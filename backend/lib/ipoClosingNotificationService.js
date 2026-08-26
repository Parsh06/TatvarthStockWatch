'use strict';

/**
 * ipoClosingNotificationService.js
 *
 * Sends ONE Web Push notification per IPO that closes today.
 * Integrated as a "tick" inside /api/cron/trigger (runs EVERY 1 MINUTE).
 *
 * Architecture (Atomic Queue State Machine, Serverless-safe):
 *   • Dispatch window: 11:00 AM – 12:59 PM IST (Grace period up to 13:15 PM IST)
 *   • 1-Minute Cron Cadence:
 *       → Each tick acquires a fail-closed tokenized tick lock.
 *       → First tick populates the state-machine PENDING queue.
 *       → Subsequent ticks atomically claim items into PROCESSING HASH.
 *       → Stale processing recovery automatically returns crashed worker items to PENDING.
 *       → Active workers issue lease heartbeats every 30 seconds.
 *       → Upon successful batch dispatch, item transitions atomically to COMPLETED SET.
 *       → Failed items exceeding max attempts (3) transition to FAILED HASH.
 *
 * Guarantees:
 *   • At-least-once IPO processing with zero item loss across serverless container crashes.
 *   • Deduplication prevents duplicate notifications per user per IPO.
 *   • Classified retry: release dedup lock on transient push errors, retain lock on expired token cleanups.
 */

const { sendWebPushToUser } = require('./webPushNotifier');
const redisNotifStore       = require('./redis/redisNotificationStore');
const prefsStore            = require('./prefsStore');
const { getISTDateTime, getISTDateString, isWithinIpoDispatchWindow } = require('./time/istTime');

// ── Config ────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 50;  // concurrent web push calls per batch

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build one clean, concise push notification payload for a single IPO.
 */
function buildSingleIpoPayload(ipo, dateIST) {
  const gainText = ipo.gmpPercentage > 0 ? ` (+${ipo.gmpPercentage}% Gain)` : '';
  const gmpText  = ipo.gmp > 0
    ? `GMP: \u20b9${ipo.gmp}${gainText}`
    : 'GMP not yet available';

  return {
    title: `\u23f0 IPO Closing Today: ${ipo.name}`,
    body:  `${gmpText} \u2022 Last day to apply! Tap to view.`,
    url:   '/ipo-gmp',
    tag:   `ipo-closing-${dateIST}-${ipo.id}`,
    type:  'IPO_CLOSING',
  };
}

/**
 * Resolve UIDs who have opted-in to IPO closing reminders.
 */
async function resolveOptedInUsers() {
  const redisUsers = await redisNotifStore.getIpoClosingUsers();

  if (redisUsers !== null) {
    console.log(`[IpoClosingNotif] Redis SET resolved ${redisUsers.length} opted-in user(s).`);
    return redisUsers;
  }

  console.warn('[IpoClosingNotif] Redis index uninitialized — falling back to DB/Firebase Auth scan.');
  const admin = require('firebase-admin');
  const uids  = [];
  let pageToken;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    for (const user of result.users) {
      try {
        const prefs = await prefsStore.getPrefs(user.uid);
        if (prefs && prefs.notifyIpoClosing !== false) {
          uids.push(user.uid);
          redisNotifStore.addIpoClosingUser(user.uid).catch(() => {});
        }
      } catch { /* skip user if prefs fetch fails */ }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  await redisNotifStore.setIpoClosingUsersIndexReady().catch(() => {});

  console.log(`[IpoClosingNotif] Firebase scan complete: ${uids.length} opted-in user(s). Index seeded.`);
  return uids;
}

/**
 * Dispatch one IPO's notification to all opted-in users with lease heartbeats.
 */
async function dispatchSingleIpo(ipo, optedInUids, dateIST, ownerToken) {
  const payload = buildSingleIpoPayload(ipo, dateIST);
  const stats   = { sent: 0, failed: 0, expired: 0, dedupSkipped: 0, pushDisabled: 0 };
  let lastHeartbeat = Date.now();

  for (let i = 0; i < optedInUids.length; i += BATCH_SIZE) {
    // Send lease renewal heartbeat every 30 seconds during long dispatches
    if (Date.now() - lastHeartbeat > 30000) {
      await redisNotifStore.renewLease(dateIST, ipo.id, ownerToken, 120000).catch(() => {});
      lastHeartbeat = Date.now();
    }

    const batch = optedInUids.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (uid) => {
      try {
        const prefs = await prefsStore.getPrefs(uid).catch(() => null);
        if (prefs && prefs.pushEnabled === false) {
          stats.pushDisabled++;
          return;
        }

        const canSend = await redisNotifStore.acquireIpoClosingIpoDedupLock(dateIST, ipo.id, uid);
        if (!canSend) {
          stats.dedupSkipped++;
          return;
        }

        const result = await sendWebPushToUser(uid, payload);
        stats.sent    += result.sent    || 0;
        stats.failed  += result.failed  || 0;
        stats.expired += result.expired || 0;

        // If push failed due to a transient network error (no sent, >0 failed), release dedup lock for retry
        if ((result.sent || 0) === 0 && (result.failed || 0) > 0) {
          await redisNotifStore.releaseUserDedupLock(dateIST, ipo.id, uid).catch(() => {});
        }

      } catch (err) {
        console.error(`[IpoClosingNotif] Error uid=${uid} ipoId=${ipo.id}:`, err.message);
        stats.failed++;
        await redisNotifStore.releaseUserDedupLock(dateIST, ipo.id, uid).catch(() => {});
      }
    }));
  }

  return stats;
}

/**
 * processIpoClosingQueueTick
 *
 * Called on 1-minute main cron invocations.
 * Uses atomic state machine, tokenized tick locks, lease heartbeats, and dynamic catch-up mode.
 *
 * @param {boolean} [force=false] — bypass time-window check (for manual testing)
 * @returns {Promise<Object>}     — stats for this tick
 */
async function processIpoClosingQueueTick({ force = false } = {}) {
  const { dateIST, istHour, istMinute } = getISTDateTime();
  const ownerToken = `TICK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Normal Window: 11:00 AM – 12:59 PM IST. Grace Window: 13:00 PM – 13:15 PM IST.
  const isNormalWindow = isWithinIpoDispatchWindow();
  const isGraceWindow  = istHour === 13 && istMinute <= 15;

  if (!force && !isNormalWindow && !isGraceWindow) {
    return { skipped: true, reason: 'OUTSIDE_DISPATCH_WINDOW', istHour, istMinute, dateIST };
  }

  // Step 0: Acquire Tokenized Distributed Tick Lock (FAIL-CLOSED)
  const lockAcquired = await redisNotifStore.acquireTickLock(dateIST, ownerToken, 120);
  if (!lockAcquired) {
    return { skipped: true, reason: 'TICK_LOCK_HELD_OR_REDIS_OFFLINE', dateIST };
  }

  try {
    // Step 0.5: Recover stale items from crashed workers
    const recoveryStats = await redisNotifStore.recoverStaleProcessingItems(dateIST, 3);
    if (recoveryStats.recovered > 0 || recoveryStats.failed > 0) {
      console.log(`[IpoClosingQueue] Stale recovery: recovered=${recoveryStats.recovered}, maxAttemptsFailed=${recoveryStats.failed}`);
    }

    // Step 1: Populate queue on first tick for today (only during normal window)
    const isPopulated = await redisNotifStore.isIpoClosingQueuePopulated(dateIST);

    if (!isPopulated && isNormalWindow) {
      const { getIposClosingToday } = require('../services/ipoService');
      const fetchResult = await getIposClosingToday();

      if (!fetchResult.ok) {
        console.warn(`[IpoClosingQueue] ${dateIST}: Scrapers unavailable (${fetchResult.error}). Will retry next minute.`);
        return { skipped: true, reason: 'UPSTREAM_SCRAPER_FAILURE', error: fetchResult.error, dateIST };
      }

      const closingIpos = fetchResult.ipos || [];
      if (closingIpos.length === 0) {
        await redisNotifStore.populateIpoClosingQueue(dateIST, []);
        console.log(`[IpoClosingQueue] ${dateIST}: No IPOs closing today. Queue marked empty.`);
        return { skipped: true, reason: 'NO_IPOS_CLOSING_TODAY', dateIST };
      }

      const sorted = [...closingIpos].sort((a, b) => b.gmpPercentage - a.gmpPercentage);
      await redisNotifStore.populateIpoClosingQueue(dateIST, sorted);

      console.log(
        `[IpoClosingQueue] ${dateIST}: Populated ${sorted.length} IPO(s): ` +
        `[${sorted.map(i => `${i.name} (+${i.gmpPercentage}%)`).join(', ')}]`
      );
    }

    // Step 2: Determine capacity-aware items to process
    const statusObj = await redisNotifStore.getIpoClosingQueueStatus(dateIST);
    const pendingCount = statusObj.pendingCount || 0;

    if (pendingCount === 0 && (statusObj.processingCount || 0) === 0) {
      return { skipped: true, reason: 'QUEUE_EMPTY_ALL_DISPATCHED', dateIST };
    }

    let itemsToProcess = 1;
    if (istHour === 12 && istMinute >= 50) {
      const remainingMinutes = Math.max(1, 60 - istMinute);
      itemsToProcess = Math.min(5, Math.ceil(pendingCount / remainingMinutes));
    } else if (isGraceWindow) {
      itemsToProcess = Math.min(5, pendingCount);
    }

    const tickStats = {
      dispatched: false,
      itemsProcessed: 0,
      iposHandled: [],
      sentTotal: 0,
      failedTotal: 0,
      durationMs: 0,
      dateIST,
    };

    const t0 = Date.now();
    const optedInUids = await resolveOptedInUsers();

    for (let count = 0; count < itemsToProcess; count++) {
      const claimedRecord = await redisNotifStore.claimNextIpoForProcessing(dateIST, ownerToken, 120000);
      if (!claimedRecord) break;

      const ipo = claimedRecord.ipo;
      console.log(`[IpoClosingQueue] Claimed "${ipo.name}" (attempt ${claimedRecord.attempts}) for ${optedInUids.length} user(s).`);

      let ipoDispatchStats = { sent: 0, failed: 0, expired: 0, dedupSkipped: 0, pushDisabled: 0 };
      if (optedInUids.length > 0) {
        ipoDispatchStats = await dispatchSingleIpo(ipo, optedInUids, dateIST, ownerToken);
      }

      // Mark completed atomically in Redis
      await redisNotifStore.markIpoCompleted(dateIST, ipo.id, ownerToken);

      tickStats.dispatched = true;
      tickStats.itemsProcessed++;
      tickStats.iposHandled.push({ name: ipo.name, ...ipoDispatchStats });
      tickStats.sentTotal += ipoDispatchStats.sent || 0;
      tickStats.failedTotal += ipoDispatchStats.failed || 0;
    }

    tickStats.durationMs = Date.now() - t0;
    return tickStats;

  } finally {
    await redisNotifStore.releaseTickLock(dateIST, ownerToken).catch(() => {});
  }
}

module.exports = { processIpoClosingQueueTick, getISTDateString };
