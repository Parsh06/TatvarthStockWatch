'use strict';

/**
 * notificationEngine.js  [v2]
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  NOTIFICATION ENGINE — Central orchestrator                                 ║
 * ║                                                                              ║
 * ║  PERFORMANCE ARCHITECTURE:                                                   ║
 * ║    1. Classify ALL announcements ONCE (before user loop).                   ║
 * ║    2. Compile blocked filter ONCE PER USER (before announcement loop).      ║
 * ║    3. Hot-path filter decision = O(1) Set.has() only.                      ║
 * ║    4. Telegram rate-limited: ≤1 message per 350ms.                         ║
 * ║                                                                              ║
 * ║  FAIL-CLOSED RULES:                                                         ║
 * ║    - prefs fetch error → skip user (no notification sent)                   ║
 * ║    - classification error → UNKNOWN (allow, logged at startup)              ║
 * ║    - taxonomy error → fail closed entirely                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const { resolveNotificationScope, matchesNotificationScope, SCOPE } = require('./notificationScope');
const { compileBlockedFilter, shouldNotify } = require('./notificationFilter');
const { classifyAnnouncementBatch }          = require('./categoryClassifier');
const { acquireDedupLock }                   = require('./notificationDedup');
const { getDb }                              = require('./mongoClient');

const { resolveRecipientsForBatch }          = require('./notification/notificationRouter');
const { evaluateNotificationFilter }         = require('./notification/notificationFilter');
const { dispatchPushBatch }                  = require('./notification/notificationDispatcher');
const redisNotifStore                        = require('./redis/redisNotificationStore');

// Telegram rate-limit: ≤ ~3 msg/s per Telegram Bot API limits
const TELEGRAM_DELAY_MS = 350;
function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * processNewAnnouncements
 *
 * Main entry point: /api/trigger and /api/cron/trigger.
 *
 * @param {Object[]} newAnnouncements — Truly new, normalized announcement objects
 * @param {{ verbose?: boolean }} opts
 * @returns {Promise<Object>} — Summary stats
 */
async function processNewAnnouncements(newAnnouncements, opts = {}) {
  const { verbose = true } = opts;
  const runId = `RUN-${Date.now()}`;

  const stats = {
    runId,
    newAnnouncements:      newAnnouncements.length,
    usersProcessed:        0,
    allScopeUsers:         0,
    watchlistUsers:        0,
    noneUsers:             0,
    candidatesTotal:       0,
    categoryBlocked:       0,
    unknownClassifications: 0,
    alreadySent:           0,
    queued:                0,
    pushSent:              0,
    telegramSent:          0,
    failed:                0,
    durationMs:            0,
  };

  if (newAnnouncements.length === 0) {
    if (verbose) console.log(`[NotifEngine:${runId}] No new announcements — skipping`);
    return stats;
  }

  const startTime = Date.now();

  try {
    const admin          = require('firebase-admin');
    const prefsStore     = require('./prefsStore');
    const watchlistStore = require('./watchlistStore');
    const { sendTelegramAlert, isConfigured: isTelegramOk } = require('./telegramNotifier');
    const { sendWebPushToUser } = require('./webPushNotifier');
    const db = await getDb();

    // ── STEP 1: Classify ALL announcements ONCE ─────────────────────────────
    // This is the most important optimization. Every user shares these objects.
    const classified = classifyAnnouncementBatch(newAnnouncements);
    let unknownCount = 0;
    for (const { classification } of classified) {
      if (!classification || classification.source === 'UNKNOWN') unknownCount++;
    }
    stats.unknownClassifications = unknownCount;

    if (verbose) {
      console.log(`[NotifEngine:${runId}] Classified ${classified.length} announcements (${unknownCount} unknown)`);
    }

    const mode = process.env.NOTIFICATION_ENGINE_MODE || 'inverted';

    if (mode === 'inverted' || mode === 'shadow') {
      return await processInvertedAnnouncements({ newAnnouncements, classified, stats, runId, verbose, isShadow: mode === 'shadow' });
    }

    // ── STEP 2 (LEGACY): Iterate all Firebase users ──────────────────────────
    let pageToken;
    do {
      const result = await admin.auth().listUsers(100, pageToken);

      for (const user of result.users) {
        const uid = user.uid;
        stats.usersProcessed++;

        // ── 2a. Fetch prefs — fail closed on error ──────────────────────────
        let prefs;
        try {
          prefs = await prefsStore.getPrefs(uid);
          if (!prefs) throw new Error('Empty prefs returned');
        } catch (err) {
          console.error(`[NotifEngine:${runId}] Cannot fetch prefs uid=${uid} — skip (fail-closed):`, err.message);
          continue;
        }

        // ── 2b. Resolve notification scope ─────────────────────────────────
        const scope = resolveNotificationScope(prefs);

        if (scope === SCOPE.NONE) {
          stats.noneUsers++;
          continue;
        }

        // ── 2c. Build watchlist sets for WATCHLIST_ONLY scope ───────────────
        let bseSet = new Set();
        let nseSet = new Set();

        if (scope === SCOPE.WATCHLIST_ONLY) {
          const uScripts = await watchlistStore.getWatchlist(uid);
          if (!uScripts || uScripts.length === 0) {
            stats.watchlistUsers++;
            continue;
          }
          for (const s of uScripts) {
            const ltdCode = (s.ltdCode || s.bseCode || '').trim();
            const sym     = (s.symbol  || s.nseSymbol || '').trim().toUpperCase();
            if (ltdCode) bseSet.add(ltdCode);
            if (sym)     nseSet.add(sym);
          }
          stats.watchlistUsers++;
        } else {
          stats.allScopeUsers++;
        }

        // ── 2d. User creation timestamp for onboarding safeguard ────────────
        const userCreatedAtMs = new Date(user.metadata?.creationTime || 0).getTime();

        // ── 2e. Compile user's blocked filter ONCE (before announcement loop)
        // This is crucial: O(blockedCategories.length), not O(announcements)
        const compiledFilter = compileBlockedFilter(prefs.blockedCategories);

        // ── 2f. Resolve candidate pool based on scope & onboarding age ──────
        const candidates = classified.filter(({ announcement: ann }) => {
          if (userCreatedAtMs > 0) {
            const annTimeMs = new Date(ann.announcementDate || ann.savedAt || ann.createdAt || Date.now()).getTime();
            // Safeguard for newly onboarded users:
            // Do NOT notify user for announcements published BEFORE they registered
            if (userCreatedAtMs > (annTimeMs + 5 * 60 * 1000)) {
              return false;
            }
          }
          return matchesNotificationScope({ announcement: ann, scope, bseSet, nseSet }).inScope;
        });

        if (candidates.length === 0) continue;
        stats.candidatesTotal += candidates.length;

        // ── 2f. Category filter — hot path O(1) per announcement ────────────
        // classification already computed in Step 1 — reused here
        const categoryPassed = [];
        for (const { announcement: ann, classification } of candidates) {
          const decision = shouldNotify({
            compiledFilter,
            classification,
            announcement: ann,
            notificationChannel: 'push+telegram',
          });
          if (decision.shouldNotify) {
            categoryPassed.push(ann);
          } else {
            stats.categoryBlocked++;
          }
        }

        if (categoryPassed.length === 0) continue;

        // ── 2g. Per-user dedup — atomic lock acquisition ────────────────────
        const toSend = [];
        for (const ann of categoryPassed) {
          try {
            const acquired = await acquireDedupLock(db, uid, ann);
            if (acquired) {
              toSend.push(ann);
            } else {
              stats.alreadySent++;
            }
          } catch (e) {
            if (e.code !== 11000) console.error(`[NotifEngine:${runId}] Dedup error uid=${uid} ann=${ann.id}:`, e.message);
          }
        }

        if (toSend.length === 0) continue;
        stats.queued += toSend.length;

        // ── 2h. Telegram dispatch ───────────────────────────────────────────
        const telegramConfigured = isTelegramOk(prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID);
        if (telegramConfigured && prefs.telegramEnabled !== false) {
          const targetChat = prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID;
          try {
            for (const ann of toSend) {
              const tgRes = await sendTelegramAlert([ann], targetChat);
              if (tgRes.sent) {
                stats.telegramSent++;
                if (tgRes.messageIds?.length > 0) {
                  try {
                    await db.collection('announcements').updateOne(
                      { _id: String(ann.id) },
                      { $push: { telegramMessages: { userId: uid, chatId: targetChat, messageId: tgRes.messageIds[0] } } }
                    );
                  } catch { /* Non-critical */ }
                }
              } else {
                stats.failed++;
              }
              await _delay(TELEGRAM_DELAY_MS);
            }
          } catch (err) {
            console.error(`[NotifEngine:${runId}] Telegram error uid=${uid}:`, err.message);
            stats.failed += toSend.length;
          }
        }

        // ── 2i. Web Push dispatch ───────────────────────────────────────────
        for (const ann of toSend) {
          try {
            const pushResult = await sendWebPushToUser(uid, {
              title: `${ann.scriptName || ann.scriptCode} (${ann.exchange || 'BSE'})`,
              body:  `[${ann.category || 'Announcement'}] ${ann.subject || 'New update'}`,
              url:   ann.pdfUrl || 'https://tatvarthstockwatch.web.app/',
              tag:   `ann-${String(ann.id).slice(0, 20)}`,
            });
            stats.pushSent += (pushResult.sent || 0);
          } catch (err) {
            console.error(`[NotifEngine:${runId}] Push error uid=${uid}:`, err.message);
            stats.failed++;
          }
        }
      }

      pageToken = result.pageToken;
    } while (pageToken);

  } catch (err) {
    console.error(`[NotifEngine:${runId}] Fatal error:`, err.message);
    stats.failed++;
  }
}

/**
 * Inverted Notification Engine Flow (O(M) Announcements -> Target Users)
 */
async function processInvertedAnnouncements({ newAnnouncements, classified, stats, runId, verbose, isShadow = false }) {
  const startTime = Date.now();
  const prefsStore = require('./prefsStore');

  // 1. Resolve target UIDs for the entire announcement batch
  const targetUids = await resolveRecipientsForBatch(newAnnouncements);
  stats.usersProcessed = targetUids.size;

  if (verbose) {
    console.log(`[NotifEngine:${runId}] Inverted Router resolved ${targetUids.size} unique target users`);
  }

  const toDispatch = [];

  // 2. Evaluate category blocking & dedup for target users only
  for (const uid of targetUids) {
    let prefs = await redisNotifStore.getPrefs(uid);
    if (!prefs) {
      try {
        prefs = await prefsStore.getPrefs(uid);
        if (prefs) redisNotifStore.setPrefs(uid, prefs).catch(() => {});
      } catch (err) {
        console.error(`[NotifEngine:${runId}] Prefs fetch error for ${uid} — skip (fail-closed)`);
        continue;
      }
    }

    if (!prefs) continue;

    for (const { announcement: ann, classification } of classified) {
      const decision = evaluateNotificationFilter({
        announcement: ann,
        classification,
        preferences: prefs,
        channel: 'push',
      });

      if (decision.shouldNotify) {
        // Atomic deduplication via Redis SET NX EX
        const acquired = await redisNotifStore.acquireDedupLock(ann.id, uid, 'PUSH', 86400);
        if (acquired) {
          toDispatch.push({ uid, announcement: ann });
        } else {
          stats.alreadySent++;
        }
      } else {
        stats.categoryBlocked++;
      }
    }
  }

  stats.queued = toDispatch.length;

  if (isShadow) {
    console.log(`[NotifEngine:${runId}] [SHADOW MODE] Would dispatch ${toDispatch.length} web push alerts.`);
    return stats;
  }

  // 3. Dispatch Web Push with bounded concurrency
  if (toDispatch.length > 0) {
    const dispatchRes = await dispatchPushBatch(toDispatch);
    stats.pushSent = dispatchRes.sent;
    stats.failed += dispatchRes.failed;
  }

  stats.durationMs = Date.now() - startTime;

  if (verbose) {
    console.log(`[NotifEngine:${runId}] Inverted Complete`, JSON.stringify(stats));
  }

  return stats;
}

/**
 * processNewIpos
 *
 * Process and dispatch notifications for newly discovered IPOs.
 *
 * @param {Object[]} newIpos — Genuinely new IPO objects
 * @returns {Promise<Object>} — Summary stats
 */
async function processNewIpos(newIpos) {
  const stats = { newIpos: newIpos.length, pushSent: 0, telegramSent: 0, failed: 0 };
  if (!Array.isArray(newIpos) || newIpos.length === 0) return stats;

  try {
    const admin = require('firebase-admin');
    const prefsStore = require('./prefsStore');
    const { markNotificationsSent } = require('./ipoStore');
    const { sendTelegramIpoAlert, isConfigured: isTelegramOk } = require('./telegramNotifier');
    const { sendWebPushToUser } = require('./webPushNotifier');
    const { acquireDedupLock } = require('./notificationDedup');
    const db = await getDb();

    let pageToken;
    do {
      const result = await admin.auth().listUsers(100, pageToken);

      for (const user of result.users) {
        const uid = user.uid;
        let prefs;
        try {
          prefs = await prefsStore.getPrefs(uid);
        } catch {
          continue;
        }

        // Skip user if they explicitly disabled IPO allotment alerts
        if (prefs.notifyIpoAllotment === false) continue;

        // User creation timestamp in ms
        const userCreatedAtMs = new Date(user.metadata?.creationTime || 0).getTime();

        for (const ipo of newIpos) {
          const symbol = ipo.symbol;
          const ipoSeenMs = new Date(ipo.firstSeenAt || ipo.createdAt || Date.now()).getTime();

          // Safeguard for newly onboarded users:
          // If the user's account was created AFTER this IPO was first discovered,
          // do NOT bombard the new user with past IPO notifications.
          if (userCreatedAtMs > 0 && userCreatedAtMs > (ipoSeenMs + 5 * 60 * 1000)) {
            continue;
          }

          const fakeAnn = { id: `IPO_NEW_${symbol}` };

          // Per-user atomic dedup lock
          let acquired = false;
          try {
            acquired = await acquireDedupLock(db, uid, fakeAnn);
          } catch {
            continue;
          }

          if (!acquired) continue;

          // Dispatch Web Push
          try {
            const pushRes = await sendWebPushToUser(uid, {
              title: 'New IPO Allotment Check Available',
              body: `${ipo.name || symbol} is now available for allotment verification.`,
              url: '/ipo-verification',
              tag: `ipo-${symbol}`,
              type: 'ipo',
              actions: [
                { action: 'check-ipo', title: 'Check Allotment' },
                { action: 'dismiss', title: 'Dismiss' }
              ]
            });
            stats.pushSent += (pushRes.sent || 0);
          } catch (err) {
            console.error(`[NotifEngine:IPO] Web push failed for uid=${uid}:`, err.message);
            stats.failed++;
          }

          // Dispatch Telegram if enabled
          const targetChat = prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID;
          if (isTelegramOk(targetChat) && prefs.telegramEnabled !== false) {
            try {
              const tgRes = await sendTelegramIpoAlert(ipo, targetChat);
              if (tgRes.sent) {
                stats.telegramSent++;
                await _delay(TELEGRAM_DELAY_MS);
              }
            } catch (err) {
              console.error(`[NotifEngine:IPO] Telegram failed for uid=${uid}:`, err.message);
            }
          }
        }
      }
      pageToken = result.pageToken;
    } while (pageToken);

    // Update notificationSent = true in MongoDB iposymbols collection
    await markNotificationsSent(newIpos).catch((e) => console.error('[NotifEngine:IPO] Failed to mark notificationSent:', e.message));

  } catch (err) {
    console.error('[NotifEngine:IPO] Error processing new IPOs:', err.message);
  }

  console.log(`[NotifEngine:IPO] Processed ${newIpos.length} new IPOs: PushSent=${stats.pushSent} TelegramSent=${stats.telegramSent}`);
  return stats;
}

async function processAnnouncement(announcement, runId = Date.now(), verbose = false) {
  return await processNewAnnouncements([announcement], runId, verbose);
}

const processAnnouncementBatch = processNewAnnouncements;

module.exports = { 
  processNewAnnouncements, 
  processAnnouncement,
  processAnnouncementBatch,
  processNewIpos 
};
