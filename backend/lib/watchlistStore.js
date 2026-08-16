'use strict';

const { getDb } = require('./mongoClient');
const { ObjectId } = require('mongodb');
const redisNotifStore = require('./redis/redisNotificationStore');

let globalWatchlistCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let indexesCreated = false;

function buildInstrumentKey(scriptData) {
  const bse = (scriptData.bseCode || scriptData.ltdCode || scriptData.scripCode || '').toString().trim();
  const nse = (scriptData.nseSymbol || scriptData.symbol || '').toString().trim().toUpperCase();

  const keys = [];
  if (bse) keys.push(`BSE:${bse}`);
  if (nse) keys.push(`NSE:${nse}`);
  return keys;
}

async function ensureIndexes() {
  if (indexesCreated) return;
  try {
    const db = await getDb();
    const col = db.collection('watchlists');
    await col.createIndex({ instrumentKey: 1, userId: 1 }, { name: 'idx_watchlists_instrument_user', background: true });
    await col.createIndex({ userId: 1, instrumentKey: 1 }, { name: 'idx_watchlists_user_instrument', background: true });
    indexesCreated = true;
  } catch (e) {
    // Non-critical background index failure
  }
}

/**
 * Get the watchlist for a specific user.
 * @param {string} uid
 * @returns {Promise<object[]>}
 */
async function getWatchlist(uid) {
  if (!uid) return [];
  const db = await getDb();
  try {
    const docs = await db.collection('watchlists').find({ userId: uid }).sort({ addedAt: -1 }).toArray();
    return docs.map(d => ({ ...d, id: String(d._id), _id: undefined }));
  } catch (e) {
    console.error('[WatchlistStore] getWatchlist error:', e);
    return [];
  }
}

/**
 * Save an array of scripts to the user's watchlist in bulk.
 * Used for bulk updates/exports where the entire list is provided.
 * @param {string} uid
 * @param {object[]} scripts
 */
async function saveWatchlist(uid, scripts) {
  if (!uid) return;
  const db = await getDb();
  const collection = db.collection('watchlists');

  try {
    // We do a "replace all" for this user since this function is historically used to sync
    await collection.deleteMany({ userId: uid });
    
    if (scripts.length > 0) {
      const docs = scripts.map(s => {
        const doc = { ...s, userId: uid };
        delete doc.id; // remove frontend ID
        return doc;
      });
      await collection.insertMany(docs);
    }
    invalidateWatchlistCache();
  } catch (e) {
    console.error('[WatchlistStore] saveWatchlist error:', e);
  }
}

/**
 * Add a single script to the watchlist.
 */
async function addScript(uid, scriptData) {
  await ensureIndexes();
  const db = await getDb();
  const collection = db.collection('watchlists');
  
  const instrumentKeys = buildInstrumentKey(scriptData);
  const primaryKey = instrumentKeys[0] || null;
  const doc = { 
    ...scriptData, 
    instrumentKey: primaryKey,
    instrumentKeys,
    userId: uid, 
    addedAt: new Date() 
  };
  
  // Prevent exact duplicates by ltdCode
  if (doc.ltdCode) {
    const exists = await collection.findOne({ userId: uid, ltdCode: doc.ltdCode });
    if (exists) return { id: String(exists._id), alreadyExists: true };
  }

  const result = await collection.insertOne(doc);
  invalidateWatchlistCache();

  // Sync to Redis hot routing sets asynchronously
  for (const k of instrumentKeys) {
    redisNotifStore.addWatcher(k, uid).catch(() => {});
  }

  return { id: String(result.insertedId), ...doc };
}

/**
 * Remove a single script by document ID strictly scoped to user.
 */
async function removeScript(uid, docId) {
  if (!uid || !docId) return { deletedCount: 0 };
  const db = await getDb();
  try {
    const query = { userId: uid };
    try {
      query._id = new ObjectId(docId);
    } catch {
      query._id = String(docId);
    }
    const result = await db.collection('watchlists').deleteOne(query);
    invalidateWatchlistCache();
    return { deletedCount: result.deletedCount || 0 };
  } catch (e) {
    console.error('[WatchlistStore] removeScript error:', e);
    return { deletedCount: 0 };
  }
}

/**
 * Update a specific script strictly scoped to user.
 */
async function updateScript(uid, docId, updates) {
  if (!uid || !docId) return { modifiedCount: 0 };
  const db = await getDb();
  try {
    const query = { userId: uid };
    try {
      query._id = new ObjectId(docId);
    } catch {
      query._id = String(docId);
    }
    // Remove unallowed ownership overrides from updates
    delete updates.userId;
    delete updates.uid;
    delete updates.id;
    delete updates._id;

    const result = await db.collection('watchlists').updateOne(
      query,
      { $set: updates }
    );
    invalidateWatchlistCache();
    return { modifiedCount: result.modifiedCount || 0 };
  } catch (e) {
    console.error('[WatchlistStore] updateScript error:', e);
    return { modifiedCount: 0 };
  }
}

/**
 * Global aggregation for background cron jobs.
 * @returns {Promise<object[]>}
 */
async function getAllTrackedScripts() {
  const now = Date.now();
  if (globalWatchlistCache && (now - lastCacheTime < CACHE_TTL)) {
    return globalWatchlistCache;
  }

  const db = await getDb();
  let allScripts = [];
  try {
    allScripts = await db.collection('watchlists').find({}).toArray();
  } catch (e) {
    console.error('[WatchlistStore] getAllTrackedScripts error:', e);
    return [];
  }
  
  // Deduplicate by bseCode/nseSymbol while accumulating UIDs
  const unique = new Map();
  for (const s of allScripts) {
    const key = String(s.ltdCode || s.bseCode || s.scripCode || s.symbol || s.nseSymbol || '').trim();
    if (key) {
      if (!unique.has(key)) {
        unique.set(key, { ...s, uids: new Set() });
      }
      if (s.userId) {
        unique.get(key).uids.add(s.userId);
      }
    }
  }
  
  // Convert Sets to Arrays for easier consumption
  const result = Array.from(unique.values()).map(s => ({
    ...s,
    uids: Array.from(s.uids)
  }));
  
  globalWatchlistCache = result;
  lastCacheTime = now;
  return result;
}

function invalidateWatchlistCache() {
  globalWatchlistCache = null;
  lastCacheTime = 0;
}

/**
 * Query MongoDB for all userIds watching any of the provided instrumentKeys.
 * @param {string[]} instrumentKeys - e.g. ['BSE:513023', 'NSE:NAVA']
 * @returns {Promise<string[]>} List of unique userIds
 */
async function getWatchersForInstruments(instrumentKeys) {
  if (!instrumentKeys || instrumentKeys.length === 0) return [];
  await ensureIndexes();
  const db = await getDb();
  try {
    const docs = await db.collection('watchlists')
      .find({
        $or: [
          { instrumentKey: { $in: instrumentKeys } },
          { instrumentKeys: { $in: instrumentKeys } }
        ]
      }, { projection: { userId: 1 } })
      .toArray();

    const uids = new Set();
    docs.forEach(d => { if (d.userId) uids.add(d.userId); });
    return Array.from(uids);
  } catch (e) {
    console.error('[WatchlistStore] getWatchersForInstruments error:', e);
    return [];
  }
}

module.exports = {
  getWatchlist,
  saveWatchlist,
  addScript,
  removeScript,
  updateScript,
  getAllTrackedScripts,
  getWatchersForInstruments,
  buildInstrumentKey,
  invalidateWatchlistCache
};
