'use strict';

const express = require('express');
const axios   = require('axios');
const { encryptPan, decryptPan, maskPan, validatePan, normalizeKfinResponse } = require('../lib/ipoUtils');

// ── KFintech Headers ─────────────────────────────────────────────────────────
const KFIN_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://ipostatus.kfintech.com',
  'Referer': 'https://ipostatus.kfintech.com/',
};

// ── Dynamic Scraper Helper ───────────────────────────────────────────────────
async function scrapeKfinCompanies() {
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
      return parsed.map(c => ({ clientId: String(c.clientId), symbol: String(c.name) }));
    }
    throw new Error('Parsed KFintech company list is empty');
  } catch (err) {
    console.error('[KFintech Live Fetch Error]', err.message);
    throw new Error(`Failed to fetch live IPO symbols from KFintech: ${err.message}`);
  }
}

// ── Symbols Cache ─────────────────────────────────────────────────────────────
let _symbolCache = { data: null, fetchedAt: 0 };
const SYMBOL_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

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

// Clean up rate limiter entries
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _ipoRl) {
    if (now > v.resetAt + IPO_RL_WINDOW) _ipoRl.delete(k);
  }
}, 5 * 60_000);

// ── Bulk Concurrency Control ──────────────────────────────────────────────────
const MAX_CONCURRENT_KFIN = 2;
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

// ── Helper: Query KFintech ────────────────────────────────────────────────────
async function queryKfintech(clientId, pan) {
  const res = await axios.get(
    'https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan',
    {
      headers: {
        ...KFIN_HEADERS,
        'client_id': clientId,
        'reqparam': pan,
      },
      timeout: 15000,
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
        return res.json({ success: true, symbols: _symbolCache.data, source: 'KFINTECH', cached: true });
      }

      const symbols = await scrapeKfinCompanies();
      _symbolCache = { data: symbols, fetchedAt: now };

      res.json({ success: true, symbols, source: 'KFINTECH', cached: false });
    } catch (err) {
      console.error('[IPO Symbols KFintech]', err.message);
      if (_symbolCache.data) {
        return res.json({ success: true, symbols: _symbolCache.data, source: 'KFINTECH', cached: true, stale: true });
      }
      res.status(400).json({ success: false, error: 'Unable to fetch IPO symbols from KFintech' });
    }
  });

  // ── POST /api/ipo/verify ────────────────────────────────────────────────────
  router.post('/verify', verifyToken, async (req, res) => {
    try {
      const { symbol, verificationType, identifier } = req.body;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ success: false, error: 'Please select an IPO symbol' });
      }
      if (!verificationType || verificationType !== 'pan') {
        return res.status(400).json({ success: false, error: 'Only PAN verification is supported for KFintech' });
      }
      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        return res.status(400).json({ success: false, error: 'Please enter your PAN number' });
      }

      const cleanPan = identifier.trim().toUpperCase();

      if (!validatePan(cleanPan)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 10-character PAN number' });
      }

      // Rate limit
      if (!checkIpoRateLimit(req.uid, 'verify')) {
        return res.status(429).json({ success: false, error: 'Too many verification requests. Please wait a minute.' });
      }

      // Query KFintech
      const startMs = Date.now();
      let kfinResponse;
      try {
        kfinResponse = await queryKfintech(symbol, cleanPan);
      } catch (err) {
        if (err.response && err.response.status === 404 && err.response.data && err.response.data.error === 'Record Not Found') {
          kfinResponse = { data: [] };
        } else {
          throw err;
        }
      }
      
      const normalized = normalizeKfinResponse(kfinResponse);
      const durationMs = Date.now() - startMs;

      console.log(`[IPO Verify KFintech] uid=${req.uid} clientId=${symbol} masked=${maskPan(cleanPan)} records=${normalized.records?.length || 0} duration=${durationMs}ms`);

      res.json({
        success: normalized.success,
        provider: 'KFINTECH',
        verification: {
          type: 'pan',
          maskedIdentifier: maskPan(cleanPan),
        },
        records: normalized.records || [],
        verifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[IPO Verify KFintech Error]', err.message);
      res.status(400).json({
        success: false,
        error: 'Unable to connect to KFintech verification service. Details: ' + err.message,
      });
    }
  });

  // ── GET /api/ipo/applicants ─────────────────────────────────────────────────
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

      const countSnap = await collRef.count().get();

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
        } catch { /* ignore decryption errors */ }
      });
      if (duplicate) {
        return res.status(400).json({ success: false, error: 'This PAN is already saved for another applicant' });
      }

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
  router.post('/verify-bulk', verifyToken, async (req, res) => {
    try {
      const { symbol, applicantIds } = req.body;

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ success: false, error: 'Please select an IPO symbol' });
      }
      if (!Array.isArray(applicantIds) || applicantIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Please select at least one applicant' });
      }

      if (!checkIpoRateLimit(req.uid, 'bulk')) {
        return res.status(429).json({ success: false, error: 'Too many bulk verification requests. Please wait a minute.' });
      }

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

      // Build tasks for concurrency control
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
            let kfinResponse;
            try {
              kfinResponse = await queryKfintech(symbol, app.pan);
            } catch (err) {
              if (err.response && err.response.status === 404 && err.response.data && err.response.data.error === 'Record Not Found') {
                kfinResponse = { data: [] };
              } else {
                throw err;
              }
            }
            
            const normalized = normalizeKfinResponse(kfinResponse);

            return {
              applicantId: app.id,
              name: app.name,
              maskedPan: maskPan(app.pan),
              status: normalized.records && normalized.records.length > 0 ? 'found' : 'not_found',
              records: normalized.records || [],
            };
          } catch (err) {
            return {
              applicantId: app.id,
              name: app.name,
              maskedPan: maskPan(app.pan),
              status: 'error',
              error: err.message || 'KFintech query failed',
              records: [],
            };
          }
        };
      });

      const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_KFIN, INTER_REQUEST_DELAY_MS);

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

      res.json({
        success: true,
        symbol,
        summary,
        results: finalResults,
        verifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[IPO Bulk Verify Error]', err.message);
      res.status(400).json({ success: false, error: 'Bulk verification failed: ' + err.message });
    }
  });

  return router;
};
