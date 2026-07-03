'use strict';

require('dotenv').config();
const axios = require('axios');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Cache BSE company list for 30 minutes (it rarely changes)
let companyListCache = null;
let companyListExpiresAt = 0;
const COMPANY_CACHE_TTL_MS = 30 * 60 * 1000;

const BSE_COMPANY_LIST_URL =
  'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&segment=Equity&Status=Active';

const BSE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.bseindia.com',
};

async function getCompanyList() {
  if (companyListCache && companyListExpiresAt > Date.now()) {
    return companyListCache;
  }

  try {
    const res = await axios.get(BSE_COMPANY_LIST_URL, {
      headers: BSE_HEADERS,
      timeout: 20000,
    });
    const body = res.data;
    let items = [];
    if (Array.isArray(body)) items = body;
    else if (body && Array.isArray(body.Table)) items = body.Table;
    else if (body && Array.isArray(body.Table1)) items = body.Table1;

    companyListCache = items.map((item) => ({
      scripCode: String(item.SCRIP_CD || item.scripcd || '').trim(),
      companyName: (item.Issuer_Name || item.SLONGNAME || item.short_name || '').trim(),
    })).filter((i) => i.scripCode && i.companyName);

    companyListExpiresAt = Date.now() + COMPANY_CACHE_TTL_MS;
    console.log(`[Search] Company list loaded: ${companyListCache.length} entries`);
    return companyListCache;
  } catch (err) {
    console.error('[Search] Failed to fetch company list:', err.message);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const q = ((req.query || {}).q || '').trim().toLowerCase();

  if (!q || q.length < 2) {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: [] }));
    return;
  }

  try {
    const list = await getCompanyList();
    const results = list
      .filter(
        (item) =>
          item.companyName.toLowerCase().includes(q) ||
          item.scripCode.toLowerCase().includes(q)
      )
      .slice(0, 10);

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: results }));
  } catch (err) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message, data: [] }));
  }
};
