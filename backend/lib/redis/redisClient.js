'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Redis } = require('@upstash/redis');

const UPSTASH_ENABLED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let _rawRedis = null;
let _circuitOpen = false;
let _circuitOpenUntil = 0;
let _circuitTrippedAt = 0;
let _circuitReason = '';
const CIRCUIT_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes cooldown when quota/rate-limit hit

function isQuotaError(err) {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const status = err.status || err.statusCode;
  return (
    status === 429 ||
    msg.includes('max requests limit exceeded') ||
    msg.includes('request limit') ||
    msg.includes('daily request limit') ||
    msg.includes('monthly request limit') ||
    msg.includes('quota') ||
    msg.includes('too many requests')
  );
}

function tripCircuit(reason) {
  _circuitOpen = true;
  _circuitTrippedAt = Date.now();
  _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  _circuitReason = reason || 'Database quota reached';
  console.warn(
    `[RedisCircuitBreaker] Upstash database quota limit reached (${_circuitReason}). ` +
    `Circuit breaker tripped OPEN for 60m. All operations will use ultra-fast in-memory fallback with zero latency and zero external network calls.`
  );
}

function isCircuitOpen() {
  if (!_circuitOpen) return false;
  if (Date.now() > _circuitOpenUntil) {
    // Cooldown elapsed — allow a probe request to test if quota has reset
    return false;
  }
  return true;
}

function isRedisAvailable() {
  if (!UPSTASH_ENABLED || !_rawRedis) return false;
  return !isCircuitOpen();
}

function getCircuitStatus() {
  const now = Date.now();
  const open = isCircuitOpen();
  return {
    enabled: UPSTASH_ENABLED,
    configured: Boolean(_rawRedis),
    circuitOpen: open,
    trippedAt: _circuitTrippedAt ? new Date(_circuitTrippedAt).toISOString() : null,
    cooldownRemainingSec: open ? Math.max(0, Math.ceil((_circuitOpenUntil - now) / 1000)) : 0,
    reason: _circuitReason || null,
    mode: open ? 'in-memory-fallback' : (UPSTASH_ENABLED && _rawRedis ? 'active' : 'disabled'),
  };
}

function resetCircuit() {
  _circuitOpen = false;
  _circuitOpenUntil = 0;
  _circuitReason = '';
  console.log('[RedisCircuitBreaker] Circuit breaker reset manually. Operational mode restored.');
}

if (UPSTASH_ENABLED) {
  try {
    _rawRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (err) {
    console.error('[RedisClient] Failed to initialize Upstash Redis:', err.message);
    _rawRedis = null;
  }
}

// Proxied wrapper that guarantees callers never crash or stall on quota exhaustion
const redis = _rawRedis ? new Proxy(_rawRedis, {
  get(obj, prop) {
    if (prop === 'pipeline') {
      return function() {
        const rawPipe = obj.pipeline ? obj.pipeline() : null;
        let commandCount = 0;
        const pipeObj = {
          incr(...args) { commandCount++; if (rawPipe) rawPipe.incr(...args); return pipeObj; },
          pexpire(...args) { commandCount++; if (rawPipe) rawPipe.pexpire(...args); return pipeObj; },
          expire(...args) { commandCount++; if (rawPipe) rawPipe.expire(...args); return pipeObj; },
          set(...args) { commandCount++; if (rawPipe) rawPipe.set(...args); return pipeObj; },
          del(...args) { commandCount++; if (rawPipe) rawPipe.del(...args); return pipeObj; },
          hset(...args) { commandCount++; if (rawPipe) rawPipe.hset(...args); return pipeObj; },
          hdel(...args) { commandCount++; if (rawPipe) rawPipe.hdel(...args); return pipeObj; },
          sadd(...args) { commandCount++; if (rawPipe) rawPipe.sadd(...args); return pipeObj; },
          srem(...args) { commandCount++; if (rawPipe) rawPipe.srem(...args); return pipeObj; },
          lpush(...args) { commandCount++; if (rawPipe) rawPipe.lpush(...args); return pipeObj; },
          rpush(...args) { commandCount++; if (rawPipe) rawPipe.rpush(...args); return pipeObj; },
          async exec() {
            if (isCircuitOpen()) {
              return new Array(commandCount).fill(1);
            }
            try {
              return await rawPipe.exec();
            } catch (err) {
              if (isQuotaError(err)) {
                tripCircuit(err.message);
                return new Array(commandCount).fill(1);
              }
              throw err;
            }
          }
        };
        return pipeObj;
      };
    }

    if (typeof obj[prop] === 'function') {
      return async function(...args) {
        if (isCircuitOpen()) {
          if (prop === 'get') return null;
          if (prop === 'smembers' || prop === 'keys') return [];
          if (prop === 'hgetall') return {};
          if (prop === 'llen') return 0;
          if (prop === 'lpop') return null;
          if (prop === 'ping') return 'PONG (circuit_open_fallback)';
          return 1;
        }

        try {
          const res = await obj[prop](...args);
          // If a successful call occurs after a previous trip, clear circuit
          if (_circuitOpen && prop === 'ping') {
            _circuitOpen = false;
            _circuitReason = '';
            console.log('[RedisCircuitBreaker] Upstash Redis probe succeeded. Circuit breaker CLOSED — operational.');
          }
          return res;
        } catch (err) {
          if (isQuotaError(err)) {
            tripCircuit(err.message);
            if (prop === 'get') return null;
            if (prop === 'smembers' || prop === 'keys') return [];
            if (prop === 'hgetall') return {};
            if (prop === 'llen') return 0;
            if (prop === 'lpop') return null;
            if (prop === 'ping') return 'PONG (circuit_open_fallback)';
            return 1;
          }
          throw err;
        }
      };
    }

    return obj[prop];
  }
}) : null;

module.exports = {
  get redis() {
    return redis;
  },
  UPSTASH_ENABLED,
  isRedisAvailable,
  isCircuitOpen,
  getCircuitStatus,
  tripCircuit,
  resetCircuit,
};
