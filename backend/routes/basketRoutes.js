'use strict';

/**
 * basketRoutes.js
 *
 * Shareable Curated Watchlist Baskets (Public Links & Viral Growth Engine)
 *
 * Endpoints:
 *   GET    /api/baskets/:slug         — Public: View basket with live quotes & announcements
 *   POST   /api/baskets               — Authed: Create / publish a curated basket
 *   POST   /api/baskets/:slug/import  — Authed: 1-Tap import basket into caller's watchlist
 *   GET    /api/baskets/user/my       — Authed: Get all baskets created by the current user
 *   DELETE /api/baskets/:slug         — Authed: Delete basket owned by caller or admin
 */

const express = require('express');
const router = express.Router();
const { db, admin } = require('../lib/firebaseAdmin');
const { getDb } = require('../lib/mongoClient');
const watchlistStore = require('../lib/watchlistStore');
const { verifyToken } = require('../lib/authMiddleware');

/**
 * Helper to slugify a string into a URL-friendly slug
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);
}

// ── GET /api/baskets/user/my (Must precede /:slug to avoid route collision) ─────
router.get('/user/my', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('public_baskets')
      .where('creatorUid', '==', req.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const baskets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, baskets });
  } catch (err) {
    console.error('[Baskets] Get my baskets error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load your baskets' });
  }
});

// ── GET /api/baskets/:slug (PUBLIC — No Auth Barrier) ─────────────────────────
router.get('/:slug', async (req, res) => {
  const rawSlug = String(req.params.slug || '').trim().toLowerCase();
  if (!rawSlug) {
    return res.status(400).json({ success: false, error: 'Basket slug is required' });
  }

  try {
    // 1. Fetch basket document from Firestore
    let basketDoc = await db.collection('public_baskets').doc(rawSlug).get();

    // Fallback: search by 'slug' field if docId differs
    if (!basketDoc.exists) {
      const snap = await db.collection('public_baskets').where('slug', '==', rawSlug).limit(1).get();
      if (!snap.empty) {
        basketDoc = snap.docs[0];
      }
    }

    if (!basketDoc.exists) {
      return res.status(404).json({ success: false, error: 'Basket not found' });
    }

    const basketData = basketDoc.data();

    // 2. Increment view count asynchronously (non-blocking)
    basketDoc.ref.update({
      viewsCount: admin.firestore.FieldValue.increment(1),
      lastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    // 3. Fetch recent announcements for stocks inside this basket from MongoDB
    const scripts = Array.isArray(basketData.scripts) ? basketData.scripts : [];
    const bseCodes = scripts.map(s => String(s.bseCode || s.ltdCode || s.scripCode || '').trim()).filter(Boolean);
    const symbols = scripts.map(s => String(s.symbol || s.nseSymbol || '').trim().toUpperCase()).filter(Boolean);

    let recentAnnouncements = [];
    try {
      const mongoDb = await getDb();
      if (mongoDb && (bseCodes.length > 0 || symbols.length > 0)) {
        const queryOr = [];
        if (bseCodes.length > 0) queryOr.push({ scripCode: { $in: bseCodes } });
        if (symbols.length > 0) queryOr.push({ symbol: { $in: symbols } });

        recentAnnouncements = await mongoDb.collection('announcements')
          .find({ $or: queryOr })
          .sort({ date: -1, time: -1, createdAt: -1 })
          .limit(10)
          .toArray();
      }
    } catch (annErr) {
      console.warn('[Baskets] Recent announcements fetch warning:', annErr.message);
    }

    res.json({
      success: true,
      basket: {
        id: basketDoc.id,
        slug: basketData.slug || basketDoc.id,
        title: basketData.title,
        description: basketData.description || '',
        category: basketData.category || 'Curated',
        tags: basketData.tags || [],
        creatorName: basketData.creatorName || 'StockWatch Investor',
        viewsCount: (basketData.viewsCount || 0) + 1,
        importsCount: basketData.importsCount || 0,
        scriptsCount: scripts.length,
        scripts,
        recentAnnouncements,
        createdAt: basketData.createdAt?.toDate?.()?.toISOString() || basketData.createdAt,
      }
    });

  } catch (err) {
    console.error('[Baskets] GET /:slug error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load basket' });
  }
});

// ── POST /api/baskets (Authenticated Basket Creation) ─────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, description, category, slug: userSlug, scripts, tags } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Basket title must be at least 3 characters' });
    }

    if (!Array.isArray(scripts) || scripts.length === 0) {
      return res.status(400).json({ success: false, error: 'Basket must contain at least 1 stock' });
    }

    // Sanitize scripts array
    const sanitizedScripts = scripts.map(s => {
      const bseCode = String(s.bseCode || s.ltdCode || s.scripCode || '').trim();
      const symbol = String(s.symbol || s.nseSymbol || '').trim().toUpperCase();
      const scriptName = String(s.scriptName || s.name || symbol || bseCode).trim();
      const exchange = String(s.exchange || 'BOTH').toUpperCase();
      const notes = String(s.notes || '').trim().slice(0, 150);
      return { bseCode, symbol, scriptName, exchange, notes };
    }).filter(s => s.bseCode || s.symbol);

    if (sanitizedScripts.length === 0) {
      return res.status(400).json({ success: false, error: 'Valid scrip code or NSE symbol required for all stocks' });
    }

    // Generate unique slug
    let baseSlug = slugify(userSlug || title);
    if (!baseSlug) baseSlug = 'curated-basket';

    let finalSlug = baseSlug;
    const existingDoc = await db.collection('public_baskets').doc(finalSlug).get();
    if (existingDoc.exists && existingDoc.data()?.creatorUid !== req.uid) {
      // If taken by another user, append short hash
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      finalSlug = `${baseSlug}-${randomSuffix}`;
    }

    // Get Creator display identity
    let creatorName = 'StockWatch Curator';
    try {
      const userRecord = await admin.auth().getUser(req.uid);
      creatorName = userRecord.displayName || (userRecord.email ? userRecord.email.split('@')[0] : 'Investor');
    } catch {}

    const now = admin.firestore.FieldValue.serverTimestamp();
    const basketPayload = {
      slug: finalSlug,
      title: title.trim().slice(0, 80),
      description: String(description || '').trim().slice(0, 300),
      category: String(category || 'General').trim().slice(0, 30),
      tags: Array.isArray(tags) ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 5) : [],
      creatorUid: req.uid,
      creatorName,
      scripts: sanitizedScripts,
      viewsCount: 0,
      importsCount: 0,
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('public_baskets').doc(finalSlug).set(basketPayload, { merge: true });

    res.json({
      success: true,
      slug: finalSlug,
      shareUrl: `https://tatvarthstockwatch.web.app/basket/${finalSlug}`,
      basket: {
        id: finalSlug,
        ...basketPayload,
        createdAt: new Date().toISOString(),
      }
    });

  } catch (err) {
    console.error('[Baskets] POST / error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to create shareable basket' });
  }
});

// ── POST /api/baskets/:slug/import (1-Tap Watchlist Import) ───────────────────
router.post('/:slug/import', verifyToken, async (req, res) => {
  const rawSlug = String(req.params.slug || '').trim().toLowerCase();
  try {
    const doc = await db.collection('public_baskets').doc(rawSlug).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Basket not found' });
    }

    const data = doc.data();
    const scripts = Array.isArray(data.scripts) ? data.scripts : [];

    if (scripts.length === 0) {
      return res.json({ success: true, addedCount: 0, skippedCount: 0, totalScripts: 0 });
    }

    // Fetch caller's existing watchlist to dedup
    const existingWatchlist = await watchlistStore.getWatchlist(req.uid);
    const existingKeys = new Set();
    for (const item of existingWatchlist) {
      if (item.ltdCode) existingKeys.add(String(item.ltdCode).trim());
      if (item.symbol) existingKeys.add(String(item.symbol).trim().toUpperCase());
      if (item.bseCode) existingKeys.add(String(item.bseCode).trim());
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const s of scripts) {
      const code = String(s.bseCode || s.ltdCode || '').trim();
      const sym = String(s.symbol || '').trim().toUpperCase();

      if ((code && existingKeys.has(code)) || (sym && existingKeys.has(sym))) {
        skippedCount++;
        continue;
      }

      await watchlistStore.addScript(req.uid, {
        ltdCode: code,
        symbol: sym,
        scriptName: s.scriptName || sym || code,
        exchange: s.exchange || 'BOTH',
        notes: s.notes ? `[${data.title}] ${s.notes}` : `Imported from basket: ${data.title}`,
      });

      if (code) existingKeys.add(code);
      if (sym) existingKeys.add(sym);
      addedCount++;
    }

    // Increment basket importsCount
    doc.ref.update({
      importsCount: admin.firestore.FieldValue.increment(1),
      lastImportedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    res.json({
      success: true,
      basketTitle: data.title,
      totalScripts: scripts.length,
      addedCount,
      skippedCount,
    });

  } catch (err) {
    console.error('[Baskets] Import error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to import basket to watchlist' });
  }
});

// ── DELETE /api/baskets/:slug (Owner or Admin Delete) ──────────────────────────
router.delete('/:slug', verifyToken, async (req, res) => {
  const rawSlug = String(req.params.slug || '').trim().toLowerCase();
  try {
    const docRef = db.collection('public_baskets').doc(rawSlug);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Basket not found' });
    }

    const data = doc.data();
    if (data.creatorUid !== req.uid && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this basket' });
    }

    await docRef.delete();
    res.json({ success: true, message: 'Basket deleted successfully' });
  } catch (err) {
    console.error('[Baskets] Delete error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete basket' });
  }
});

module.exports = router;
