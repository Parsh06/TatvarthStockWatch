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

/**
 * Extracts a stable, non-null announcement ID.
 * Returns null if the announcement is malformed or lacks a valid identifier.
 */
function getStableAnnouncementId(ann) {
  if (!ann) return null;
  const rawId = ann.id || ann._id || ann.NEWSID || ann.newsId || ann.announcementId;
  if (!rawId) return null;
  const strId = String(rawId).trim();
  return (strId.length > 0 && strId !== 'undefined' && strId !== 'null') ? strId : null;
}

/**
 * Extracts canonical instrument keys for an announcement matching watchlistStore.buildInstrumentKey format.
 * Returns e.g. ['BSE:500325', 'NSE:RELIANCE']
 */
function getAnnouncementInstrumentKeys(ann) {
  if (!ann) return [];
  const bse = (ann.scriptCode || ann.ltdCode || ann.bseCode || ann.scripCode || '').toString().trim();
  const nse = (ann.symbol || ann.nseSymbol || '').toString().trim().toUpperCase();

  const keys = [];
  if (bse) keys.push(`BSE:${bse}`);
  if (nse) keys.push(`NSE:${nse}`);
  return keys;
}

/**
 * Resolves a Map of AnnouncementId -> Set<UserId> strictly binding recipients to specific announcements.
 * Batches Redis lookups per unique instrument key to preserve performance.
 *
 * @param {Array<object>} announcements
 * @returns {Promise<Map<string, Set<string>>>} Map of announcement ID to set of recipient UIDs
 */
async function resolveRecipientsMapForBatch(announcements) {
  const recipientsMap = new Map();

  if (!Array.isArray(announcements) || announcements.length === 0) {
    return recipientsMap;
  }

  // 1. Resolve ALL market scope users ONCE
  const allScopeUsers = await redisNotifStore.getScopeAllUsers();
  const allScopeSet = new Set(allScopeUsers);

  // 2. Normalize announcements & collect unique instrument keys across the batch
  const validAnnouncements = [];
  const instrumentKeysNeeded = new Set();

  for (const ann of announcements) {
    const annId = getStableAnnouncementId(ann);
    if (!annId) {
      console.warn('[NotificationRouter] Skipping malformed announcement with missing ID:', ann?.subject || ann?.scriptCode || 'Unknown');
      continue;
    }

    const instrumentKeys = getAnnouncementInstrumentKeys(ann);
    validAnnouncements.push({ ann, annId, instrumentKeys });

    for (const key of instrumentKeys) {
      instrumentKeysNeeded.add(key);
    }
  }

  // 3. Batch fetch watchers per unique instrument key (cached per run)
  const instrumentWatchersMap = new Map();
  for (const key of instrumentKeysNeeded) {
    let watcherSet = new Set();
    const watchers = await redisNotifStore.getWatchers(key);
    if (watchers && watchers.length > 0) {
      watcherSet = new Set(watchers);
    } else {
      // Fallback query to MongoDB if Redis key is unseeded or missing
      const mongoWatchers = await watchlistStore.getWatchersForInstruments([key]);
      watcherSet = new Set(mongoWatchers);
      mongoWatchers.forEach(uid => {
        redisNotifStore.addWatcher(key, uid).catch(() => {});
      });
    }
    instrumentWatchersMap.set(key, watcherSet);
  }

  // 4. Map recipient UIDs per announcement ID
  for (const { annId, instrumentKeys } of validAnnouncements) {
    const recipientsForAnn = new Set(allScopeSet);

    for (const key of instrumentKeys) {
      if (instrumentWatchersMap.has(key)) {
        instrumentWatchersMap.get(key).forEach(uid => recipientsForAnn.add(uid));
      }
    }

    recipientsMap.set(annId, recipientsForAnn);
  }

  return recipientsMap;
}

module.exports = {
  resolveRecipientsForBatch,
  resolveRecipientsMapForBatch,
  getStableAnnouncementId,
  getAnnouncementInstrumentKeys,
};
