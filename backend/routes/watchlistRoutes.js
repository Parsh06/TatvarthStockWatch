'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const { userMutationRateLimiter } = require('../middleware/rateLimiter');
const watchlistStore = require('../lib/watchlistStore');
const { sanitizeWatchlistScript } = require('../utils/sanitizeResponse');
const { db, admin } = require('../lib/firebaseAdmin');
const { getDb } = require('../lib/mongoClient');

/**
 * GET /api/watchlist
 * Retrieve user's watchlist scripts.
 */
router.get('/', verifyToken, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  try {
    const scripts = await watchlistStore.getWatchlist(req.uid);
    const sanitized = scripts.map((s) => sanitizeWatchlistScript(s)).filter(Boolean);
    res.json({ scripts: sanitized });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve watchlist' });
  }
});

/**
 * POST /api/watchlist
 * Add a script to user's watchlist.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const body = req.body || {};
    const ltdCode = String(body.ltdCode || body.bseCode || body.scripCode || '').trim();
    const symbol = String(body.symbol || body.nseSymbol || '').trim().toUpperCase();
    const scriptName = String(body.scriptName || body.name || ltdCode || symbol).trim();
    const exchange = String(body.exchange || 'BOTH').trim().toUpperCase();
    const notes = String(body.notes || '').trim();
    const group = String(body.group || '').trim();
    const isin = String(body.isin || '').trim();

    if (!ltdCode && !symbol) {
      return res.status(400).json({ error: 'ltdCode or symbol is required' });
    }

    const result = await watchlistStore.addScript(req.uid, {
      ltdCode,
      symbol,
      scriptName,
      exchange,
      notes,
      group,
      isin,
    });

    if (result.alreadyExists) {
      return res.json({ ...result, alreadyExists: true });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/watchlist/bulk
 * Bulk add scripts to user's watchlist.
 */
router.post('/bulk', verifyToken, async (req, res) => {
  const incoming = Array.isArray(req.body.scripts) ? req.body.scripts : [];
  if (!incoming.length) return res.json({ added: 0, skipped: 0 });

  const existing = await watchlistStore.getWatchlist(req.uid);
  const existingCodes = new Set(existing.map((s) => s.ltdCode));
  let added = 0;
  let skipped = 0;

  const toAdd = [];
  for (const item of incoming) {
    const ltdCode = String(item.ltdCode || item.bseCode || item.scripCode || '').trim();
    const symbol = String(item.symbol || item.nseSymbol || '').trim().toUpperCase();
    const scriptName = String(item.scriptName || item.name || ltdCode || symbol).trim();

    if (!ltdCode && !symbol) {
      skipped++;
      continue;
    }
    const key = ltdCode || symbol;
    if (existingCodes.has(key)) {
      skipped++;
      continue;
    }
    existingCodes.add(key);

    toAdd.push({
      ltdCode,
      symbol,
      scriptName,
      exchange: 'BOTH',
      notes: item.notes || '',
      group: String(item.group || '').trim(),
      addedAt: new Date(),
    });
    added++;
  }

  if (toAdd.length > 0) {
    const mongoDb = await getDb();
    const docs = toAdd.map((s) => ({ ...s, userId: req.uid }));
    await mongoDb.collection('watchlists').insertMany(docs);
    watchlistStore.invalidateWatchlistCache();
  }

  res.json({ added, skipped });
});

/**
 * POST /api/watchlist/catchup
 * Check and create historical notifications for newly added watchlist script.
 */
router.post('/catchup', verifyToken, async (req, res) => {
  try {
    const { scriptCode } = req.body;
    if (!scriptCode) return res.status(400).json({ error: 'scriptCode required' });

    // Invalidate the cache so background jobs pick up this new script immediately
    watchlistStore.invalidateWatchlistCache();

    // 1. Fetch today's announcements for this script from the global DB
    const annsSnap = await db.collection('announcements')
      .where('scriptCode', '==', scriptCode)
      .get();

    if (annsSnap.empty) {
      return res.json({ sent: 0, skipped: 0, reason: 'no announcements found today' });
    }

    const announcements = [];
    annsSnap.forEach((d) => announcements.push(d.data()));

    // 2. Check which ones have NOT been added to notifications
    const toNotify = [];
    const ts = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    const docIds = announcements.map((a) => String(a.id));
    const notifRefs = docIds.map((id) => db.collection('users').doc(req.uid).collection('notifications').doc(id));

    const existingNotifs = await db.getAll(...notifRefs);

    for (let i = 0; i < announcements.length; i++) {
      if (!existingNotifs[i].exists) {
        toNotify.push(announcements[i]);
        batch.set(notifRefs[i], {
          id: announcements[i].id || '',
          exchange: announcements[i].exchange || '',
          scriptName: announcements[i].scriptName || '',
          scriptCode: announcements[i].scriptCode || '',
          category: announcements[i].category || '',
          subCategory: announcements[i].subCategory || '',
          subject: announcements[i].subject || '',
          announcementDate: announcements[i].announcementDate || '',
          date: announcements[i].date || '',
          time: announcements[i].time || '',
          datetimeIST: announcements[i].datetimeIST || '',
          pdfUrl: announcements[i].pdfUrl || null,
          critical: announcements[i].critical || false,
          read: false,
          createdAt: ts,
        });
      }
    }

    if (toNotify.length === 0) {
      return res.json({ sent: 0, skipped: announcements.length, reason: 'already notified' });
    }

    // 3. Update watchlist count for this script
    const wlSnap = await db.collection('users').doc(req.uid).collection('watchlist')
      .where('ltdCode', '==', scriptCode)
      .limit(1)
      .get();

    if (!wlSnap.empty) {
      const latestAnn = toNotify.reduce((latest, a) => (!latest || a.announcementDate > latest) ? a.announcementDate : latest, null);
      batch.update(wlSnap.docs[0].ref, {
        announcementCount: admin.firestore.FieldValue.increment(toNotify.length),
        lastAnnouncementAt: latestAnn,
        lastCheckedAt: ts,
      });
    }

    await batch.commit();
    res.json({ sent: toNotify.length, skipped: announcements.length - toNotify.length });
  } catch (e) {
    console.error('[Catchup Error]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/watchlist/export
 * Export watchlist as CSV download.
 */
router.get('/export', verifyToken, async (req, res) => {
  try {
    const scripts = await watchlistStore.getWatchlist(req.uid);
    const header = 'BSE Code,NSE Symbol,Company Name,Exchange,Group,Notes,Added At\n';
    const rows = scripts.map((s) => {
      const code = s.ltdCode || s.bseCode || '';
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        cell(code),
        cell(s.symbol || ''),
        cell(s.scriptName || ''),
        cell(s.exchange || ''),
        cell(s.group || ''),
        cell(s.notes || ''),
        cell(s.addedAt || ''),
      ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="watchlist_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + header + rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/watchlist/all
 * Clear entire watchlist for user.
 */
router.delete('/all', verifyToken, async (req, res) => {
  try {
    await watchlistStore.saveWatchlist(req.uid, []);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/watchlist/:id
 * Remove a specific script from user's watchlist.
 */
router.delete('/:id', verifyToken, userMutationRateLimiter, async (req, res) => {
  try {
    const result = await watchlistStore.removeScript(req.uid, req.params.id);
    if (!result || result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Script not found or access denied', code: 'NOT_FOUND' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/watchlist/:id
 * Update notes/group of a specific script.
 */
router.patch('/:id', verifyToken, userMutationRateLimiter, async (req, res) => {
  try {
    const result = await watchlistStore.updateScript(req.uid, req.params.id, req.body || {});
    if (!result || result.modifiedCount === 0) {
      return res.status(404).json({ success: false, error: 'Script not found or access denied', code: 'NOT_FOUND' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
