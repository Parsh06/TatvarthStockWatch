'use strict';

const express = require('express');
const axios   = require('axios');
const { 
  encryptPan, 
  decryptPan, 
  maskPan, 
  validatePan, 
  normalizeKfinResponse,
  normalizeMufgResponse,
  normalizeBigshareResponse 
} = require('../lib/ipoUtils');

// ── KFintech Headers ─────────────────────────────────────────────────────────
const KFIN_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://ipostatus.kfintech.com',
  'Referer': 'https://ipostatus.kfintech.com/',
};

const { scrapeKfinCompanies } = require('../lib/ipoScraper');
const { scrapeMufgCompanies, queryMufg } = require('../lib/mufgScraper');
const { scrapeBigshareCompanies, queryBigshare } = require('../lib/bigshareScraper');

// ── Per-user IPO Rate Limiter ─────────────────────────────────────────────────
const _ipoRl = new Map();
const IPO_RL_WINDOW = 60_000; // 1 minute
const IPO_RL_MAX_VERIFY = 15;
const IPO_RL_MAX_BULK   = 5;

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
const MAX_CONCURRENT_IPO = 2;
const INTER_REQUEST_DELAY_MS = 400;

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

  // In-memory cache for unified symbols
  let _unifiedSymbolCache = { data: null, fetchedAt: 0 };
  const UNIFIED_CACHE_TTL_MS = 3 * 60 * 1000;

  async function syncRegistrarsToMongo() {
    const { saveIpoSymbols } = require('../lib/ipoStore');
    const [mufgRes, kfinRes, bigshareRes] = await Promise.allSettled([
      scrapeMufgCompanies(),
      scrapeKfinCompanies(),
      scrapeBigshareCompanies(),
    ]);

    const mufgList = mufgRes.status === 'fulfilled' && Array.isArray(mufgRes.value) ? mufgRes.value : [];
    const kfinList = kfinRes.status === 'fulfilled' && Array.isArray(kfinRes.value) ? kfinRes.value : [];
    const bigshareList = bigshareRes.status === 'fulfilled' && Array.isArray(bigshareRes.value) ? bigshareRes.value : [];

    try {
      if (kfinList.length > 0) await saveIpoSymbols(kfinList, 'KFINTECH');
      if (mufgList.length > 0) await saveIpoSymbols(mufgList, 'MUFG');
      if (bigshareList.length > 0) await saveIpoSymbols(bigshareList, 'BIGSHARE');
    } catch (dbErr) {
      console.error('[Unified Symbols] MongoDB sync error:', dbErr.message);
    }
  }

  async function fetchUnifiedSymbols(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _unifiedSymbolCache.data && (now - _unifiedSymbolCache.fetchedAt < UNIFIED_CACHE_TTL_MS)) {
      return _unifiedSymbolCache.data;
    }

    const { getActiveIpoSymbols } = require('../lib/ipoStore');

    // 1. Fast Path: Read pre-cached active symbols directly from MongoDB (sub-15ms)
    let mongoDocs = [];
    if (!forceRefresh) {
      try {
        mongoDocs = await getActiveIpoSymbols('ALL');
      } catch (err) {
        console.error('[Unified Symbols] Fast MongoDB read error:', err.message);
      }
    }

    // 2. If DB is empty or forceRefresh is true, sync live from registrars
    if (mongoDocs.length === 0 || forceRefresh) {
      await syncRegistrarsToMongo();
      try {
        mongoDocs = await getActiveIpoSymbols('ALL');
      } catch (err) {
        console.error('[Unified Symbols] Post-sync read error:', err.message);
      }
    }

    let unified = [];
    if (mongoDocs.length > 0) {
      unified = mongoDocs.map((doc, idx) => ({
        clientId: doc.clientId || doc._id,
        symbol: doc.symbol,
        name: doc.name || doc.symbol,
        registrar: doc.source || 'KFINTECH',
        isLatest: idx < 5,
        discoveredAt: doc.firstSeenAt ? new Date(doc.firstSeenAt).toISOString() : new Date().toISOString(),
      }));
    }

    if (unified.length > 0) {
      _unifiedSymbolCache = { data: unified, fetchedAt: now };
    }
    return unified;
  }

  // ── GET /api/ipo/symbols ────────────────────────────────────────────────────
  router.get('/symbols', verifyToken, async (req, res) => {
    try {
      const registrar = String(req.query.registrar || 'ALL').toUpperCase();
      const forceRefresh = req.query.forceRefresh === 'true' || req.query.refresh === 'true';
      let symbols = [];
      let source = 'ALL';

      // Set edge CDN & browser cache headers for instantaneous client navigation
      res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');

      if (registrar === 'MUFG' || registrar === 'LINKINTIME' || registrar === 'LINK_INTIME') {
        const { getActiveIpoSymbols } = require('../lib/ipoStore');
        const docs = await getActiveIpoSymbols('MUFG');
        symbols = docs.length > 0 && !forceRefresh ? docs : await scrapeMufgCompanies();
        source = 'MUFG';
      } else if (registrar === 'BIGSHARE' || registrar === 'BIG_SHARE') {
        const { getActiveIpoSymbols } = require('../lib/ipoStore');
        const docs = await getActiveIpoSymbols('BIGSHARE');
        symbols = docs.length > 0 && !forceRefresh ? docs : await scrapeBigshareCompanies();
        source = 'BIGSHARE';
      } else if (registrar === 'KFINTECH' || registrar === 'KFIN') {
        const { getActiveIpoSymbols } = require('../lib/ipoStore');
        const docs = await getActiveIpoSymbols('KFINTECH');
        symbols = docs.length > 0 && !forceRefresh ? docs : await scrapeKfinCompanies();
        source = 'KFINTECH';
      } else {
        symbols = await fetchUnifiedSymbols(forceRefresh);
        source = 'UNIFIED';
      }

      res.json({ success: true, symbols, source, count: symbols.length });
    } catch (err) {
      console.error('[IPO Symbols Error]', err.message);
      res.status(400).json({ success: false, error: 'Unable to fetch IPO symbols. ' + err.message });
    }
  });

  // ── POST /api/ipo/verify ────────────────────────────────────────────────────
  router.post('/verify', verifyToken, async (req, res) => {
    try {
      const { symbol, verificationType, identifier, registrar = 'KFINTECH' } = req.body;
      const reg = String(registrar).toUpperCase();

      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ success: false, error: 'Please select an IPO symbol' });
      }
      if (!verificationType || verificationType !== 'pan') {
        return res.status(400).json({ success: false, error: 'Only PAN verification is supported' });
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

      const startMs = Date.now();
      let normalized;

      if (reg === 'MUFG' || reg === 'LINKINTIME' || reg === 'LINK_INTIME') {
        const mufgXml = await queryMufg(symbol, cleanPan);
        normalized = await normalizeMufgResponse(mufgXml, cleanPan);
      } else if (reg === 'BIGSHARE' || reg === 'BIG_SHARE') {
        const bigshareData = await queryBigshare(symbol, cleanPan);
        normalized = normalizeBigshareResponse(bigshareData, cleanPan);
      } else {
        // Query KFintech
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
        normalized = normalizeKfinResponse(kfinResponse);
      }

      const durationMs = Date.now() - startMs;
      console.log(`[IPO Verify] uid=${req.uid} reg=${reg} symbol=${symbol} masked=${maskPan(cleanPan)} records=${normalized.records?.length || 0} duration=${durationMs}ms`);

      const providerName = (reg === 'MUFG' || reg === 'LINKINTIME') ? 'MUFG' : (reg === 'BIGSHARE' ? 'BIGSHARE' : 'KFINTECH');

      res.json({
        success: normalized.success,
        provider: providerName,
        verification: {
          type: 'pan',
          maskedIdentifier: maskPan(cleanPan),
        },
        records: normalized.records || [],
        verifiedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[IPO Verify Error]', err.message);
      res.status(400).json({
        success: false,
        error: 'Unable to connect to verification service. Details: ' + err.message,
      });
    }
  });

  // ── GET /api/ipo/applicants ─────────────────────────────────────────────────
  router.get('/applicants', verifyToken, async (req, res) => {
    try {
      const { db } = require('../lib/firebaseAdmin');
      const { sanitizeApplicant } = require('../utils/sanitizeResponse');
      const snap = await db.collection('users').doc(req.uid).collection('familyPans').orderBy('createdAt', 'asc').get();

      const applicants = [];
      snap.forEach(doc => {
        const d = doc.data();
        const appObj = sanitizeApplicant({
          id: doc.id,
          name: d.name || 'Unknown',
          panLast4: d.panLast4,
          createdAt: d.createdAt?.toDate?.()?.toISOString() || d.createdAt,
        });
        if (appObj) applicants.push(appObj);
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
      const { symbol, applicantIds, registrar = 'KFINTECH' } = req.body;
      const reg = String(registrar).toUpperCase();

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
            let normalized;
            if (reg === 'MUFG' || reg === 'LINKINTIME' || reg === 'LINK_INTIME') {
              const mufgXml = await queryMufg(symbol, app.pan);
              normalized = await normalizeMufgResponse(mufgXml, app.pan);
            } else if (reg === 'BIGSHARE' || reg === 'BIG_SHARE') {
              const bigshareData = await queryBigshare(symbol, app.pan);
              normalized = normalizeBigshareResponse(bigshareData, app.pan);
            } else {
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
              normalized = normalizeKfinResponse(kfinResponse);
            }

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
              error: err.message || 'Verification query failed',
              records: [],
            };
          }
        };
      });

      const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_IPO, INTER_REQUEST_DELAY_MS);

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

      const providerName = (reg === 'MUFG' || reg === 'LINKINTIME') ? 'MUFG' : (reg === 'BIGSHARE' || reg === 'BIG_SHARE' ? 'BIGSHARE' : 'KFINTECH');

      res.json({
        success: true,
        symbol,
        provider: providerName,
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
