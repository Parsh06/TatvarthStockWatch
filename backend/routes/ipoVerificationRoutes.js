'use strict';

const express = require('express');
const axios   = require('axios');
const { encryptPan, decryptPan, maskPan, validatePan, normalizeIpoBidResponse } = require('../lib/ipoUtils');

// ── NSE Session Helper ────────────────────────────────────────────────────────
// Fetches the NSE homepage to obtain session cookies, then uses them for API calls.
const NSE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const NSE_HEADERS = {
  'User-Agent': NSE_UA,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

async function getNseCookies() {
  try {
    const res = await axios.get('https://www.nseindia.com', {
      headers: {
        'User-Agent': NSE_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    });
    const setCookies = res.headers['set-cookie'];
    if (!setCookies) return '';
    return setCookies.map(c => c.split(';')[0]).join('; ');
  } catch (err) {
    console.error('[NSE Cookie Fetch Error]', err.message);
    throw err;
  }
}

// ── IPO Symbol Cache ──────────────────────────────────────────────────────────
let _symbolCache = { data: null, fetchedAt: 0 };
const SYMBOL_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ── Per-user IPO Rate Limiter ─────────────────────────────────────────────────
const _ipoRl = new Map();
const IPO_RL_WINDOW = 60_000; // 1 minute
const IPO_RL_MAX_VERIFY = 10;
const IPO_RL_MAX_BULK   = 3;

function checkIpoRateLimit(uid, action) {
  const key = `${uid}:${action}`;
  const now = Date.now();
  let entry = _ipoRl.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + IPO_RL_WINDOW };
    _ipoRl.set(key, entry);
  }
  entry.count++;
  const max = action === 'bulk' ? IPO_RL_MAX_BULK : IPO_RL_MAX_VERIFY;
  return entry.count <= max;
}

// Clean up rate limiter entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _ipoRl) {
    if (now > v.resetAt + IPO_RL_WINDOW) _ipoRl.delete(k);
  }
}, 5 * 60_000);

// ── Bulk Concurrency Control ──────────────────────────────────────────────────
const MAX_CONCURRENT_NSE = 2;
const INTER_REQUEST_DELAY_MS = 500;

async function runWithConcurrencyLimit(tasks, concurrency, delayMs) {
  const results = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = { _error: err.message || 'Unknown error' };
      }
      if (delayMs > 0 && idx < tasks.length) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, tasks.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ── Helper: Verify a single PAN against NSE ───────────────────────────────────
async function verifySinglePan(cookies, symbol, pan) {
  const res = await axios.post(
    'https://www.nseindia.com/api/ipo-bid-verification-details',
    { symbol, pan, appNo: '' },
    {
      headers: {
        ...NSE_HEADERS,
        'Content-Type': 'application/json',
        'Referer': 'https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_bid_details.jsp',
        Cookie: cookies,
      },
      timeout: 30000,
    }
  );
  return res.data;
}

async function verifySingleAppNo(cookies, symbol, appNo) {
  const res = await axios.post(
    'https://www.nseindia.com/api/ipo-bid-verification-details',
    { symbol, pan: '', appNo },
    {
      headers: {
        ...NSE_HEADERS,
        'Content-Type': 'application/json',
        'Referer': 'https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_bid_details.jsp',
        Cookie: cookies,
      },
      timeout: 30000,
    }
  );
  return res.data;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

module.exports = function (verifyToken) {
  const router = express.Router();

  // ── GET /api/ipo/symbols ────────────────────────────────────────────────────
  router.get('/symbols', verifyToken, async (req, res) => {
    try {
      const now = Date.now();
      if (_symbolCache.data && (now - _symbolCache.fetchedAt) < SYMBOL_CACHE_TTL) {
        return res.json({ success: true, symbols: _symbolCache.data, source: 'NSE', cached: true });
      }

      let rawSymbols = [];
      try {
        // Try direct fetch first (NSE symbols master often doesn't require session cookies)
        const nseRes = await axios.get('https://www.nseindia.com/api/ipo-bid-master', {
          headers: NSE_HEADERS,
          timeout: 10000,
        });
        rawSymbols = Array.isArray(nseRes.data) ? nseRes.data : [];
      } catch (directErr) {
        console.warn('[Symbols Direct Fetch Failed, trying with cookies]', directErr.message);
        const cookies = await getNseCookies();
        const nseRes = await axios.get('https://www.nseindia.com/api/ipo-bid-master', {
          headers: { ...NSE_HEADERS, Cookie: cookies },
          timeout: 15000,
        });
        rawSymbols = Array.isArray(nseRes.data) ? nseRes.data : [];
      }

      const symbols = rawSymbols.map(s => ({ symbol: String(s) }));
      _symbolCache = { data: symbols, fetchedAt: now };

      res.json({ success: true, symbols, source: 'NSE', cached: false });
    } catch (err) {
      console.error('[IPO Symbols]', err.message);
      // Return cached data even if stale on error
      if (_symbolCache.data) {
        return res.json({ success: true, symbols: _symbolCache.data, source: 'NSE', cached: true, stale: true });
      }
      res.status(502).json({ success: false, error: 'Unable to fetch IPO symbols from NSE' });
    }
  });

  // ── POST /api/ipo/verify ────────────────────────────────────────────────────
  router.post('/verify', verifyToken, async (req, res) => {
    try {
      const { ipoType, symbol, verificationType, identifier } = req.body;

      // Validate inputs
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ success: false, error: 'Please select an IPO symbol' });
      }
      if (ipoType === 'debt') {
        return res.status(400).json({ success: false, error: 'Debt IPO verification is coming soon' });
      }
      if (!verificationType || !['pan', 'application'].includes(verificationType)) {
        return res.status(400).json({ success: false, error: 'Invalid verification type' });
      }
      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        return res.status(400).json({ success: false, error: 'Please enter a PAN or Application Number' });
      }

      const cleanIdentifier = identifier.trim().toUpperCase();

      if (verificationType === 'pan' && !validatePan(cleanIdentifier)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 10-character PAN number (e.g., ABCDE1234F)' });
      }

      // Rate limit
      if (!checkIpoRateLimit(req.uid, 'verify')) {
        return res.status(429).json({ success: false, error: 'Too many verification requests. Please wait a minute and try again.' });
      }

      // Fetch cookies & verify
      const startMs = Date.now();
      const cookies = await getNseCookies();

      let nseResponse;
      if (verificationType === 'pan') {
        nseResponse = await verifySinglePan(cookies, symbol.trim(), cleanIdentifier);
      } else {
        nseResponse = await verifySingleAppNo(cookies, symbol.trim(), cleanIdentifier);
      }

      const normalized = normalizeIpoBidResponse(nseResponse);
      const durationMs = Date.now() - startMs;

      // Audit log (never logs plaintext PAN)
      console.log(`[IPO Verify] uid=${req.uid} symbol=${symbol} type=${verificationType} masked=${verificationType === 'pan' ? maskPan(cleanIdentifier) : '***'} records=${normalized.records.length} duration=${durationMs}ms`);

      res.json({
        success: normalized.success,
        source: 'NSE',
        message: normalized.message,
        ipo: { symbol: symbol.trim() },
        verification: {
          type: verificationType,
          maskedIdentifier: verificationType === 'pan' ? maskPan(cleanIdentifier) : cleanIdentifier,
        },
        records: normalized.records,
        verifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[IPO Verify Error]', err.message, err.response?.status, err.response?.data);
      res.status(502).json({ 
        success: false, 
        error: 'Unable to connect to NSE verification service. Details: ' + err.message,
        statusCode: err.response?.status,
        responseData: err.response?.data
      });
    }
  });

  // ── GET /api/ipo/applicants ─────────────────────────────────────────────────
  // Returns masked PAN data only — frontend never sees encrypted values.
  router.get('/applicants', verifyToken, async (req, res) => {
    try {
      const { db } = require('../lib/firebaseAdmin');
      const snap = await db.collection('users').doc(req.uid).collection('familyPans').orderBy('createdAt', 'asc').get();

      const applicants = [];
      snap.forEach(doc => {
        const d = doc.data();
        applicants.push({
          id: doc.id,
          name: d.name || 'Unknown',
          maskedPan: d.panLast4 ? maskPan('XXXXXX' + d.panLast4) : 'XXXX',
          createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        });
      });

      res.json({ success: true, applicants });
    } catch (err) {
      console.error('[IPO Applicants GET]', err.message);
      res.status(500).json({ success: false, error: 'Failed to load applicants' });
    }
  });

  // ── POST /api/ipo/applicants ────────────────────────────────────────────────
  // Encrypts PAN and stores in Firestore. Frontend sends plaintext PAN only once.
  router.post('/applicants', verifyToken, async (req, res) => {
    try {
      const { name, pan } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Please enter the applicant name' });
      }
      if (!pan || !validatePan(pan.trim().toUpperCase())) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 10-character PAN number' });
      }

      const cleanName = name.trim().slice(0, 50);
      const cleanPan = pan.trim().toUpperCase();

      const { db } = require('../lib/firebaseAdmin');
      const collRef = db.collection('users').doc(req.uid).collection('familyPans');

      // Enforce max 10 applicants
      const countSnap = await collRef.count().get();
      if (countSnap.data().count >= 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 applicants allowed. Please remove one to add a new one.' });
      }

      // Check for duplicate PAN (by last 4 chars + name match)
      const panLast4 = cleanPan.slice(-4);
      const existingSnap = await collRef.where('panLast4', '==', panLast4).get();
      let duplicate = false;
      existingSnap.forEach(doc => {
        try {
          const existingPan = decryptPan({
            encrypted: doc.data().panEncrypted,
            iv: doc.data().panIv,
            authTag: doc.data().panAuthTag,
          });
          if (existingPan === cleanPan) duplicate = true;
        } catch { /* ignore decryption errors for old records */ }
      });
      if (duplicate) {
        return res.status(400).json({ success: false, error: 'This PAN is already saved for another applicant' });
      }

      // Encrypt and store
      const { encrypted, iv, authTag } = encryptPan(cleanPan);
      const now = new Date();

      const docRef = await collRef.add({
        name: cleanName,
        panEncrypted: encrypted,
        panIv: iv,
        panAuthTag: authTag,
        panLast4,
        createdAt: now,
        updatedAt: now,
      });

      // Audit (no plaintext PAN)
      console.log(`[IPO Applicant Add] uid=${req.uid} name="${cleanName}" last4=${panLast4}`);

      res.json({
        success: true,
        applicant: {
          id: docRef.id,
          name: cleanName,
          maskedPan: maskPan(cleanPan),
          createdAt: now.toISOString(),
        },
      });
    } catch (err) {
      console.error('[IPO Applicant Add Error]', err.message);
      res.status(500).json({ success: false, error: 'Failed to save applicant' });
    }
  });

  // ── DELETE /api/ipo/applicants/:id ──────────────────────────────────────────
  router.delete('/applicants/:id', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { db } = require('../lib/firebaseAdmin');
      const docRef = db.collection('users').doc(req.uid).collection('familyPans').doc(id);

      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ success: false, error: 'Applicant not found' });
      }

      await docRef.delete();
      console.log(`[IPO Applicant Delete] uid=${req.uid} docId=${id}`);

      res.json({ success: true, message: 'Applicant removed' });
    } catch (err) {
      console.error('[IPO Applicant Delete Error]', err.message);
      res.status(500).json({ success: false, error: 'Failed to remove applicant' });
    }
  });

  // ── POST /api/ipo/verify-bulk ───────────────────────────────────────────────
  // Verifies multiple family applicants against a single IPO.
  // Decrypts PANs server-side, rate-controls NSE requests, handles partial failures.
  router.post('/verify-bulk', verifyToken, async (req, res) => {
    try {
      const { ipoType, symbol, applicantIds } = req.body;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ success: false, error: 'Please select an IPO symbol' });
      }
      if (ipoType === 'debt') {
        return res.status(400).json({ success: false, error: 'Debt IPO verification is coming soon' });
      }
      if (!Array.isArray(applicantIds) || applicantIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Please select at least one applicant' });
      }
      if (applicantIds.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 applicants per bulk verification' });
      }

      // Rate limit
      if (!checkIpoRateLimit(req.uid, 'bulk')) {
        return res.status(429).json({ success: false, error: 'Too many bulk verification requests. Please wait a minute.' });
      }

      // Load applicants from Firestore (ownership validated by subcollection path)
      const { db } = require('../lib/firebaseAdmin');
      const collRef = db.collection('users').doc(req.uid).collection('familyPans');

      const applicants = [];
      for (const id of applicantIds) {
        const doc = await collRef.doc(id).get();
        if (doc.exists) {
          const d = doc.data();
          try {
            const plainPan = decryptPan({
              encrypted: d.panEncrypted,
              iv: d.panIv,
              authTag: d.panAuthTag,
            });
            applicants.push({ id: doc.id, name: d.name, pan: plainPan, panLast4: d.panLast4 });
          } catch (decErr) {
            applicants.push({ id: doc.id, name: d.name, pan: null, panLast4: d.panLast4, _error: 'Decryption failed' });
          }
        }
      }

      if (applicants.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid applicants found' });
      }

      // Fetch cookies once for all requests
      const cookies = await getNseCookies();
      const cleanSymbol = symbol.trim();

      // Build verification tasks with concurrency control
      const tasks = applicants.map(app => {
        return async () => {
          if (!app.pan) {
            return {
              applicantId: app.id,
              name: app.name,
              maskedPan: app.panLast4 ? maskPan('XXXXXX' + app.panLast4) : 'XXXX',
              status: 'error',
              error: app._error || 'PAN unavailable',
              records: [],
            };
          }

          try {
            const nseResponse = await verifySinglePan(cookies, cleanSymbol, app.pan);
            const normalized = normalizeIpoBidResponse(nseResponse);

            return {
              applicantId: app.id,
              name: app.name,
              maskedPan: maskPan(app.pan),
              status: normalized.records.length > 0 ? 'found' : 'not_found',
              records: normalized.records,
            };
          } catch (err) {
            let errorMsg = 'NSE request failed';
            if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
              errorMsg = 'NSE request timed out';
            } else if (err.response?.status === 403 || err.response?.status === 401) {
              errorMsg = 'NSE temporarily blocked the request';
            }
            return {
              applicantId: app.id,
              name: app.name,
              maskedPan: maskPan(app.pan),
              status: 'error',
              error: errorMsg,
              records: [],
            };
          }
        };
      });

      const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_NSE, INTER_REQUEST_DELAY_MS);

      // Normalize any worker-level errors
      const finalResults = results.map((r, i) => {
        if (r && r._error) {
          return {
            applicantId: applicants[i].id,
            name: applicants[i].name,
            maskedPan: applicants[i].panLast4 ? maskPan('XXXXXX' + applicants[i].panLast4) : 'XXXX',
            status: 'error',
            error: r._error,
            records: [],
          };
        }
        return r;
      });

      const summary = {
        total: finalResults.length,
        found: finalResults.filter(r => r.status === 'found').length,
        notFound: finalResults.filter(r => r.status === 'not_found').length,
        errors: finalResults.filter(r => r.status === 'error').length,
      };

      console.log(`[IPO Bulk Verify] uid=${req.uid} symbol=${cleanSymbol} total=${summary.total} found=${summary.found} notFound=${summary.notFound} errors=${summary.errors}`);

      res.json({
        success: true,
        symbol: cleanSymbol,
        summary,
        results: finalResults,
        verifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[IPO Bulk Verify Error]', err.message);
      res.status(502).json({ success: false, error: 'Bulk verification failed. Please try again later.' });
    }
  });

  return router;
};
