'use strict';

const { getDb } = require('../mongoClient');
const redisNotifStore = require('../redis/redisNotificationStore');
const { rebuildNotificationRegistry } = require('./notificationRegistryRebuilder');

/**
 * Registry Reconciler.
 * Detects discrepancies between MongoDB watchlists and Redis watcher sets, repairing stale or missing memberships.
 */
async function reconcileRegistry() {
  console.log('[RegistryReconciler] Starting reconciliation audit...');
  const stats = { repairedAdditions: 0, repairedRemovals: 0 };

  try {
    const db = await getDb();
    const mongoWatchlists = await db.collection('watchlists').find({}).toArray();

    const mongoWatcherMap = new Map();
    for (const w of mongoWatchlists) {
      if (!w.userId) continue;
      const bse = (w.bseCode || w.ltdCode || '').toString().trim();
      const nse = (w.nseSymbol || w.symbol || '').toString().trim().toUpperCase();

      if (bse) {
        const key = `BSE:${bse}`;
        if (!mongoWatcherMap.has(key)) mongoWatcherMap.set(key, new Set());
        mongoWatcherMap.get(key).add(w.userId);
      }
      if (nse) {
        const key = `NSE:${nse}`;
        if (!mongoWatcherMap.has(key)) mongoWatcherMap.set(key, new Set());
        mongoWatcherMap.get(key).add(w.userId);
      }
    }

    // Compare Mongo vs Redis sets and repair missing entries
    for (const [key, mongoUids] of mongoWatcherMap.entries()) {
      const redisUids = new Set(await redisNotifStore.getWatchers(key));

      // Add missing users to Redis
      for (const uid of mongoUids) {
        if (!redisUids.has(uid)) {
          await redisNotifStore.addWatcher(key, uid);
          stats.repairedAdditions++;
        }
      }

      // Remove stale users from Redis
      for (const uid of redisUids) {
        if (!mongoUids.has(uid)) {
          await redisNotifStore.removeWatcher(key, uid);
          stats.repairedRemovals++;
        }
      }
    }

    console.log('[RegistryReconciler] Reconciliation complete:', stats);
    return { success: true, stats };
  } catch (err) {
    console.error('[RegistryReconciler] Reconciliation error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  reconcileRegistry,
};
