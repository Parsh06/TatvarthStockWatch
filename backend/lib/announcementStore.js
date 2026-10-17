'use strict';

const { getDb } = require('./mongoClient');

/**
 * announcementStore.js (MongoDB Version)
 *
 * Handles reading/writing announcements to the MongoDB
 * `announcements` collection. The collection is keyed by the
 * announcement's `id` (set as the document `_id`) so writes are
 * naturally idempotent.
 */

function getStoredISTTimestamp(date = new Date()) {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date(date);
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', options).formatToParts(d).map(p => [p.type, p.value]));
  const dateStr = `${parts.day} ${parts.month} ${parts.year}`;
  const timeStr = `${parts.hour}:${parts.minute}:${parts.second}`;
  return {
    date: dateStr,
    time: timeStr,
    datetimeIST: `${dateStr} ${timeStr} IST`,
    iso: d.toISOString(),
  };
}

/**
 * Save an array of normalized announcements to MongoDB.
 * Only returns documents that did not already exist.
 *
 * @param {object[]} announcements  - Normalized announcement objects (must have `.id`)
 * @returns {Promise<{ saved: number, skipped: number, newAnnouncements: object[] }>}
 */
async function saveAnnouncements(announcements) {
  if (!announcements || announcements.length === 0) {
    return { saved: 0, skipped: 0, newAnnouncements: [] };
  }

  const db = await getDb();
  const collection = db.collection('announcements');

  // 1. Find which IDs already exist
  const ids = announcements.map((a) => String(a.id));
  const existingDocs = await collection.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray();
  const existingIds = new Set(existingDocs.map(d => String(d._id)));

  // 2. Filter to only the truly new ones
  const newAnnouncements = announcements.filter((a) => !existingIds.has(String(a.id)));

  if (newAnnouncements.length === 0) {
    return { saved: 0, skipped: announcements.length, newAnnouncements: [] };
  }

  // 3. Bulk write new announcements with exact storage time (including seconds in IST)
  const operations = newAnnouncements.map(ann => {
    // Clone object to avoid mutating the original
    const doc = { ...ann };
    const docId = String(doc.id);
    delete doc.id;

    const now = new Date();
    const storedMeta = getStoredISTTimestamp(now);

    return {
      updateOne: {
        filter: { _id: docId },
        update: { 
          $set: { 
            ...doc,
            _id: docId,
            savedAt: now,
            savedAtIST: storedMeta.datetimeIST,   // e.g. "17 Oct 2026 22:45:12 IST"
            storedAt: now,
            storedAtIST: storedMeta.datetimeIST,  // e.g. "17 Oct 2026 22:45:12 IST"
            storedTime: storedMeta.time,          // e.g. "22:45:12"
            storedDate: storedMeta.date,          // e.g. "17 Oct 2026"
          } 
        },
        upsert: true
      }
    };
  });

  try {
    await collection.bulkWrite(operations, { ordered: false });
    console.log(`[AnnouncementStore] Saved ${newAnnouncements.length} new, skipped ${existingIds.size} existing`);
    return { saved: newAnnouncements.length, skipped: existingIds.size, newAnnouncements };
  } catch (err) {
    console.error('[AnnouncementStore] batch write error:', err.message);
    return { saved: 0, skipped: existingIds.size, newAnnouncements: [] };
  }
}

/**
 * Get the most recent announcements from MongoDB.
 *
 * @param {object} opts
 * @param {string} [opts.exchange]    Filter by exchange (BSE|NSE)
 * @param {string} [opts.scriptCode]  Filter by scriptCode or nseSymbol
 * @param {string} [opts.nseSymbol]   Filter by nseSymbol
 * @param {number} [opts.limitCount]  Max documents to return (default 100)
 * @param {string} [opts.sinceDate]   ISO date string
 * @returns {Promise<object[]>}
 */
async function getAnnouncements({ exchange, scriptCode, nseSymbol, limitCount = 1000, sinceDate } = {}) {
  const db = await getDb();
  const collection = db.collection('announcements');

  const query = {};
  
  if (exchange && exchange !== 'ALL') {
    query.exchange = exchange;
  }

  if (scriptCode || nseSymbol) {
    query.$or = [];
    if (scriptCode) query.$or.push({ scriptCode: String(scriptCode) }, { nseSymbol: String(scriptCode) });
    if (nseSymbol)  query.$or.push({ nseSymbol: String(nseSymbol).toUpperCase() });
  }

  if (sinceDate) {
    query.announcementDate = { $gt: sinceDate };
  }

  try {
    const docs = await collection.find(query)
      .sort({ announcementDate: -1 })
      .limit(Number(limitCount) || 1000)
      .toArray();
      
    return docs.map(d => {
      const bseCode = d.bseCode || (d.exchange === 'BSE' ? d.scriptCode : '');
      const scriptCode = d.scriptCode || bseCode || d.nseSymbol || '';

      let savedAtIST = d.savedAtIST || d.storedAtIST;
      let storedTime = d.storedTime;
      let storedDate = d.storedDate;
      if ((!savedAtIST || !storedTime) && d.savedAt) {
        try {
          const ist = getStoredISTTimestamp(d.savedAt);
          savedAtIST = savedAtIST || ist.datetimeIST;
          storedTime = storedTime || ist.time;
          storedDate = storedDate || ist.date;
        } catch { /* fallback */ }
      }

      return {
        ...d,
        id: String(d._id),
        _id: undefined,
        bseCode,
        scriptCode,
        savedAtIST: savedAtIST || '',
        storedAtIST: savedAtIST || '',
        storedTime: storedTime || '',
        storedDate: storedDate || '',
      };
    });
  } catch (err) {
    console.error('[AnnouncementStore] getAnnouncements error:', err.message);
    return [];
  }
}

/**
 * Get announcements for a specific list of script codes.
 *
 * @param {string[]} scriptCodes
 * @param {string} [sinceDate]
 * @returns {Promise<object[]>}
 */
async function getAnnouncementsForScripts(scriptCodes, sinceDate) {
  if (!scriptCodes || scriptCodes.length === 0) return [];
  
  const db = await getDb();
  const collection = db.collection('announcements');

  const cleanCodes = scriptCodes.filter(Boolean).map(String);
  const query = { scriptCode: { $in: cleanCodes } };
  
  if (sinceDate) {
    query.announcementDate = { $gt: sinceDate };
  }

  try {
    const docs = await collection.find(query).toArray();
    return docs.map(d => {
      const bseCode = d.bseCode || (d.exchange === 'BSE' ? d.scriptCode : '');
      const scriptCode = d.scriptCode || bseCode || d.nseSymbol || '';

      let savedAtIST = d.savedAtIST || d.storedAtIST;
      let storedTime = d.storedTime;
      let storedDate = d.storedDate;
      if ((!savedAtIST || !storedTime) && d.savedAt) {
        try {
          const ist = getStoredISTTimestamp(d.savedAt);
          savedAtIST = savedAtIST || ist.datetimeIST;
          storedTime = storedTime || ist.time;
          storedDate = storedDate || ist.date;
        } catch { /* fallback */ }
      }

      return {
        ...d,
        id: String(d._id),
        _id: undefined,
        bseCode,
        scriptCode,
        savedAtIST: savedAtIST || '',
        storedAtIST: savedAtIST || '',
        storedTime: storedTime || '',
        storedDate: storedDate || '',
      };
    });
  } catch (err) {
    console.error('[AnnouncementStore] getAnnouncementsForScripts error:', err.message);
    return [];
  }
}

module.exports = { saveAnnouncements, getAnnouncements, getAnnouncementsForScripts };
