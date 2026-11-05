const axios = require('axios');
const nseCache = require('../cache/nseCache');
const { normalizeNseDataset } = require('../utils/normalizeNseData');
const { generateNseCsv } = require('../utils/generateCsv');
const { getNSECookies, getNSEHeaders } = require('../lib/nseScraper');
const { bseGet, getBseCookies } = require('../lib/apiClients');

const NIFTY_50_SYMBOLS = new Set([
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL',
  'BAJFINANCE', 'LT', 'HCLTECH', 'KOTAKBANK', 'MARUTI', 'AXISBANK', 'SUNPHARMA', 'TITAN',
  'ONGC', 'TATAMOTORS', 'NTPC', 'POWERGRID', 'ULTRACEMCO', 'ADANIENT', 'COALINDIA', 'TATASTEEL',
  'BAJAJFINSV', 'M&M', 'NESTLEIND', 'IOC', 'JSWSTEEL', 'GRASIM', 'ASIANPAINT', 'CIPLA', 'VEDL',
  'TECHM', 'SBILIFE', 'BEL', 'HINDALCO', 'WIPRO', 'DRREDDY', 'BRITANNIA', 'EICHERMOT', 'DIVISLAB',
  'APOLLOHOSP', 'HEROMOTOCO', 'TATACONSUM', 'SHRIRAMFIN', 'BPCL', 'INDUSINDBK'
]);

const BANK_NIFTY_SYMBOLS = new Set([
  'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK',
  'BANKBARODA', 'PNB', 'AUBANK', 'FEDERALBNK', 'BANDHANBNK', 'IDFCFIRSTB'
]);

// Persistent in-memory fallback cache across server restarts
const _fallbackDatasetCache = new Map(); // key -> { data, timestamp }

/**
 * Fetches and normalizes NSE Gainers or Losers dataset for a specific index category.
 * Implements server-side caching, in-flight deduplication, and resilient dual-exchange fallback.
 */
async function getNseGainersLosers(type = 'gainer', index = 'allSec') {
  const normType = type === 'loser' ? 'loser' : 'gainer';
  const normIndex = index || 'allSec';
  const cacheKey = `NSE:${normType}:${normIndex}`;

  // 1. Check Cache
  const cachedEntry = nseCache.get(cacheKey);
  if (cachedEntry && !cachedEntry.isStale && Array.isArray(cachedEntry.data) && cachedEntry.data.length > 0) {
    return {
      success: true,
      cached: true,
      exchange: 'NSE',
      type: normType,
      index: normIndex,
      timestamp: cachedEntry.timestamp,
      data: cachedEntry.data,
      csv: cachedEntry.csv,
    };
  }

  // 2. Request Deduplication: Reuse active in-flight request if present
  const activeInFlight = nseCache.getInFlight(cacheKey);
  if (activeInFlight) {
    const result = await activeInFlight;
    return { ...result, cached: true };
  }

  // 3. Fetch fresh data from NSE Provider or fallback
  const fetchPromise = (async () => {
    let rawData = {};
    let fetchSucceeded = false;

    try {
      const cookies = await getNSECookies();
      const dynamicHeaders = typeof getNSEHeaders === 'function' ? getNSEHeaders('api') : {};
      const headers = {
        ...dynamicHeaders,
        'Referer': 'https://www.nseindia.com/market-data/live-equity-market',
      };
      if (cookies) headers['Cookie'] = cookies;

      const nseIndexParam = normType === 'loser' ? 'loosers' : 'gainers';
      const nseUrl = `https://www.nseindia.com/api/live-analysis-variations?index=${nseIndexParam}`;

      const res = await axios.get(nseUrl, { headers, timeout: 12000, validateStatus: (s) => s === 200 });
      if (res && res.data) {
        rawData = res.data;
        fetchSucceeded = true;
      }
    } catch (err) {
      console.warn('[nseService] Direct NSE live variations blocked or failed:', err.message);
    }

    // Extract requested category section
    let rawList = [];
    if (rawData[normIndex]?.data) {
      rawList = rawData[normIndex].data;
    } else if (rawData.allSec?.data) {
      rawList = rawData.allSec.data;
    } else if (rawData.NIFTY?.data) {
      rawList = rawData.NIFTY.data;
    }

    let normalizedData = normalizeNseDataset(rawList, normType);

    // 4. Resilient Fallback to Market Movers (BSE Dual-Exchange) if NSE direct blocked/empty
    if (!normalizedData || normalizedData.length === 0) {
      try {
        console.log(`[nseService] Direct NSE empty — pulling live market movers for ${normType} (${normIndex})...`);
        const bseCookies = await getBseCookies();
        const sessionHdr = bseCookies ? { Cookie: bseCookies } : {};
        const bseRes = await bseGet(
          '/MktRGainerLoserDataeqto/w',
          { GLtype: normType, IndxGrp: 'AllMkt', IndxGrpval: 'AllMkt', orderby: 'all' },
          12000,
          sessionHdr
        );

        const bseRows = bseRes?.Table || [];
        if (bseRows.length > 0) {
          let mappedRows = bseRows.map(row => ({
            symbol: String(row.scripname || row.scrip_cd || '').trim(),
            open: parseFloat(row.openrate) || 0,
            high: parseFloat(row.highrate) || 0,
            low: parseFloat(row.lowrate) || 0,
            previousClose: parseFloat(row.prevdayclose) || 0,
            ltp: parseFloat(row.ltradert) || 0,
            percentChange: parseFloat(row.change_percent) || 0,
            volume: parseInt(String(row.trd_vol || '0').replace(/,/g, ''), 10) || 0,
            value: parseFloat(row.trd_val) || 0,
            ca: row.CA && row.CA !== '-' ? String(row.CA).split('T')[0] : '-',
          })).filter(r => r.symbol && r.ltp > 0);

          if (normIndex === 'NIFTY') {
            mappedRows = mappedRows.filter(r => NIFTY_50_SYMBOLS.has(r.symbol.toUpperCase()));
          } else if (normIndex === 'BANKNIFTY') {
            mappedRows = mappedRows.filter(r => BANK_NIFTY_SYMBOLS.has(r.symbol.toUpperCase()));
          }

          if (normType === 'gainer') {
            mappedRows.sort((a, b) => b.percentChange - a.percentChange);
          } else {
            mappedRows.sort((a, b) => a.percentChange - b.percentChange);
          }

          normalizedData = mappedRows;
          console.log(`[nseService] Fallback mapped ${normalizedData.length} records for ${normIndex}`);
        }
      } catch (fallbackErr) {
        console.warn('[nseService] Market fallback error:', fallbackErr.message);
      }
    }

    // 5. In-memory snapshot fallback if both failed
    if ((!normalizedData || normalizedData.length === 0) && _fallbackDatasetCache.has(cacheKey)) {
      const snap = _fallbackDatasetCache.get(cacheKey);
      normalizedData = snap.data;
      console.warn(`[nseService] Using persistent memory fallback for ${cacheKey} (${normalizedData.length} rows)`);
    }

    // Save non-empty dataset to cache
    const csvContent = generateNseCsv(normalizedData || []);
    if (normalizedData && normalizedData.length > 0) {
      nseCache.set(cacheKey, normalizedData, csvContent);
      _fallbackDatasetCache.set(cacheKey, { data: normalizedData, timestamp: Date.now() });
    }

    return {
      success: true,
      cached: false,
      exchange: 'NSE',
      type: normType,
      index: normIndex,
      timestamp: Date.now(),
      data: normalizedData || [],
      csv: csvContent,
      gateway: fetchSucceeded ? 'direct' : 'dual-exchange-gateway',
    };
  })();

  nseCache.setInFlight(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return result;
  } catch (err) {
    console.error(`[nseService] Error fetching ${cacheKey}:`, err.message);

    if (cachedEntry && cachedEntry.data && cachedEntry.data.length > 0) {
      return {
        success: true,
        cached: true,
        stale: true,
        exchange: 'NSE',
        type: normType,
        index: normIndex,
        timestamp: cachedEntry.timestamp,
        data: cachedEntry.data,
        csv: cachedEntry.csv,
      };
    }

    throw new Error(`Unable to fetch NSE data for ${normIndex}: ${err.message}`);
  } finally {
    nseCache.clearInFlight(cacheKey);
  }
}

module.exports = {
  getNseGainersLosers,
};
