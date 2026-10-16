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
const _memCache = new Map(); // fallback in-memory cache
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const REDIS_TTL_SEC = 60;

function getRedis() {
  if (_redis !== null) return _redis;
  try {
    const { redis, UPSTASH_ENABLED } = require('../lib/redis/redisClient');
    _redis = UPSTASH_ENABLED ? redis : false;
  } catch {
    _redis = false;
  }
  return _redis;
}

/**
 * Reads admin entitlement from Redis cache → Firestore → stores in cache.
 * @param {string} uid
 * @returns {{ role: string, entitlements: { read: boolean, write: boolean }, disabled: boolean }}
 */
async function loadAdminProfile(uid) {
  const cacheKey = `admin:entitlement:${uid}`;

  // 1. Try Redis
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(cacheKey);
      if (raw) return JSON.parse(raw);
    } catch {
      // Redis read failed — fall through
    }
  }

  // 2. Try in-memory cache
  const memEntry = _memCache.get(cacheKey);
  if (memEntry && Date.now() < memEntry.expiresAt) {
    return memEntry.data;
  }

  // 3. Fetch from Firestore
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() : {};

  const profile = {
    role: data.role || 'user',
    entitlements: data.entitlements || { read: false, write: false },
    disabled: data.disabled === true,
  };

  // 4. Store in caches
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(profile), { ex: REDIS_TTL_SEC });
    } catch {
      // Non-critical — continue
    }
  }
  _memCache.set(cacheKey, { data: profile, expiresAt: Date.now() + CACHE_TTL_MS });

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
