'use strict';

/**
 * Upstash Redis rates storage.
 *
 * Stores fetched stock rates in Upstash Redis via @upstash/redis SDK.
 * SLIM FORMAT — only ltp/change/pctChange stored (not OHLC).
 * Full OHLC data is only needed for price-alert checking (done in memory,
 * never persisted). Slimming reduces payload from ~600KB → ~200KB.
 *
 * Redis key: stockwatch:rates:latest
 * TTL: 2 hours — stale rates auto-expire if server goes down.
 */

const { Redis } = require('@upstash/redis');

const UPSTASH_ENABLED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redis = null;
if (UPSTASH_ENABLED) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const REDIS_KEY = 'stockwatch:rates:latest';
const REDIS_TTL = 7200; // 2 hours

const DEFAULT_RATES = {
  fetchedAt: null, updatedAt: null,
  total: 0, success: 0, failed: 0,
  complete: false, rates: {},
};

// ── Slim transform ────────────────────────────────────────────────────────────
// Input:  { code: { ltp, prevClose, high, low, open, change, pctChange, ... } }
// Output: { code: { ltp, change, pctChange } }
function slimRates(rates) {
  const slim = {};
  for (const [code, r] of Object.entries(rates || {})) {
    if (!r || r.error || r.ltp == null) continue;
    slim[code] = {
      ltp:       r.ltp,
      change:    r.change    ?? null,
      pctChange: r.pctChange ?? null,
    };
  }
  return slim;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read latest completed rates (slim format) from Upstash Redis.
 * Returns DEFAULT_RATES if nothing stored yet or if UPSTASH is disabled.
 */
async function readRates() {
  if (!UPSTASH_ENABLED || !redis) return { ...DEFAULT_RATES };
  try {
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return { ...DEFAULT_RATES };
    // @upstash/redis automatically parses JSON if it is returned as such
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed;
  } catch (e) {
    console.error('[ratesStore] Redis GET failed:', e.message);
    return { ...DEFAULT_RATES };
  }
}

/**
 * Write a completed rates snapshot.
 * Always slims the rates object before storage.
 *
 * ONLY call this when snapshot.complete === true to avoid write amplification.
 */
async function writeRates(snapshot) {
  const slimmed = {
    fetchedAt: snapshot.fetchedAt,
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
    total:     snapshot.total     || 0,
    success:   snapshot.success   || 0,
    failed:    snapshot.failed    || 0,
    complete:  true,
    rates:     slimRates(snapshot.rates || {}),
  };

  if (UPSTASH_ENABLED && redis) {
    try {
      // Set with expiration in one command
      await redis.set(REDIS_KEY, JSON.stringify(slimmed), { ex: REDIS_TTL });
      console.log(`[ratesStore] Redis: wrote ${Object.keys(slimmed.rates).length} rates`);
    } catch (e) {
      console.error('[ratesStore] Redis SET failed:', e.message);
    }
  }

  return slimmed;
}

module.exports = {
  readRates,
  writeRates,
  slimRates,
  UPSTASH_ENABLED,
};
