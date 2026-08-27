'use strict';

const { getDb } = require('./mongoClient');

/**
 * ipoClosingStore.js (MongoDB Version)
 *
 * Single Source of Truth for IPOs closing on the current day in IST.
 * Collection: `ipo_closing_today`
 */

const COLLECTION_NAME = 'ipo_closing_today';

/**
 * Wipe the entire ipo_closing_today collection (executed during midnight wipe IST).
 */
async function wipeTodayClosingIpos() {
  try {
    const db = await getDb();
    const result = await db.collection(COLLECTION_NAME).deleteMany({});
    console.log(`[IpoClosingStore] Wiped ${result.deletedCount} items from ${COLLECTION_NAME}`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (err) {
    console.error('[IpoClosingStore] Failed to wipe collection:', err.message);
    throw err;
  }
}

/**
 * Sync / Upsert closing IPOs discovered for today into MongoDB.
 * Preserves 'COMPLETED' status if an IPO was already dispatched today.
 *
 * @param {Array<Object>} ipos - Normalized IPO closing objects
 * @param {string} dateIST - Current date in IST (YYYY-MM-DD)
 */
async function syncTodayClosingIpos(ipos, dateIST) {
  if (!Array.isArray(ipos) || ipos.length === 0) {
    return { synced: 0, existing: 0 };
  }

  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  let synced = 0;
  let existing = 0;

  for (const ipo of ipos) {
    const ipoId = String(ipo.id || ipo.slug);
    const existingDoc = await collection.findOne({ _id: ipoId });

    if (existingDoc) {
      existing++;
      // Update metadata (like live GMP updates) without touching completed or dispatching statuses
      const updateFields = {
        name: ipo.name,
        slug: ipo.slug,
        gmp: ipo.gmp,
        gmpPercentage: ipo.gmpPercentage,
        issuePrice: ipo.issuePrice,
        lotSize: ipo.lotSize,
        closeDate: ipo.closeDate,
        closeDateISO: ipo.closeDateISO,
        exchange: ipo.exchange,
        updatedAt: new Date(),
      };
      await collection.updateOne({ _id: ipoId }, { $set: updateFields });
    } else {
      synced++;
      await collection.insertOne({
        _id: ipoId,
        ipoId,
        name: ipo.name,
        slug: ipo.slug,
        gmp: ipo.gmp,
        gmpPercentage: ipo.gmpPercentage,
        issuePrice: ipo.issuePrice,
        lotSize: ipo.lotSize,
        closeDate: ipo.closeDate,
        closeDateISO: ipo.closeDateISO,
        exchange: ipo.exchange,
        dateIST,
        dispatchStatus: 'PENDING', // PENDING | DISPATCHING | COMPLETED
        dispatchedAt: null,
        dispatchStartedAt: null,
        deliveredUsers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  console.log(`[IpoClosingStore] Sync complete for ${dateIST}: synced=${synced}, existing=${existing}`);
  return { synced, existing, total: ipos.length };
}

/**
 * Atomically claim the highest GMP% pending IPO for dispatch.
 * Transitions status: PENDING -> DISPATCHING
 *
 * @param {string} dateIST
 * @returns {Promise<Object|null>}
 */
async function getNextPendingClosingIpo(dateIST) {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  // Auto-recover stale dispatching items (> 3 minutes old from crashed workers)
  const staleThreshold = new Date(Date.now() - 3 * 60 * 1000);
  await collection.updateMany(
    { dateIST, dispatchStatus: 'DISPATCHING', dispatchStartedAt: { $lt: staleThreshold } },
    { $set: { dispatchStatus: 'PENDING', dispatchStartedAt: null } }
  );

  // Find the highest GMP% pending IPO
  const pendingIpos = await collection
    .find({ dateIST, dispatchStatus: 'PENDING' })
    .sort({ gmpPercentage: -1 })
    .limit(1)
    .toArray();

  if (!pendingIpos || pendingIpos.length === 0) {
    return null;
  }

  const candidate = pendingIpos[0];

  // Atomically claim candidate
  const result = await collection.findOneAndUpdate(
    { _id: candidate._id, dispatchStatus: 'PENDING' },
    {
      $set: {
        dispatchStatus: 'DISPATCHING',
        dispatchStartedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );

  return result?.value || result;
}

/**
 * Mark a closing IPO as COMPLETED and record delivered recipient user UIDs.
 *
 * @param {string} ipoId
 * @param {string} dateIST
 * @param {Array<string>} deliveredUserUids
 */
async function markClosingIpoCompleted(ipoId, dateIST, deliveredUserUids = []) {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  const idStr = String(ipoId);
  await collection.updateOne(
    {
      $or: [{ _id: idStr }, { ipoId: idStr }, { slug: idStr }],
      dateIST,
    },
    {
      $set: {
        dispatchStatus: 'COMPLETED',
        dispatchedAt: new Date(),
        updatedAt: new Date(),
      },
      $addToSet: {
        deliveredUsers: { $each: deliveredUserUids },
      },
    }
  );

  console.log(`[IpoClosingStore] Marked IPO ${ipoId} as COMPLETED with ${deliveredUserUids.length} delivered users`);
  return true;
}

/**
 * Revert a closing IPO from DISPATCHING back to PENDING (on recoverable error).
 *
 * @param {string} ipoId
 * @param {string} dateIST
 */
async function markClosingIpoPending(ipoId, dateIST) {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { _id: String(ipoId), dateIST },
    {
      $set: {
        dispatchStatus: 'PENDING',
        dispatchStartedAt: null,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`[IpoClosingStore] Reverted IPO ${ipoId} back to PENDING`);
  return true;
}

/**
 * Get summary status of today's closing IPOs.
 *
 * @param {string} dateIST
 */
async function getClosingIposSummary(dateIST) {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  const ipos = await collection
    .find({ dateIST })
    .sort({ gmpPercentage: -1 })
    .toArray();

  const summary = {
    dateIST,
    total: ipos.length,
    pending: ipos.filter((i) => i.dispatchStatus === 'PENDING').length,
    dispatching: ipos.filter((i) => i.dispatchStatus === 'DISPATCHING').length,
    completed: ipos.filter((i) => i.dispatchStatus === 'COMPLETED').length,
    ipos: ipos.map((i) => ({
      id: i.ipoId,
      name: i.name,
      gmpPercentage: i.gmpPercentage,
      status: i.dispatchStatus,
      dispatchedAt: i.dispatchedAt,
      deliveredUsersCount: i.deliveredUsers?.length || 0,
    })),
  };

  return summary;
}

module.exports = {
  wipeTodayClosingIpos,
  syncTodayClosingIpos,
  getNextPendingClosingIpo,
  markClosingIpoCompleted,
  markClosingIpoPending,
  getClosingIposSummary,
};
