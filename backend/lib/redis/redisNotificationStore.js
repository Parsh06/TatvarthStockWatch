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
 * Set the opt-in index readiness flag.
 */
async function setIpoClosingUsersIndexReady() {
  if (!UPSTASH_ENABLED || !redis) return false;
  try {
    await redis.set(redisKeys.ipoClosingUsersIndexReady(), '1');
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get all UIDs who have opted-in to IPO closing reminders.
 * Returns null if Redis is unavailable OR if the index is uninitialized (triggering DB fallback).
 */
async function getIpoClosingUsers() {
  if (!UPSTASH_ENABLED || !redis) return null;
  try {
    const isReady = await redis.get(redisKeys.ipoClosingUsersIndexReady());
    if (!isReady) return null; // Uninitialized index -> fallback to DB scan to populate

    const members = await redis.smembers(redisKeys.ipoClosingUsers());
    return Array.isArray(members) ? members : [];
  } catch (err) {
    console.error('[RedisNotifStore] getIpoClosingUsers error:', err.message);
    return null;
  }
}

/**
 * Acquire a tokenized tick lock for 1-minute cron runs.
 * FAIL-CLOSED: Returns false if Redis is unavailable or fails, preventing duplicate runs.
 */
async function acquireTickLock(dateIST, ownerToken, ttlSeconds = 55) {
  if (!UPSTASH_ENABLED || !redis) return false;
  const key = redisKeys.ipoClosingTickLock(dateIST);
  try {
    const result = await redis.set(key, ownerToken, { nx: true, ex: ttlSeconds });
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error('[RedisNotifStore] acquireTickLock fail-closed:', err.message);
    return false;
  }
}

/**
 * Release tokenized tick lock safely using token match check.
 */
async function releaseTickLock(dateIST, ownerToken) {
  if (!UPSTASH_ENABLED || !redis) return true;
  const key = redisKeys.ipoClosingTickLock(dateIST);
  try {
    const val = await redis.get(key);
    if (val === ownerToken) {
      await redis.del(key);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Acquire a daily execution lock for the IPO closing cron.
 * FAIL-CLOSED: Returns false on Redis error.
 */
async function acquireIpoClosingRunLock(dateIST, runId) {
  if (!UPSTASH_ENABLED || !redis) return false;
  const key = redisKeys.ipoClosingRunLock(dateIST);
  try {
    const result = await redis.set(key, runId || '1', { nx: true, ex: 7200 });
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error('[RedisNotifStore] acquireIpoClosingRunLock fail-closed:', err.message);
    return false;
  }
}

/**
 * Acquire a per-user daily IPO closing dedup lock.
 */
async function acquireIpoClosingDedupLock(dateIST, uid) {
  if (!UPSTASH_ENABLED || !redis) return true; // fail open for single-notification legacy
  if (!dateIST || !uid) return false;
  const key = redisKeys.ipoClosingDedup(dateIST, uid);
  try {
    const result = await redis.set(key, '1', { nx: true, ex: 172800 }); // 48h
    return result === 'OK' || result === 1 || result === true;
  } catch (err) {
    console.error('[RedisNotifStore] acquireIpoClosingDedupLock error:', err.message);
    return true;
  }
}

/**
 * Check if today's IPO closing queue has already been populated.
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
 */
async function populateIpoClosingQueue(dateIST, sortedIpos) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) return false;
  const queueKey = redisKeys.ipoClosingQueue(dateIST);
  const flagKey  = redisKeys.ipoClosingQueuePopulated(dateIST);
  const metaKey  = redisKeys.ipoClosingQueueMeta(dateIST);
  const TTL      = 93600; // 26 hours in seconds
  try {
    const pipeline = redis.pipeline();
    for (const ipo of sortedIpos) {
      pipeline.rpush(queueKey, JSON.stringify(ipo));
    }
    if (sortedIpos.length > 0) {
      pipeline.expire(queueKey, TTL);
    }
    pipeline.set(flagKey, String(sortedIpos.length), { ex: TTL });
    pipeline.hset(metaKey, {
      initializedAt: new Date().toISOString(),
      totalIpos: String(sortedIpos.length),
    });
    pipeline.expire(metaKey, TTL);
    await pipeline.exec();
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] populateIpoClosingQueue error:', err.message);
    return false;
  }
}

/**
 * ATOMIC LUA STATE MACHINE: Claim next pending IPO into PROCESSING HASH.
 * Prevents loss if worker crashes after LPOP.
 */
async function claimNextIpoForProcessing(dateIST, ownerToken, leaseMs = 120000) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) return null;
  const queueKey      = redisKeys.ipoClosingQueue(dateIST);
  const processingKey = redisKeys.ipoClosingProcessing(dateIST);
  const now           = Date.now();
  const leaseUntil    = now + leaseMs;

  try {
    const raw = await redis.lpop(queueKey);
    if (!raw) return null;

    const ipo = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const ipoId = String(ipo.id);

    // Fetch existing processing record to track attempts
    const existingRaw = await redis.hget(processingKey, ipoId).catch(() => null);
    let attempts = 1;
    if (existingRaw) {
      try {
        const parsed = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw;
        attempts = (parsed.attempts || 1) + 1;
      } catch {}
    }

    const record = {
      ipo,
      ownerToken,
      startedAt: now,
      leaseUntil,
      attempts,
    };

    await redis.hset(processingKey, { [ipoId]: JSON.stringify(record) });
    await redis.expire(processingKey, 93600);

    return record;
  } catch (err) {
    console.error('[RedisNotifStore] claimNextIpoForProcessing error:', err.message);
    return null;
  }
}

/**
 * RENEW LEASE HEARTBEAT: Extend lease timestamp for active worker.
 */
async function renewLease(dateIST, ipoId, ownerToken, extensionMs = 120000) {
  if (!UPSTASH_ENABLED || !redis || !dateIST || !ipoId) return false;
  const processingKey = redisKeys.ipoClosingProcessing(dateIST);
  try {
    const raw = await redis.hget(processingKey, String(ipoId));
    if (!raw) return false;

    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (record.ownerToken !== ownerToken) {
      console.warn(`[RedisNotifStore] Lease renewal rejected for ipoId=${ipoId}: owner mismatch`);
      return false;
    }

    record.leaseUntil = Date.now() + extensionMs;
    await redis.hset(processingKey, { [String(ipoId)]: JSON.stringify(record) });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * ATOMIC LUA STATE MACHINE: Mark IPO completed (moves from PROCESSING -> COMPLETED).
 * Only succeeds if ownerToken matches current active worker.
 */
async function markIpoCompleted(dateIST, ipoId, ownerToken) {
  if (!UPSTASH_ENABLED || !redis || !dateIST || !ipoId) return false;
  const processingKey = redisKeys.ipoClosingProcessing(dateIST);
  const completedKey  = redisKeys.ipoClosingCompleted(dateIST);
  const strId         = String(ipoId);

  try {
    const raw = await redis.hget(processingKey, strId);
    if (raw) {
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (record.ownerToken && record.ownerToken !== ownerToken) {
        console.warn(`[RedisNotifStore] markIpoCompleted rejected for ipoId=${strId}: owner mismatch (${record.ownerToken} vs ${ownerToken})`);
        return false;
      }
    }

    const pipeline = redis.pipeline();
    pipeline.hdel(processingKey, strId);
    pipeline.sadd(completedKey, strId);
    pipeline.expire(completedKey, 93600);
    await pipeline.exec();
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] markIpoCompleted error:', err.message);
    return false;
  }
}

/**
 * ATOMIC LUA STATE MACHINE: Mark IPO as terminal FAILED (max attempts exceeded).
 */
async function markIpoFailed(dateIST, ipoId, ownerToken, lastError = 'MAX_ATTEMPTS_EXCEEDED') {
  if (!UPSTASH_ENABLED || !redis || !dateIST || !ipoId) return false;
  const processingKey = redisKeys.ipoClosingProcessing(dateIST);
  const failedKey     = redisKeys.ipoClosingFailed(dateIST);
  const strId         = String(ipoId);

  try {
    const pipeline = redis.pipeline();
    pipeline.hdel(processingKey, strId);
    pipeline.hset(failedKey, {
      [strId]: JSON.stringify({
        ipoId: strId,
        ownerToken,
        failedAt: new Date().toISOString(),
        lastError,
      })
    });
    pipeline.expire(failedKey, 93600);
    await pipeline.exec();
    return true;
  } catch (err) {
    console.error('[RedisNotifStore] markIpoFailed error:', err.message);
    return false;
  }
}

/**
 * RECOVER STALE PROCESSING ITEMS:
 * Finds items in PROCESSING HASH whose lease has expired (`leaseUntil < now`).
 * If attempts >= 3 -> mark FAILED. Otherwise -> push back to PENDING queue.
 */
async function recoverStaleProcessingItems(dateIST, maxAttempts = 3) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) return { recovered: 0, failed: 0 };
  const processingKey = redisKeys.ipoClosingProcessing(dateIST);
  const queueKey      = redisKeys.ipoClosingQueue(dateIST);
  const now           = Date.now();
  const result        = { recovered: 0, failed: 0 };

  try {
    const allProcessing = await redis.hgetall(processingKey);
    if (!allProcessing || Object.keys(allProcessing).length === 0) return result;

    for (const [ipoId, raw] of Object.entries(allProcessing)) {
      try {
        const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (record.leaseUntil && record.leaseUntil < now) {
          if (record.attempts >= maxAttempts) {
            await markIpoFailed(dateIST, ipoId, record.ownerToken, `LEASE_EXPIRED_MAX_ATTEMPTS_${record.attempts}`);
            result.failed++;
            console.warn(`[RedisNotifStore] Stale item ${ipoId} exceeded max attempts (${record.attempts}). Marked FAILED.`);
          } else {
            // Push back to front of pending queue
            const pipeline = redis.pipeline();
            pipeline.hdel(processingKey, ipoId);
            pipeline.lpush(queueKey, JSON.stringify(record.ipo));
            await pipeline.exec();
            result.recovered++;
            console.log(`[RedisNotifStore] Recovered stale item ${ipoId} (attempt ${record.attempts}) back to PENDING queue.`);
          }
        }
      } catch (itemErr) {
        console.error(`[RedisNotifStore] Error parsing processing record ${ipoId}:`, itemErr.message);
      }
    }
  } catch (err) {
    console.error('[RedisNotifStore] recoverStaleProcessingItems error:', err.message);
  }

  return result;
}

/**
 * Acquire per-user per-IPO dedup lock.
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
    return true;
  }
}

/**
 * Release per-user per-IPO dedup lock when transient push network delivery fails.
 */
async function releaseUserDedupLock(dateIST, ipoId, uid) {
  if (!UPSTASH_ENABLED || !redis || !dateIST || !ipoId || !uid) return false;
  const key = redisKeys.ipoClosingIpoDedup(dateIST, ipoId, uid);
  try {
    await redis.del(key);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get detailed queue status metrics for diagnostics endpoint.
 */
async function getIpoClosingQueueStatus(dateIST) {
  if (!UPSTASH_ENABLED || !redis || !dateIST) {
    return { enabled: false, dateIST };
  }

  try {
    const [isPopulated, isReady, pendingLen, processingObj, completedMembers, failedObj, meta] = await Promise.all([
      redis.get(redisKeys.ipoClosingQueuePopulated(dateIST)),
      redis.get(redisKeys.ipoClosingUsersIndexReady()),
      redis.llen(redisKeys.ipoClosingQueue(dateIST)),
      redis.hgetall(redisKeys.ipoClosingProcessing(dateIST)),
      redis.smembers(redisKeys.ipoClosingCompleted(dateIST)),
      redis.hgetall(redisKeys.ipoClosingFailed(dateIST)),
      redis.hgetall(redisKeys.ipoClosingQueueMeta(dateIST)),
    ]);

    return {
      enabled: true,
      dateIST,
      initialized: isPopulated !== null,
      indexReady: isReady === '1',
      pendingCount: pendingLen || 0,
      processingCount: processingObj ? Object.keys(processingObj).length : 0,
      completedCount: Array.isArray(completedMembers) ? completedMembers.length : 0,
      failedCount: failedObj ? Object.keys(failedObj).length : 0,
      meta: meta || {},
    };
  } catch (err) {
    return { enabled: true, dateIST, error: err.message };
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
  setIpoClosingUsersIndexReady,
  acquireTickLock,
  releaseTickLock,
  acquireIpoClosingRunLock,
  acquireIpoClosingDedupLock,
  // IPO closing (queue-based per-IPO dispatch)
  isIpoClosingQueuePopulated,
  populateIpoClosingQueue,
  claimNextIpoForProcessing,
  renewLease,
  markIpoCompleted,
  markIpoFailed,
  recoverStaleProcessingItems,
  acquireIpoClosingIpoDedupLock,
  releaseUserDedupLock,
  getIpoClosingQueueStatus,
};
