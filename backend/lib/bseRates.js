'use strict';

const axios   = require('axios');
const https   = require('https');

const BSE_HOME      = 'https://www.bseindia.com';
const BSE_PRICE_URL = 'https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w';
const CONCURRENCY   = 100;   // 100 parallel requests per batch
const WRITE_EVERY   = 5;     // flush partial results to disk every N batches (~500 scripts)

const API_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Sec-Fetch-Dest':  'empty',
  'Sec-Fetch-Mode':  'cors',
  'Sec-Fetch-Site':  'same-site',
  'Origin':          BSE_HOME,
};

let _instance = null;

async function getInstance() {
  if (_instance) return _instance;
  _instance = axios.create({
    timeout: 8000,
    headers: { 'User-Agent': API_HEADERS['User-Agent'], 'Accept-Language': API_HEADERS['Accept-Language'] },
    httpsAgent: new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 150 }),
    insecureHTTPParser: true,
  });
  return _instance;
}

function _num(val) {
  if (val == null || val === '') return null;
  const v = String(val).replace(/,/g, '').trim();
  if (!v || v === '-' || v === 'N/A' || v === '--') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

async function fetchOne(instance, code) {
  try {
    const resp = await instance.get(BSE_PRICE_URL, {
      params:  { Debtflag: '', scripcode: code, seriesid: '' },
      headers: { ...API_HEADERS, Referer: `https://www.bseindia.com/stock-share-price/${code}` },
      timeout: 8000,
    });
    const data = resp.data || {};
    const h    = data.Header || ((data.ScripHeaderData || [{}])[0]) || {};

    const ltp       = _num(h.LTP || h.CurrRate || h.Ltp);
    const prevClose = _num(h.PrevClose || h.Prevclose || h.PrevCls);
    const high      = _num(h.High  || h.DayHigh);
    const low       = _num(h.Low   || h.DayLow);
    const open      = _num(h.Open  || h.DayOpen);

    let change    = _num(h.Change || h.Chg || h.NetChg || h.CHANGE);
    let pctChange = _num(h.PerChange || h.Perchng || h.PerChng || h.PCHANGE || h.PChange);

    if (change    === null && ltp !== null && prevClose !== null && prevClose !== 0)
      change    = Math.round((ltp - prevClose) * 100) / 100;
    if (pctChange === null && ltp !== null && prevClose !== null && prevClose !== 0)
      pctChange = Math.round(((ltp - prevClose) / prevClose) * 10000) / 100;

    return { ltp, prevClose, high, low, open, change, pctChange, updatedAt: new Date().toISOString(), error: null };
  } catch (e) {
    return { ltp: null, prevClose: null, high: null, low: null, open: null, change: null, pctChange: null, updatedAt: new Date().toISOString(), error: e.message };
  }
}

/**
 * Fetch live BSE rates for all watchlist scripts.
 *
 * onProgress(snapshot) is called every WRITE_EVERY batches with:
 *   { fetchedAt, total, success, failed, complete: false, rates }
 * and once more with complete: true when all done.
 *
 * Returns the final snapshot.
 */
async function fetchRatesForScripts(scripts, { onProgress } = {}) {
  const instance = await getInstance();
  const codes = [...new Set(
    scripts.map(s => (s.ltdCode || s.bseCode || '').trim()).filter(Boolean)
  )];

  const rates   = {};
  let success   = 0, failed = 0;
  const total   = codes.length;
  const startAt = new Date().toISOString();

  const totalBatches = Math.ceil(total / CONCURRENCY);

  for (let i = 0, batchNum = 0; i < total; i += CONCURRENCY, batchNum++) {
    const batch   = codes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(code => fetchOne(instance, code)));

    batch.forEach((code, idx) => {
      rates[code] = results[idx];
      if (results[idx].error) failed++; else success++;
    });

    const isLast = (batchNum + 1) >= totalBatches;

    // Flush to disk every WRITE_EVERY batches and on the final batch
    if (onProgress && (isLast || (batchNum + 1) % WRITE_EVERY === 0)) {
      onProgress({
        fetchedAt: startAt,
        updatedAt: new Date().toISOString(),
        total,
        success,
        failed,
        complete: isLast,
        rates,
      });
    }
  }

  const final = { fetchedAt: startAt, updatedAt: new Date().toISOString(), total, success, failed, complete: true, rates };
  console.log(`[bseRates] ${success} ok / ${failed} failed for ${total} scripts`);
  return final;
}

module.exports = { fetchRatesForScripts };
