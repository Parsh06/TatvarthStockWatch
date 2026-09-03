'use strict';

const { getDb } = require('./mongoClient');

const EXPIRE_AFTER_HOURS = parseInt(process.env.IPO_EXPIRE_AFTER_HOURS || '48', 10);
const RETENTION_DAYS = parseInt(process.env.IPO_HISTORY_RETENTION_DAYS || '30', 10);

const TTL_DAYS = parseInt(process.env.IPO_TTL_DAYS || '14', 10);
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

const NOTIFICATION_HISTORY_TTL_DAYS = parseInt(process.env.NOTIFICATION_HISTORY_TTL_DAYS || '60', 10);
const NOTIFICATION_HISTORY_TTL_SECONDS = NOTIFICATION_HISTORY_TTL_DAYS * 24 * 60 * 60;

/**
 * Ensure indexes on iposymbols & allotment_notification_history collections,
 * including native TTL auto-purge indexes.
 */
async function ensureIndexes() {
  try {
    const db = await getDb();
    if (!db) return;
    
    // ── iposymbols indexes ───────────────────────────────────────────────────
    const col = db.collection('iposymbols');
    await col.createIndex({ source: 1, clientId: 1 });
    await col.createIndex({ status: 1, source: 1 });
    await col.createIndex({ firstSeenAt: -1 });
    await col.createIndex({ symbol: 1, source: 1 });

    // 14-Day Native MongoDB TTL Auto-Purge Index on lastSeenAt
    try {
      await col.createIndex(
        { lastSeenAt: 1 },
        { expireAfterSeconds: TTL_SECONDS, name: 'lastSeenAt_ttl_14d', background: true }
      );
    } catch (ttlErr) {
      if (ttlErr.codeName === 'IndexOptionsConflict' || ttlErr.code === 85) {
        await col.dropIndex({ lastSeenAt: 1 }).catch(() => {});
        await col.createIndex(
          { lastSeenAt: 1 },
          { expireAfterSeconds: TTL_SECONDS, name: 'lastSeenAt_ttl_14d', background: true }
        );
      }
    }

    // ── allotment_notification_history indexes ──────────────────────────────
    const historyCol = db.collection('allotment_notification_history');
    await historyCol.createIndex({ source: 1, clientId: 1 });
    await historyCol.createIndex({ symbol: 1, source: 1 });

    // 60-Day Native MongoDB TTL Auto-Purge Index on notifiedAt
    // Automatically purges historical notification ledger documents after 60 days
    try {
      await historyCol.createIndex(
        { notifiedAt: 1 },
        { expireAfterSeconds: NOTIFICATION_HISTORY_TTL_SECONDS, name: 'notifiedAt_ttl_60d', background: true }
      );
    } catch (ttlErr) {
      if (ttlErr.codeName === 'IndexOptionsConflict' || ttlErr.code === 85) {
        await historyCol.dropIndex({ notifiedAt: 1 }).catch(() => {});
        await historyCol.createIndex(
          { notifiedAt: 1 },
          { expireAfterSeconds: NOTIFICATION_HISTORY_TTL_SECONDS, name: 'notifiedAt_ttl_60d', background: true }
        );
      }
    }
  } catch (err) {
    console.error('[ipoStore] Index creation error:', err.message);
  }
}

/**
 * Save scraped IPO symbols to MongoDB.
 * Updates lastSeenAt for existing ones.
 * Inserts new ones with status 'ACTIVE' and notificationSent = false.
 *
 * @param {Array<{clientId: string, symbol: string}>} scrapedSymbols
 * @returns {Promise<Array<Object>>} Truly new IPO objects inserted
 */
async function saveIpoSymbols(scrapedSymbols, source = 'KFINTECH') {
  if (!Array.isArray(scrapedSymbols) || scrapedSymbols.length === 0) {
    return [];
  }

  const db = await getDb();
  const col = db.collection('iposymbols');
  const now = new Date();
  const src = String(source || 'KFINTECH').toUpperCase();

  // Deduplicate incoming array by symbol
  const uniqueIncoming = new Map();
  for (const item of scrapedSymbols) {
    const sym = String(item.symbol || '').trim();
    if (sym && !uniqueIncoming.has(sym)) {
      uniqueIncoming.set(sym, item);
    }
  }

  const newIpos = [];
  const historyCol = db.collection('allotment_notification_history');

  for (const [sym, item] of uniqueIncoming.entries()) {
    const docId = `${src}_${item.clientId || sym}`;
    const existing = await col.findOne({
      $or: [
        { _id: docId },
        { _id: sym, source: src },
        { clientId: String(item.clientId || ''), source: src },
        { symbol: sym, source: src },
      ],
    });

    if (!existing) {
      // Check permanent history ledger to see if this IPO was EVER notified in the past
      const wasEverNotified = await historyCol.findOne({
        $or: [
          { _id: docId },
          { clientId: String(item.clientId || ''), source: src },
          { symbol: sym, source: src },
        ]
      });

      const isNotificationSent = !!wasEverNotified;

      const doc = {
        _id: docId,
        clientId: String(item.clientId || ''),
        symbol: sym,
        name: sym,
        status: 'ACTIVE',
        firstSeenAt: now,
        lastSeenAt: now,
        notificationSent: isNotificationSent,
        source: src,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await col.insertOne(doc);
        // Only return in newIpos if it was truly never notified before
        if (!isNotificationSent) {
          newIpos.push(doc);
        }
      } catch (err) {
        if (err.code !== 11000) {
          console.error(`[ipoStore] Failed to insert new IPO ${sym}:`, err.message);
        }
      }
    } else {
      // Update lastSeenAt (which continuously resets the 14-day TTL timer while active)
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            clientId: String(item.clientId || existing.clientId || ''),
            lastSeenAt: now,
            status: 'ACTIVE',
            updatedAt: now,
          },
        }
      );
    }
  }

  return newIpos;
}

/**
 * Get all currently ACTIVE IPO symbols from MongoDB.
 */
async function getActiveIpoSymbols(source) {
  const db = await getDb();
  const col = db.collection('iposymbols');
  const filter = { status: 'ACTIVE' };
  if (source && source !== 'ALL') {
    filter.source = String(source).toUpperCase();
  }
  return await col.find(filter).sort({ firstSeenAt: -1, lastSeenAt: -1 }).toArray();
}

/**
 * Reconcile missing IPOs.
 * If an IPO is missing from the scraped list and its lastSeenAt is older than EXPIRE_AFTER_HOURS,
 * mark its status as 'EXPIRED'.
 *
 * @param {Array<{clientId: string, symbol: string}>} scrapedSymbols
 * @param {string} source
 */
async function reconcileMissingIpos(scrapedSymbols, source = 'KFINTECH') {
  if (!Array.isArray(scrapedSymbols)) return;

  const db = await getDb();
  const col = db.collection('iposymbols');
  const src = String(source || 'KFINTECH').toUpperCase();

  const scrapedSymbolSet = new Set(scrapedSymbols.map(s => String(s.symbol || '').trim()));
  const activeDocs = await col.find({ status: 'ACTIVE', source: src }).toArray();

  const cutoffMs = Date.now() - EXPIRE_AFTER_HOURS * 60 * 60 * 1000;

  for (const doc of activeDocs) {
    if (!scrapedSymbolSet.has(doc.symbol)) {
      const lastSeenTime = new Date(doc.lastSeenAt || doc.updatedAt || 0).getTime();
      if (lastSeenTime < cutoffMs) {
        await col.updateOne(
          { _id: doc._id },
          { $set: { status: 'EXPIRED', updatedAt: new Date() } }
        );
        console.log(`[ipoStore] Marked IPO [${src}] ${doc.symbol} as EXPIRED (missing for >${EXPIRE_AFTER_HOURS}h)`);
      }
    }
  }
}

/**
 * Delete historical EXPIRED IPOs older than RETENTION_DAYS.
 */
async function cleanupHistoricalIpos() {
  const db = await getDb();
  if (!db) return 0;
  const col = db.collection('iposymbols');
  const historyCol = db.collection('allotment_notification_history');

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await col.deleteMany({
    status: 'EXPIRED',
    updatedAt: { $lt: cutoffDate },
  });

  // Prune notification history records older than NOTIFICATION_HISTORY_TTL_DAYS
  const historyCutoff = new Date(Date.now() - NOTIFICATION_HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000);
  const historyResult = await historyCol.deleteMany({
    notifiedAt: { $lt: historyCutoff },
  });

  if (result.deletedCount > 0 || historyResult.deletedCount > 0) {
    console.log(`[ipoStore] Purge cycle complete: ${result.deletedCount} expired IPOs, ${historyResult.deletedCount} old notification history records purged.`);
  }
  return result.deletedCount + historyResult.deletedCount;
}

/**
 * Mark notificationSent = true for given symbols in iposymbols collection.
 *
 * @param {Array<Object|string>} symbols
 * @param {string} source
 */
async function markNotificationsSent(symbols, source) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  const ids = symbols.map(s => (typeof s === 'string' ? s : s.clientId || s.symbol)).filter(Boolean);
  if (ids.length === 0) return;

  const db = await getDb();
  const col = db.collection('iposymbols');
  const historyCol = db.collection('allotment_notification_history');
  const now = new Date();
  const src = source && source !== 'ALL' ? String(source).toUpperCase() : 'KFINTECH';

  const filter = {
    $or: [
      { symbol: { $in: ids } },
      { clientId: { $in: ids } },
      { _id: { $in: ids } },
    ],
  };
  if (source && source !== 'ALL') {
    filter.source = src;
  }

  await col.updateMany(
    filter,
    { $set: { notificationSent: true, lastNotificationAt: now, updatedAt: now } }
  );

  // Write to permanent history ledger so this IPO can NEVER be re-alerted even if purged and re-scraped
  for (const s of symbols) {
    const item = typeof s === 'string' ? { symbol: s, clientId: s } : s;
    const docId = `${src}_${item.clientId || item.symbol}`;
    try {
      await historyCol.updateOne(
        { _id: docId },
        {
          $set: {
            clientId: String(item.clientId || ''),
            symbol: item.symbol,
            source: src,
            notifiedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
    } catch {
      // ignore dup error
    }
  }
}

module.exports = {
  ensureIndexes,
  saveIpoSymbols,
  getActiveIpoSymbols,
  reconcileMissingIpos,
  cleanupHistoricalIpos,
  markNotificationsSent,
};
