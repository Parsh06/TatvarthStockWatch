'use strict';

const { getDb } = require('./mongoClient');
const { ObjectId } = require('mongodb');

let globalWatchlistCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

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
  const db = await getDb();
  const collection = db.collection('watchlists');
  const doc = { ...scriptData, userId: uid, addedAt: new Date() };
  
  // Prevent exact duplicates by ltdCode
  if (doc.ltdCode) {
    const exists = await collection.findOne({ userId: uid, ltdCode: doc.ltdCode });
    if (exists) return { id: String(exists._id), alreadyExists: true };
  }

  const result = await collection.insertOne(doc);
  invalidateWatchlistCache();
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

module.exports = {
  getWatchlist,
  saveWatchlist,
  addScript,
  removeScript,
  updateScript,
  getAllTrackedScripts,
  invalidateWatchlistCache
};
