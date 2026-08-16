'use strict';

const redisNotifStore = require('../redis/redisNotificationStore');
const watchlistStore = require('../watchlistStore');

/**
 * Inverted Notification Router.
 * Resolves the unique UIDs of users who should be evaluated for a batch of announcements.
 *
 * Recipient Rule:
 * (scope === 'ALL') OR (scope === 'WATCHLIST' AND user watches instrumentKey)
 *
 * @param {Array<object>} announcements
 * @returns {Promise<Set<string>>} Unique recipient UIDs
 */
async function resolveRecipientsForBatch(announcements) {
  const recipientUids = new Set();

  if (!announcements || announcements.length === 0) {
    return recipientUids;
  }

  // 1. Resolve ALL market scope users from Redis
  const allScopeUsers = await redisNotifStore.getScopeAllUsers();
  allScopeUsers.forEach(uid => recipientUids.add(uid));

  // 2. Extract unique instrument keys from announcements
  const instrumentKeys = new Set();
  for (const ann of announcements) {
    const bse = (ann.scriptCode || ann.ltdCode || '').toString().trim();
    const nse = (ann.symbol || ann.nseSymbol || '').toString().trim().toUpperCase();

    if (bse) instrumentKeys.add(`BSE:${bse}`);
    if (nse) instrumentKeys.add(`NSE:${nse}`);
  }

  // 3. For each instrument key, query Redis set (or fallback to Mongo)
  for (const key of instrumentKeys) {
    const watchers = await redisNotifStore.getWatchers(key);
    if (watchers && watchers.length > 0) {
      watchers.forEach(uid => recipientUids.add(uid));
    } else {
      // Fallback query to MongoDB if Redis key is missing
      const mongoWatchers = await watchlistStore.getWatchersForInstruments([key]);
      mongoWatchers.forEach(uid => {
        recipientUids.add(uid);
        // Seed Redis asynchronously
        redisNotifStore.addWatcher(key, uid).catch(() => {});
      });
    }
  }

  return recipientUids;
}

module.exports = {
  resolveRecipientsForBatch,
};
