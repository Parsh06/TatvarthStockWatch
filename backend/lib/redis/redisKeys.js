'use strict';

/**
 * Standardized Redis Keys for Notification Acceleration Layer ONLY.
 * Strictly prohibited from non-notification features (dashboard, IPO, spurts, etc.).
 */
const redisKeys = {
  allUsers: () =>
    'notification:scope:ALL',

  watchlistUsers: (instrumentKey) =>
    `notification:watchers:${instrumentKey}`,

  prefs: (uid) =>
    `notification:prefs:${uid}`,

  pushDevices: (uid) =>
    `notification:pushDevices:${uid}`,

  dedup: (announcementId, uid, channel = 'PUSH') =>
    `notification:dedup:${announcementId}:${uid}:${channel}`,

  eventLock: (announcementId) =>
    `notification:lock:announcement:${announcementId}`,

  // ── IPO Closing Notification Keys ─────────────────────────────────

  /** SET of UIDs who have opted-in to IPO closing reminders */
  ipoClosingUsers: () =>
    'notification:ipo-closing:users',

  /** Flag indicating the Redis opt-in index has been populated/initialized */
  ipoClosingUsersIndexReady: () =>
    'notification:ipo-closing:users:index-ready',

  /**
   * Tokenized 1-minute tick lock — prevents overlapping 1-minute cron executions.
   * @param {string} dateIST  e.g. '2026-08-22'
   */
  ipoClosingTickLock: (dateIST) =>
    `notification:ipo-closing:tick-lock:${dateIST}`,

  /**
   * Daily execution lock — prevents cron from processing twice on the same day.
   * @param {string} dateIST  e.g. '2026-08-22'
   */
  ipoClosingRunLock: (dateIST) =>
    `notification:ipo-closing:run:${dateIST}`,

  /**
   * Per-user per-day dedup — at most 1 IPO closing push per user per day.
   * @param {string} dateIST  e.g. '2026-08-22'
   * @param {string} uid
   */
  ipoClosingDedup: (dateIST, uid) =>
    `notification:dedup:ipo-closing:${dateIST}:${uid}:webpush`,

  /**
   * Redis LIST — ordered queue of IPOs to dispatch today (JSON strings, RPUSH/LPOP).
   * Populated once at 11:00 AM IST, TTL 26h.
   */
  /** Redis LIST — ordered queue of IPOs to dispatch today (JSON strings, RPUSH/LPOP). */
  ipoClosingQueue: (dateIST) =>
    `ipo:closing:queue:${dateIST}`,

  /** HASH of currently processing IPOs */
  ipoClosingProcessing: (dateIST) =>
    `ipo:closing:processing:${dateIST}`,

  /** SET of completed IPO IDs for today */
  ipoClosingCompleted: (dateIST) =>
    `ipo:closing:completed:${dateIST}`,

  /** HASH of failed IPOs for today (max attempts exceeded) */
  ipoClosingFailed: (dateIST) =>
    `ipo:closing:failed:${dateIST}`,

  /** HASH of queue execution metadata */
  ipoClosingQueueMeta: (dateIST) =>
    `ipo:closing:meta:${dateIST}`,

  /**
   * Flag indicating today's queue has been populated.
   * Existence check prevents re-fetching on every tick.
   * TTL 26h.
   */
  ipoClosingQueuePopulated: (dateIST) =>
    `ipo:closing:queue-populated:${dateIST}`,

  /**
   * Per-user per-IPO dedup lock — at most 1 push per user per IPO per day.
   * TTL 48h.
   */
  ipoClosingIpoDedup: (dateIST, ipoId, uid) =>
    `notification:dedup:ipo-closing:${dateIST}:ipo:${ipoId}:${uid}:webpush`,
};

module.exports = redisKeys;
