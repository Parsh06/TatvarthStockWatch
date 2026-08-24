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

// ── IPO Closing Notification Operations ─────────────────────────────────────

/**
 * Add a user to the IPO closing opted-in SET.
 * Called when the user enables notifyIpoClosing in their preferences.
 */
async function addIpoClosingUser(uid) {
  if (!UPSTASH_ENABLED || !redis || !uid) return false;
  try {
    await redis.sadd(redisKeys.ipoClosingUsers(), uid);
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] addIpoClosingUser error:', err.message);
    return false;
  }
}

/**
 * Remove a user from the IPO closing opted-in SET.
 * Called when the user disables notifyIpoClosing.
 */
async function removeIpoClosingUser(uid) {
  if (!UPSTASH_ENABLED || !redis || !uid) return false;
  try {
    await redis.srem(redisKeys.ipoClosingUsers(), uid);
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] removeIpoClosingUser error:', err.message);
    return false;
  }
}

/**
 * Get all UIDs who have opted-in to IPO closing reminders.
 * Returns an empty array if Redis is not enabled (graceful degradation).
 */
async function getIpoClosingUsers() {
  if (!UPSTASH_ENABLED || !redis) return null; // null = Redis unavailable → caller falls back to Firebase scan
  try {
    const members = await redis.smembers(redisKeys.ipoClosingUsers());
    return Array.isArray(members) ? members : [];
  } catch (err) {
    console.error('[RedisNotifStore] getIpoClosingUsers error:', err.message);
    return null;
  }
}

/**
 * Acquire a daily execution lock for the IPO closing cron.
 * Returns true if acquired (first run for this IST date), false if already executed.
 * TTL = 2 hours — protects against duplicate scheduler invocations.
 *
 * @param {string} dateIST  — e.g. '2026-08-22'
 * @param {string} runId    — unique ID for this invocation
 */
async function acquireIpoClosingRunLock(dateIST, runId) {
  if (!UPSTASH_ENABLED || !redis) return true; // fail open if Redis is down
  const key = redisKeys.ipoClosingRunLock(dateIST);
  try {
    const result = await redis.set(key, runId || '1', { nx: true, ex: 7200 });
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error('[RedisNotifStore] acquireIpoClosingRunLock error:', err.message);
    return true; // fail open to avoid silently skipping the day
  }
}

/**
 * Acquire a per-user daily IPO closing dedup lock.
 * Guarantees at most ONE IPO closing push notification per user per day.
 * TTL = 48 hours (avoids edge cases at day boundary).
 *
 * @param {string} dateIST  — e.g. '2026-08-22'
 * @param {string} uid
 * @returns {Promise<boolean>} true if lock acquired (send the notification), false if already sent
 */
async function acquireIpoClosingDedupLock(dateIST, uid) {
  if (!UPSTASH_ENABLED || !redis) return true; // fail open
  if (!dateIST || !uid) return false;
  const key = redisKeys.ipoClosingDedup(dateIST, uid);
  try {
    const result = await redis.set(key, '1', { nx: true, ex: 172800 }); // 48h
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error('[RedisNotifStore] acquireIpoClosingDedupLock error:', err.message);
    return true; // fail open — better to send once extra than miss entirely
  }
}

/**
 * Check if today's IPO closing queue has already been populated.
 * Returns false if Redis is down (caller will re-populate safely).
 */
async function isIpoClosingQueuePopulated(dateIST) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) return false;
  try {
    const val = await redis.get(redisKeys.ipoClosingQueuePopulated(dateIST));
    return val !== null;
  } catch (err) {
    console.error('[RedisNotifStore] isIpoClosingQueuePopulated error:', err.message);
    return false;
  }
}

/**
 * Populate the IPO closing queue with today's sorted IPO list.
 * Uses RPUSH so LPOP processes them in sorted order (highest GMP first).
 * Sets a 26-hour TTL on both the LIST and the populated flag.
 *
 * Pass empty array to set the "populated" flag with no items (no IPOs today).
 */
async function populateIpoClosingQueue(dateIST, sortedIpos) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) return false;
  const queueKey = redisKeys.ipoClosingQueue(dateIST);
  const flagKey  = redisKeys.ipoClosingQueuePopulated(dateIST);
  const TTL      = 93600; // 26 hours in seconds
  try {
    const pipeline = redis.pipeline();
    // Push all IPOs as serialized JSON
    for (const ipo of sortedIpos) {
      pipeline.rpush(queueKey, JSON.stringify(ipo));
    }
    if (sortedIpos.length > 0) {
      pipeline.expire(queueKey, TTL);
    }
    pipeline.set(flagKey, String(sortedIpos.length), { ex: TTL });
    await pipeline.exec();
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] populateIpoClosingQueue error:', err.message);
    return false;
  }
}

/**
 * Atomically pop the next pending IPO from today's queue.
 * Returns parsed IPO object or null if queue is empty / Redis down.
 */
async function popNextIpoFromQueue(dateIST) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) return null;
  const queueKey = redisKeys.ipoClosingQueue(dateIST);
  try {
    const raw = await redis.lpop(queueKey);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error('[RedisNotifStore] popNextIpoFromQueue error:', err.message);
    return null;
  }
}

/**
 * Acquire a per-user per-IPO dedup lock.
 * Returns true  → lock acquired, notification should be sent.
 * Returns false → already sent today for this user + IPO.
 * TTL = 48 hours.
 */
async function acquireIpoClosingIpoDedupLock(dateIST, ipoId, uid) {
  if (!UPSTASH_ENABLED || !redis) return true; // fail open
  if (!dateIST || !ipoId || !uid) return false;
  const key = redisKeys.ipoClosingIpoDedup(dateIST, ipoId, uid);
  try {
    const result = await redis.set(key, '1', { nx: true, ex: 172800 }); // 48h
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error('[RedisNotifStore] acquireIpoClosingIpoDedupLock error:', err.message);
    return true; // fail open — better to send once extra than miss entirely
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
  // IPO closing (legacy single-notification)
  addIpoClosingUser,
  removeIpoClosingUser,
  getIpoClosingUsers,
  acquireIpoClosingRunLock,
  acquireIpoClosingDedupLock,
  // IPO closing (queue-based per-IPO dispatch)
  isIpoClosingQueuePopulated,
  populateIpoClosingQueue,
  popNextIpoFromQueue,
  acquireIpoClosingIpoDedupLock,
};
