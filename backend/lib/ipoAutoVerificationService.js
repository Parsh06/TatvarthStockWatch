'use strict';

/**
 * ipoAutoVerificationService.js
 *
 * Event-Driven Automated IPO Allotment Family PAN Verification Engine
 *
 * When a new IPO allotment announcement goes live on ANY registrar
 * (Link Intime / MUFG, KFintech, BigShare), this service is triggered ONCE.
 * It queries registrar records for all registered users' saved family PANs,
 * delivering rich, multi-tiered notifications (Allotted vs Not Allotted vs Not Applied).
 *
 * Storage Policy: Zero permanent storage footprint.
 * Execution locks and runs are stored in MongoDB Atlas `ipo_auto_verifications`
 * with a 24-hour TTL index (expireAfterSeconds: 86400) and cleaned at midnight.
 */

const axios = require('axios');
const { getDb } = require('./mongoClient');
const { db } = require('./firebaseAdmin');
const prefsStore = require('./prefsStore');
const { appendAlert } = require('./alertStore');
const { sendWebPushToUser } = require('./webPushNotifier');
const { sendTelegram, isConfigured: isTelegramConfigured } = require('./telegramNotifier');
const { 
  decryptPan, 
  maskPan, 
  normalizeKfinResponse, 
  normalizeMufgResponse, 
  normalizeBigshareResponse 
} = require('./ipoUtils');
const { queryMufg } = require('./mufgScraper');
const { queryBigshare } = require('./bigshareScraper');

// ── KFintech Direct Query Helper ──────────────────────────────────────────────
const KFIN_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://ipostatus.kfintech.com',
  'Referer': 'https://ipostatus.kfintech.com/',
};

async function queryKfintechDirect(clientId, pan) {
  const cleanId = String(clientId || '').replace(/^KFIN(TECH)?_/i, '');
  const res = await axios.get(
    'https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan',
    {
      headers: {
        ...KFIN_HEADERS,
        'client_id': cleanId,
        'reqparam': pan,
      },
      timeout: 12000,
    }
  );
  return res.data;
}

// ── Rate Limiter & Concurrency ────────────────────────────────────────────────
const MAX_CONCURRENT = 3;
const INTER_REQUEST_DELAY_MS = 200;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTasksWithConcurrency(tasks, limit = MAX_CONCURRENT, delayMs = INTER_REQUEST_DELAY_MS) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = { _error: err.message || 'Worker task failed' };
      }
      if (delayMs > 0 && index < tasks.length) {
        await delay(delayMs);
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(limit, tasks.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Get current date string in IST format YYYY-MM-DD
 */
function getIstDateStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Trigger automated allotment check for all users with family PANs upon new IPO release.
 *
 * @param {Object} params
 * @param {string} params.symbol - IPO symbol or identifier (e.g. "TATA_TECH" or "543335")
 * @param {string} params.registrar - "MUFG" | "LINKINTIME" | "KFINTECH" | "BIGSHARE"
 * @param {string} [params.ipoName] - Human-readable name of the IPO
 * @param {boolean} [params.force] - Bypass 24h deduplication lock for manual admin testing
 */
async function triggerAutoAllotmentCheck({ symbol, registrar, ipoName, force = false }) {
  if (!symbol) throw new Error('IPO symbol is required for auto allotment verification');
  const reg = String(registrar || 'KFINTECH').toUpperCase();
  const rawSymbol = String(symbol).trim();
  const displayName = ipoName || rawSymbol;
  const dateIST = getIstDateStr();
  const lockKey = `${reg}_${rawSymbol}_${dateIST}`;

  console.log(`[IPO Auto Check] Starting verification trigger for "${displayName}" (${reg})...`);

  // 1. Check & Acquire 24-Hour Ephemeral Lock in MongoDB Atlas
  const mdb = await getDb();
  if (mdb) {
    try {
      const col = mdb.collection('ipo_auto_verifications');
      // Ensure 24-hour TTL index
      await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }).catch(() => {});

      if (!force) {
        const existing = await col.findOne({ _id: lockKey });
        if (existing && (existing.status === 'COMPLETED' || existing.status === 'PROCESSING')) {
          console.log(`[IPO Auto Check] Skipped: ${lockKey} already processed in the last 24 hours.`);
          return { skipped: true, reason: 'ALREADY_CHECKED', lockKey };
        }
      }

      await col.updateOne(
        { _id: lockKey },
        {
          $set: {
            symbol: rawSymbol,
            registrar: reg,
            ipoName: displayName,
            status: 'PROCESSING',
            startedAt: new Date(),
            createdAt: new Date(),
          }
        },
        { upsert: true }
      );
    } catch (lockErr) {
      console.warn('[IPO Auto Check] MongoDB lock warning:', lockErr.message);
    }
  }

  // 2. Discover All Users with Saved Family PANs
  const usersWithPans = new Map(); // uid -> [{ id, name, panEncrypted, panIv, panAuthTag, panLast4 }]
  try {
    const snap = await db.collectionGroup('familyPans').get();
    snap.forEach((doc) => {
      // doc.ref.parent is CollectionReference('familyPans')
      // doc.ref.parent.parent is DocumentReference('users/{uid}')
      const userRef = doc.ref.parent.parent;
      if (userRef && userRef.id) {
        const uid = userRef.id;
        if (!usersWithPans.has(uid)) usersWithPans.set(uid, []);
        usersWithPans.get(uid).push({ id: doc.id, ...doc.data() });
      }
    });
  } catch (groupErr) {
    console.error('[IPO Auto Check] Failed to fetch family PANs:', groupErr.message);
    return { success: false, error: groupErr.message };
  }

  if (usersWithPans.size === 0) {
    console.log('[IPO Auto Check] No users with saved family PANs found. Completed.');
    if (mdb) {
      await mdb.collection('ipo_auto_verifications').updateOne(
        { _id: lockKey },
        { $set: { status: 'NO_APPLICANTS', completedAt: new Date() } }
      ).catch(() => {});
    }
    return { success: true, usersChecked: 0, allotmentsFound: 0 };
  }

  console.log(`[IPO Auto Check] Verifying across ${usersWithPans.size} user account(s)...`);

  let totalUsersChecked = 0;
  let totalAllotmentsFound = 0;
  let totalNonAllottedUsers = 0;
  let totalNotAppliedUsers = 0;

  // 3. Process Each User
  for (const [uid, rawApplicants] of usersWithPans.entries()) {
    try {
      // Check user preferences
      const prefs = await prefsStore.getPrefs(uid);
      if (prefs && prefs.notifyIpoAllotment === false) {
        continue; // User explicitly disabled IPO alerts
      }

      // Decrypt applicants
      const validApplicants = [];
      for (const app of rawApplicants) {
        try {
          const plainPan = decryptPan({
            encrypted: app.panEncrypted,
            iv: app.panIv,
            authTag: app.panAuthTag,
          });
          if (plainPan) {
            validApplicants.push({
              id: app.id,
              name: app.name || 'Family Member',
              pan: plainPan,
              panLast4: app.panLast4 || plainPan.slice(-4),
            });
          }
        } catch {
          // Decryption failed for this PAN — skip silently
        }
      }

      if (validApplicants.length === 0) continue;
      totalUsersChecked++;

      // Build execution tasks for this user's family PANs
      const tasks = validApplicants.map((app) => {
        return async () => {
          try {
            let normalized;
            if (reg === 'MUFG' || reg === 'LINKINTIME' || reg === 'LINK_INTIME') {
              const mufgXml = await queryMufg(rawSymbol, app.pan);
              normalized = await normalizeMufgResponse(mufgXml, app.pan);
            } else if (reg === 'BIGSHARE' || reg === 'BIG_SHARE') {
              const bigData = await queryBigshare(rawSymbol, app.pan);
              normalized = normalizeBigshareResponse(bigData, app.pan);
            } else {
              let kfinRes;
              try {
                kfinRes = await queryKfintechDirect(rawSymbol, app.pan);
              } catch (kErr) {
                if (kErr.response && kErr.response.status === 404) {
                  kfinRes = { data: [] };
                } else {
                  throw kErr;
                }
              }
              normalized = normalizeKfinResponse(kfinRes);
            }

            return {
              applicant: app,
              records: normalized.records || [],
              status: normalized.records && normalized.records.length > 0 ? 'found' : 'not_found',
            };
          } catch (err) {
            return {
              applicant: app,
              records: [],
              status: 'error',
              error: err.message,
            };
          }
        };
      });

      const userResults = await runTasksWithConcurrency(tasks, MAX_CONCURRENT, INTER_REQUEST_DELAY_MS);

      // Analyze outcomes for this user
      const allottedList = [];
      const notAllottedList = [];
      let anyRecordsFound = false;

      for (const res of userResults) {
        if (!res || !res.records) continue;
        if (res.records.length > 0) anyRecordsFound = true;

        for (const rec of res.records) {
          const shares = Number(rec.allottedShares || 0);
          const isAllotted = shares > 0 || String(rec.allotmentStatus).toLowerCase() === 'allotted';
          if (isAllotted) {
            allottedList.push({
              name: res.applicant.name,
              shares,
              applied: Number(rec.appliedShares || 0),
              dpId: rec.dpId || rec.clientId || 'N/A',
              appNo: rec.applicationNumber || 'N/A',
              category: rec.category || 'Regular',
            });
          } else {
            notAllottedList.push({
              name: res.applicant.name,
              applied: Number(rec.appliedShares || 0),
              status: rec.allotmentStatus || 'Not Allotted',
            });
          }
        }
      }

      // ── Dispatch Notification Based on 3 Tiers ──────────────────────────────
      if (allottedList.length > 0) {
        // TIER 1: 🎉 ALLOTMENT CONFIRMED!
        totalAllotmentsFound++;
        const totalShares = allottedList.reduce((sum, item) => sum + item.shares, 0);
        const names = allottedList.map(item => `${item.name} (${item.shares} sh)`).join(', ');

        const pushTitle = `🎉 ALLOTMENT CONFIRMED: ${displayName}!`;
        const pushBody = `Congratulations! ${names} allotted shares! DP/App details verified on ${reg}. Tap to view full breakdown.`;
        const pushUrl = `/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg}&auto=1`;

        // 1. Web Push
        await sendWebPushToUser(uid, {
          title: pushTitle,
          body: pushBody,
          url: pushUrl,
          tag: `ipo-allotment-win-${rawSymbol}-${Date.now()}`,
          type: 'ipo-allotment-win',
          actions: [
            { action: 'view-allotment', title: 'View Allotment' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        }).catch(() => {});

        // 2. Telegram Alert
        const targetChat = prefs.telegramChatId || (prefs.telegramEnabled !== false ? process.env.TELEGRAM_CHAT_ID : null);
        if (targetChat && isTelegramConfigured(targetChat)) {
          let tgText = `🎉 *IPO ALLOTMENT CONFIRMED!*\n\n`;
          tgText += `Company: *${displayName}*\nRegistrar: *${reg}*\n\n`;
          tgText += `*Allotted Family Members:*\n`;
          for (const item of allottedList) {
            tgText += `• *${item.name}*: ${item.shares} shares allotted (Applied: ${item.applied})\n`;
            if (item.dpId !== 'N/A') tgText += `  └ DP/Client: \`${item.dpId}\` | App: \`${item.appNo}\`\n`;
          }
          tgText += `\n👉 [Open Full Details in StockWatch](https://tatvarthstockwatch.web.app/ipo-check?symbol=${encodeURIComponent(rawSymbol)})`;
          await sendTelegram(targetChat, tgText).catch(() => {});
        }

        // 3. Save into alerts history
        await appendAlert(uid, {
          id: `IPO_ALLOTMENT_WIN_${rawSymbol}_${Date.now()}`,
          type: 'IPO_ALLOTMENT_WIN',
          title: pushTitle,
          message: pushBody,
          symbol: rawSymbol,
          registrar: reg,
          allottedCount: allottedList.length,
          totalShares,
          triggeredAt: new Date().toISOString(),
        }).catch(() => {});

      } else if (anyRecordsFound && notAllottedList.length > 0) {
        // TIER 2: 📋 APPLIED BUT NOT ALLOTTED
        totalNonAllottedUsers++;
        const names = notAllottedList.map(item => `${item.name} (${item.applied} sh)`).join(', ');
        const pushTitle = `📋 IPO Allotment Status: ${displayName}`;
        const pushBody = `Allotment processed for ${names}. No shares allotted. Registrar (${reg}) will process bank mandate release.`;
        const pushUrl = `/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg}`;

        await sendWebPushToUser(uid, {
          title: pushTitle,
          body: pushBody,
          url: pushUrl,
          tag: `ipo-allotment-none-${rawSymbol}-${Date.now()}`,
          type: 'ipo-allotment-none',
          actions: [
            { action: 'view-status', title: 'Check Details' }
          ]
        }).catch(() => {});

        const targetChat = prefs.telegramChatId || (prefs.telegramEnabled !== false ? process.env.TELEGRAM_CHAT_ID : null);
        if (targetChat && isTelegramConfigured(targetChat)) {
          let tgText = `📋 *IPO Allotment Update*\n\n`;
          tgText += `Company: *${displayName}*\nRegistrar: *${reg}*\n\n`;
          tgText += `Status: *Not Allotted* for ${names}.\nBank mandate refund will be released shortly.\n\n`;
          tgText += `👉 [Check on StockWatch](https://tatvarthstockwatch.web.app/ipo-check?symbol=${encodeURIComponent(rawSymbol)})`;
          await sendTelegram(targetChat, tgText).catch(() => {});
        }

        await appendAlert(uid, {
          id: `IPO_ALLOTMENT_NON_${rawSymbol}_${Date.now()}`,
          type: 'IPO_ALLOTMENT_NON',
          title: pushTitle,
          message: pushBody,
          symbol: rawSymbol,
          registrar: reg,
          triggeredAt: new Date().toISOString(),
        }).catch(() => {});

      } else {
        // TIER 3: NOT APPLIED (Record Not Found on Registrar)
        totalNotAppliedUsers++;
        // If user set notifyOnlyIfApplied: true, do not send noise!
        if (prefs.notifyOnlyIfApplied === true) {
          // Quietly skip — user only wants alerts when they actually applied
        } else {
          // Low-priority single informational update
          const pushTitle = `📢 IPO Allotment Live: ${displayName}`;
          const pushBody = `Allotment is live on ${reg}. No application found for your saved family PANs.`;
          await sendWebPushToUser(uid, {
            title: pushTitle,
            body: pushBody,
            url: `/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg}`,
            tag: `ipo-allotment-live-${rawSymbol}`,
            type: 'ipo-allotment-live',
          }).catch(() => {});
        }
      }

    } catch (userErr) {
      console.error(`[IPO Auto Check] Error processing uid=${uid}:`, userErr.message);
    }
  }

  // 4. Update Execution Status in MongoDB
  if (mdb) {
    try {
      await mdb.collection('ipo_auto_verifications').updateOne(
        { _id: lockKey },
        {
          $set: {
            status: 'COMPLETED',
            usersChecked: totalUsersChecked,
            allotmentsFound: totalAllotmentsFound,
            nonAllottedUsers: totalNonAllottedUsers,
            notAppliedUsers: totalNotAppliedUsers,
            completedAt: new Date(),
          }
        }
      );
    } catch (updateErr) {
      console.warn('[IPO Auto Check] Status update warning:', updateErr.message);
    }
  }

  console.log(`[IPO Auto Check] Completed for "${displayName}": Checked=${totalUsersChecked}, AllotmentsFound=${totalAllotmentsFound}, NonAllotted=${totalNonAllottedUsers}`);

  return {
    success: true,
    symbol: rawSymbol,
    registrar: reg,
    usersChecked: totalUsersChecked,
    allotmentsFound: totalAllotmentsFound,
    nonAllottedUsers: totalNonAllottedUsers,
    notAppliedUsers: totalNotAppliedUsers,
  };
}

module.exports = {
  triggerAutoAllotmentCheck,
  queryKfintechDirect,
};
