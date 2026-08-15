'use strict';

/**
 * rateLimiter.js
 * In-memory rate limiting per IP and per authenticated User UID.
 */

const _rlStore = new Map();
const WINDOW_MS = 60_000; // 1 minute

function getClientIdentifier(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const uid = req.uid || req.user?.uid || 'anon';
  return `${ip}:${uid}`;
}

function createLimiter({ maxRequests = 120, windowMs = WINDOW_MS, errorMessage = 'Too many requests — please slow down.' }) {
  return (req, res, next) => {
    const key = `${getClientIdentifier(req)}:${req.baseUrl || ''}${req.path || ''}`;
    const now = Date.now();
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
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    next();
  };
}

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rlStore) {
    if (now > v.resetAt + 60_000) _rlStore.delete(k);
  }
}, 5 * 60_000);

const globalRateLimiter = createLimiter({ maxRequests: 120, windowMs: WINDOW_MS });
const strictRateLimiter = createLimiter({ maxRequests: 15, windowMs: WINDOW_MS, errorMessage: 'Strict rate limit exceeded for this operation.' });
const userMutationRateLimiter = createLimiter({ maxRequests: 60, windowMs: WINDOW_MS, errorMessage: 'Mutation limit exceeded.' });

module.exports = {
  globalRateLimiter,
  strictRateLimiter,
  userMutationRateLimiter,
  createLimiter,
};
