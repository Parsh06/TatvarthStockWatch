'use strict';

/**
 * ipoClosingNotificationService.js
 *
 * Orchestrates Web Push notifications for IPOs whose subscription window closes today.
 * Intentionally isolated from the main announcement notification engine.
 *
 * Architecture:
 *   1. Acquire daily execution lock (prevents duplicate processing from the same day)
 *   2. Fetch opted-in UIDs from Redis SET — fast O(1) lookup
 *      → Falls back to Firebase Auth scan only if Redis is unavailable
 *   3. Build ONE grouped notification payload (1 push per user regardless of how many IPOs close)
 *   4. Dispatch in batches of 25 concurrent sends (bounded concurrency)
 *   5. Per-user Redis dedup lock — max 1 IPO closing notification per user per day
 *
 * Called exclusively by: /api/cron/ipo-closing (hits at 05:30 UTC = 11:00 AM IST)
 */

const { sendWebPushToUser } = require('./webPushNotifier');
const redisNotifStore       = require('./redis/redisNotificationStore');
const prefsStore            = require('./prefsStore');

const BATCH_SIZE = 25; // bounded concurrency per batch

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get the current date in IST as YYYY-MM-DD.
 * IST = UTC + 5 hours 30 minutes.
 */
function getISTDateString() {
  const now  = new Date();
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs).toISOString().slice(0, 10);
}

/**
 * Build a single grouped notification payload for all closing IPOs.
 *
 * 1 IPO  → Specific title + GMP in body.
 * 2+ IPOs → Grouped "X IPOs Closing Today" with best GMP as a hint.
 */
function buildNotificationPayload(closingIpos, dateIST) {
  if (!closingIpos || closingIpos.length === 0) return null;

  if (closingIpos.length === 1) {
    const ipo    = closingIpos[0];
    const gmpStr = ipo.gmp > 0
      ? ` Current GMP: \u20b9${ipo.gmp}${ipo.gmpPercentage > 0 ? ` (+${ipo.gmpPercentage}%)` : ''}.`
      : '';
    return {
      title: `\u23f0 IPO Closing Today: ${ipo.name}`,
      body:  `Today is the LAST day to apply.${gmpStr} Tap to view details.`,
      url:   '/ipo-gmp',
      tag:   `ipo-closing-${dateIST}`,
      type:  'IPO_CLOSING',
    };
  }

  // Multiple IPOs — group into one notification
  const maxGmp  = closingIpos.reduce((best, i) => (i.gmp > best.gmp ? i : best), closingIpos[0]);
  const gmpHint = maxGmp.gmp > 0
    ? ` Highest GMP: \u20b9${maxGmp.gmp} (${maxGmp.name}).`
    : '';

  return {
    title: `\u23f0 ${closingIpos.length} IPOs Closing Today`,
    body:  `Today is the last day to apply for ${closingIpos.length} IPOs.${gmpHint} Tap to check details.`,
    url:   '/ipo-gmp',
    tag:   `ipo-closing-${dateIST}`,
    type:  'IPO_CLOSING',
  };
}

/**
 * Resolve opted-in user UIDs.
 *
 * Primary path  → Redis SET  (milliseconds, no Firebase round-trips)
 * Fallback path → Firebase Auth listUsers scan with per-user prefs check
 *                 (used only when Redis is unavailable)
 */
async function resolveOptedInUsers() {
  const redisUsers = await redisNotifStore.getIpoClosingUsers();

  if (redisUsers !== null) {
    // Redis is up and returned the SET (may be empty array if no one opted in)
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
        // notifyIpoClosing defaults to true — undefined means ON
        if (prefs.notifyIpoClosing !== false) {
          uids.push(user.uid);
        }
      } catch {
        // Skip user if prefs fetch fails — fail closed for this user only
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`[IpoClosingNotif] Firebase scan complete: ${uids.length} opted-in user(s).`);
  return uids;
}

/**
 * Process one batch of UIDs with bounded concurrency (25 at a time).
 * Includes per-user dedup check before every send.
 */
async function processBatch(uids, payload, dateIST, stats) {
  await Promise.all(uids.map(async (uid) => {
    try {
      // Check if push is explicitly disabled for this user
      const prefs = await prefsStore.getPrefs(uid).catch(() => null);
      if (prefs && prefs.pushEnabled === false) {
        stats.pushDisabled++;
        return;
      }

      // Per-user daily dedup — at most 1 push per user per IST calendar day
      const canSend = await redisNotifStore.acquireIpoClosingDedupLock(dateIST, uid);
      if (!canSend) {
        stats.dedupSkipped++;
        return;
      }

      const result = await sendWebPushToUser(uid, payload);
      stats.sent    += result.sent    || 0;
      stats.failed  += result.failed  || 0;
      stats.expired += result.expired || 0;

    } catch (err) {
      console.error(`[IpoClosingNotif] Error for uid=${uid}:`, err.message);
      stats.failed++;
    }
  }));
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * processIpoClosingReminder
 *
 * @param {Array} closingIpos  — Already fetched, normalized closing IPOs (from getIposClosingToday)
 * @returns {Promise<Object>}  — Structured stats object for the cron API response
 */
async function processIpoClosingReminder(closingIpos) {
  const dateIST = getISTDateString();
  const runId   = `IPOCLOSE-${Date.now()}`;

  const stats = {
    dateIST,
    runId,
    alreadyProcessed: false,
    closingIpoCount:  closingIpos.length,
    closingIpoNames:  closingIpos.map(i => i.name),
    optedInUsers:     0,
    sent:             0,
    failed:           0,
    expired:          0,
    dedupSkipped:     0,
    pushDisabled:     0,
    durationMs:       0,
  };

  if (closingIpos.length === 0) {
    return { ...stats, skipped: true, reason: 'NO_IPOS_CLOSING_TODAY' };
  }

  const t0 = Date.now();

  // Step 1 — Acquire daily run lock (TTL = 2 hours)
  const lockAcquired = await redisNotifStore.acquireIpoClosingRunLock(dateIST, runId);
  if (!lockAcquired) {
    console.log(`[IpoClosingNotif] Lock already held for ${dateIST}. Skipping duplicate run.`);
    return { ...stats, alreadyProcessed: true, reason: 'ALREADY_PROCESSED_FOR_TODAY' };
  }

  console.log(`[IpoClosingNotif] ${runId} started. Date: ${dateIST}. Closing: [${closingIpos.map(i => i.name).join(', ')}]`);

  // Step 2 — Build the single notification payload
  const payload = buildNotificationPayload(closingIpos, dateIST);
  if (!payload) {
    stats.durationMs = Date.now() - t0;
    return { ...stats, skipped: true, reason: 'PAYLOAD_BUILD_FAILED' };
  }

  // Step 3 — Get opted-in UIDs (Redis first, Firebase fallback)
  const optedInUids      = await resolveOptedInUsers();
  stats.optedInUsers     = optedInUids.length;

  if (optedInUids.length === 0) {
    console.log('[IpoClosingNotif] No opted-in users. Nothing to dispatch.');
    stats.durationMs = Date.now() - t0;
    return stats;
  }

  // Step 4 — Bounded-concurrency dispatch (25 at a time)
  for (let i = 0; i < optedInUids.length; i += BATCH_SIZE) {
    const batch = optedInUids.slice(i, i + BATCH_SIZE);
    await processBatch(batch, payload, dateIST, stats);
  }

  stats.durationMs = Date.now() - t0;

  console.log(
    `[IpoClosingNotif] Complete. sent=${stats.sent} failed=${stats.failed} ` +
    `expired=${stats.expired} dedupSkipped=${stats.dedupSkipped} ` +
    `pushDisabled=${stats.pushDisabled} durationMs=${stats.durationMs}ms`
  );

  return stats;
}

module.exports = { processIpoClosingReminder, getISTDateString };
