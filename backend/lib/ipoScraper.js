'use strict';

const axios = require('axios');

let _symbolCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = parseInt(process.env.IPO_SYMBOL_CACHE_TTL_MS || '300000', 10); // 5 minutes default

/**
 * Dynamic Scraper Helper for KFintech IPO Symbols
 */
async function scrapeKfinCompanies(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!forceRefresh && _symbolCache.data && (now - _symbolCache.fetchedAt) < CACHE_TTL_MS) {
    return _symbolCache.data;
  }

  try {
    const homeRes = await axios.get('https://ipostatus.kfintech.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    const scriptMatch = homeRes.data.match(/src="(\.\/static\/js\/main\.[a-f0-9]+\.js)"/);
    if (!scriptMatch) throw new Error('Script tag not found in KFintech homepage');

    const bundleUrl = 'https://ipostatus.kfintech.com' + scriptMatch[1].slice(1);
    const bundleRes = await axios.get(bundleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const jsonMatch = bundleRes.data.match(/JSON\.parse\('(\[.*?\])'\)/);
    if (!jsonMatch) throw new Error('JSON.parse company list pattern not found in JS bundle');

    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const symbols = parsed.map(c => ({ clientId: String(c.clientId), symbol: String(c.name) }));
      _symbolCache = { data: symbols, fetchedAt: now };
      return symbols;
    }
    throw new Error('Parsed KFintech company list is empty');
  } catch (err) {
    console.error('[KFintech Live Fetch Error]', err.message);
    if (_symbolCache.data) {
      return _symbolCache.data; // Return stale cache if available on error
    }
    throw err;
  }
}

module.exports = {
  scrapeKfinCompanies,
};
