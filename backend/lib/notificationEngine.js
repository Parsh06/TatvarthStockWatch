'use strict';

/**
 * notificationEngine.js
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  NOTIFICATION ENGINE — Central orchestrator for announcement notifications  ║
 * ║                                                                              ║
 * ║  Pipeline:                                                                   ║
 * ║    newAnnouncements                                                          ║
 * ║        ↓                                                                     ║
 * ║    Partition users → ALL_ANNOUNCEMENTS | WATCHLIST_ONLY | NONE              ║
 * ║        ↓                                                                     ║
 * ║    For each user → resolve candidate pool                                   ║
 * ║        ↓                                                                     ║
 * ║    Category / Subcategory filtering (notificationFilter.js)                 ║
 * ║        ↓                                                                     ║
 * ║    Per-user deduplication (notificationDedup.js)                            ║
 * ║        ↓                                                                     ║
 * ║    Channel dispatch → Push + Telegram                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * CRITICAL RULES:
 *   1. If prefs cannot be fetched → FAIL CLOSED (no notification sent)
 *   2. Category filters are always authoritative regardless of scope
 *   3. A user with both notifyWatchlist=true AND notifyAllAnnouncements=true
 *      receives ONE notification per announcement (not two)
 *   4. Telegram rate-limit: max 1 message per 350ms between sends
 */

const { resolveNotificationScope, matchesNotificationScope, SCOPE } = require('./notificationScope');
const { shouldNotify } = require('./notificationFilter');
const { acquireDedupLock, getAlreadySentIds }   = require('./notificationDedup');
const { getDb }   = require('./mongoClient');

// ─── Telegram rate-limit helper ──────────────────────────────────────────────
const TELEGRAM_DELAY_MS = 350; // ≤ ~3 msg/s per Telegram Bot API limits

async function _delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * processNewAnnouncements
 *
 * Main entry point called by /api/trigger and /api/cron/trigger.
 *
 * @param {Object[]} newAnnouncements — Array of truly new, normalized announcement objects
 * @param {Object}   opts
 * @param {boolean}  [opts.verbose]   — Log extra detail (default: true)
 * @returns {Promise<Object>}          — Summary stats for the run
 */
async function processNewAnnouncements(newAnnouncements, opts = {}) {
  const { verbose = true } = opts;
  const runId = `RUN-${Date.now()}`;

  const stats = {
    runId,
    newAnnouncements: newAnnouncements.length,
    usersProcessed:   0,
    allScopeUsers:    0,
    watchlistUsers:   0,
    noneUsers:        0,
    candidatesTotal:  0,
    categoryBlocked:  0,
    alreadySent:      0,
    queued:           0,
    pushSent:         0,
    telegramSent:     0,
    failed:           0,
    durationMs:       0,
  };

  if (newAnnouncements.length === 0) {
    if (verbose) console.log(`[NotifEngine:${runId}] No new announcements — skipping user loop`);
    return stats;
  }

  const startTime = Date.now();

  try {
    const admin       = require('firebase-admin');
    const prefsStore  = require('./prefsStore');
    const watchlistStore = require('./watchlistStore');
    const { sendTelegramAlert, isConfigured: isTelegramOk } = require('./telegramNotifier');
    const { sendWebPushToUser } = require('./webPushNotifier');
    const db = await getDb();

    if (verbose) console.log(`[NotifEngine:${runId}] Processing ${newAnnouncements.length} new announcements across all users`);

    // ── Iterate all Firebase users ──────────────────────────────────────────
    let pageToken;
    do {
      const result = await admin.auth().listUsers(100, pageToken);

      for (const user of result.users) {
        const uid = user.uid;
        stats.usersProcessed++;

        // ── 1. Fetch prefs — fail closed on error ─────────────────────────
        let prefs;
        try {
          prefs = await prefsStore.getPrefs(uid);
          if (!prefs) throw new Error('Empty prefs returned');
        } catch (err) {
          console.error(`[NotifEngine:${runId}] Cannot fetch prefs for uid=${uid} — skipping (fail-closed):`, err.message);
          continue;
        }

        // ── 2. Resolve notification scope ─────────────────────────────────
        const scope = resolveNotificationScope(prefs);

        if (scope === SCOPE.NONE) {
          stats.noneUsers++;
          continue;
        }

        // ── 3. Build user's watchlist sets for WATCHLIST_ONLY scope ───────
        let bseSet = new Set();
        let nseSet = new Set();

        if (scope === SCOPE.WATCHLIST_ONLY) {
          const uScripts = await watchlistStore.getWatchlist(uid);
          if (!uScripts || uScripts.length === 0) {
            // No watchlist → no notifications in WATCHLIST_ONLY mode
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

        // ── 4. Resolve candidate pool based on scope ──────────────────────
        const candidates = newAnnouncements.filter(ann =>
          matchesNotificationScope({ announcement: ann, scope, bseSet, nseSet }).inScope
        );

        if (candidates.length === 0) continue;
        stats.candidatesTotal += candidates.length;

        // ── 5. Category / subcategory filtering ───────────────────────────
        const categoryPassed = candidates.filter(ann => {
          const decision = shouldNotify({ prefs, announcement: ann, uid, notificationChannel: 'push+telegram' });
          if (!decision.shouldNotify) stats.categoryBlocked++;
          return decision.shouldNotify;
        });

        if (categoryPassed.length === 0) continue;

        // ── 6. Per-user deduplication — atomic lock acquisition ───────────
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
            if (e.code !== 11000) console.error(`[NotifEngine:${runId}] Dedup error for uid=${uid} ann=${ann.id}:`, e.message);
            // On unexpected dedup error, skip this announcement to avoid double-sends
          }
        }

        if (toSend.length === 0) continue;
        stats.queued += toSend.length;

        // ── 7. Channel dispatch ───────────────────────────────────────────

        // — Telegram —
        const telegramConfigured = isTelegramOk(prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID);
        if (telegramConfigured && prefs.telegramEnabled !== false) {
          const targetChat = prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID;
          try {
            // Send one at a time with rate-limit delay to respect Telegram limits
            for (const ann of toSend) {
              const tgRes = await sendTelegramAlert([ann], targetChat);
              if (tgRes.sent) {
                stats.telegramSent++;
                // Save Telegram message ID back to MongoDB for potential edits
                if (tgRes.messageIds && tgRes.messageIds.length > 0) {
                  try {
                    await db.collection('announcements').updateOne(
                      { _id: String(ann.id) },
                      { $push: { telegramMessages: { userId: uid, chatId: targetChat, messageId: tgRes.messageIds[0] } } }
                    );
                  } catch { /* Non-critical — log but continue */ }
                }
              } else {
                stats.failed++;
              }
              // Rate-limit buffer between Telegram messages
              await _delay(TELEGRAM_DELAY_MS);
            }
          } catch (err) {
            console.error(`[NotifEngine:${runId}] Telegram dispatch error for uid=${uid}:`, err.message);
            stats.failed += toSend.length;
          }
        }

        // — Web Push (multi-device) —
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
            console.error(`[NotifEngine:${runId}] Push error for uid=${uid}:`, err.message);
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

  stats.durationMs = Date.now() - startTime;

  if (verbose) {
    console.log(`[NotifEngine:${runId}] Complete`, JSON.stringify({
      newAnnouncements: stats.newAnnouncements,
      users:            stats.usersProcessed,
      allScope:         stats.allScopeUsers,
      watchlistScope:   stats.watchlistUsers,
      none:             stats.noneUsers,
      candidates:       stats.candidatesTotal,
      categoryBlocked:  stats.categoryBlocked,
      alreadySent:      stats.alreadySent,
      queued:           stats.queued,
      pushSent:         stats.pushSent,
      telegramSent:     stats.telegramSent,
      failed:           stats.failed,
      durationMs:       stats.durationMs,
    }));
  }

  return stats;
}

module.exports = { processNewAnnouncements };
