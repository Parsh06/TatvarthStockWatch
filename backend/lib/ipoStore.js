'use strict';

const { getDb } = require('./mongoClient');

const EXPIRE_AFTER_HOURS = parseInt(process.env.IPO_EXPIRE_AFTER_HOURS || '48', 10);
const RETENTION_DAYS = parseInt(process.env.IPO_HISTORY_RETENTION_DAYS || '30', 10);

/**
 * Ensure index on iposymbols collection.
 */
async function ensureIndexes() {
  try {
    const db = await getDb();
    const col = db.collection('iposymbols');
    await col.createIndex({ symbol: 1 }, { unique: true });
    await col.createIndex({ clientId: 1 });
    await col.createIndex({ status: 1 });
    await col.createIndex({ lastSeenAt: 1 });
  } catch (err) {
    console.error('[ipoStore] Index creation error:', err.message);
  }
}

// Call once on module load
ensureIndexes().catch(() => {});

/**
 * Save scraped IPO symbols to MongoDB.
 * Updates lastSeenAt for existing ones.
 * Inserts new ones with status 'ACTIVE' and notificationSent = false.
 *
 * @param {Array<{clientId: string, symbol: string}>} scrapedSymbols
 * @returns {Promise<Array<Object>>} Truly new IPO objects inserted
 */
async function saveIpoSymbols(scrapedSymbols) {
  if (!Array.isArray(scrapedSymbols) || scrapedSymbols.length === 0) {
    return [];
  }

  const db = await getDb();
  const col = db.collection('iposymbols');
  const now = new Date();

  // Deduplicate incoming array by symbol
  const uniqueIncoming = new Map();
  for (const item of scrapedSymbols) {
    const sym = String(item.symbol || '').trim();
    if (sym && !uniqueIncoming.has(sym)) {
      uniqueIncoming.set(sym, item);
    }
  }

  const symbolsList = Array.from(uniqueIncoming.keys());

  // Find existing records in DB
  const existingDocs = await col.find({ symbol: { $in: symbolsList } }).toArray();
  const existingMap = new Map(existingDocs.map(doc => [doc.symbol, doc]));

  const newIpos = [];

  for (const [sym, item] of uniqueIncoming.entries()) {
    const existing = existingMap.get(sym);
    if (!existing) {
      const doc = {
        _id: sym,
        clientId: String(item.clientId || ''),
        symbol: sym,
        name: sym,
        status: 'ACTIVE',
        firstSeenAt: now,
        lastSeenAt: now,
        notificationSent: false,
        source: 'KFINTECH',
        createdAt: now,
        updatedAt: now,
      };

      try {
        await col.insertOne(doc);
        newIpos.push(doc);
      } catch (err) {
        if (err.code !== 11000) {
          console.error(`[ipoStore] Failed to insert new IPO ${sym}:`, err.message);
        }
      }
    } else {
      // Update lastSeenAt and make sure status is ACTIVE if it was EXPIRED
      await col.updateOne(
        { symbol: sym },
        {
          $set: {
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
 * Get all currently ACTIVE IPO symbols.
 */
async function getActiveIpoSymbols() {
  const db = await getDb();
  const col = db.collection('iposymbols');
  return await col.find({ status: 'ACTIVE' }).toArray();
}

/**
 * Reconcile missing IPOs.
 * If an IPO is missing from the scraped list and its lastSeenAt is older than EXPIRE_AFTER_HOURS,
 * mark its status as 'EXPIRED'.
 *
 * @param {Array<{clientId: string, symbol: string}>} scrapedSymbols
 */
async function reconcileMissingIpos(scrapedSymbols) {
  if (!Array.isArray(scrapedSymbols)) return;

  const db = await getDb();
  const col = db.collection('iposymbols');

  const scrapedSymbolSet = new Set(scrapedSymbols.map(s => String(s.symbol || '').trim()));
  const activeDocs = await col.find({ status: 'ACTIVE' }).toArray();

  const cutoffMs = Date.now() - EXPIRE_AFTER_HOURS * 60 * 60 * 1000;

  for (const doc of activeDocs) {
    if (!scrapedSymbolSet.has(doc.symbol)) {
      const lastSeenTime = new Date(doc.lastSeenAt || doc.updatedAt || 0).getTime();
      if (lastSeenTime < cutoffMs) {
        await col.updateOne(
          { _id: doc._id },
          { $set: { status: 'EXPIRED', updatedAt: new Date() } }
        );
        console.log(`[ipoStore] Marked IPO ${doc.symbol} as EXPIRED (missing for >${EXPIRE_AFTER_HOURS}h)`);
      }
    }
  }
}

/**
 * Delete historical EXPIRED IPOs older than RETENTION_DAYS.
 */
async function cleanupHistoricalIpos() {
  const db = await getDb();
  const col = db.collection('iposymbols');

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await col.deleteMany({
    status: 'EXPIRED',
    updatedAt: { $lt: cutoffDate },
  });

  if (result.deletedCount > 0) {
    console.log(`[ipoStore] Cleaned up ${result.deletedCount} expired historical IPO symbols (older than ${RETENTION_DAYS}d)`);
  }
  return result.deletedCount;
}

/**
 * Mark notificationSent = true for given symbols in iposymbols collection.
 *
 * @param {Array<Object|string>} symbols
 */
async function markNotificationsSent(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  const symbolStrings = symbols.map(s => (typeof s === 'string' ? s : s.symbol)).filter(Boolean);
  if (symbolStrings.length === 0) return;

  const db = await getDb();
  const col = db.collection('iposymbols');
  const now = new Date();

  await col.updateMany(
    { symbol: { $in: symbolStrings } },
    { $set: { notificationSent: true, lastNotificationAt: now, updatedAt: now } }
  );
}

module.exports = {
  saveIpoSymbols,
  getActiveIpoSymbols,
  reconcileMissingIpos,
  cleanupHistoricalIpos,
  markNotificationsSent,
};
