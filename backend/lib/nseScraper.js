'use strict';

const axios = require('axios');

const NSE_HOME    = 'https://www.nseindia.com';
const NSE_FILINGS = 'https://www.nseindia.com/companies-listing/corporate-filings-announcements';
const NSE_API     = 'https://www.nseindia.com/api/corporate-announcements?index=equities';

const BASE_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',  // no 'br' — axios doesn't handle brotli natively
  'Connection':      'keep-alive',
};

let _nseCookies      = '';
let _nseInitialised  = false;
let _nseSessionAt    = 0;
const SESSION_TTL_MS = 2 * 60 * 1000;   // re-init every 2 minutes — NSE cookies expire quickly

// ── Session init ──────────────────────────────────────────────────────────────
// NSE Akamai requires: homepage visit → filings page visit → API call
// Without this chain the API returns empty body or 403

async function initNSESession() {
  if (_nseInitialised && (Date.now() - _nseSessionAt) < SESSION_TTL_MS) return;
  try {
    const r1 = await axios.get(NSE_HOME, {
      headers:        { ...BASE_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      timeout:        15000,
      maxRedirects:   5,
      validateStatus: () => true,
    });
    const c1 = (r1.headers['set-cookie'] || []).map((c) => c.split(';')[0]);

    await new Promise((resolve) => setTimeout(resolve, 800));

    const r2 = await axios.get(NSE_FILINGS, {
      headers: {
        ...BASE_HEADERS,
        Accept:  'text/html,application/xhtml+xml,*/*;q=0.8',
        Referer: NSE_HOME,
        Cookie:  c1.join('; '),
      },
      timeout:        15000,
      maxRedirects:   5,
      validateStatus: () => true,
    });
    const c2 = (r2.headers['set-cookie'] || []).map((c) => c.split(';')[0]);

    _nseCookies = [...c1, ...c2].join('; ');
    console.log(`[NSE] Session ready — ${[...c1, ...c2].length} cookies set`);
  } catch (e) {
    console.warn(`[NSE] Session init failed (${e.message}) — proceeding without cookies`);
  }
  _nseInitialised = true;
  _nseSessionAt   = Date.now();
}

// ── Normalise ─────────────────────────────────────────────────────────────────

function normalizeNSEItem(item, meta = {}) {
  const symbol = (item.symbol || '').trim().toUpperCase();
  const anDt   = item.an_dt || '';              // "15-Jun-2026 20:12:35"
  const parts  = anDt.split(' ');               // ["15-Jun-2026", "20:12:35"]

  return {
    id:              `nse-${item.seq_id || item.dt || symbol + Date.now()}`,
    exchange:        'NSE',
    nseSymbol:       symbol,
    scriptCode:      symbol,                    // unified field used for filtering
    scriptName:      meta.scriptName || item.sm_name || symbol,
    bseCode:         meta.bseCode    || '',
    category:        (item.desc       || 'General').trim(),
    subCategory:     '',
    subject:         (item.attchmntText || '').trim(),
    description:     (item.attchmntText || '').trim(),
    announcementDate: item.sort_date   || '',
    datetimeIST:     anDt,
    date:            parts.slice(0, 2).join(' '),
    time:            parts[2] || '',
    pdfUrl:          item.attchmntFile || null,
    sourceUrl:       NSE_FILINGS,
    isin:            item.sm_isin      || '',
    industry:        item.smIndustry   || '',
    seqId:           item.seq_id       || '',
    critical:        false,
  };
}

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * Fetch all NSE corporate announcements (equities).
 * NSE returns the latest ~20 items — no date pagination.
 *
 * @param {Map<string,{bseCode,scriptName}>} watchedMap  UPPER(symbol) → watchlist meta
 * @returns {Promise<object[]>}
 */
async function callNSEAPI() {
  const response = await axios.get(NSE_API, {
    headers: {
      ...BASE_HEADERS,
      Accept:               '*/*',
      Referer:              NSE_FILINGS,
      'Sec-Fetch-Dest':     'empty',
      'Sec-Fetch-Mode':     'cors',
      'Sec-Fetch-Site':     'same-origin',
      'sec-ch-ua':          '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile':   '?0',
      'sec-ch-ua-platform': '"Windows"',
      Cookie:               _nseCookies,
    },
    timeout:        30000,
    validateStatus: () => true,
  });

  const bodyPreview = typeof response.data === 'string'
    ? response.data.slice(0, 150)
    : JSON.stringify(response.data).slice(0, 150);
  console.log(`[NSE] HTTP ${response.status} — type: ${typeof response.data} — preview: ${bodyPreview}`);

  if (response.status !== 200) throw new Error(`Non-200 status: ${response.status}`);
  if (!Array.isArray(response.data)) throw new Error(`Expected array, got ${typeof response.data} — Akamai may have blocked`);
  return response.data;
}

async function fetchAllNSEAnnouncements(watchedMap = new Map()) {
  await initNSESession();
  await new Promise((resolve) => setTimeout(resolve, 800));

  let raw;
  try {
    raw = await callNSEAPI();
  } catch (e) {
    console.warn(`[NSE] First attempt failed (${e.message}) — resetting session and retrying...`);
    // Force full re-init on retry
    _nseInitialised = false;
    _nseCookies     = '';
    try {
      await initNSESession();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      raw = await callNSEAPI();
    } catch (e2) {
      console.error(`[NSE] Retry also failed: ${e2.message}`);
      return [];
    }
  }

  console.log(`[NSE] Fetched ${raw.length} total announcements`);
  return raw.map((item) => {
    const sym = (item.symbol || '').trim().toUpperCase();
    return normalizeNSEItem(item, watchedMap.get(sym) || {});
  });
}

function resetNSESession() {
  _nseInitialised = false;
  _nseCookies     = '';
}

module.exports = { fetchAllNSEAnnouncements, resetNSESession };
