'use strict';

const { getDb } = require('../mongoClient');
const redisNotifStore = require('../redis/redisNotificationStore');
const prefsStore = require('../prefsStore');
const { SCOPE } = require('../notificationScope');
const { admin } = require('../firebaseAdmin');

/**
 * Registry Rebuilder.
 * Scans authoritative databases and seeds Redis routing sets and preferences.
 */
async function rebuildNotificationRegistry() {
  console.log('[RegistryRebuilder] Starting notification registry rebuild...');
  const stats = { scopeAllCount: 0, watcherKeysCount: 0, prefsCachedCount: 0 };

  try {
    const db = await getDb();

    // 1. Rebuild watchlists in Redis
    const allWatchlists = await db.collection('watchlists').find({}).toArray();
    const watcherMap = new Map(); // instrumentKey -> Set of uids

    for (const w of allWatchlists) {
      if (!w.userId) continue;
      const bse = (w.bseCode || w.ltdCode || '').toString().trim();
      const nse = (w.nseSymbol || w.symbol || '').toString().trim().toUpperCase();

      if (bse) {
        const key = `BSE:${bse}`;
        if (!watcherMap.has(key)) watcherMap.set(key, new Set());
        watcherMap.get(key).add(w.userId);
      }
      if (nse) {
        const key = `NSE:${nse}`;
        if (!watcherMap.has(key)) watcherMap.set(key, new Set());
        watcherMap.get(key).add(w.userId);
      }
    }

    for (const [key, uidSet] of watcherMap.entries()) {
      for (const uid of uidSet) {
        await redisNotifStore.addWatcher(key, uid);
      }
    }
    stats.watcherKeysCount = watcherMap.size;

    // 2. Rebuild user preferences and Scope ALL users in Redis
    const userList = await admin.auth().listUsers(1000);
    for (const user of userList.users) {
      const uid = user.uid;
      const prefs = await prefsStore.getPrefs(uid);
      if (prefs) {
        await redisNotifStore.setPrefs(uid, prefs);
        stats.prefsCachedCount++;

        if (prefs.notificationScope === SCOPE.ALL) {
          await redisNotifStore.addScopeAllUser(uid);
          stats.scopeAllCount++;
        }
      }
    }

    console.log('[RegistryRebuilder] Rebuild complete:', stats);
    return { success: true, stats };
  } catch (err) {
    console.error('[RegistryRebuilder] Rebuild failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  rebuildNotificationRegistry,
};
