'use strict';

/**
 * nseScraper.js
 *
 * Institutional-grade scraper for NSE Corporate Announcements & Session Management.
 * 
 * Features:
 * - Multi-Profile Browser Emulation (Chrome 131 Windows, Edge 131 Windows, Safari 17.5)
 * - Map-based Cookie Deduplication (overwrites stale Akamai telemetry & prevents duplicate cookie headers)
 * - Strict Session Integrity: Validates 200 HTTP status and minimum cookie quorum (>=3 cookies)
 * - Automatic Profile Rotation on 403 / challenge
 * - Shared Session Headers & Cookies across FII/DII, Gainers/Losers, and Admin Diagnostics
 * - 45-Minute Session Keep-Alive with zero redundant homepage requests during active session
 */

const axios = require('axios');

const NSE_HOME    = 'https://www.nseindia.com';
const NSE_FILINGS = 'https://www.nseindia.com/companies-listing/corporate-filings-announcements';
const NSE_API     = 'https://www.nseindia.com/api/corporate-announcements?index=equities';

const BROWSER_PROFILES = [
  {
    name: 'Chrome 131 Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    navHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Connection': 'keep-alive',
    },
    apiHeaders: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Connection': 'keep-alive',
    }
  },
  {
    name: 'Edge 131 Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    navHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'sec-ch-ua': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Connection': 'keep-alive',
    },
    apiHeaders: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'sec-ch-ua': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Connection': 'keep-alive',
    }
  },
  {
    name: 'Mobile Safari 17.5',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    navHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    },
    apiHeaders: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Connection': 'keep-alive',
    }
  }
];

let _currentProfileIdx = 0;
let _nseCookieMap      = new Map();
let _nseCookies        = '';
let _nseInitialised    = false;
let _nseSessionAt      = 0;
const SESSION_TTL_MS   = 45 * 60 * 1000; // 45 minutes keep-alive

/**
 * Helper to parse Set-Cookie headers into a deduplicated Map
 */
function parseSetCookies(setCookieHeaders, targetMap) {
  if (!setCookieHeaders || !Array.isArray(setCookieHeaders)) return targetMap;
  for (const header of setCookieHeaders) {
    const part = header.split(';')[0];
    const idx = part.indexOf('=');
    if (idx !== -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k && v) targetMap.set(k, v);
    }
  }
  return targetMap;
}

function serializeCookieMap(map) {
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function getActiveProfile() {
  return BROWSER_PROFILES[_currentProfileIdx % BROWSER_PROFILES.length];
}

function rotateProfile() {
  _currentProfileIdx = (_currentProfileIdx + 1) % BROWSER_PROFILES.length;
  resetNSESession();
  console.log(`[NSE] Rotated to browser profile: ${getActiveProfile().name}`);
}

/**
 * Establishes a validated session with NSE Akamai.
 * Requires: Homepage visit -> Filings page visit -> valid cookie quorum.
 */
async function initNSESession(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _nseInitialised && _nseCookies && (now - _nseSessionAt) < SESSION_TTL_MS) {
    return true;
  }

  const profile = getActiveProfile();
  const cookieMap = new Map();

  try {
    // 1. Visit NSE Homepage
    const r1 = await axios.get(NSE_HOME, {
      headers: {
        'User-Agent': profile.ua,
        ...profile.navHeaders,
      },
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    parseSetCookies(r1.headers['set-cookie'], cookieMap);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // 2. Visit Corporate Filings Page with Homepage cookies
    const r2 = await axios.get(NSE_FILINGS, {
      headers: {
        'User-Agent': profile.ua,
        ...profile.navHeaders,
        Referer: NSE_HOME + '/',
        'Sec-Fetch-Site': 'same-origin',
        Cookie: serializeCookieMap(cookieMap),
      },
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    parseSetCookies(r2.headers['set-cookie'], cookieMap);

    // Verify session quorum: A valid NSE session typically has 4 to 8 cookies
    // (AKA_A2, _abck, ak_bmsc, bm_mi, bm_sz, bm_sv, nsit)
    if (cookieMap.size >= 3) {
      _nseCookieMap   = cookieMap;
      _nseCookies     = serializeCookieMap(cookieMap);
      _nseInitialised = true;
      _nseSessionAt   = now;
      console.log(`[NSE] Session ready (${profile.name}) — ${cookieMap.size} unique cookies set`);
      return true;
    } else {
      _nseInitialised = false;
      _nseCookies     = '';
      console.warn(`[NSE] Session returned insufficient cookies (${cookieMap.size}) — will rotate profile`);
      return false;
    }
  } catch (e) {
    _nseInitialised = false;
    _nseCookies     = '';
    console.warn(`[NSE] Session init failed on profile "${profile.name}" (${e.message})`);
    return false;
  }
}

/**
 * Normalizes an NSE announcement record
 */
function normalizeNSEItem(item, meta = {}) {
  const symbol = (item.symbol || '').trim().toUpperCase();
  const anDt   = item.an_dt || '';
  const parts  = anDt.split(' ');

  return {
    id:              `nse-${item.seq_id || item.dt || symbol + Date.now()}`,
    exchange:        'NSE',
    nseSymbol:       symbol,
    scriptCode:      symbol,
    scriptName:      meta.scriptName || item.sm_name || symbol,
    bseCode:         meta.bseCode    || '',
    category:        (item.desc       || 'General').trim(),
    subCategory:     '',
    subject:         (item.attchmntText || '').trim(),
    description:     (item.attchmntText || '').trim(),
    announcementDate: item.sort_date   || '',
    datetimeIST:     anDt,
    date:            parts[0] || '',
    time:            parts[1] || '',
    pdfUrl:          item.attchmntFile || null,
    sourceUrl:       NSE_FILINGS,
    isin:            item.sm_isin      || '',
    industry:        item.smIndustry   || '',
    seqId:           item.seq_id       || '',
    critical:        false,
  };
}

/**
 * Makes the authenticated API call to fetch NSE corporate announcements
 */
async function callNSEAPI() {
  if (!_nseCookies || !_nseInitialised) {
    throw new Error('No valid NSE session available');
  }

  const profile = getActiveProfile();
  const response = await axios.get(NSE_API, {
    headers: {
      'User-Agent': profile.ua,
      ...profile.apiHeaders,
      Referer: NSE_FILINGS,
      Cookie:  _nseCookies,
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    throw new Error(`Non-200 status: ${response.status}`);
  }
  if (!Array.isArray(response.data)) {
    throw new Error(`Expected array, got ${typeof response.data}`);
  }

  return response.data;
}

/**
 * Fetches all live NSE corporate announcements with multi-profile auto-healing.
 */
async function fetchAllNSEAnnouncements(watchedMap = new Map()) {
  let ok = await initNSESession();
  if (!ok) {
    rotateProfile();
    ok = await initNSESession(true);
  }

  if (!ok) {
    console.warn('[NSE] Could not establish session after profile rotation. Skipping cycle.');
    return [];
  }

  await new Promise((resolve) => setTimeout(resolve, 600));

  let raw = [];
  try {
    raw = await callNSEAPI();
  } catch (e) {
    console.warn(`[NSE] First API call attempt failed (${e.message}) — rotating profile and retrying...`);
    rotateProfile();
    const retryOk = await initNSESession(true);
    if (!retryOk) return [];

    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
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
  _nseCookieMap.clear();
  _nseSessionAt   = 0;
}

async function getNSECookies() {
  await initNSESession();
  return _nseCookies;
}

function getNSEHeaders(type = 'api') {
  const profile = getActiveProfile();
  return {
    'User-Agent': profile.ua,
    ...(type === 'nav' ? profile.navHeaders : profile.apiHeaders),
  };
}

function getNSESessionInfo() {
  const profile = getActiveProfile();
  return {
    initialised: _nseInitialised,
    sessionAt: _nseSessionAt,
    ttlMs: SESSION_TTL_MS,
    hasCookies: Boolean(_nseCookies && _nseCookies.length > 0),
    cookiesCount: _nseCookieMap.size,
    profileName: profile.name,
    userAgent: profile.ua,
  };
}

/**
 * Diagnostics ping for Admin Control Center & Health Checks
 */
async function testNSEConnectivity(forceRefresh = false) {
  const start = Date.now();
  const profile = getActiveProfile();

  try {
    // Test base connectivity to NSE homepage
    const resp = await axios.get(NSE_HOME, {
      headers: {
        'User-Agent': profile.ua,
        ...profile.navHeaders,
      },
      timeout: 8000,
      validateStatus: () => true,
    });

    const latencyMs = Date.now() - start;
    const ok = resp.status >= 200 && resp.status < 400;

    // If base connectivity is working, check session status
    const sessionInfo = getNSESessionInfo();

    return {
      name: 'NSE Corporate Scraper',
      status: ok ? (latencyMs < 1500 ? 'healthy' : 'degraded') : (resp.status === 403 ? 'blocked' : 'down'),
      statusCode: resp.status,
      latencyMs,
      details: {
        endpoint: 'www.nseindia.com',
        profile: profile.name,
        sessionActive: sessionInfo.initialised,
        cookiesCount: sessionInfo.cookiesCount,
      },
    };
  } catch (err) {
    return {
      name: 'NSE Corporate Scraper',
      status: 'down',
      statusCode: 500,
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

module.exports = {
  fetchAllNSEAnnouncements,
  resetNSESession,
  getNSECookies,
  getNSEHeaders,
  getNSESessionInfo,
  testNSEConnectivity,
};
