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

  const bseCode    = String(item.scripcd || item.SCRIP_CD || '').trim();
  const symbol     = (item.scrip_id || item.SCRIP_ID || bseCode).trim();
  const company    = (item.SLONGNAME || item.scrip_name || symbol).trim();
  const ltp        = parse(item.CURRENT_VALUE || item.current_value || item.LTP);
  const prevClose  = parse(item.PREV_VALUE || item.prev_value || item.PREVCLOSE);
  const change     = parse(item.change_val || item.CHANGE || (ltp - prevClose));
  const changePct  = parse(item.change_percent || item.PCT_CHANGE || item.pct_change);
  const curVol     = parse(item.CURRENT_VOLUME || item.current_volume || item.VOL);
  const avgVol     = parse(item.AVG_VOLUME || item.avg_volume || item.AVGVOL);
  const volMulti   = avgVol > 0 ? parseFloat((curVol / avgVol).toFixed(2)) : parse(item.VOL_MULTIPLE || item.vol_multiple);
  const turnover   = parse(item.TURNOVER || item.turnover || (ltp * curVol));

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
    turnover,
    bseUrl: bseCode
      ? `https://www.bseindia.com/corporates/ann.html?scripcd=${bseCode}`
      : null,
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
