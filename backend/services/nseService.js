const axios = require('axios');
const nseCache = require('../cache/nseCache');
const { normalizeNseDataset } = require('../utils/normalizeNseData');
const { generateNseCsv } = require('../utils/generateCsv');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Referer': 'https://www.nseindia.com/',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

/**
 * Establishes session cookie from NSE homepage.
 */
async function getSessionCookies() {
  try {
    const res = await axios.get('https://www.nseindia.com', {
      headers: DEFAULT_HEADERS,
      timeout: 10000,
    });
    if (res.headers['set-cookie']) {
      return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    }
  } catch (err) {
    console.warn('[nseService] Session cookie fetch warning:', err.message);
  }
  return '';
}

/**
 * Fetches and normalizes NSE Gainers or Losers dataset for a specific index category.
 * Implements server-side caching, in-flight deduplication, and single-source CSV generation.
 */
async function getNseGainersLosers(type = 'gainer', index = 'allSec') {
  const normType = type === 'loser' ? 'loser' : 'gainer';
  const normIndex = index || 'allSec';
  const cacheKey = `NSE:${normType}:${normIndex}`;

  // 1. Check Cache
  const cachedEntry = nseCache.get(cacheKey);
  if (cachedEntry && !cachedEntry.isStale) {
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

  // 3. Fetch fresh data from NSE Provider
  const fetchPromise = (async () => {
    const cookies = await getSessionCookies();
    const headers = { ...DEFAULT_HEADERS };
    if (cookies) headers['Cookie'] = cookies;

    const nseIndexParam = normType === 'loser' ? 'loosers' : 'gainers';
    const nseUrl = `https://www.nseindia.com/api/live-analysis-variations?index=${nseIndexParam}`;

    const res = await axios.get(nseUrl, { headers, timeout: 20000 });
    const rawData = res?.data || {};

    // Extract requested category section
    let rawList = [];
    if (rawData[normIndex]?.data) {
      rawList = rawData[normIndex].data;
    } else if (rawData.allSec?.data) {
      rawList = rawData.allSec.data;
    } else if (rawData.NIFTY?.data) {
      rawList = rawData.NIFTY.data;
    }

    // Normalize and sort
    const normalizedData = normalizeNseDataset(rawList, normType);
    
    // Generate CSV string once
    const csvContent = generateNseCsv(normalizedData);

    // Save to Cache
    nseCache.set(cacheKey, normalizedData, csvContent);

    return {
      success: true,
      cached: false,
      exchange: 'NSE',
      type: normType,
      index: normIndex,
      timestamp: Date.now(),
      data: normalizedData,
      csv: csvContent,
      rawResponse: rawData,
    };
  })();

  nseCache.setInFlight(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return result;
  } catch (err) {
    console.error(`[nseService] Error fetching ${cacheKey}:`, err.message);

    // Fallback: If network error occurred but stale cache exists, return stale cache with warning
    if (cachedEntry) {
      console.warn(`[nseService] Serving stale cache for ${cacheKey}`);
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
