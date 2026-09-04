'use strict';

const { bseGet, getBseCookies } = require('./apiClients');

// ── In-memory snapshot & TTL ──────────────────────────────────────────────────
let _snapshot = null; // { lastUpdated, exchange, stocks: [] }
let _lastFetchedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// ── Normalize raw BSE Volume Spurt item ──────────────────────────────────────
function normalizeSpurtItem(item, rank) {
  const parse = (v) => {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const bseCode   = String(item.scrip_cd || item.SCRIP_CD || '').trim();
  const symbol    = (item.scripname || item.SCRIP_ID || bseCode).trim();
  const company   = (item.long_name || item.SLONGNAME || symbol).trim();
  const ltp       = parse(item.Ltradert || item.CURRENT_VALUE);
  const change    = parse(item.change_val);
  const changePct = parse(item.change_percent);
  const prevClose = ltp - change;
  const curVol    = parse(item.Trd_vol);       // in lakhs (L)
  const avgVol    = parse(item.wkavgqty);      // weekly avg in lakhs
  const volMulti  = parse(item.volumechangetimes); // e.g. "132.15"
  const turnover  = parse(item.TurnOver);      // in crores
  const bseUrl    = item.NSURL || (bseCode
    ? `https://www.bseindia.com/corporates/ann.html?scripcd=${bseCode}`
    : null);

  return {
    rank,
    bseCode,
    symbol,
    company,
    ltp,
    prevClose,
    change,
    changePct,
    currentVolume: curVol,
    avgVolume:     avgVol,
    volMultiple:   volMulti,
    turnoverCr:    turnover,
    bseUrl,
  };
}

// ── Fetch and cache snapshot on-demand ────────────────────────────────────────
async function fetchAndCache(force = false) {
  const now = Date.now();
  if (!force && _snapshot && (now - _lastFetchedAt) < CACHE_TTL_MS) {
    return _snapshot;
  }

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    const data = await bseGet(
      '/SpurtvolumeNew/w',
      { flag: '1' },
      15000,
      sessionHdr
    );

    let raw = [];
    if (Array.isArray(data)) {
      raw = data;
    } else if (Array.isArray(data?.Table)) {
      raw = data.Table;
    } else if (data && typeof data === 'object') {
      const firstArr = Object.values(data).find(Array.isArray);
      if (firstArr) raw = firstArr;
    }

    const stocks = raw.map((item, i) => normalizeSpurtItem(item, i + 1));

    if (stocks.length > 0 || !_snapshot) {
      _snapshot = {
        lastUpdated: new Date().toISOString(),
        exchange:    'BSE',
        count:       stocks.length,
        stocks,
      };
    }
    _lastFetchedAt = Date.now();

    return _snapshot;
  } catch (e) {
    console.error('[Volume Spurt] Fetch error:', e.message);
    return _snapshot || {
      lastUpdated: new Date().toISOString(),
      exchange:    'BSE',
      count:       0,
      stocks:      [],
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function getLatestSpurt() {
  return _snapshot;
}

async function getOrFetchSpurt(force = false) {
  return await fetchAndCache(force);
}

// Optional backward-compatible helper (does not poll)
async function startSpurtPoller() {
  return Promise.resolve();
}

module.exports = {
  startSpurtPoller,
  getLatestSpurt,
  getOrFetchSpurt,
  fetchAndCache,
};
