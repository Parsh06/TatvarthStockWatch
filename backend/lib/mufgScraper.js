'use strict';

const axios = require('axios');
const crypto = require('crypto');
const xml2js = require('xml2js');

const MUFG_BASE_URL = 'https://in.mpms.mufg.com/Initial_Offer';

const MUFG_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'https://in.mpms.mufg.com',
  'Referer': 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
};

let _mufgSymbolCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = parseInt(process.env.IPO_SYMBOL_CACHE_TTL_MS || '300000', 10); // 5 minutes default

/**
 * Encrypt token with AES-128-CBC using key '8080808080808080' and IV '8080808080808080'
 */
function encryptMufgToken(tokenStr) {
  const key = Buffer.from('8080808080808080', 'utf8');
  const iv = Buffer.from('8080808080808080', 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(true);
  let encrypted = cipher.update(tokenStr, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

/**
 * Generate fresh encrypted session token from MUFG API
 */
async function generateMufgToken(retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(`${MUFG_BASE_URL}/IPO.aspx/generateToken`, {}, {
        headers: MUFG_HEADERS,
        timeout: 15000,
      });
      const rawToken = res.data?.d;
      if (rawToken) {
        return encryptMufgToken(String(rawToken));
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  throw new Error('Failed to obtain session token from MUFG: ' + (lastErr?.message || 'unknown error'));
}

/**
 * Fetch active IPO symbols list from MUFG (Link Intime)
 */
async function scrapeMufgCompanies(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!forceRefresh && _mufgSymbolCache.data && (now - _mufgSymbolCache.fetchedAt) < CACHE_TTL_MS) {
    return _mufgSymbolCache.data;
  }

  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await axios.post(`${MUFG_BASE_URL}/IPO.aspx/GetDetails`, {}, {
        headers: MUFG_HEADERS,
        timeout: 15000,
      });

      const xmlData = res.data?.d;
      if (!xmlData) {
        throw new Error('Empty response from MUFG GetDetails');
      }

      const parsed = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
      const tables = parsed?.NewDataSet?.Table;
      const rawList = Array.isArray(tables) ? tables : (tables ? [tables] : []);

      const symbols = rawList.map(item => ({
        clientId: String(item.company_id || '').trim(),
        symbol: String(item.companyname || '').trim(),
        registrar: 'MUFG',
      })).filter(s => s.clientId && s.symbol);

      if (symbols.length > 0) {
        _mufgSymbolCache = { data: symbols, fetchedAt: now };
        return symbols;
      }
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }

  console.error('[MUFG Scrape Companies Error]', lastErr?.message);
  if (_mufgSymbolCache.data) {
    return _mufgSymbolCache.data;
  }
  throw lastErr || new Error('Failed to fetch MUFG company list');
}

/**
 * Query IPO allotment status on MUFG for a given Company ID & PAN
 */
async function queryMufg(clientId, pan) {
  const token = await generateMufgToken();

  const payload = {
    clientid: String(clientId).trim(),
    PAN: String(pan).trim().toUpperCase(),
    IFSC: '',
    CHKVAL: '1', // 1 = PAN search
    token,
  };

  const res = await axios.post(`${MUFG_BASE_URL}/IPO.aspx/SearchOnPan`, payload, {
    headers: MUFG_HEADERS,
    timeout: 15000,
  });

  return res.data?.d || '';
}

module.exports = {
  encryptMufgToken,
  generateMufgToken,
  scrapeMufgCompanies,
  queryMufg,
};
