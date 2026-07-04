'use strict';

const { db } = require('./firebaseAdmin');

async function getWatchlist(uid) {
  if (!uid) return [];
  const snap = await db.collection('users').doc(uid).collection('watchlist').get();
  if (snap.empty) return [];
  const scripts = [];
  snap.forEach(doc => scripts.push(doc.data()));
  return scripts;
}

async function saveWatchlist(uid, scripts) {
  // Not heavily used in the new frontend, but left for compatibility
  // In the new schema, scripts are saved individually, not as an array
}

let globalWatchlistCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Global aggregation for background cron jobs
// The cron needs to know which scripts to fetch live rates and announcements for.
// We pull all watchlists via a Collection Group query on 'watchlist'.
async function getAllTrackedScripts() {
  const now = Date.now();
  if (globalWatchlistCache && (now - lastCacheTime < CACHE_TTL)) {
    return globalWatchlistCache;
  }

  const snap = await db.collectionGroup('watchlist').get();
  const allScripts = [];
  
  snap.forEach(doc => {
    const data = doc.data();
    // Extract UID from the path: users/{uid}/watchlist/{docId}
    const uid = doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
    if (uid) data._uid = uid;
    allScripts.push(data);
  });
  
  // Deduplicate by bseCode/nseSymbol while accumulating UIDs
  const unique = new Map();
  for (const s of allScripts) {
    const key = String(s.ltdCode || s.bseCode || s.scripCode || s.symbol || s.nseSymbol || '').trim();
    if (key) {
      if (!unique.has(key)) {
        unique.set(key, { ...s, uids: new Set() });
      }
      if (s._uid) {
        unique.get(key).uids.add(s._uid);
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
  getAllTrackedScripts,
  invalidateWatchlistCache
};
