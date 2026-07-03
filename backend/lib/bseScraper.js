'use strict';

require('dotenv').config();
const axios = require('axios');

const BSE_API_URL  = 'https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w';
const BSE_HOMEPAGE = 'https://www.bseindia.com';

// API request headers — Akamai bot protection checks Sec-Fetch-* headers
// and returns an empty 200 body without them. Accept must be '*/*' not 'application/json'.
const BSE_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://www.bseindia.com/',
  'Origin':          'https://www.bseindia.com',
  'Sec-Fetch-Dest':  'empty',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Site':  'same-site',
};

// Homepage visit headers — used to warm the session before API calls
const BSE_HOMEPAGE_HEADERS = {
  'User-Agent':                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':           'en-US,en;q=0.9',
  'Sec-Fetch-Dest':            'document',
  'Sec-Fetch-Mode':            'navigate',
  'Sec-Fetch-Site':            'none',
  'Upgrade-Insecure-Requests': '1',
};

const PAGE_CONCURRENCY = 5;

// ── Session management ────────────────────────────────────────────────────────
// axios doesn't have a built-in cookie jar, but BSE's homepage visit sets
// cookies via Set-Cookie. We capture them and forward on API calls.
// In serverless environments each invocation may start fresh — we init on
// every module load (which happens once per warm instance).

let _sessionCookies = '';
let _sessionInitialised = false;

async function initSession() {
  if (_sessionInitialised) return;
  try {
    const resp = await axios.get(BSE_HOMEPAGE, {
      headers:              BSE_HOMEPAGE_HEADERS,
      timeout:              15000,
      maxRedirects:         5,
      validateStatus:       () => true,
      insecureHTTPParser:   true,  // BSE server sends headers with trailing whitespace
    });

    // Collect Set-Cookie headers into a single cookie string
    const setCookie = resp.headers['set-cookie'];
    if (Array.isArray(setCookie) && setCookie.length) {
      _sessionCookies = setCookie.map((c) => c.split(';')[0]).join('; ');
      console.log(`[BSE] Session initialised — cookies: ${_sessionCookies.slice(0, 80)}...`);
    } else {
      console.log('[BSE] Session initialised — no cookies returned (proceeding without)');
    }
  } catch (e) {
    console.warn(`[BSE] Homepage visit failed (${e.message}) — proceeding without cookies`);
  }
  _sessionInitialised = true;
}

function getApiHeaders() {
  return _sessionCookies
    ? { ...BSE_HEADERS, Cookie: _sessionCookies }
    : { ...BSE_HEADERS };
}

// ── Date formatting ───────────────────────────────────────────────────────────

// BSE timestamps are IST (UTC+5:30). Always compute "today" in IST so the
// correct date is used even when Node.js runs in UTC (e.g. Vercel).
function todayIST() {
  const now    = new Date();
  const istMs  = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs);
}

function formatBSEDate(date) {
  const d = date ? new Date(date) : todayIST();
  if (isNaN(d.getTime())) return formatBSEDate(null);
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ── Normalise raw BSE item ────────────────────────────────────────────────────

function normalizeItem(item) {
  const scripCode = String(item.SCRIP_CD || item.scripcd || '').trim();
  const scripName = (item.SLONGNAME || item.scrip_name || item.SCRIP_NAME || '').trim();

  let pdfUrl = null;
  if (item.ATTACHMENTNAME) {
    pdfUrl = `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}`;
  } else if (item.PDFurl) {
    pdfUrl = item.PDFurl;
  }

  const sourceUrl = scripCode
    ? `https://www.bseindia.com/corporates/ann.html?scripcd=${scripCode}`
    : 'https://www.bseindia.com/corporates/ann.html';

  // Parse date — keep full ISO string including time
  const rawDate = item.NEWS_DT || item.DissemDT || item.dt_tm || '';
  let announcementDate = rawDate;
  let date = '';
  let time = '';
  let datetimeIST = '';

  if (rawDate) {
    try {
      const d     = new Date(rawDate);
      announcementDate = d.toISOString();
      // Format for IST display (BSE timestamps are IST, not UTC — keep as-is)
      const pad   = (n) => String(n).padStart(2, '0');
      const localD = new Date(rawDate); // treat as local
      date        = `${pad(localD.getDate())} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][localD.getMonth()]} ${localD.getFullYear()}`;
      time        = `${pad(localD.getHours())}:${pad(localD.getMinutes())}:${pad(localD.getSeconds())}`;
      datetimeIST = `${date} ${time} IST`;
    } catch { /* keep raw */ }
  }

  const id = item.NEWSID || item.NewsID
    || `BSE-${scripCode}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id:               String(id),
    exchange:         'BSE',
    scriptName:       scripName || scripCode,
    scriptCode:       scripCode,
    category:         (item.CATEGORYNAME || item.categoryname || item.Category || 'General').trim(),
    subCategory:      (item.SUBCATNAME   || '').trim(),
    subject:          (item.HEADLINE     || item.headline || item.NEWSSUB || '').trim(),
    description:      (item.NEWSSUB      || item.headline || '').trim(),
    announcementDate,
    date,
    time,
    datetimeIST,
    pdfUrl,
    sourceUrl,
    critical:         item.CRITICALNEWS === 1,
  };
}

// ── Response body parser ──────────────────────────────────────────────────────

function extractBody(body) {
  if (Array.isArray(body)) return { items: body, rowCount: body.length };
  if (body && Array.isArray(body.Table)) {
    const rowCount = (body.Table1 && body.Table1[0] && body.Table1[0].ROWCNT)
      ? Number(body.Table1[0].ROWCNT)
      : body.Table.length;
    return { items: body.Table, rowCount };
  }
  if (body && typeof body === 'object') {
    const arr = Object.values(body).find(Array.isArray);
    if (arr) return { items: arr, rowCount: arr.length };
  }
  return { items: [], rowCount: 0 };
}

// ── Single page fetch ─────────────────────────────────────────────────────────

async function fetchBSEPage(strPrevDate, strToDate, strScrip, pageNo) {
  const params = {
    pageno:      pageNo,
    strCat:      -1,
    strPrevDate,
    strScrip,
    strSearch:   'P',       // required — empty string returns {}
    strToDate,
    strType:     'C',
    subcategory: -1,        // required — missing causes empty response
  };

  try {
    const response = await axios.get(BSE_API_URL, {
      params,
      headers:            getApiHeaders(),
      timeout:            15000,
      insecureHTTPParser: true,  // BSE server sends headers with trailing whitespace
    });

    // Detect empty body — happens when Akamai blocks the request
    if (!response.data || (typeof response.data === 'string' && response.data.trim() === '')) {
      console.warn(`[BSE] Page ${pageNo}: empty response — session may need re-init`);
      return null;
    }

    return extractBody(response.data);
  } catch (error) {
    const status = error.response ? error.response.status : 'N/A';
    console.error(`[BSE] Page ${pageNo} error (${status}): ${error.message}`);
    return null;
  }
}

// ── Public: fetch ALL announcements (cron) ────────────────────────────────────

/**
 * Fetch ALL BSE announcements for today across ALL companies.
 * Paginates automatically. The cron calls this then filters in-memory.
 * Typically 6-10 pages (~300-500 items) on a trading day.
 *
 * @param {string|Date} [date] - defaults to today
 * @returns {Promise<object[]>}
 */
async function fetchAllBSEAnnouncements(date) {
  await initSession();

  const dateStr = formatBSEDate(date);
  console.log(`[BSE] Fetching ALL announcements for ${dateStr}...`);

  const first = await fetchBSEPage(dateStr, dateStr, '', 1);
  if (!first || !first.items.length) {
    console.log('[BSE] No announcements returned for this date.');
    return [];
  }

  const allItems  = [...first.items];
  const totalCount = first.rowCount;
  const pageSize   = first.items.length || 50;
  const totalPages = Math.ceil(totalCount / pageSize);

  console.log(`[BSE] Total: ${totalCount} across ${totalPages} page(s)`);

  if (totalPages > 1) {
    for (let p = 2; p <= totalPages; p += PAGE_CONCURRENCY) {
      const pageNums = [];
      for (let q = p; q <= Math.min(p + PAGE_CONCURRENCY - 1, totalPages); q++) pageNums.push(q);

      const results = await Promise.all(
        pageNums.map((pg) => fetchBSEPage(dateStr, dateStr, '', pg))
      );
      results.forEach((r) => { if (r) allItems.push(...r.items); });
    }
  }

  const normalized = allItems
    .map(normalizeItem)
    .filter((a) => a.scriptCode || a.scriptName);

  console.log(`[BSE] Fetched ${normalized.length} total announcements`);
  return normalized;
}

// ── Public: fetch for a single scrip code (API endpoint / frontend) ───────────

/**
 * Fetch announcements for one scrip code and date range.
 * Used by frontend-facing API routes (/api/announcements/bse).
 *
 * @param {string} [scripCode]
 * @param {string|Date} [fromDate]
 * @param {string|Date} [toDate]
 * @returns {Promise<object[]>}
 */
async function fetchBSEAnnouncements(scripCode, fromDate, toDate) {
  await initSession();

  const strScrip    = scripCode ? String(scripCode).trim() : '';
  const strPrevDate = formatBSEDate(fromDate || new Date());
  const strToDate   = formatBSEDate(toDate || fromDate || new Date());

  const result = await fetchBSEPage(strPrevDate, strToDate, strScrip, 1);
  if (!result) return [];

  const normalized = result.items
    .map(normalizeItem)
    .filter((a) => a.scriptCode || a.scriptName);

  console.log(`[BSE] Fetched ${normalized.length} for scripCode=${strScrip || 'ALL'}`);
  return normalized;
}

module.exports = { fetchBSEAnnouncements, fetchAllBSEAnnouncements };
