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
};

module.exports = redisKeys;
