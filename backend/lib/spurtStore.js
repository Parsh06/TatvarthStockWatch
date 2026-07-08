'use strict';

const { bseGet, getBseCookies } = require('./apiClients');

// ── In-memory snapshot ────────────────────────────────────────────────────────
let _snapshot = null; // { lastUpdated, exchange, stocks: [] }

// ── Normalize raw BSE Volume Spurt item ──────────────────────────────────────
function normalizeSpurtItem(item, rank) {
  const parse = (v) => {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // Actual BSE fields: scrip_cd, scripname, long_name, Trd_vol, wkavgqty,
  // volumechangetimes, Ltradert, change_val, change_percent, TurnOver, NSURL
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
    turnoverCr:    turnover,  // in Crores
    bseUrl,
  };
}


// ── Fetch and cache snapshot ──────────────────────────────────────────────────
async function fetchAndCache() {
  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    const data = await bseGet(
      '/SpurtvolumeNew/w',
      { flag: '1' },
      15000,
      sessionHdr
    );

    // BSE returns the array at root or inside a key like Table
    let raw = [];
    if (Array.isArray(data)) {
      raw = data;
    } else if (Array.isArray(data?.Table)) {
      raw = data.Table;
    } else if (data && typeof data === 'object') {
      // Try to find the first array property
      const firstArr = Object.values(data).find(Array.isArray);
      if (firstArr) raw = firstArr;
    }

    const stocks = raw.map((item, i) => normalizeSpurtItem(item, i + 1));

    _snapshot = {
      lastUpdated: new Date().toISOString(),
      exchange:    'BSE',
      count:       stocks.length,
      stocks,
    };

    console.log(`[Spurt Poller] ✅ Refreshed — ${stocks.length} stocks at ${_snapshot.lastUpdated}`);
  } catch (e) {
    console.error('[Spurt Poller] ❌ Fetch failed:', e.message);
    // Keep the old snapshot so the frontend still has data
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function getLatestSpurt() {
  return _snapshot;
}

let _pollerStarted = false;

async function startSpurtPoller() {
  if (_pollerStarted) return;
  _pollerStarted = true;

  // Initial fetch immediately
  await fetchAndCache();

  // Then every 60 seconds
  setInterval(fetchAndCache, 60 * 1000);
  console.log('[Spurt Poller] Started — polling every 60 seconds');
}

module.exports = { startSpurtPoller, getLatestSpurt };
