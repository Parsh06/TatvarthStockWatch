const https = require('https');
require('dotenv').config(); // ensure env is loaded

const BSE_API_BASE = process.env.BSE_API_BASE || 'https://api.bseindia.com/BseIndiaAPI/api';
const BSE_BASE_URL = process.env.BSE_BASE_URL || 'https://www.bseindia.com';
const YAHOO_QUERY1 = process.env.YAHOO_QUERY1 || 'https://query1.finance.yahoo.com';
const YAHOO_QUERY2 = process.env.YAHOO_QUERY2 || 'https://query2.finance.yahoo.com';
const YAHOO_FC     = process.env.YAHOO_FC     || 'https://fc.yahoo.com';

// ── Shared BSE native HTTPS helper ───────────────────────────────────────────
const _bseHeaders = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         `${BSE_BASE_URL}/`,
  'Origin':          BSE_BASE_URL,
  'Sec-Fetch-Dest':  'empty',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Site':  'same-site',
};

let _bseCookieStr = '';
let _bseCookieExpiry = 0;

function _refreshBseCookies() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: new URL(BSE_BASE_URL).hostname,
      port: 443,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent':      _bseHeaders['User-Agent'],
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection':      'keep-alive',
      },
      insecureHTTPParser: true,
    }, (resp) => {
      const raw = resp.headers['set-cookie'] || [];
      const str = raw.map((c) => c.split(';')[0]).join('; ');
      _bseCookieStr = str;
      _bseCookieExpiry = Date.now() + 25 * 60 * 1000;
      resp.resume();
      resolve(str);
    });
    req.on('error', (e) => { console.error('[BSE Cookies] fetch failed:', e.message); resolve(''); });
    req.setTimeout(8000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

async function getBseCookies() {
  if (_bseCookieStr && Date.now() < _bseCookieExpiry) return _bseCookieStr;
  return _refreshBseCookies();
}

function bseGet(url, params = {}, timeoutMs = 12000, extraHeaders = {}) {
  // If a path is passed instead of full URL, prepend base
  if (url.startsWith('/')) url = `${BSE_API_BASE}${url}`;
  
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    let settled = false;
    const finish = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { ..._bseHeaders, ...extraHeaders },
      insecureHTTPParser: true,
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end',  () => finish(() => {
        const body = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      }));
    });
    const timer = setTimeout(() => finish(() => {
      req.destroy(new Error(`BSE timeout ${timeoutMs}ms — ${u.pathname}`));
    }), timeoutMs);
    req.on('error', (e) => finish(() => reject(e)));
    req.end();
  });
}

// ── Yahoo Finance helpers ─────────────────────────────────────────────────────
const _yHeaders = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
  'Referer':         'https://finance.yahoo.com/',
};

function _yahooGet(hostname, path, extraHeaders = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (fn) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const req = https.request({
      hostname, port: 443, path, method: 'GET',
      headers: { ..._yHeaders, ...extraHeaders },
      insecureHTTPParser: true,
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => finish(() => {
        const body = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      }));
    });
    const timer = setTimeout(() => finish(() => { req.destroy(); resolve(null); }), timeoutMs);
    req.on('error', () => finish(() => resolve(null)));
    req.end();
  });
}

let _yahooCrumb = '';
let _yahooCookieStr = '';
let _yahooCrumbExpiry = 0;

async function _fetchCookiesFrom(hostname, path = '/') {
  return new Promise((resolve) => {
    const req = https.request({
      hostname, port: 443, path, method: 'GET',
      headers: { ..._yHeaders, Accept: 'text/html,application/xhtml+xml,*/*' },
      insecureHTTPParser: true,
    }, (resp) => {
      const raw = (resp.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
      resp.resume();
      resolve(raw);
    });
    req.on('error', () => resolve(''));
    req.setTimeout(8000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

async function _fetchCrumb(cookies) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: new URL(YAHOO_QUERY2).hostname, port: 443,
      path: '/v1/test/getcrumb', method: 'GET',
      headers: { ..._yHeaders, Accept: 'text/plain, */*', Cookie: cookies },
      insecureHTTPParser: true,
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim()));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(5000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

async function getYahooCrumb() {
  if (_yahooCrumb && Date.now() < _yahooCrumbExpiry) return { crumb: _yahooCrumb, cookies: _yahooCookieStr };

  const sources = [new URL(YAHOO_FC).hostname, 'finance.yahoo.com'];
  let cookies = '';
  for (const host of sources) {
    cookies = await _fetchCookiesFrom(host);
    if (cookies) break;
  }
  if (!cookies) { console.log('[Yahoo crumb] no cookies from any source'); return null; }

  const crumb = await _fetchCrumb(cookies);
  if (!crumb) return null;

  _yahooCrumb = crumb;
  _yahooCookieStr = cookies;
  _yahooCrumbExpiry = Date.now() + 55 * 60 * 1000;
  return { crumb, cookies };
}

async function _yahooChart(ticker) {
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`;
  const data = await _yahooGet(new URL(YAHOO_QUERY1).hostname, path);
  return data?.chart?.result?.[0]?.meta || null;
}

async function _yahooQuote(ticker) {
  const fields = 'trailingPE,forwardPE,epsTrailingTwelveMonths,bookValue,dividendYield,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap';
  const path = `/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=${fields}&formatted=false&corsDomain=finance.yahoo.com`;
  const data = await _yahooGet(new URL(YAHOO_QUERY1).hostname, path);
  const q = data?.quoteResponse?.result?.[0];
  if (q) return q;
  const data2 = await _yahooGet(new URL(YAHOO_QUERY2).hostname, path);
  const q2 = data2?.quoteResponse?.result?.[0];
  return q2 || null;
}

async function _yahooSummary(ticker) {
  const auth = await getYahooCrumb();
  if (!auth?.crumb) return null;
  const crumbParam = `&crumb=${encodeURIComponent(auth.crumb)}`;
  const cookieHdr  = { Cookie: auth.cookies };
  const path = `/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail%2CdefaultKeyStatistics${crumbParam}`;
  const data = await _yahooGet(new URL(YAHOO_QUERY1).hostname, path, cookieHdr);
  if (!data?.quoteSummary?.result?.[0]) {
    const data2 = await _yahooGet(new URL(YAHOO_QUERY2).hostname, path, cookieHdr);
    return data2?.quoteSummary?.result?.[0] || null;
  }
  return data.quoteSummary.result[0];
}

async function getYahooFundamentals(nseSymbol, bseCode) {
  const _y = (v) => { const n = Number(v); return (v != null && !isNaN(n) && n !== 0) ? n : null; };

  const tickers = [];
  if (nseSymbol) tickers.push(`${nseSymbol}.NS`);
  if (bseCode)   tickers.push(`${bseCode}.BO`);

  for (const ticker of tickers) {
    try {
      const [quote, meta] = await Promise.all([_yahooQuote(ticker), _yahooChart(ticker)]);
      if (!quote && !meta) continue;

      const result = {
        week52High: _y(quote?.fiftyTwoWeekHigh || meta?.fiftyTwoWeekHigh),
        week52Low:  _y(quote?.fiftyTwoWeekLow  || meta?.fiftyTwoWeekLow),
        pe:         _y(quote?.trailingPE        || quote?.forwardPE),
        eps:        _y(quote?.epsTrailingTwelveMonths),
        bookValue:  _y(quote?.bookValue),
        dividend:   _y(quote?.dividendYield != null ? quote.dividendYield * 100 : null),
        marketCap:  (quote?.marketCap || meta?.marketCap)
                      ? `₹${((quote?.marketCap || meta.marketCap) / 1e7).toFixed(0)} Cr`
                      : null,
      };
      if (result.week52High || result.week52Low || result.pe || result.eps) return result;
    } catch (e) {
      console.error(`[Yahoo ${ticker}] error:`, e.message);
    }
  }
  return null;
}

async function getYahooHistory(nseSymbol, bseCode, range = '1M') {
  // map range to Yahoo interval/range
  let yRange = '1mo', yInterval = '1d';
  if (range === '1W') yRange = '5d';
  else if (range === '1M') yRange = '1mo';
  else if (range === '3M') yRange = '3mo';
  else if (range === '6M') yRange = '6mo';
  else if (range === '1Y') yRange = '1y';
  else if (range === '5Y') { yRange = '5y'; yInterval = '1wk'; }
  else yRange = '1mo';

  const tickers = [];
  if (nseSymbol) tickers.push(`${nseSymbol}.NS`);
  if (bseCode) tickers.push(`${bseCode}.BO`); // Not all BSE codes map perfectly, but it's a fallback

  for (const ticker of tickers) {
    try {
      const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yInterval}&range=${yRange}&includePrePost=false`;
      const data = await _yahooGet(new URL(YAHOO_QUERY1).hostname, path);
      const result = data?.chart?.result?.[0];
      if (result && result.timestamp && result.indicators?.quote?.[0]) {
        const timestamps = result.timestamp;
        const quote = result.indicators.quote[0];
        const points = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (quote.close[i] == null) continue;
          points.push({
            date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
            open: quote.open[i],
            high: quote.high[i],
            low: quote.low[i],
            close: quote.close[i],
            volume: quote.volume[i] || 0
          });
        }
        if (points.length > 0) return points;
      }
    } catch (e) {
      console.error(`[Yahoo History ${ticker}] error:`, e.message);
    }
  }
  return null;
}

function sanitizeCode(raw) {
  return String(raw || '').trim().replace(/[^0-9A-Za-z]/g, '').slice(0, 20);
}

module.exports = {
  BSE_API_BASE,
  BSE_BASE_URL,
  YAHOO_QUERY1,
  YAHOO_QUERY2,
  YAHOO_FC,
  bseGet,
  getBseCookies,
  getYahooFundamentals,
  getYahooHistory,
  sanitizeCode
};
