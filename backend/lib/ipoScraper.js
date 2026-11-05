'use strict';

const axios = require('axios');
const { getDb } = require('./mongoClient');

let _symbolCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = parseInt(process.env.IPO_SYMBOL_CACHE_TTL_MS || '300000', 10); // 5 minutes default

/**
 * Parses company array from raw KFintech javascript bundle using multi-strategy fallbacks
 */
function extractCompaniesFromJs(jsText) {
  if (!jsText || typeof jsText !== 'string') return null;

  function normalizeList(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const normalized = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const clientId = item.clientId || item.value || item.id || item.code;
      const name = item.name || item.text || item.label || item.company;
      if (clientId && name) {
        normalized.push({ clientId: String(clientId).trim(), name: String(name).trim() });
      }
    }
    return normalized.length > 0 ? normalized : null;
  }

  // Strategy 1: JSON.parse single-quoted string
  const m1 = jsText.match(/JSON\.parse\('(\[.*?\])'\)/);
  if (m1 && m1[1]) {
    try {
      const parsed = JSON.parse(m1[1]);
      const norm = normalizeList(parsed);
      if (norm) return norm;
    } catch {}
  }

  // Strategy 2: JSON.parse double-quoted string
  const m2 = jsText.match(/JSON\.parse\("(\[.*?\])"\)/);
  if (m2 && m2[1]) {
    try {
      const parsed = JSON.parse(m2[1]);
      const norm = normalizeList(parsed);
      if (norm) return norm;
    } catch {}
  }

  // Strategy 3: Object array literal extraction: [ { ... } ]
  const arrayMatches = jsText.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
  if (arrayMatches) {
    for (const arrStr of arrayMatches) {
      try {
        const parsed = JSON.parse(arrStr);
        const norm = normalizeList(parsed);
        if (norm) return norm;
      } catch {}
    }
  }

  // Strategy 4: Regex token scanner for key-value pairs (handles unquoted JS objects)
  const tokenRegex = /\{[^}]*?(?:clientId|value|id|code)\s*:\s*["']?([^"',}\s]+)["']?[^}]*?(?:name|text|label|company)\s*:\s*["']([^"']+)["'][^}]*?\}/gi;
  let match;
  const tokenResults = [];
  while ((match = tokenRegex.exec(jsText)) !== null) {
    if (match[1] && match[2]) {
      tokenResults.push({ clientId: match[1].trim(), name: match[2].trim() });
    }
  }
  if (tokenResults.length > 0) return tokenResults;

  return null;
}

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

    const parsed = extractCompaniesFromJs(bundleRes.data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const symbols = parsed.map(c => ({ clientId: String(c.clientId), symbol: String(c.name) }));
      _symbolCache = { data: symbols, fetchedAt: now };
      return symbols;
    }

    throw new Error('All KFintech JS bundle extraction strategies returned empty');
  } catch (err) {
    console.warn('[KFintech Live Fetch Error]', err.message);
    if (_symbolCache.data && _symbolCache.data.length > 0) {
      return _symbolCache.data; // Return memory cache
    }

    // Fail-Safe Fallback: Read known KFintech symbols from MongoDB Atlas
    try {
      const db = await getDb();
      const docs = await db.collection('iposymbols')
        .find({ source: 'KFINTECH' })
        .sort({ lastSeenAt: -1 })
        .limit(100)
        .toArray();

      if (docs && docs.length > 0) {
        const fallbackSymbols = docs.map(d => ({ clientId: String(d.clientId), symbol: String(d.symbol) }));
        _symbolCache = { data: fallbackSymbols, fetchedAt: now };
        console.log(`[KFintech] Recovered ${fallbackSymbols.length} cached symbols from MongoDB fallback`);
        return fallbackSymbols;
      }
    } catch (dbErr) {
      console.warn('[KFintech] MongoDB fallback query failed:', dbErr.message);
    }

    return [];
  }
}

module.exports = {
  scrapeKfinCompanies,
  extractCompaniesFromJs,
};
