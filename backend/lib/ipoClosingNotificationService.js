'use strict';

/**
 * ipoClosingNotificationService.js
 *
 * Sends ONE Web Push notification per IPO that closes today.
 * Integrated as a "tick" inside /api/cron/trigger (runs every 5 min).
 *
 * Architecture (Queue-based, Serverless-safe):
 *   • Dispatch window: 11:00 AM – 12:59 PM IST
 *   • On the FIRST tick in the window for today:
 *       → Fetch all IPOs closing today from live API
 *       → Sort by GMP% descending (best opportunity first)
 *       → Push each IPO as JSON into Redis LIST (queue)
 *       → Set "populated" flag so subsequent ticks skip the fetch
 *   • On every subsequent tick in the window:
 *       → LPOP one IPO from the Redis LIST
 *       → Dispatch one clean push per opted-in user (50 concurrent)
 *       → Per-user per-IPO Redis dedup (SET NX EX 48h) prevents any duplicates
 *       → Return. Next IPO is dispatched on the next 5-min cron tick.
 *
 * Guarantees:
 *   • Each user receives exactly 1 push per IPO (even if cron misfires twice)
 *   • No Vercel serverless timeout — each invocation does at most 1 IPO
 *   • Natural 5-minute spacing between IPO notifications
 *   • Scale-safe: 10,000 users × 10 IPOs handled over ~50 minutes
 *
 * Dispatch time: 11:00 AM IST (05:30 UTC) → first IPO pushed immediately.
 *               11:05 AM IST → second IPO, and so on every 5 minutes.
 *
 * Manual testing: POST /api/cron/ipo-closing (bypasses time window check).
 */

const { sendWebPushToUser } = require('./webPushNotifier');
const redisNotifStore       = require('./redis/redisNotificationStore');
const prefsStore            = require('./prefsStore');

// ── Config ────────────────────────────────────────────────────────────────────
const BATCH_SIZE          = 50;  // concurrent web push calls per batch
const DISPATCH_HOUR_START = 11;  // 11:00 AM IST
const DISPATCH_HOUR_END   = 13;  // up to 12:59 PM IST (safety margin)

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current date in IST as YYYY-MM-DD.
 */
function getISTDateString() {
  const now   = new Date();
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs).toISOString().slice(0, 10);
}

/**
 * Returns the current hour (0–23) in IST.
 */
function getISTHour() {
  const now   = new Date();
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs).getHours();
}

/**
 * Build one clean, concise push notification payload for a single IPO.
 *
 * Each IPO gets a unique `tag` so every notification appears separately
 * in the user's notification tray instead of replacing the previous one.
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
    tag:   `ipo-closing-${dateIST}-${ipo.id}`, // unique per IPO → separate notification
    type:  'IPO_CLOSING',
  };
}

/**
 * Resolve UIDs who have opted-in to IPO closing reminders.
 *
 * Primary path:  Redis SET  (sub-millisecond, no Firebase round-trips)
 * Fallback path: Firebase Auth listUsers scan (only when Redis is down)
 */
async function resolveOptedInUsers() {
  const redisUsers = await redisNotifStore.getIpoClosingUsers();

  if (redisUsers !== null) {
    console.log(`[IpoClosingNotif] Redis SET resolved ${redisUsers.length} opted-in user(s).`);
    return redisUsers;
  }

  // Redis unavailable — fall back to Firebase Auth full scan
  console.warn('[IpoClosingNotif] Redis unavailable — falling back to Firebase Auth scan.');
  const admin = require('firebase-admin');
  const uids  = [];
  let pageToken;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    for (const user of result.users) {
      try {
        const prefs = await prefsStore.getPrefs(user.uid);
        if (prefs.notifyIpoClosing !== false) uids.push(user.uid);
      } catch { /* skip user if prefs fetch fails */ }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`[IpoClosingNotif] Firebase scan complete: ${uids.length} opted-in user(s).`);
  return uids;
}

/**
 * Dispatch one IPO's notification to all opted-in users.
 * Enforces per-user per-IPO dedup via Redis atomic SET NX EX.
 *
 * @param {Object} ipo           — IPO object from ipoService.getIposClosingToday()
 * @param {string[]} optedInUids — UIDs of opted-in users
 * @param {string} dateIST       — YYYY-MM-DD in IST
 * @returns {Object}             — stats { sent, failed, expired, dedupSkipped, pushDisabled }
 */
async function dispatchSingleIpo(ipo, optedInUids, dateIST) {
  const payload = buildSingleIpoPayload(ipo, dateIST);
  const stats   = { sent: 0, failed: 0, expired: 0, dedupSkipped: 0, pushDisabled: 0 };

  for (let i = 0; i < optedInUids.length; i += BATCH_SIZE) {
    const batch = optedInUids.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (uid) => {
      try {
        // Skip if user has explicitly disabled web push
        const prefs = await prefsStore.getPrefs(uid).catch(() => null);
        if (prefs && prefs.pushEnabled === false) {
          stats.pushDisabled++;
          return;
        }

        // Per-user per-IPO dedup — atomic Redis SET NX EX 48h
        const canSend = await redisNotifStore.acquireIpoClosingIpoDedupLock(dateIST, ipo.id, uid);
        if (!canSend) {
          stats.dedupSkipped++;
          return;
        }

        const result   = await sendWebPushToUser(uid, payload);
        stats.sent    += result.sent    || 0;
        stats.failed  += result.failed  || 0;
        stats.expired += result.expired || 0;

      } catch (err) {
        console.error(`[IpoClosingNotif] Error uid=${uid} ipoId=${ipo.id}:`, err.message);
        stats.failed++;
      }
    }));
  }

  return stats;
}

// ── Main Tick (called from /api/cron/trigger every 5 min) ────────────────────

/**
 * processIpoClosingQueueTick
 *
 * Designed to be called on every 5-minute main cron invocation.
 * Each call either populates the queue (first call) or dispatches one IPO.
 * Returns immediately if outside the dispatch window.
 *
 * @param {boolean} [force=false] — bypass time-window check (for manual testing)
 * @returns {Promise<Object>}     — stats for this tick
 */
async function processIpoClosingQueueTick({ force = false } = {}) {
  const dateIST = getISTDateString();
  const istHour = getISTHour();

  // Enforce 11:00 AM – 12:59 PM IST window (unless force-triggered)
  if (!force && (istHour < DISPATCH_HOUR_START || istHour >= DISPATCH_HOUR_END)) {
    return { skipped: true, reason: 'OUTSIDE_DISPATCH_WINDOW', istHour, dateIST };
  }

  // ── Step 1: Populate queue on first tick for today ────────────────────────
  const isPopulated = await redisNotifStore.isIpoClosingQueuePopulated(dateIST);

  if (!isPopulated) {
    const { getIposClosingToday } = require('../services/ipoService');
    const closingIpos = await getIposClosingToday();

    if (closingIpos.length === 0) {
      // Mark populated with "0" count so we don't re-fetch on every tick
      await redisNotifStore.populateIpoClosingQueue(dateIST, []);
      console.log(`[IpoClosingQueue] ${dateIST}: No IPOs closing today. Queue marked empty.`);
      return { skipped: true, reason: 'NO_IPOS_CLOSING_TODAY', dateIST };
    }

    // Sort highest GMP% first (best opportunity gets the earliest notification)
    const sorted = [...closingIpos].sort((a, b) => b.gmpPercentage - a.gmpPercentage);
    await redisNotifStore.populateIpoClosingQueue(dateIST, sorted);

    console.log(
      `[IpoClosingQueue] ${dateIST}: Populated ${sorted.length} IPO(s): ` +
      `[${sorted.map(i => `${i.name} (+${i.gmpPercentage}%)`).join(', ')}]`
    );
  }

  // ── Step 2: Pop the next IPO from the queue ───────────────────────────────
  const nextIpo = await redisNotifStore.popNextIpoFromQueue(dateIST);

  if (!nextIpo) {
    return { skipped: true, reason: 'QUEUE_EMPTY_ALL_DISPATCHED', dateIST };
  }

  // ── Step 3: Resolve opted-in users ───────────────────────────────────────
  const t0          = Date.now();
  const optedInUids = await resolveOptedInUsers();

  console.log(
    `[IpoClosingQueue] Dispatching "${nextIpo.name}" (GMP: ₹${nextIpo.gmp}, ` +
    `+${nextIpo.gmpPercentage}%) to ${optedInUids.length} user(s).`
  );

  if (optedInUids.length === 0) {
    return {
      dispatched:   true,
      ipoName:      nextIpo.name,
      ipoId:        nextIpo.id,
      optedInUsers: 0,
      sent: 0, failed: 0, expired: 0, dedupSkipped: 0, pushDisabled: 0,
      durationMs:   Date.now() - t0,
      dateIST,
    };
  }

  // ── Step 4: Dispatch to all users ────────────────────────────────────────
  const stats = await dispatchSingleIpo(nextIpo, optedInUids, dateIST);

  console.log(
    `[IpoClosingQueue] "${nextIpo.name}" complete. ` +
    `sent=${stats.sent} failed=${stats.failed} ` +
    `expired=${stats.expired} dedup=${stats.dedupSkipped} ` +
    `durationMs=${Date.now() - t0}ms`
  );

  return {
    dispatched:   true,
    ipoName:      nextIpo.name,
    ipoId:        nextIpo.id,
    optedInUsers: optedInUids.length,
    ...stats,
    durationMs:   Date.now() - t0,
    dateIST,
  };
}

module.exports = { processIpoClosingQueueTick, getISTDateString };
