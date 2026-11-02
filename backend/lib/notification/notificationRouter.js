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
/**
 * Resolves ALL market scope users with Redis-first lookup and zero-downtime Firestore fallback.
 */
async function getEffectiveAllScopeUsers() {
  let uids = await redisNotifStore.getScopeAllUsers();
  if (Array.isArray(uids) && uids.length > 0) {
    return uids;
  }

  // Fallback: Query Firestore for users who opted in to ALL market announcements
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    const snap = await db.collection('users')
      .where('prefs.notifyAllAnnouncements', '==', true)
      .get();

    const fallbackUids = [];
    snap.forEach(doc => {
      if (doc.id) fallbackUids.push(doc.id);
    });

    // Asynchronously populate Redis cache
    if (fallbackUids.length > 0) {
      for (const u of fallbackUids) {
        redisNotifStore.addScopeAllUser(u).catch(() => {});
      }
    }

    return fallbackUids;
  } catch (err) {
    console.warn('[NotificationRouter] Firestore fallback for ALL scope users warning:', err.message);
    return [];
  }
}

async function resolveRecipientsForBatch(announcements) {
  const recipientUids = new Set();

  if (!announcements || announcements.length === 0) {
    return recipientUids;
  }

  // 1. Resolve ALL market scope users (Redis + Firestore fallback)
  const allScopeUsers = await getEffectiveAllScopeUsers();
  allScopeUsers.forEach(uid => recipientUids.add(uid));

  // 2. Extract unique instrument keys from announcements
  const instrumentKeys = new Set();
  for (const ann of announcements) {
    const bse = (ann.scriptCode || ann.ltdCode || '').toString().trim();
    const nse = (ann.symbol || ann.nseSymbol || '').toString().trim().toUpperCase();

    if (bse) instrumentKeys.add(`BSE:${bse}`);
    if (nse) instrumentKeys.add(`NSE:${nse}`);
  }

  // 3. For each instrument key, query Redis batch (pipelined) or fallback to Mongo
  const keysArray = Array.from(instrumentKeys);
  const batchWatchersMap = await redisNotifStore.getWatchersBatch(keysArray);

  for (const key of keysArray) {
    const watchers = batchWatchersMap.get(key) || [];
    if (watchers.length > 0) {
      watchers.forEach(uid => recipientUids.add(uid));
    } else {
      // Fallback query to MongoDB if Redis key is missing
      const mongoWatchers = await watchlistStore.getWatchersForInstruments([key]);
      mongoWatchers.forEach(uid => recipientUids.add(uid));
      if (mongoWatchers.length > 0) {
        redisNotifStore.addWatchersBatch(key, mongoWatchers).catch(() => {});
      }
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

  // 1. Resolve ALL market scope users ONCE (Redis + Firestore fallback)
  const allScopeUsers = await getEffectiveAllScopeUsers();
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

  // 3. Batch fetch watchers across all unique instrument keys via Redis Pipeline / 30m in-memory cache
  const keysArray = Array.from(instrumentKeysNeeded);
  const batchWatchersMap = await redisNotifStore.getWatchersBatch(keysArray);
  const instrumentWatchersMap = new Map();

  for (const key of keysArray) {
    const cachedWatchers = batchWatchersMap.get(key) || [];
    if (cachedWatchers.length > 0) {
      instrumentWatchersMap.set(key, new Set(cachedWatchers));
    } else {
      // Fallback query to MongoDB only if Redis key returned empty
      const mongoWatchers = await watchlistStore.getWatchersForInstruments([key]);
      instrumentWatchersMap.set(key, new Set(mongoWatchers));
      if (mongoWatchers.length > 0) {
        redisNotifStore.addWatchersBatch(key, mongoWatchers).catch(() => {});
      }
    }
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
