'use strict';

/**
 * rateLimiter.js
 * High-performance, quota-conscious rate limiting.
 * Uses high-speed in-memory store for general routes (zero Redis commands),
 * and distributes only high-risk mutation endpoints when Redis circuit is healthy.
 */

const { redis, isRedisAvailable } = require('../lib/redis/redisClient');

const _rlStore = new Map();
const WINDOW_MS = 60_000; // 1 minute

function getClientIdentifier(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const uid = req.uid || req.user?.uid || 'anon';
  return `${ip}:${uid}`;
}

/**
 * Health checks, internal cron triggers, and system diagnostics consume 0 rate limit resources.
 */
function shouldBypassRateLimit(req) {
  const url = req.originalUrl || req.url || '';
  if (
    url === '/' ||
    url.startsWith('/api/health') ||
    url.startsWith('/api/system') ||
    url.startsWith('/api/cron') ||
    url.startsWith('/api/telegram-status')
  ) {
    return true;
  }
  return false;
}

function createLimiter({
  maxRequests = 120,
  windowMs = WINDOW_MS,
  errorMessage = 'Too many requests — please slow down.',
  useDistributed = false,
}) {
  return async (req, res, next) => {
    // 1. Bypass internal and diagnostic routes
    if (shouldBypassRateLimit(req)) {
      return next();
    }

    const key = `ratelimit:${getClientIdentifier(req)}:${req.baseUrl || ''}${req.path || ''}`;
    const now = Date.now();

    // 2. Try Redis only for explicit distributed limiters (e.g., auth, checkout) when circuit is available
    if (useDistributed && isRedisAvailable() && redis) {
      try {
        const pipeline = redis.pipeline();
        pipeline.incr(key);
        pipeline.pexpire(key, windowMs, 'NX');

        const results = await pipeline.exec();
        const count = results && Array.isArray(results) ? results[0] : 1;

        if (count > maxRequests) {
          return res.status(429).json({
            success: false,
            error: errorMessage,
            code: 'RATE_LIMIT_EXCEEDED',
          });
        }
        return next();
      } catch (err) {
        // Fall through to in-memory without breaking user request
      }
    }

    // 3. Fast In-Memory Rate Limiting (0ms latency, zero database quota impact)
    let entry = _rlStore.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      _rlStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({
        success: false,
        error: errorMessage,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    next();
  };
}

// Clean up stale in-memory rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rlStore) {
    if (now > v.resetAt + 60_000) _rlStore.delete(k);
  }
}, 5 * 60_000);

// Global app rate limiter: Uses high-speed in-memory store (0 Redis commands consumed)
const globalRateLimiter = createLimiter({ maxRequests: 120, windowMs: WINDOW_MS, useDistributed: false });

// Strict rate limiter for sensitive auth & onboarding endpoints: Distributed with circuit fallback
const strictRateLimiter = createLimiter({
  maxRequests: 15,
  windowMs: WINDOW_MS,
  errorMessage: 'Strict rate limit exceeded for this operation.',
  useDistributed: true,
});

// User mutation limiter for watchlist/preferences updates: Uses in-memory store (0 Redis commands consumed)
const userMutationRateLimiter = createLimiter({
  maxRequests: 60,
  windowMs: WINDOW_MS,
  errorMessage: 'Mutation limit exceeded.',
  useDistributed: false,
});

module.exports = {
  globalRateLimiter,
  strictRateLimiter,
  userMutationRateLimiter,
  createLimiter,
  shouldBypassRateLimit,
};
