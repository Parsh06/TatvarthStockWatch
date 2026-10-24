'use strict';

/**
 * requireAdmin.js
 *
 * Express middleware factory that enforces admin role + entitlement checks.
 *
 * MUST always run AFTER verifyToken (req.uid must be set).
 *
 * Usage:
 *   router.get('/api/admin/users', verifyToken, requireAdmin('read'), handler)
 *   router.patch('/api/admin/users/:uid/disable', verifyToken, requireAdmin('write'), handler)
 *
 * Redis caching:
 *   Entitlement results are cached in Redis under admin:entitlement:{uid}
 *   with a 60-second TTL to avoid Firestore reads on every admin API call.
 */

const { db } = require('../lib/firebaseAdmin');

let _redis = null;
const _memCache = new Map(); // Fast local in-memory cache
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in memory
const REDIS_TTL_SEC = 300; // 5 minutes in Redis

function getRedis() {
  if (_redis !== null) return _redis;
  try {
    const { redis, isRedisAvailable } = require('../lib/redis/redisClient');
    _redis = isRedisAvailable() ? redis : false;
  } catch {
    _redis = false;
  }
  return _redis;
}

/**
 * Reads admin entitlement from in-memory cache (0ms) → Redis cache → Firestore.
 * @param {string} uid
 * @returns {{ role: string, entitlements: { read: boolean, write: boolean }, disabled: boolean }}
 */
async function loadAdminProfile(uid) {
  const cacheKey = `admin:entitlement:${uid}`;

  // 1. Try high-speed in-memory cache FIRST (0ms latency, zero database quota impact)
  const memEntry = _memCache.get(cacheKey);
  if (memEntry && Date.now() < memEntry.expiresAt) {
    return memEntry.data;
  }

  // 2. Try Redis ONLY if available and circuit is healthy
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(cacheKey);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        _memCache.set(cacheKey, { data: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
        return parsed;
      }
    } catch {
      // Redis read failed — fall through
    }
  }

  // 3. Fetch from Firestore
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() : {};

  const profile = {
    role: data.role || 'user',
    entitlements: data.entitlements || { read: false, write: false },
    disabled: data.disabled === true,
  };

  // 4. Store in in-memory cache & Redis
  _memCache.set(cacheKey, { data: profile, expiresAt: Date.now() + CACHE_TTL_MS });
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(profile), { ex: REDIS_TTL_SEC });
    } catch {
      // Non-critical — continue
    }
  }

  return profile;
}

/**
 * Invalidates the cached entitlement for a specific UID.
 * Call this whenever an admin changes another user's role or entitlements.
 * @param {string} uid
 */
async function invalidateEntitlementCache(uid) {
  const cacheKey = `admin:entitlement:${uid}`;
  _memCache.delete(cacheKey);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(cacheKey);
    } catch {
      // Non-critical
    }
  }
}

/**
 * Middleware factory.
 * @param {'read'|'write'} [requiredEntitlement] - if provided, checks entitlements[requiredEntitlement] === true
 */
function requireAdmin(requiredEntitlement) {
  return async function adminGuard(req, res, next) {
    const uid = req.uid;
    if (!uid) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      const profile = await loadAdminProfile(uid);

      if (profile.disabled) {
        return res.status(403).json({
          success: false,
          error: 'Your account has been disabled. Contact support.',
          code: 'ACCOUNT_DISABLED',
        });
      }

      if (profile.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required',
          code: 'FORBIDDEN',
        });
      }

      // Check entitlements if a specific one is required
      if (requiredEntitlement) {
        if (!profile.entitlements || profile.entitlements[requiredEntitlement] !== true) {
          return res.status(403).json({
            success: false,
            error: `Admin entitlement '${requiredEntitlement}' required for this operation`,
            code: 'ENTITLEMENT_INSUFFICIENT',
          });
        }
      }

      // Attach for downstream handlers
      req.adminProfile = profile;
      next();
    } catch (err) {
      console.error('[requireAdmin] Entitlement check failed:', err.message);
      return res.status(403).json({
        success: false,
        error: 'Failed to verify admin permissions',
        code: 'ENTITLEMENT_CHECK_FAILED',
      });
    }
  };
}

module.exports = {
  requireAdmin,
  invalidateEntitlementCache,
  loadAdminProfile,
};
