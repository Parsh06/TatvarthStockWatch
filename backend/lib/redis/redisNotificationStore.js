'use strict';

const { redis, UPSTASH_ENABLED } = require('./redisClient');
const redisKeys = require('./redisKeys');

/**
 * High-performance Notification Acceleration Store using Upstash Redis.
 */
async function addScopeAllUser(uid) {
  if (!UPSTASH_ENABLED || !redis || !uid) return false;
  try {
    await redis.sadd(redisKeys.allUsers(), uid);
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] addScopeAllUser error:', err.message);
    return false;
  }
}

async function removeScopeAllUser(uid) {
  if (!UPSTASH_ENABLED || !redis || !uid) return false;
  try {
    await redis.srem(redisKeys.allUsers(), uid);
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] removeScopeAllUser error:', err.message);
    return false;
  }
}

async function getScopeAllUsers() {
  if (!UPSTASH_ENABLED || !redis) return [];
  try {
    const members = await redis.smembers(redisKeys.allUsers());
    return Array.isArray(members) ? members : [];
  } catch (err) {
    console.error('[RedisNotifStore] getScopeAllUsers error:', err.message);
    return [];
  }
}

async function addWatcher(instrumentKey, uid) {
  if (!UPSTASH_ENABLED || !redis || !instrumentKey || !uid) return false;
  try {
    await redis.sadd(redisKeys.watchlistUsers(instrumentKey), uid);
    return true;
  } catch (err) {
    console.error(`[RedisNotifStore] addWatcher error (${instrumentKey}):`, err.message);
    return false;
  }
}

async function removeWatcher(instrumentKey, uid) {
  if (!UPSTASH_ENABLED || !redis || !instrumentKey || !uid) return false;
  try {
    await redis.srem(redisKeys.watchlistUsers(instrumentKey), uid);
    return true;
  } catch (err) {
    console.error(`[RedisNotifStore] removeWatcher error (${instrumentKey}):`, err.message);
    return false;
  }
}

async function getWatchers(instrumentKey) {
  if (!UPSTASH_ENABLED || !redis || !instrumentKey) return [];
  try {
    const members = await redis.smembers(redisKeys.watchlistUsers(instrumentKey));
    return Array.isArray(members) ? members : [];
  } catch (err) {
    console.error(`[RedisNotifStore] getWatchers error (${instrumentKey}):`, err.message);
    return [];
  }
}

async function setPrefs(uid, prefs) {
  if (!UPSTASH_ENABLED || !redis || !uid || !prefs) return false;
  try {
    await redis.set(redisKeys.prefs(uid), JSON.stringify(prefs));
    return true;
  } catch (err) {
    console.error(`[RedisNotifStore] setPrefs error (${uid}):`, err.message);
    return false;
  }
}

async function getPrefs(uid) {
  if (!UPSTASH_ENABLED || !redis || !uid) return null;
  try {
    const raw = await redis.get(redisKeys.prefs(uid));
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error(`[RedisNotifStore] getPrefs error (${uid}):`, err.message);
    return null;
  }
}

/**
 * Atomic deduplication lock using SET key 1 NX EX ttlSeconds.
 * Returns true if lock was acquired (first time seeing this notification for user/channel).
 * Returns false if key already existed.
 */
async function acquireDedupLock(announcementId, uid, channel = 'PUSH', ttlSeconds = 86400) {
  if (!UPSTASH_ENABLED || !redis) return true; // Fail open for dedup if Redis down (fallback handled by Mongo/in-memory)
  if (!announcementId || !uid) return false;

  const key = redisKeys.dedup(announcementId, uid, channel);
  try {
    // Upstash Redis set options: nx = true, ex = ttlSeconds
    const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error(`[RedisNotifStore] acquireDedupLock error (${key}):`, err.message);
    return true; // Fail open to avoid dropping critical notifications
  }
}

module.exports = {
  addScopeAllUser,
  removeScopeAllUser,
  getScopeAllUsers,
  addWatcher,
  removeWatcher,
  getWatchers,
  setPrefs,
  getPrefs,
  acquireDedupLock,
};
