'use strict';

/**
 * ipoAutoVerificationService.js
 *
 * Event-Driven Automated IPO Allotment Family PAN Verification Engine
 *
 * Two-Stage Architecture:
 * 1. Stage 1 (Immediate Broadcast):
 *    When a new IPO allotment symbol is discovered & stored in MongoDB,
 *    broadcasts an immediate announcement notification to all opted-in users:
 *    "📢 IPO Allotment Live: [IPO Name]. Check your allotment now."
 *
 * 2. Stage 2 (5-Minute Automated Family PAN Verification):
 *    Indian registrars (KFintech, Link Intime/MUFG, BigShare) take 2-5 minutes
 *    after updating dropdown listings to index applicant PAN records.
 *    Enqueues a durable 5-minute delayed check in MongoDB `ipo_scheduled_checks`
 *    and arms an in-process timer. When executed, it decrypts all saved family PANs,
 *    queries the registrar, and dispatches personalized tiered notifications:
 *    - Tier 1: 🎉 Allotment Confirmed! (Shares > 0)
 *    - Tier 2: 📋 Applied, Not Allotted (Refund/mandate release notice)
 *    - Tier 3: ℹ️ No Records Found (Digest / silent skip per user preferences)
 *
 * Zero permanent storage footprint:
 * Ephemeral locks and scheduled jobs use MongoDB Atlas native TTL auto-purge (86400s).
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
const { saveCheckHistory } = require('./ipoCheckHistoryStore');

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
 * Clean and normalize registrar name
 */
function normalizeRegistrarName(registrar) {
  const reg = String(registrar || 'KFINTECH').toUpperCase().trim();
  if (reg === 'LINKINTIME' || reg === 'LINK_INTIME' || reg === 'MUFG') return 'MUFG';
  if (reg === 'BIGSHARE' || reg === 'BIG_SHARE') return 'BIGSHARE';
  return 'KFINTECH';
}

/**
 * Stage 1: Broadcast Immediate Announcement to All Users
 * Notifies all active opted-in users that a new IPO allotment has gone live on a registrar.
 *
 * @param {Object} params
 * @param {string} params.symbol - IPO symbol or identifier
 * @param {string} params.registrar - "KFINTECH" | "MUFG" | "BIGSHARE"
 * @param {string} [params.ipoName] - Human-readable IPO company name
 * @returns {Promise<{ sentPush: number, sentTelegram: number, totalUsers: number }>}
 */
async function broadcastStage1IpoAllotment({ symbol, registrar, ipoName }) {
  const reg = normalizeRegistrarName(registrar);
  const rawSymbol = String(symbol || '').trim();
  const displayName = ipoName || rawSymbol;
  const regDisplay = reg === 'MUFG' ? 'Link Intime (MUFG)' : reg === 'BIGSHARE' ? 'BigShare Online' : 'KFintech';

  console.log(`[IPO Dispatcher:Stage1] Broadcasting live allotment notice for "${displayName}" (${regDisplay})...`);

  const stats = { sentPush: 0, sentTelegram: 0, totalUsers: 0 };
  const admin = require('firebase-admin');

  const pushTitle = `📢 IPO Allotment Live: ${displayName}`;
  const pushBody = `Allotment status for ${displayName} is now active on ${regDisplay}. Check your allotment on StockWatch now!`;
  const pushUrl = `/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg}`;

  let pageToken;
  try {
    do {
      const result = await admin.auth().listUsers(1000, pageToken);
      for (const user of result.users) {
        stats.totalUsers++;
        const uid = user.uid;

        try {
          const prefs = await prefsStore.getPrefs(uid);
          if (prefs && (prefs.notifyIpoAllotment === false || prefs.pushEnabled === false)) {
            continue;
          }

          // 1. Web Push Notification
          const pushRes = await sendWebPushToUser(uid, {
            title: pushTitle,
            body: pushBody,
            url: pushUrl,
            tag: `ipo-live-${reg}-${rawSymbol}`,
            type: 'ipo-allotment-live',
            actions: [
              { action: 'check-allotment', title: 'Check Allotment' },
              { action: 'dismiss', title: 'Dismiss' },
            ],
          }).catch(() => ({ sent: 0 }));

          if (pushRes && pushRes.sent > 0) {
            stats.sentPush += pushRes.sent;
          }

          // 2. Telegram Alert (per-user if enabled)
          const targetChat = prefs?.telegramChatId || (prefs?.telegramEnabled !== false ? process.env.TELEGRAM_CHAT_ID : null);
          if (targetChat && isTelegramConfigured(targetChat) && prefs?.telegramEnabled !== false) {
            let tgText = `📢 *IPO ALLOTMENT LIVE!*\n\n`;
            tgText += `Company: *${displayName}*\n`;
            tgText += `Registrar: *${regDisplay}*\n`;
            tgText += `Status: Allotment results are now available for verification.\n\n`;
            tgText += `👉 [Check Allotment on StockWatch](https://tatvarthstockwatch.web.app/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg})`;

            await sendTelegram(targetChat, tgText).catch(() => {});
            stats.sentTelegram++;
          }

          // 3. Save to User Alerts History
          await appendAlert(uid, {
            id: `IPO_LIVE_${reg}_${rawSymbol}_${Date.now()}`,
            type: 'IPO_ALLOTMENT_LIVE',
            title: pushTitle,
            message: pushBody,
            symbol: rawSymbol,
            registrar: reg,
            triggeredAt: new Date().toISOString(),
          }).catch(() => {});

        } catch (uErr) {
          console.warn(`[IPO Dispatcher:Stage1] Error notifying uid=${uid}:`, uErr.message);
        }
      }
      pageToken = result.pageToken;
    } while (pageToken);
  } catch (scanErr) {
    console.error('[IPO Dispatcher:Stage1] User scan error:', scanErr.message);
  }

  console.log(`[IPO Dispatcher:Stage1] Completed broadcast for "${displayName}": Pushes=${stats.sentPush}, Telegrams=${stats.sentTelegram}, UsersEvaluated=${stats.totalUsers}`);
  return stats;
}

/**
 * Stage 2: Schedule 5-Minute Delayed Family PAN Auto-Verification
 *
 * @param {Object} params
 * @param {string} params.symbol
 * @param {string} params.registrar
 * @param {string} [params.ipoName]
 * @param {number} [params.delayMs=300000] - Default 5 minutes
 */
async function scheduleStage2FamilyPanCheck({ symbol, registrar, ipoName, delayMs = 5 * 60 * 1000 }) {
  const reg = normalizeRegistrarName(registrar);
  const rawSymbol = String(symbol || '').trim();
  const displayName = ipoName || rawSymbol;
  const jobId = `${reg}_${rawSymbol}`;
  const scheduledFor = new Date(Date.now() + delayMs);

  console.log(`[IPO Dispatcher:Stage2] Scheduling 5-minute auto family PAN check for "${displayName}" (${reg}) at ${scheduledFor.toISOString()}...`);

  // 1. Persist in MongoDB Atlas for durability across restarts
  const mdb = await getDb();
  if (mdb) {
    try {
      const col = mdb.collection('ipo_scheduled_checks');
      await col.createIndex({ scheduledFor: 1 }, { background: true }).catch(() => {});
      await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400, background: true }).catch(() => {});

      await col.updateOne(
        { _id: jobId },
        {
          $set: {
            symbol: rawSymbol,
            registrar: reg,
            ipoName: displayName,
            scheduledFor,
            status: 'PENDING',
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          }
        },
        { upsert: true }
      );
    } catch (schedErr) {
      console.warn('[IPO Dispatcher:Stage2] MongoDB schedule warning:', schedErr.message);
    }
  }

  // 2. Set In-Process Timer (for instant local / worker execution at +5 mins)
  setTimeout(async () => {
    try {
      console.log(`[IPO Dispatcher:Stage2] 5-minute timer fired for "${displayName}" (${reg}). Executing automated verification...`);
      await triggerAutoAllotmentCheck({
        symbol: rawSymbol,
        registrar: reg,
        ipoName: displayName,
        force: true, // Bypass lock so 5m follow-up always runs
        scheduledCheckId: jobId,
      });
    } catch (timerErr) {
      console.error(`[IPO Dispatcher:Stage2] Timer check error for ${jobId}:`, timerErr.message);
    }
  }, Math.max(1000, delayMs)).unref();

  return { scheduled: true, jobId, scheduledFor };
}

/**
 * Unified Dispatcher: Stage 1 (Immediate Broadcast) + Stage 2 (5-Min Delayed Family Check)
 *
 * @param {Object} params
 * @param {Object|string} params.ipo - IPO object or symbol
 * @param {string} params.registrar - "KFINTECH" | "MUFG" | "BIGSHARE"
 * @param {boolean} [params.force=false]
 * @param {boolean} [params.skipDelay=false] - If true, runs Stage 2 immediately (useful for manual admin tests)
 */
async function dispatchNewIpoAllotment({ ipo, registrar, force = false, skipDelay = false }) {
  const reg = normalizeRegistrarName(registrar);
  const symbol = typeof ipo === 'string' ? ipo : (ipo.clientId || ipo.symbol);
  const ipoName = typeof ipo === 'object' ? (ipo.name || ipo.symbol) : symbol;

  console.log(`[IPO Dispatcher] Initiating 2-Stage Allotment Pipeline for "${ipoName}" (${reg})...`);

  // Stage 1: Immediate Broadcast to All Users
  const stage1Stats = await broadcastStage1IpoAllotment({
    symbol,
    registrar: reg,
    ipoName,
  });

  // Stage 2: Family PAN Auto-Verification
  let stage2Result;
  if (skipDelay) {
    console.log(`[IPO Dispatcher] skipDelay=true: Executing Stage 2 family PAN check immediately...`);
    stage2Result = await triggerAutoAllotmentCheck({
      symbol,
      registrar: reg,
      ipoName,
      force,
    });
  } else {
    stage2Result = await scheduleStage2FamilyPanCheck({
      symbol,
      registrar: reg,
      ipoName,
      delayMs: 5 * 60 * 1000,
    });
  }

  return {
    success: true,
    symbol,
    registrar: reg,
    ipoName,
    stage1: stage1Stats,
    stage2: stage2Result,
  };
}

/**
 * Process Overdue Pending Scheduled Checks
 * Called on every cron tick to process any scheduled checks whose scheduledFor <= now.
 */
async function processPendingScheduledChecks() {
  const mdb = await getDb();
  if (!mdb) return { processed: 0 };

  try {
    const col = mdb.collection('ipo_scheduled_checks');
    const now = new Date();

    const pendingJobs = await col.find({
      status: 'PENDING',
      scheduledFor: { $lte: now },
    }).limit(5).toArray();

    if (pendingJobs.length === 0) return { processed: 0 };

    console.log(`[IPO Scheduled Engine] Found ${pendingJobs.length} mature 5-minute scheduled check(s) to process.`);
    let processed = 0;

    for (const job of pendingJobs) {
      const lockRes = await col.updateOne(
        { _id: job._id, status: 'PENDING' },
        { $set: { status: 'PROCESSING', startedAt: new Date() } }
      );

      if (lockRes.modifiedCount === 0) continue; // Concurrently claimed by another worker

      try {
        console.log(`[IPO Scheduled Engine] Processing overdue check for "${job.ipoName}" (${job.registrar})...`);
        const result = await triggerAutoAllotmentCheck({
          symbol: job.symbol,
          registrar: job.registrar,
          ipoName: job.ipoName,
          force: true,
          scheduledCheckId: job._id,
        });

        await col.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'COMPLETED',
              completedAt: new Date(),
              result,
            }
          }
        );
        processed++;
      } catch (execErr) {
        console.error(`[IPO Scheduled Engine] Execution error for ${job._id}:`, execErr.message);
        await col.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'FAILED',
              failedAt: new Date(),
              error: execErr.message,
            }
          }
        );
      }
    }

    return { processed };
  } catch (err) {
    console.warn('[IPO Scheduled Engine] Error processing scheduled checks:', err.message);
    return { processed: 0, error: err.message };
  }
}

/**
 * Trigger automated allotment check for all users with family PANs.
 *
 * @param {Object} params
 * @param {string} params.symbol - IPO symbol or identifier
 * @param {string} params.registrar - "MUFG" | "LINKINTIME" | "KFINTECH" | "BIGSHARE"
 * @param {string} [params.ipoName] - Human-readable name of the IPO
 * @param {boolean} [params.force] - Bypass 24h deduplication lock for manual admin testing
 * @param {string} [params.scheduledCheckId] - Optional scheduled check identifier to mark completed
 */
async function triggerAutoAllotmentCheck({ symbol, registrar, ipoName, force = false, scheduledCheckId = null }) {
  if (!symbol) throw new Error('IPO symbol is required for auto allotment verification');
  const reg = normalizeRegistrarName(registrar);
  const rawSymbol = String(symbol).trim();
  const displayName = ipoName || rawSymbol;
  const dateIST = getIstDateStr();
  const lockKey = `${reg}_${rawSymbol}_${dateIST}`;

  console.log(`[IPO Auto Check] Starting family PAN verification trigger for "${displayName}" (${reg})...`);

  // 1. Check & Acquire 24-Hour Ephemeral Lock in MongoDB Atlas
  const mdb = await getDb();
  if (mdb) {
    try {
      const col = mdb.collection('ipo_auto_verifications');
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

  console.log(`[IPO Auto Check] Verifying across ${usersWithPans.size} user account(s) with saved family PANs...`);

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
          tgText += `\n👉 [Open Full Details in StockWatch](https://tatvarthstockwatch.web.app/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg}&auto=1)`;
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
        if (prefs.notifyOnlyIfApplied === true) {
          // User requested alerts only when they actually applied — quiet skip
        } else {
          const pushTitle = `ℹ️ Family Allotment Check Completed: ${displayName}`;
          const pushBody = `Allotment checked on ${reg}. No active applications found for your saved family PANs.`;
          await sendWebPushToUser(uid, {
            title: pushTitle,
            body: pushBody,
            url: `/ipo-check?symbol=${encodeURIComponent(rawSymbol)}&registrar=${reg}`,
            tag: `ipo-allotment-checked-${rawSymbol}`,
            type: 'ipo-allotment-live',
          }).catch(() => {});
        }
      }

      // 4. Save to Ephemeral Check History for instant zero-server-load UI review
      try {
        const histResults = userResults.map((ur, idx) => {
          const app = ur.applicant || {};
          const recs = ur.records || [];
          const top = recs[0] || {};
          const sharesAllotted = Number(top.allottedShares || 0);
          const appliedShares = Number(top.appliedShares || 0);
          const isAllotted = sharesAllotted > 0 || String(top.allotmentStatus).toLowerCase() === 'allotted';
          const status = isAllotted ? 'allotted' : (recs.length > 0 ? 'not_allotted' : (ur.status === 'error' ? 'error' : 'not_found'));

          return {
            id: app.id || `app_${idx}`,
            applicantId: app.id || `app_${idx}`,
            name: app.name || 'Family Member',
            maskedPan: `XXXXXX${app.panLast4 || 'XXXX'}`,
            status,
            allotmentStatus: isAllotted ? 'Allotted' : (recs.length > 0 ? 'Not Allotted' : 'Record Not Found'),
            sharesAllotted,
            appliedShares,
            dpId: top.dpId || top.clientId || 'N/A',
            appNo: top.applicationNumber || 'N/A',
            category: top.category || 'Regular',
            records: recs,
            error: ur.error || null,
          };
        });

        await saveCheckHistory({
          uid,
          symbol: rawSymbol,
          ipoName: displayName,
          registrar: reg,
          type: 'AUTO',
          results: histResults,
          summary: {
            total: histResults.length,
            allotted: histResults.filter(h => h.status === 'allotted').length,
            notAllotted: histResults.filter(h => h.status === 'not_allotted').length,
            notFound: histResults.filter(h => h.status === 'not_found').length,
            errors: histResults.filter(h => h.status === 'error').length,
          }
        });
      } catch (hErr) {
        console.warn(`[IPO Auto Check] History save warning for uid=${uid}:`, hErr.message);
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

/**
 * On-Demand Family PAN Verification for a Single User
 * Allows a logged-in user to check all their family PANs for any IPO on-demand.
 *
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.symbol - IPO symbol
 * @param {string} params.registrar - "MUFG" | "KFINTECH" | "BIGSHARE"
 */
async function checkUserFamilyPans({ uid, symbol, registrar }) {
  if (!uid || !symbol) throw new Error('uid and symbol are required');
  const reg = normalizeRegistrarName(registrar);
  const rawSymbol = String(symbol).trim();

  // 1. Fetch user's saved family PANs
  const collRef = db.collection('users').doc(uid).collection('familyPans');
  const snap = await collRef.get();
  if (snap.empty) {
    return { success: true, count: 0, applicants: [], summary: { total: 0, allotted: 0, notAllotted: 0, notFound: 0 } };
  }

  const validApplicants = [];
  snap.forEach(doc => {
    const data = doc.data();
    try {
      const plainPan = decryptPan({
        encrypted: data.panEncrypted,
        iv: data.panIv,
        authTag: data.panAuthTag,
      });
      if (plainPan) {
        validApplicants.push({
          id: doc.id,
          name: data.name || 'Family Member',
          pan: plainPan,
          panLast4: data.panLast4 || plainPan.slice(-4),
        });
      }
    } catch {
      // ignore decryption failure
    }
  });

  if (validApplicants.length === 0) {
    return { success: true, count: 0, applicants: [], summary: { total: 0, allotted: 0, notAllotted: 0, notFound: 0 } };
  }

  // 2. Execute verification concurrently
  const tasks = validApplicants.map((app) => {
    return async () => {
      try {
        let normalized;
        if (reg === 'MUFG') {
          const mufgXml = await queryMufg(rawSymbol, app.pan);
          normalized = await normalizeMufgResponse(mufgXml, app.pan);
        } else if (reg === 'BIGSHARE') {
          const bigData = await queryBigshare(rawSymbol, app.pan);
          normalized = normalizeBigshareResponse(bigData, app.pan);
        } else {
          let kfinRes;
          try {
            kfinRes = await queryKfintechDirect(rawSymbol, app.pan);
          } catch (kErr) {
            kfinRes = { data: [] };
          }
          normalized = normalizeKfinResponse(kfinRes);
        }

        const records = normalized.records || [];
        let sharesAllotted = 0;
        let appliedShares = 0;
        let allotmentStatus = 'Record Not Found';
        let isAllotted = false;

        if (records.length > 0) {
          const rec = records[0];
          sharesAllotted = Number(rec.allottedShares || 0);
          appliedShares = Number(rec.appliedShares || 0);
          isAllotted = sharesAllotted > 0 || String(rec.allotmentStatus).toLowerCase() === 'allotted';
          allotmentStatus = isAllotted ? 'Allotted' : (rec.allotmentStatus || 'Not Allotted');
        }

        return {
          id: app.id,
          name: app.name,
          panLast4: app.panLast4,
          status: records.length > 0 ? (isAllotted ? 'allotted' : 'not_allotted') : 'not_found',
          allotmentStatus,
          sharesAllotted,
          appliedShares,
          records,
        };
      } catch (err) {
        return {
          id: app.id,
          name: app.name,
          panLast4: app.panLast4,
          status: 'error',
          error: err.message,
          records: [],
        };
      }
    };
  });

  const results = await runTasksWithConcurrency(tasks, MAX_CONCURRENT, INTER_REQUEST_DELAY_MS);

  let allotted = 0, notAllotted = 0, notFound = 0, errors = 0;
  for (const r of results) {
    if (r.status === 'allotted') allotted++;
    else if (r.status === 'not_allotted') notAllotted++;
    else if (r.status === 'not_found') notFound++;
    else errors++;
  }

  // 3. Save to Ephemeral Check History
  try {
    const histResults = results.map((r, idx) => {
      const recs = r.records || [];
      const top = recs[0] || {};
      const sharesAllotted = Number(r.sharesAllotted || top.allottedShares || 0);
      const appliedShares = Number(r.appliedShares || top.appliedShares || 0);
      const isAllotted = sharesAllotted > 0 || r.status === 'allotted' || String(top.allotmentStatus).toLowerCase() === 'allotted';
      const status = isAllotted ? 'allotted' : (recs.length > 0 ? 'not_allotted' : (r.status === 'error' ? 'error' : 'not_found'));

      return {
        id: r.id || `app_${idx}`,
        applicantId: r.id || `app_${idx}`,
        name: r.name || 'Family Member',
        maskedPan: `XXXXXX${r.panLast4 || 'XXXX'}`,
        status,
        allotmentStatus: isAllotted ? 'Allotted' : (recs.length > 0 ? 'Not Allotted' : 'Record Not Found'),
        sharesAllotted,
        appliedShares,
        dpId: top.dpId || top.clientId || 'N/A',
        appNo: top.applicationNumber || 'N/A',
        category: top.category || 'Regular',
        records: recs,
        error: r.error || null,
      };
    });

    await saveCheckHistory({
      uid,
      symbol: rawSymbol,
      ipoName: rawSymbol,
      registrar: reg,
      type: 'MANUAL',
      results: histResults,
      summary: {
        total: histResults.length,
        allotted,
        notAllotted,
        notFound,
        errors,
      }
    });
  } catch (hErr) {
    console.warn(`[checkUserFamilyPans] History save warning:`, hErr.message);
  }

  return {
    success: true,
    symbol: rawSymbol,
    registrar: reg,
    count: results.length,
    applicants: results,
    summary: {
      total: results.length,
      allotted,
      notAllotted,
      notFound,
      errors,
    }
  };
}

module.exports = {
  triggerAutoAllotmentCheck,
  queryKfintechDirect,
  broadcastStage1IpoAllotment,
  scheduleStage2FamilyPanCheck,
  dispatchNewIpoAllotment,
  processPendingScheduledChecks,
  checkUserFamilyPans,
  normalizeRegistrarName,
};
