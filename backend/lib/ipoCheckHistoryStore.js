'use strict';

/**
 * ipoCheckHistoryStore.js
 *
 * Ephemeral Storage for IPO Allotment Check History
 *
 * Stores previous verification runs (both manual user checks and automated background checks)
 * so users can instantly review detailed family allotment records without re-querying registrars
 * or burning server compute and bandwidth.
 *
 * Lifecycle:
 * - Wiped every day at 12:00 AM Midnight IST via `cronService.js`.
 * - Native MongoDB TTL auto-purge index (expireAfterSeconds: 86400) guarantees zero permanent footprint.
 */

const { getDb } = require('./mongoClient');

const COLLECTION_NAME = 'ipo_check_history';

/**
 * Ensure compound indexes and 24-hour native TTL auto-purge index.
 */
async function ensureIndexes() {
  const db = await getDb();
  if (!db) return;
  try {
    const col = db.collection(COLLECTION_NAME);
    await col.createIndex({ uid: 1, updatedAt: -1 }, { background: true });
    await col.createIndex({ uid: 1, symbol: 1 }, { background: true });
    // 24-hour native TTL auto-purge
    await col.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 86400, name: 'check_history_ttl_24h', background: true }
    ).catch(() => {});
  } catch (err) {
    console.warn('[ipoCheckHistoryStore] Index creation warning:', err.message);
  }
}

/**
 * Save or update a verification history record for a user.
 *
 * @param {Object} params
 * @param {string} params.uid - Firebase User ID
 * @param {string} params.symbol - IPO symbol/identifier
 * @param {string} [params.ipoName] - Company human-readable name
 * @param {string} params.registrar - "KFINTECH" | "MUFG" | "BIGSHARE"
 * @param {'MANUAL'|'AUTO'} [params.type='MANUAL'] - Origin of the check
 * @param {Array<Object>} params.results - Individual applicant results
 * @param {Object} [params.summary] - Summary counters { total, allotted, notAllotted, notFound, errors }
 */
async function saveCheckHistory({ uid, symbol, ipoName, registrar, type = 'MANUAL', results = [], summary = null }) {
  if (!uid || !symbol) return null;

  const db = await getDb();
  if (!db) return null;

  try {
    const col = db.collection(COLLECTION_NAME);
    const reg = String(registrar || 'KFINTECH').toUpperCase();
    const cleanSym = String(symbol).trim();
    const now = new Date();

    // Generate unique doc ID per user + registrar + symbol
    const docId = `${uid}_${reg}_${cleanSym}`;

    // Normalize applicant results
    const cleanResults = (results || []).map((r, i) => {
      const records = Array.isArray(r.records) ? r.records : [];
      let sharesAllotted = Number(r.sharesAllotted || r.allottedShares || 0);
      let appliedShares = Number(r.appliedShares || 0);
      let dpId = r.dpId || r.clientId || 'N/A';
      let appNo = r.appNo || r.applicationNumber || 'N/A';
      let category = r.category || 'Regular';

      if (records.length > 0) {
        const topRec = records[0];
        if (!sharesAllotted) sharesAllotted = Number(topRec.allottedShares || 0);
        if (!appliedShares) appliedShares = Number(topRec.appliedShares || 0);
        if (dpId === 'N/A') dpId = topRec.dpId || topRec.clientId || 'N/A';
        if (appNo === 'N/A') appNo = topRec.applicationNumber || 'N/A';
        if (category === 'Regular') category = topRec.category || 'Regular';
      }

      const isAllotted = sharesAllotted > 0 || r.status === 'allotted' || String(r.allotmentStatus).toLowerCase() === 'allotted';
      const status = isAllotted 
        ? 'allotted' 
        : (records.length > 0 || r.status === 'not_allotted' ? 'not_allotted' : (r.status || 'not_found'));

      return {
        id: r.id || r.applicantId || `app_${i}`,
        applicantId: r.applicantId || r.id || `app_${i}`,
        name: r.name || 'Family Member',
        maskedPan: r.maskedPan || (r.panLast4 ? `XXXXXX${r.panLast4}` : 'XXXX'),
        status,
        allotmentStatus: isAllotted ? 'Allotted' : (status === 'not_allotted' ? 'Not Allotted' : 'Record Not Found'),
        sharesAllotted,
        appliedShares,
        dpId,
        appNo,
        category,
        records,
        error: r.error || null,
      };
    });

    const calculatedSummary = {
      total: summary?.total ?? cleanResults.length,
      allotted: summary?.allotted ?? cleanResults.filter(r => r.status === 'allotted').length,
      notAllotted: summary?.notAllotted ?? cleanResults.filter(r => r.status === 'not_allotted').length,
      notFound: summary?.notFound ?? cleanResults.filter(r => r.status === 'not_found').length,
      errors: summary?.errors ?? cleanResults.filter(r => r.status === 'error').length,
    };

    const doc = {
      _id: docId,
      uid,
      symbol: cleanSym,
      ipoName: ipoName || cleanSym,
      registrar: reg,
      type: type.toUpperCase() === 'AUTO' ? 'AUTO' : 'MANUAL',
      summary: calculatedSummary,
      results: cleanResults,
      checkedAt: now,
      updatedAt: now,
    };

    await col.updateOne(
      { _id: docId },
      {
        $set: doc,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    return doc;
  } catch (err) {
    console.error('[ipoCheckHistoryStore] Error saving check history:', err.message);
    return null;
  }
}

/**
 * Fetch all check history records for a user for today.
 *
 * @param {string} uid - Firebase User ID
 * @returns {Promise<Array<Object>>}
 */
async function getUserCheckHistory(uid) {
  if (!uid) return [];
  const db = await getDb();
  if (!db) return [];

  try {
    const col = db.collection(COLLECTION_NAME);
    const docs = await col
      .find({ uid })
      .sort({ updatedAt: -1 })
      .limit(30)
      .toArray();

    return docs.map(d => ({
      id: d._id,
      symbol: d.symbol,
      ipoName: d.ipoName || d.symbol,
      registrar: d.registrar,
      type: d.type || 'MANUAL',
      summary: d.summary || { total: 0, allotted: 0, notAllotted: 0, notFound: 0, errors: 0 },
      results: d.results || [],
      checkedAt: d.checkedAt ? d.checkedAt.toISOString() : (d.updatedAt ? d.updatedAt.toISOString() : new Date().toISOString()),
    }));
  } catch (err) {
    console.error('[ipoCheckHistoryStore] Error fetching user history:', err.message);
    return [];
  }
}

/**
 * Clear all check history for a single user.
 */
async function clearUserCheckHistory(uid) {
  if (!uid) return 0;
  const db = await getDb();
  if (!db) return 0;
  try {
    const col = db.collection(COLLECTION_NAME);
    const res = await col.deleteMany({ uid });
    return res.deletedCount;
  } catch (err) {
    console.error('[ipoCheckHistoryStore] Error clearing user history:', err.message);
    return 0;
  }
}

/**
 * Wipe all check history across the database.
 * Called strictly at 12:00 AM Midnight IST during performMidnightWipeIfNeeded.
 */
async function wipeAllCheckHistory() {
  const db = await getDb();
  if (!db) return 0;
  try {
    const col = db.collection(COLLECTION_NAME);
    const res = await col.deleteMany({});
    console.log(`[ipoCheckHistoryStore] Midnight wipe completed: ${res.deletedCount} check history records deleted.`);
    return res.deletedCount;
  } catch (err) {
    console.error('[ipoCheckHistoryStore] Error wiping check history at midnight:', err.message);
    return 0;
  }
}

module.exports = {
  ensureIndexes,
  saveCheckHistory,
  getUserCheckHistory,
  clearUserCheckHistory,
  wipeAllCheckHistory,
};
