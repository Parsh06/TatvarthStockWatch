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
};

module.exports = redisKeys;
