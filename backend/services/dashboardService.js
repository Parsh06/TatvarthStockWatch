'use strict';

/**
 * Dashboard aggregation service.
 * Calls existing backend modules — does NOT duplicate BSE/NSE logic.
 * Returns a partial-failure model: each source has its own status.
 */

const { bseGet } = require('../lib/apiClients');
const { getAnnouncements } = require('../lib/announcementStore');
const { getWatchlist } = require('../lib/watchlistStore');
const axios = require('axios');

// KFintech fallback symbols (updated periodically in ipoVerificationRoutes)
const KFIN_FALLBACK = [
  'MOLBIO DIAGNOSTICS', 'DHOOT TRANSMISSION', 'ARDEE INDUSTRIES',
  'MV ELECTROSYSTEMS', 'JUNIPER GREEN ENERGY', 'DHAVAL PACKAGING',
];

async function fetchIpoSymbolsFromKfin() {
  try {
    const homeRes = await axios.get('https://ipostatus.kfintech.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 StockWatch/1.0' },
      timeout: 8000,
    });
    const scriptMatch = homeRes.data.match(/src="(\.\/static\/js\/main\.[a-f0-9]+\.js)"/);
    if (!scriptMatch) return KFIN_FALLBACK;

    const bundleUrl = 'https://ipostatus.kfintech.com' + scriptMatch[1].slice(1);
    const bundleRes = await axios.get(bundleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 StockWatch/1.0' },
      timeout: 10000,
    });
    const jsonMatch = bundleRes.data.match(/JSON\.parse\('(\[.*?\])'\)/);
    if (!jsonMatch) return KFIN_FALLBACK;
    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(c => String(c.name || c.clientId || '')).filter(Boolean);
    }
    return KFIN_FALLBACK;
  } catch {
    return KFIN_FALLBACK;
  }
}


// ── In-memory TTL cache ────────────────────────────────────────────────────────
const _cache = new Map();
function fromCache(key, ttlMs) {
  const e = _cache.get(key);
  if (e && Date.now() < e.exp) return e.data;
  return null;
}
function toCache(key, data, ttlMs) {
  _cache.set(key, { data, exp: Date.now() + ttlMs });
}

// Safe wrapper — returns { status, data } or { status:'error', message }
async function safe(label, fn) {
  try {
    const data = await fn();
    return { status: 'success', data };
  } catch (err) {
    console.warn(`[DashboardService] ${label} failed:`, err.message);
    return { status: 'error', message: 'Provider unavailable' };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalize raw BSE index object to a consistent schema */
function normalizeIndex(raw) {
  return {
    name:          (raw.indxnm || raw.name || '').trim(),
    value:         parseFloat(String(raw.ltp  || raw.value || '0').replace(/,/g, '')) || 0,
    change:        parseFloat(String(raw.chg  || raw.change || '0').replace(/,/g, '')) || 0,
    changePercent: parseFloat(String(raw.perchg || raw.changePercent || '0').replace(/[,%]/g, '')) || 0,
  };
}

/** Normalize a BSE gainer/loser row */
function normalizeMover(raw) {
  return {
    name:          (raw.scrip_name || raw.scriptname || raw.companyName || raw.scripName || '').trim(),
    bseCode:       (raw.scripcode  || raw.bseCode    || '').trim(),
    ltp:           parseFloat(String(raw.ltp || raw.LTP || 0).replace(/,/g, '')) || 0,
    change:        parseFloat(String(raw.chg || raw.chng || 0).replace(/,/g, '')) || 0,
    changePercent: parseFloat(String(raw.perchg || raw.per_chg || 0).replace(/[,%]/g, '')) || 0,
  };
}

/** Normalize a BSE bulk/block deal row */
function normalizeDeal(raw) {
  return {
    company:     (raw.SCRIP_NAME  || raw.scrip_name  || raw.CompanyName || '').trim(),
    bseCode:     (raw.SCRIP_CD    || raw.scripcode   || '').trim(),
    dealType:    (raw.DEAL_TYPE   || raw.deal_type   || '').trim(),
    client:      (raw.CLIENT_NAME || raw.client_name || '').trim(),
    quantity:    Number(String(raw.QUANTITY || raw.quantity || 0).replace(/,/g, '')) || 0,
    price:       parseFloat(String(raw.RATE  || raw.price  || 0).replace(/,/g, '')) || 0,
    value:       parseFloat(String(raw.VALUE || raw.value  || 0).replace(/,/g, '')) || 0,
  };
}

/** Normalize a volume spurt row */
function normalizeSpurt(raw) {
  return {
    name:       (raw.scrip_name || raw.ScripName || raw.companyName || '').trim(),
    bseCode:    (raw.scripcode  || raw.ScripCode || '').trim(),
    multiplier: parseFloat(String(raw.noof_times || raw.NoofTimes || raw.multiplier || 0).replace(/,/g, '')) || 0,
    volume:     Number(String(raw.TodaysVol || raw.volume || 0).replace(/,/g, '')) || 0,
  };
}

/** Normalize a board-meeting/AGM record */
function normalizeMeeting(raw) {
  return {
    company:  (raw.COMPANY_NAME || raw.companyName || raw.scrip_name || '').trim(),
    bseCode:  (raw.SCRIP_CD     || raw.scripcode   || '').trim(),
    date:     (raw.BOARD_DATE   || raw.date        || raw.MEETING_DATE || '').trim(),
    purpose:  (raw.PURPOSE      || raw.purpose     || raw.Agenda || '').trim(),
    type:     (raw.MEETING_TYPE || raw.meetingType || 'BOARD').trim(),
  };
}

// ── Data Fetchers ─────────────────────────────────────────────────────────────

async function fetchIndices() {
  const CACHE_KEY = 'dashboard:indices';
  const cached = fromCache(CACHE_KEY, 30_000); // 30s
  if (cached) return cached;

  const raw = await bseGet('/IndicesGetData/w', { index: 'BSE' }, 10_000);
  if (!Array.isArray(raw)) throw new Error('Unexpected indices response');

  const PRIORITY = ['SENSEX', 'S&P BSE SENSEX', 'NIFTY 50', 'NIFTY BANK', 'NIFTY IT'];
  const normalized = raw.map(normalizeIndex).filter(i => i.name && i.value > 0);

  // Sort: priority items first, then rest
  normalized.sort((a, b) => {
    const ai = PRIORITY.findIndex(p => a.name.toUpperCase().includes(p));
    const bi = PRIORITY.findIndex(p => b.name.toUpperCase().includes(p));
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  toCache(CACHE_KEY, normalized, 30_000);
  return normalized;
}

async function fetchAnnouncementStats() {
  const CACHE_KEY = 'dashboard:ann_stats';
  const cached = fromCache(CACHE_KEY, 30_000); // 30s
  if (cached) return cached;

  const { getDb } = require('../lib/mongoClient');
  const mongoDb = await getDb();
  const col = mongoDb.collection('announcements');
  const [total, bse, nse] = await Promise.all([
    col.countDocuments(),
    col.countDocuments({ exchange: 'BSE' }),
    col.countDocuments({ exchange: 'NSE' }),
  ]);
  const result = { total, bse, nse };
  toCache(CACHE_KEY, result, 30_000);
  return result;
}

async function fetchMarketMovers() {
  const CACHE_KEY = 'dashboard:movers';
  const cached = fromCache(CACHE_KEY, 45_000); // 45s
  if (cached) return cached;

  // Try BSE TopGainers and TopLosers endpoint (same as bseRoutes)
  const [gainersRaw, losersRaw] = await Promise.all([
    bseGet('/TopGainersScrips/w', { flag: '1' }, 10_000),
    bseGet('/TopLosers/w',        { flag: '2' }, 10_000),
  ]);

  const gainers = Array.isArray(gainersRaw) ? gainersRaw.slice(0, 5).map(normalizeMover) : [];
  const losers  = Array.isArray(losersRaw)  ? losersRaw.slice(0, 5).map(normalizeMover) : [];

  const result = { gainers, losers };
  toCache(CACHE_KEY, result, 45_000);
  return result;
}

async function fetchIpo() {
  const CACHE_KEY = 'dashboard:ipo';
  const cached = fromCache(CACHE_KEY, 10 * 60_000); // 10 min
  if (cached) return cached;

  const symbols = await fetchIpoSymbolsFromKfin();
  const result = { activeCount: symbols.length, symbols: symbols.slice(0, 6) };
  toCache(CACHE_KEY, result, 10 * 60_000);
  return result;
}


async function fetchBoardMeetings() {
  const CACHE_KEY = 'dashboard:board_meetings';
  const cached = fromCache(CACHE_KEY, 10 * 60_000); // 10 min
  if (cached) return cached;

  const raw = await bseGet('/ForthcomingBrdMtg/w', {}, 10_000);
  const items = Array.isArray(raw?.Table)
    ? raw.Table.filter(r => (r.MEETING_TYPE || '').toUpperCase().includes('BOARD') || !(r.MEETING_TYPE))
        .slice(0, 5).map(normalizeMeeting)
    : [];
  toCache(CACHE_KEY, items, 10 * 60_000);
  return items;
}

async function fetchAgms() {
  const CACHE_KEY = 'dashboard:agms';
  const cached = fromCache(CACHE_KEY, 10 * 60_000); // 10 min
  if (cached) return cached;

  const raw = await bseGet('/ForthcomingBrdMtg/w', {}, 10_000);
  const items = Array.isArray(raw?.Table)
    ? raw.Table.filter(r => (r.MEETING_TYPE || '').toUpperCase().includes('AGM'))
        .slice(0, 5).map(normalizeMeeting)
    : [];
  toCache(CACHE_KEY, items, 10 * 60_000);
  return items;
}

async function fetchVolumeSpurts() {
  const CACHE_KEY = 'dashboard:spurts';
  const cached = fromCache(CACHE_KEY, 45_000); // 45s
  if (cached) return cached;

  const raw = await bseGet('/SpurtInVolume/w', {}, 10_000);
  const items = Array.isArray(raw)
    ? raw.slice(0, 5).map(normalizeSpurt)
    : (Array.isArray(raw?.data) ? raw.data.slice(0, 5).map(normalizeSpurt) : []);
  toCache(CACHE_KEY, items, 45_000);
  return items;
}

async function fetchDeals() {
  const CACHE_KEY = 'dashboard:deals';
  const cached = fromCache(CACHE_KEY, 2 * 60_000); // 2 min
  if (cached) return cached;

  const raw = await bseGet('/BulkBlockDeal/w', {}, 10_000);
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.Table) ? raw.Table : []);
  const items = list.slice(0, 5).map(normalizeDeal);
  toCache(CACHE_KEY, items, 2 * 60_000);
  return items;
}

async function buildWatchlistSummary(uid, allAnnouncements, boardMeetingItems, spurtItems) {
  const watchlist = await getWatchlist(uid);
  const scriptCount = watchlist.length;

  const watchlistCodes = new Set([
    ...watchlist.map(s => s.ltdCode).filter(Boolean),
    ...watchlist.map(s => s.symbol).filter(Boolean),
  ]);

  // Announcement count for watchlist
  const announcementCount = allAnnouncements.filter(
    a => watchlistCodes.has(a.scriptCode) || watchlistCodes.has(a.bseCode) || watchlistCodes.has(a.nseSymbol)
  ).length;

  // Board meeting count — how many meetings involve a watchlisted company
  const boardMeetingCount = boardMeetingItems.filter(
    m => watchlistCodes.has(m.bseCode)
  ).length;

  // Volume spurt count
  const volumeSpurtCount = spurtItems.filter(
    s => watchlistCodes.has(s.bseCode)
  ).length;

  // Top companies by announcement count
  const companyMap = {};
  for (const a of allAnnouncements) {
    const code = a.scriptCode || a.bseCode || '';
    const sym  = a.nseSymbol  || '';
    if (!watchlistCodes.has(code) && !watchlistCodes.has(sym)) continue;
    const name = a.scriptName || a.companyName || code;
    if (!name) continue;
    if (!companyMap[name]) companyMap[name] = { name, bseCode: code, symbol: sym, total: 0, bse: 0, nse: 0 };
    companyMap[name].total++;
    if (a.exchange === 'NSE') companyMap[name].nse++; else companyMap[name].bse++;
  }
  const topCompanies = Object.values(companyMap)
    .sort((a, b) => b.total - a.total).slice(0, 5);

  // Groups breakdown
  const groupMap = {};
  for (const s of watchlist) {
    const g = (s.group || '').trim();
    if (!g) continue;
    groupMap[g] = (groupMap[g] || 0) + 1;
  }
  const groups = Object.entries(groupMap)
    .map(([group, scripts]) => ({ group, scripts }))
    .sort((a, b) => b.scripts - a.scripts)
    .slice(0, 6);

  // Category breakdown from watchlisted announcements only
  const catMap = {};
  for (const a of allAnnouncements) {
    const code = a.scriptCode || a.bseCode || '';
    if (!watchlistCodes.has(code)) continue;
    const cat = (a.category || 'Other').split(' / ')[0].trim();
    catMap[cat] = (catMap[cat] || 0) + 1;
  }

  return {
    scriptCount,
    announcementCount,
    boardMeetingCount,
    volumeSpurtCount,
    topCompanies,
    groups,
  };
}

// ── Main aggregator ────────────────────────────────────────────────────────────

async function getDashboardOverview(uid) {
  const generatedAt = new Date().toISOString();

  // Fire all independent fetches in parallel
  const [
    indicesResult,
    annStatsResult,
    moversResult,
    ipoResult,
    boardResult,
    agmResult,
    spurtsResult,
    dealsResult,
    announcementsRaw,
  ] = await Promise.all([
    safe('indices',          fetchIndices),
    safe('announcementStats', fetchAnnouncementStats),
    safe('marketMovers',     fetchMarketMovers),
    safe('ipo',              fetchIpo),
    safe('boardMeetings',    fetchBoardMeetings),
    safe('agms',             fetchAgms),
    safe('volumeSpurts',     fetchVolumeSpurts),
    safe('deals',            fetchDeals),
    safe('announcements',    () => getAnnouncements({ limitCount: 2000 })),
  ]);

  // Build watchlist summary using the loaded announcement data
  let watchlistResult;
  const announcements = announcementsRaw.status === 'success' ? announcementsRaw.data : [];
  const boardItems    = boardResult.status === 'success'    ? boardResult.data  : [];
  const spurtItems    = spurtsResult.status === 'success'   ? spurtsResult.data : [];

  try {
    const summary = await buildWatchlistSummary(uid, announcements, boardItems, spurtItems);
    watchlistResult = { status: 'success', data: summary };
  } catch (err) {
    console.warn('[DashboardService] watchlist summary failed:', err.message);
    watchlistResult = { status: 'error', message: 'Could not load watchlist data' };
  }

  // Build category distribution from all announcements (not just watchlisted)
  const catMap = {};
  for (const a of announcements) {
    const cat = (a.category || 'Other').split(' / ')[0].trim();
    catMap[cat] = (catMap[cat] || 0) + 1;
  }
  const announcementCategories = Object.entries(catMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    success:     true,
    generatedAt,

    sources: {
      indices:          { status: indicesResult.status    },
      announcements:    { status: annStatsResult.status   },
      marketMovers:     { status: moversResult.status     },
      ipo:              { status: ipoResult.status        },
      boardMeetings:    { status: boardResult.status      },
      agms:             { status: agmResult.status        },
      volumeSpurts:     { status: spurtsResult.status     },
      deals:            { status: dealsResult.status      },
      watchlist:        { status: watchlistResult.status  },
    },

    indices:      indicesResult.status === 'success'    ? indicesResult.data    : null,
    announcements: annStatsResult.status === 'success'  ? { ...annStatsResult.data, categories: announcementCategories } : null,
    marketMovers: moversResult.status === 'success'     ? moversResult.data     : null,
    ipo:          ipoResult.status === 'success'        ? ipoResult.data        : null,
    boardMeetings: boardResult.status === 'success'     ? { items: boardResult.data }  : null,
    agms:         agmResult.status === 'success'        ? { items: agmResult.data }    : null,
    volumeSpurts: spurtsResult.status === 'success'     ? { items: spurtsResult.data } : null,
    deals:        dealsResult.status === 'success'      ? { items: dealsResult.data }  : null,
    watchlist:    watchlistResult.status === 'success'  ? watchlistResult.data  : null,
  };
}

module.exports = { getDashboardOverview };
