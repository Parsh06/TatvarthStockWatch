'use strict';

/**
 * Dashboard aggregation service.
 * Uses authoritative BSE endpoints matched with bseRoutes.js and spurtStore.js.
 */

const { bseGet, getBseCookies } = require('../lib/apiClients');
const { getAnnouncements } = require('../lib/announcementStore');
const { getWatchlist } = require('../lib/watchlistStore');
const { startSpurtPoller, getLatestSpurt } = require('../lib/spurtStore');
const axios = require('axios');

// Ensure spurt poller is initialized
let _spurtPromise = null;
function ensureSpurtPoller() {
  if (!_spurtPromise) {
    _spurtPromise = startSpurtPoller().catch(e => console.error('[Spurt Poller Init]', e.message));
  }
  return _spurtPromise;
}
ensureSpurtPoller();

// ── Date Formatting Helpers ───────────────────────────────────────────────────
function getFormattedDates() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // IST
  const pastWeek = new Date(now);
  pastWeek.setDate(now.getDate() - 14); // 14 days back

  const dd = (d) => String(d.getDate()).padStart(2, '0');
  const mm = (d) => String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = (d) => d.getFullYear();

  return {
    todayDDMMYYYY: `${dd(now)}/${mm(now)}/${yyyy(now)}`,
    pastDDMMYYYY:  `${dd(pastWeek)}/${mm(pastWeek)}/${yyyy(pastWeek)}`,

    todayYYYYMMDD: `${yyyy(now)}${mm(now)}${dd(now)}`,
    pastYYYYMMDD:  `${yyyy(pastWeek)}${mm(pastWeek)}${dd(pastWeek)}`,
  };
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
    return { status: 'error', message: err.message || 'Provider unavailable' };
  }
}

// ── Data Fetchers ─────────────────────────────────────────────────────────────

/** 1. Primary Market Indices (Sensex, Nifty, etc) */
async function fetchIndices() {
  const CACHE_KEY = 'dashboard:indices';
  const cached = fromCache(CACHE_KEY, 30_000);
  if (cached) return cached;

  let raw = await bseGet('https://api.bseindia.com/RealTimeBseIndiaAPI/api/GetSensexDatanew/w', {}, 10_000);
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = []; }
  }

  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.Table) ? raw.Table : []);
  if (!list.length) throw new Error('Indices unavailable');

  const normalized = list.map(item => {
    const name = (item.indxnm || item.indexname || item.name || '').trim();
    const val  = parseFloat(String(item.ltp || item.currentValue || item.val || 0).replace(/,/g, '')) || 0;
    const chg  = parseFloat(String(item.chg || item.change || 0).replace(/,/g, '')) || 0;
    const pchg = parseFloat(String(item.perchg || item.perChange || item.pChange || 0).replace(/[,%]/g, '')) || 0;
    return { name, value: val, change: chg, changePercent: pchg };
  }).filter(i => i.name && i.value > 0);

  toCache(CACHE_KEY, normalized, 30_000);
  return normalized;
}

/** 2. Announcement Statistics */
async function fetchAnnouncementStats() {
  const CACHE_KEY = 'dashboard:ann_stats';
  const cached = fromCache(CACHE_KEY, 30_000);
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

/** 3. Market Movers (Top Gainers & Losers) */
async function fetchMarketMovers() {
  const CACHE_KEY = 'dashboard:movers';
  const cached = fromCache(CACHE_KEY, 45_000);
  if (cached) return cached;

  const cookies = await getBseCookies();
  const sessionHdr = cookies ? { Cookie: cookies } : {};

  const [gainersRes, losersRes] = await Promise.allSettled([
    bseGet('/MktRGainerLoserDataeqto/w', { GLtype: 'gainer', IndxGrp: 'AllMkt', IndxGrpval: 'AllMkt', orderby: 'all' }, 15_000, sessionHdr),
    bseGet('/MktRGainerLoserDataeqto/w', { GLtype: 'loser', IndxGrp: 'AllMkt', IndxGrpval: 'AllMkt', orderby: 'all' }, 15_000, sessionHdr),
  ]);

  function parseMovers(res) {
    if (res.status !== 'fulfilled' || !res.value) return [];
    let raw = res.value;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    const table = Array.isArray(raw)
      ? raw
      : (Array.isArray(raw?.Table) ? raw.Table : (Array.isArray(raw?.Table1) ? raw.Table1 : (Array.isArray(raw?.MktRGainerLoserDataeqto) ? raw.MktRGainerLoserDataeqto : [])));
    
    return table.slice(0, 5).map(item => {
      const name = (item.scrip_name || item.scripname || item.SLONGNAME || item.scrip_cd || item.scripcode || item.scrip_id || '').trim();
      const bseCode = String(item.scrip_cd || item.scripcode || '').trim();
      const ltp = parseFloat(String(item.ltp || item.Ltp || item.LTP || item.ltradert || 0).replace(/,/g, '')) || 0;
      const change = parseFloat(String(item.change || item.chg || item.change_val || 0).replace(/,/g, '')) || 0;
      const changePercent = parseFloat(String(item.per_chg || item.perchg || item.pctChange || item.change_percent || 0).replace(/[,%]/g, '')) || 0;
      return { name, bseCode, ltp, change, changePercent };
    }).filter(m => m.name && m.ltp > 0);
  }

  const result = {
    gainers: parseMovers(gainersRes),
    losers:  parseMovers(losersRes),
  };

  toCache(CACHE_KEY, result, 45_000);
  return result;
}

/** 4. Active OPEN IPO Symbols (Real-time from ipoService) */
async function fetchIpo() {
  const CACHE_KEY = 'dashboard:open_ipos';
  const cached = fromCache(CACHE_KEY, 5 * 60_000); // 5 min
  if (cached) return cached;

  let openSymbols = [];
  try {
    const { fetchIpoGmpData } = require('./ipoService');
    const ipoData = await fetchIpoGmpData(1, '');
    
    const all = ipoData?.data || [];
    const openIpos = all.filter(i => {
      const s = (i.tab_status || '').toLowerCase();
      return s === 'open' || s === 'ct';
    });
    openSymbols = openIpos.map(i => {
      const gmp = parseFloat(i.gmp) || 0;
      const issuePriceMatch = (i.issue_price || '').match(/\d+(\.\d+)?/g);
      let issuePrice = 0;
      if (issuePriceMatch) {
        issuePrice = parseFloat(issuePriceMatch[issuePriceMatch.length - 1]);
      }
      const estGain = issuePrice > 0 ? (gmp / issuePrice) * 100 : 0;
      
      return {
        name: i.company_name,
        gmp: (i.gmp !== 'NA' && i.gmp != null && i.gmp !== '') ? parseFloat(i.gmp) : null,
        estGain: estGain,
        status: (i.tab_status || '').toUpperCase()
      };
    }).filter(s => Boolean(s.name));
  } catch (e) {
    console.warn('[DashboardService] Open IPO fetch failed:', e.message);
  }

  const result = { activeCount: openSymbols.length, symbols: openSymbols.slice(0, 6) };
  toCache(CACHE_KEY, result, 5 * 60_000);
  return result;
}

/** 5. Today's Board Meetings */
async function fetchBoardMeetings() {
  const CACHE_KEY = 'dashboard:todays_board_meetings';
  const cached = fromCache(CACHE_KEY, 5 * 60_000);
  if (cached) return cached;

  const dates = getFormattedDates();
  const cookies = await getBseCookies();
  const sessionHdr = cookies ? { Cookie: cookies } : {};

  // Fetch for TODAY specifically
  const raw = await bseGet(
    '/Corp_Fetch_BoardMeeting_With_Filter_ng/w',
    {
      SCRIPCODE: '',
      fromDT: dates.todayDDMMYYYY,
      ToDt: dates.todayDDMMYYYY,
      purposeCode: '',
      IsCanRev: '0',
      FLAGDUR: '0',
      ISUBGROUP_CODE: ' ',
      LnFlag: 'en'
    },
    15_000,
    sessionHdr
  );

  let list = [];
  if (raw && typeof raw === 'object') {
    list = raw.Corp_fetch_BoardMeeting_Table1 || raw.Table || (Array.isArray(raw) ? raw : []);
  }

  const items = list.slice(0, 5).map(r => ({
    company: (r.Long_Name || r.SHORT_NAME || r.SLONGNAME || r.scripname || r.companyName || '').trim(),
    bseCode: String(r.scrip_code || r.SCRIP_CD || r.scripcode || '').trim(),
    date:    (r.MEETING_DATE || r.MEETING_BOARD_DATE || r.BOARD_DATE || 'Today').trim(),
    purpose: (r.PURPOSE_NAME || r.PURPOSE || r.purpose || '').trim(),
    type:    'BOARD',
  })).filter(i => i.company);

  toCache(CACHE_KEY, items, 5 * 60_000);
  return items;
}

/** 6. Today's AGMs */
async function fetchAgms() {
  const CACHE_KEY = 'dashboard:todays_agms';
  const cached = fromCache(CACHE_KEY, 5 * 60_000);
  if (cached) return cached;

  const dates = getFormattedDates();
  const cookies = await getBseCookies();
  const sessionHdr = cookies ? { Cookie: cookies } : {};

  // Fetch for TODAY specifically
  const raw = await bseGet(
    '/GetForthBoardMeeting/w',
    {
      SCRIPCODE: '',
      fromDT: dates.todayYYYYMMDD,
      ToDt: dates.todayYYYYMMDD,
      purposeCode: '',
      IsCanRev: '',
      IsSubCode: ''
    },
    15_000,
    sessionHdr
  );

  let list = [];
  if (raw && typeof raw === 'object') {
    list = raw.Table || raw.Table1 || (Array.isArray(raw) ? raw : []);
  }

  const items = list.slice(0, 5).map(r => ({
    company: (r.Long_Name || r.Short_name || r.SLONGNAME || r.companyName || '').trim(),
    bseCode: String(r.scrip_code || r.SCRIP_CD || r.scripcode || '').trim(),
    date:    (r.MEETING_DATE || r.BOARD_DATE || r.date || 'Today').trim(),
    purpose: (r.PURPOSE_NAME || r.PURPOSE || r.purpose || '').trim(),
    type:    'AGM',
  })).filter(i => i.company);

  toCache(CACHE_KEY, items, 5 * 60_000);
  return items;
}

/** 7. Volume Spurts */
async function fetchVolumeSpurts() {
  const CACHE_KEY = 'dashboard:spurts';
  const cached = fromCache(CACHE_KEY, 45_000);
  if (cached) return cached;

  await ensureSpurtPoller();
  let snapshot = getLatestSpurt();

  const list = snapshot?.stocks || [];
  const items = list.slice(0, 5).map(s => ({
    name:       s.company || s.symbol || s.bseCode,
    bseCode:    s.bseCode,
    multiplier: s.volMultiple || 0,
    volume:     s.currentVolume || 0,
  }));

  toCache(CACHE_KEY, items, 45_000);
  return items;
}

/** 8. Bulk & Block Deals */
async function fetchDeals() {
  const CACHE_KEY = 'dashboard:deals';
  const cached = fromCache(CACHE_KEY, 2 * 60_000);
  if (cached) return cached;

  const dates = getFormattedDates();
  const cookies = await getBseCookies();
  const sessionHdr = cookies ? { Cookie: cookies } : {};

  const raw = await bseGet(
    '/BulkDealData_ng/w',
    { DealType: 1, sc_code: '', FDate: dates.pastDDMMYYYY, TDate: dates.todayDDMMYYYY },
    15_000,
    sessionHdr
  );

  let list = [];
  if (raw && typeof raw === 'object') {
    list = raw.Table || (Array.isArray(raw) ? raw : []);
  }

  const items = list.slice(0, 5).map(r => {
    const qty   = Number(r.QUANTITY || r.quantity || 0);
    const price = parseFloat(String(r.PRICE || r.price || 0));
    return {
      company:     (r.scripname || r.SCRIP_NAME || r.CompanyName || '').trim(),
      bseCode:     String(r.SCRIP_CODE || r.SCRIP_CD || r.scripcode || '').trim(),
      dealType:    r.DEAL_TYPE === 2 ? 'BLOCK' : 'BULK',
      client:      (r.CLIENT_NAME || r.client_name || '').trim(),
      quantity:    qty,
      price:       price,
      value:       qty && price ? qty * price : 0,
    };
  }).filter(d => d.company);

  toCache(CACHE_KEY, items, 2 * 60_000);
  return items;
}

/** 9. Watchlist Summary */
async function buildWatchlistSummary(uid, allAnnouncements, boardMeetingItems, spurtItems) {
  const watchlist = await getWatchlist(uid);
  const scriptCount = watchlist.length;

  const watchlistCodes = new Set([
    ...watchlist.map(s => s.ltdCode).filter(Boolean),
    ...watchlist.map(s => s.symbol).filter(Boolean),
  ]);

  const announcementCount = allAnnouncements.filter(
    a => watchlistCodes.has(a.scriptCode) || watchlistCodes.has(a.bseCode) || watchlistCodes.has(a.nseSymbol)
  ).length;

  const boardMeetingCount = boardMeetingItems.filter(
    m => watchlistCodes.has(m.bseCode)
  ).length;

  const volumeSpurtCount = spurtItems.filter(
    s => watchlistCodes.has(s.bseCode)
  ).length;

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

  return {
    scriptCount,
    announcementCount,
    boardMeetingCount,
    volumeSpurtCount,
    topCompanies,
    groups,
  };
}

// ── Main Aggregator ────────────────────────────────────────────────────────────

async function getDashboardOverview(uid) {
  const generatedAt = new Date().toISOString();

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

  const announcements = announcementsRaw.status === 'success' ? announcementsRaw.data : [];
  const boardItems    = boardResult.status === 'success'    ? boardResult.data  : [];
  const spurtItems    = spurtsResult.status === 'success'   ? spurtsResult.data : [];

  let watchlistResult;
  try {
    const summary = await buildWatchlistSummary(uid, announcements, boardItems, spurtItems);
    watchlistResult = { status: 'success', data: summary };
  } catch (err) {
    console.warn('[DashboardService] watchlist summary failed:', err.message);
    watchlistResult = { status: 'error', message: 'Could not load watchlist data' };
  }

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
    success: true,
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
