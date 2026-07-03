'use strict';

/**
 * announcementStore.js
 *
 * Handles reading/writing announcements to the global Firestore
 * `announcements` collection. The collection is keyed by the
 * announcement's `id` (set as the document ID) so writes are
 * naturally idempotent — writing the same announcement twice
 * simply overwrites with identical data.
 *
 * Collection schema: announcements/{announcementId}
 *   id              string   (= doc ID)
 *   exchange        string   BSE | NSE
 *   scriptName      string
 *   scriptCode      string
 *   category        string
 *   subject         string
 *   description     string
 *   announcementDate string  ISO date string
 *   pdfUrl          string | null
 *   sourceUrl       string
 *   savedAt         Timestamp  (server timestamp, only set on first write)
 */

function getFirebase() {
  return require('./firebaseAdmin');
}

const BATCH_SIZE = 400; // Firestore max is 500; keep headroom

/**
 * Check which of the given announcement IDs already exist in Firestore.
 * Returns a Set of existing IDs.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string[]} ids
 * @returns {Promise<Set<string>>}
 */
async function getExistingIds(db, ids) {
  const existing = new Set();
  if (!ids.length) return existing;

  // Firestore `in` operator supports max 30 values per query
  const CHUNK = 30;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const snap = await db
        .collection('announcements')
        .where('__name__', 'in', chunk)
        .select() // fetch no fields — just doc existence
        .get();
      snap.forEach((doc) => existing.add(doc.id));
    } catch (err) {
      console.error('[AnnouncementStore] getExistingIds error:', err.message);
    }
  }
  return existing;
}

/**
 * Save an array of normalized announcements to Firestore.
 * Only writes documents that do not already exist (checked in bulk).
 *
 * @param {object[]} announcements  - Normalized announcement objects (must have `.id`)
 * @returns {Promise<{ saved: number, skipped: number, newAnnouncements: object[] }>}
 */
async function saveAnnouncements(announcements) {
  if (!announcements || announcements.length === 0) {
    return { saved: 0, skipped: 0, newAnnouncements: [] };
  }

  const { db, admin } = getFirebase();
  const serverTs = admin.firestore.FieldValue.serverTimestamp();

  // 1. Collect all IDs and find which already exist
  const ids = announcements.map((a) => String(a.id));
  const existingIds = await getExistingIds(db, ids);

  // 2. Filter to only the truly new ones
  const newAnnouncements = announcements.filter((a) => !existingIds.has(String(a.id)));

  if (newAnnouncements.length === 0) {
    return { saved: 0, skipped: announcements.length, newAnnouncements: [] };
  }

  // 3. Batch write new announcements
  let saved = 0;
  for (let i = 0; i < newAnnouncements.length; i += BATCH_SIZE) {
    const chunk = newAnnouncements.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const ann of chunk) {
      const ref = db.collection('announcements').doc(String(ann.id));
      batch.set(ref, { ...ann, savedAt: serverTs });
      saved++;
    }
    try {
      await batch.commit();
    } catch (err) {
      console.error('[AnnouncementStore] batch write error:', err.message);
    }
  }

  console.log(`[AnnouncementStore] Saved ${saved} new, skipped ${existingIds.size} existing`);
  return { saved, skipped: existingIds.size, newAnnouncements };
}

/**
 * Get the most recent announcements from Firestore.
 *
 * @param {object} opts
 * @param {string} [opts.exchange]    Filter by exchange (BSE|NSE)
 * @param {string} [opts.scriptCode]  Filter by scriptCode
 * @param {number} [opts.limitCount]  Max documents to return (default 100)
 * @returns {Promise<object[]>}
 */
async function getAnnouncements({ exchange, scriptCode, limitCount = 100 } = {}) {
  const { db } = getFirebase();

  try {
    let q = db.collection('announcements').orderBy('announcementDate', 'desc').limit(limitCount);

    if (exchange && exchange !== 'ALL') {
      q = db.collection('announcements')
        .where('exchange', '==', exchange)
        .orderBy('announcementDate', 'desc')
        .limit(limitCount);
    }

    if (scriptCode) {
      q = db.collection('announcements')
        .where('scriptCode', '==', String(scriptCode))
        .orderBy('announcementDate', 'desc')
        .limit(limitCount);
    }

    const snap = await q.get();
    const results = [];
    snap.forEach((doc) => results.push(doc.data()));
    return results;
  } catch (err) {
    console.error('[AnnouncementStore] getAnnouncements error:', err.message);
    return [];
  }
}

/**
 * Get announcements for a specific list of script codes.
 * Used by the cron to match announcements against a user's watchlist.
 *
 * @param {string[]} scriptCodes
 * @param {string} [sinceDate]  ISO date string — only return announcements after this date
 * @returns {Promise<object[]>}
 */
async function getAnnouncementsForScripts(scriptCodes, sinceDate) {
  if (!scriptCodes || scriptCodes.length === 0) return [];

  const { db } = getFirebase();
  const results = [];

  // Firestore `in` max 30 values
  const CHUNK = 30;
  for (let i = 0; i < scriptCodes.length; i += CHUNK) {
    const chunk = scriptCodes.slice(i, i + CHUNK).filter(Boolean);
    if (!chunk.length) continue;

    try {
      let q = db.collection('announcements').where('scriptCode', 'in', chunk);
      if (sinceDate) {
        q = q.where('announcementDate', '>', sinceDate);
      }
      const snap = await q.get();
      snap.forEach((doc) => results.push(doc.data()));
    } catch (err) {
      console.error('[AnnouncementStore] getAnnouncementsForScripts error:', err.message);
    }
  }

  return results;
}

module.exports = { saveAnnouncements, getAnnouncements, getAnnouncementsForScripts };
