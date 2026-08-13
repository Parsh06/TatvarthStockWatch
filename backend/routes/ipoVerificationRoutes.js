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

// ── KFintech Fallback Companies ──────────────────────────────────────────────
const KFIN_FALLBACK_COMPANIES = [
  { "clientId": "81387868980", "name": "MOLBIO DIAGNOSTICS LIMITED" },
  { "clientId": "94818267561", "name": "DHOOT TRANSMISSION LIMITED" },
  { "clientId": "62198153830", "name": "ARDEE INDUSTRIES LIMITED" },
  { "clientId": "44065980180", "name": "MV ELECTROSYSTEMS LIMITED" },
  { "clientId": "53707331280", "name": "JUNIPER GREEN ENERGY LIMITED" },
  { "clientId": "67709372110", "name": "DHAVAL PACKAGING LIMITED" },
  { "clientId": "43836057990", "name": "MANIPAL HEALTH ENTERPRISES LIMITED" },
  { "clientId": "42817695520", "name": "ADVANCE TECHNOFORG LIMITED" },
  { "clientId": "55385908200", "name": "CUBE HIGHWAYS TRUST - INVIT" },
  { "clientId": "94419360500", "name": "XTRANET TECHNOLOGIES LIMITED" },
  { "clientId": "63734978420", "name": "SHREE BALAJI MALA TEXTILES LIMITED" },
  { "clientId": "19193086920", "name": "GULF LLOYDS INDIA LIMITED" },
  { "clientId": "89605487720", "name": "CALIBER MINING AND LOGISTICS LIMITED IPO" },
  { "clientId": "89468061991", "name": "SBI FUNDS MANAGMENT LIMITED IPO" },
  { "clientId": "41422222050", "name": "ALPINE TEXWORLD LIMITED IPO" },
  { "clientId": "73206134640", "name": "KRATIKAL TECH LIMITED SME" },
  { "clientId": "17643901490", "name": "TEJA ENGINEERING INDUSTRIES LIMITED SME IPO" },
  { "clientId": "65065971040", "name": "ADON AGRO COMMODITIES LIMITED SME IPO" },
  { "clientId": "39751101520", "name": "CRAZY SNACKS LIMITED SME IPO" },
  { "clientId": "89075375160", "name": "CSM TECHNOLOGIES LIMITED IPO" },
  { "clientId": "10609640970", "name": "TURTLEMINT FINTECH SOLUTIONS LIMITED IPO" },
  { "clientId": "82984397570", "name": "CLAY CRAFT INDIA LIMITED SME IPO" },
  { "clientId": "41208427340", "name": "LIOTECH INDUSTRIES LIMITED SME IPO" },
  { "clientId": "22809299660", "name": "PRACHAY CAPITAL LIMITED NCDS JUNE 2026" },
  { "clientId": "34105687640", "name": "HORIZON RECLAIM INDIA LIMITED" },
  { "clientId": "89347697100", "name": "EDELWEISS FINANCIAL SERVICES LTD NCD18 JUNE 2026" },
  { "clientId": "68599915170", "name": "MUTHOOT MERCANTILE LIMITED - JUNE 2026" },
  { "clientId": "70806992450", "name": "HEXAGON NUTRITION LIMITED" },
  { "clientId": "28962929970", "name": "VAHH CHEMICALS LIMITED" },
  { "clientId": "65310715440", "name": "CMR GREEN TECHNOLOGIES LIMITED" },
  { "clientId": "90318758440", "name": "KOSAMATTAM FINANCE LIMITED - NCDS - MAY-2026" },
  { "clientId": "53483362510", "name": "TEAMTECH FORMWORK SOLUTIONS LIMITED" },
  { "clientId": "26859517830", "name": "RFBL FLEXI PACK LIMITED" },
  { "clientId": "28267215520", "name": "BAGMANE PRIME OFFICE REIT" },
  { "clientId": "34561715130", "name": "VALUE 360 COMMUNICATIONS LIMITED" },
  { "clientId": "54450217260", "name": "ONEMI TECHNOLOGY SOLUTIONS LIMITED" },
  { "clientId": "92634312570", "name": "ADISOFT TECHNOLOGIES LIMITED" },
  { "clientId": "73146088770", "name": "CITIUS TRANSNET INVESTMENT TRUST" },
  { "clientId": "80184898770", "name": "MEHUL TELECOM LIMITED" },
  { "clientId": "51817446680", "name": "PROPSHARE CELESTIA SM REIT 2026" },
  { "clientId": "77980267280", "name": "AMIR CHAND JAGDISH KUMAR (EXPORTS) LIMITED" },
  { "clientId": "67638044790", "name": "CENTRAL MINE PLANNING AND DESIGN INSTITUTE LIMITED" },
  { "clientId": "26440316230", "name": "NOVUS LOYALTY LIMITED" },
  { "clientId": "91318037690", "name": "EDELWEISS FINANCIAL SERVICES LTD-NCDS-MARCH-2026" },
  { "clientId": "35015605280", "name": "INNOVISION LIMITED-IPO" },
  { "clientId": "94209528790", "name": "RAAJMARG INFRA INVESTMENT TRUST - INVIT" },
  { "clientId": "76300775270", "name": "CHEMMANUR CREDITS AND INVESTMENTS LIMITED - NCDS8 - MARCH2026" },
  { "clientId": "43990634450", "name": "RAJPUTANA STAINLESS LIMITED-IPO" },
  { "clientId": "62507743750", "name": "PRACHAY CAPITAL LIMITED-NCDS3-FEBRUARY-2026" },
  { "clientId": "51058840660", "name": "ACCORD TRANSFORMER AND SWITCHGEAR LIMITED" },
  { "clientId": "85658340220", "name": "FRACTAL INDUSTRIES LIMITED" },
  { "clientId": "20422755930", "name": "KOSAMATTAM FINANCE LIMITED - NCD36 - FEBRUARY 2026" },
  { "clientId": "64562521850", "name": "POWER FINANCE CORPORATION LIMITED - ZERO COUPON NCDS" },
  { "clientId": "33209180890", "name": "POWER FINANCE CORPORATION LIMITED - NCDS" },
  { "clientId": "62430336220", "name": "AYE FINANCE LIMITED" },
  { "clientId": "18899853180", "name": "ACCRETION NUTRAVEDA LIMITED" },
  { "clientId": "41087928370", "name": "KANISHK ALUMINIUM INDIA LIMITED" }
];

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
    if (!scriptMatch) throw new Error('Script tag not found');

    const bundleUrl = 'https://ipostatus.kfintech.com' + scriptMatch[1].slice(1);
    const bundleRes = await axios.get(bundleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const jsonMatch = bundleRes.data.match(/JSON\.parse\('(\[.*?\])'\)/);
    if (!jsonMatch) throw new Error('JSON.parse pattern not found');

    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(c => ({ clientId: String(c.clientId), symbol: String(c.name) }));
    }
    throw new Error('Parsed list is empty');
  } catch (err) {
    console.warn('[KFintech Scraper Failed, using fallback]', err.message);
    return KFIN_FALLBACK_COMPANIES.map(c => ({ clientId: c.clientId, symbol: c.name }));
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
      const kfinResponse = await queryKfintech(symbol, cleanPan);
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
      if (countSnap.data().count >= 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 applicants allowed.' });
      }

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
      if (applicantIds.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 applicants per bulk verification' });
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
            const kfinResponse = await queryKfintech(symbol, app.pan);
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
