'use strict';

/**
 * basketRoutes.js
 *
 * Shareable Curated Watchlist Baskets (Public Links & Viral Growth Engine)
 *
 * Endpoints:
 *   GET    /api/baskets/user/my         — Authed: Get all baskets created by the current user
 *   POST   /api/baskets/share-watchlist — Authed: 1-Tap share active watchlist
 *   POST   /api/baskets                 — Authed: Create / publish a curated basket
 *   GET    /api/baskets/:slug           — Public: View basket with live quotes & announcements
 *   POST   /api/baskets/:slug/import    — Authed: 1-Tap import basket into caller's watchlist
 *   DELETE /api/baskets/:slug           — Authed: Delete basket owned by caller or admin
 */

const express = require('express');
const router = express.Router();
const { db, admin } = require('../lib/firebaseAdmin');
const { getDb } = require('../lib/mongoClient');
const watchlistStore = require('../lib/watchlistStore');
const { verifyToken } = require('../lib/authMiddleware');
const { canCreateBasket, canAddToWatchlist } = require('../lib/planLimits');

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

/**
 * Robust basket lookup helper: checks direct document ID then queries 'slug' field
 */
async function findBasketDoc(rawSlug) {
  if (!rawSlug) return null;
  const slug = String(rawSlug).trim().toLowerCase();

  const directDoc = await db.collection('public_baskets').doc(slug).get();
  if (directDoc.exists) return directDoc;

  const querySnap = await db.collection('public_baskets').where('slug', '==', slug).limit(1).get();
  if (!querySnap.empty) return querySnap.docs[0];

  return null;
}

// ── GET /api/baskets/user/my (Must precede /:slug to avoid route collision) ─────
router.get('/user/my', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('public_baskets')
      .where('creatorUid', '==', req.uid)
      .get();

    const baskets = snap.docs.map(doc => {
      const data = doc.data();
      const scripts = Array.isArray(data.scripts) ? data.scripts : [];
      return {
        id: doc.id,
        slug: data.slug || doc.id,
        title: data.title || 'Untitled Basket',
        description: data.description || '',
        category: data.category || 'General',
        tags: data.tags || [],
        scriptsCount: scripts.length,
        viewsCount: data.viewsCount || 0,
        importsCount: data.importsCount || 0,
        shareUrl: `https://tatvarthstockwatch.web.app/basket/${data.slug || doc.id}`,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      };
    });

    // Sort by createdAt descending
    baskets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ success: true, baskets, count: baskets.length });
  } catch (err) {
    console.error('[Baskets] Get my baskets error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load your baskets' });
  }
});

// ── POST /api/baskets/share-watchlist (1-Tap Fast Share Active Watchlist) ──────
router.post('/share-watchlist', verifyToken, async (req, res) => {
  try {
    const watchlist = await watchlistStore.getWatchlist(req.uid);
    if (!watchlist || watchlist.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Your watchlist is currently empty. Add at least 1 stock before sharing!',
      });
    }

    // Check user plan basket limits
    const existingSnap = await db.collection('public_baskets').where('creatorUid', '==', req.uid).get();
    const currentBasketCount = existingSnap.size;

    const basketCheck = await canCreateBasket(req.uid, currentBasketCount);
    if (!basketCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: `Basket creation limit reached (${currentBasketCount}/${basketCheck.maxAllowed} baskets on ${basketCheck.plan.toUpperCase()} plan). Upgrade to Pro for 10 baskets or Premium for unlimited shareable baskets.`,
        code: 'PLAN_LIMIT_REACHED',
        feature: 'baskets',
        plan: basketCheck.plan,
        current: currentBasketCount,
        maxAllowed: basketCheck.maxAllowed,
      });
    }

    // Get Creator display identity
    let creatorName = 'StockWatch Investor';
    try {
      const userRecord = await admin.auth().getUser(req.uid);
      creatorName = userRecord.displayName || (userRecord.email ? userRecord.email.split('@')[0] : 'Investor');
    } catch {}

    const customTitle = String(req.body.title || '').trim();
    const title = customTitle || `${creatorName}'s High-Conviction Watchlist`;
    const description = String(req.body.description || '').trim() || 'Curated watchlist tracking corporate announcements, quarterly results, and volume spurts on StockWatch.';
    const category = String(req.body.category || 'Curated').trim();

    // Map watchlist to validated scripts format
    const scripts = watchlist.map(s => ({
      bseCode: String(s.ltdCode || s.bseCode || '').trim(),
      ltdCode: String(s.ltdCode || s.bseCode || '').trim(),
      symbol: String(s.symbol || s.nseSymbol || '').trim().toUpperCase(),
      scriptName: String(s.scriptName || s.name || s.symbol || s.ltdCode).trim(),
      exchange: s.exchange || 'BOTH',
      notes: s.notes || '',
    })).filter(s => s.bseCode || s.symbol);

    let baseSlug = slugify(req.body.slug || title);
    if (!baseSlug) baseSlug = `watchlist-${req.uid.slice(0, 6)}`;

    let finalSlug = baseSlug;
    const existingDoc = await db.collection('public_baskets').doc(finalSlug).get();
    if (existingDoc.exists && existingDoc.data()?.creatorUid !== req.uid) {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      finalSlug = `${baseSlug}-${randomSuffix}`;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const basketPayload = {
      slug: finalSlug,
      title: title.slice(0, 80),
      description: description.slice(0, 400),
      category: category.slice(0, 30),
      tags: ['watchlist', 'curated'],
      creatorUid: req.uid,
      creatorName,
      scripts,
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
    console.error('[Baskets] POST /share-watchlist error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to share watchlist' });
  }
});

// ── POST /api/baskets (Authenticated Basket Creation) ─────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { validateBasketInput } = require('../utils/validators');
    const validation = validateBasketInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || (validation.errors && validation.errors[0]) || 'Invalid basket data',
        errors: validation.errors || [validation.error],
      });
    }

    const { title, description, category, slug: userSlug, scripts: sanitizedScripts, tags } = validation.data;

    // Check user plan basket creation limit
    const existingSnap = await db.collection('public_baskets').where('creatorUid', '==', req.uid).get();
    const currentBasketCount = existingSnap.size;

    const basketCheck = await canCreateBasket(req.uid, currentBasketCount);
    if (!basketCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: `Basket creation limit reached (${currentBasketCount}/${basketCheck.maxAllowed} baskets on ${basketCheck.plan.toUpperCase()} plan). Upgrade to Pro for 10 baskets or Premium for unlimited shareable baskets.`,
        code: 'PLAN_LIMIT_REACHED',
        feature: 'baskets',
        plan: basketCheck.plan,
        current: currentBasketCount,
        maxAllowed: basketCheck.maxAllowed,
      });
    }

    // Generate unique slug
    let baseSlug = slugify(userSlug || title);
    if (!baseSlug) baseSlug = 'curated-basket';

    let finalSlug = baseSlug;
    const existingDoc = await db.collection('public_baskets').doc(finalSlug).get();
    if (existingDoc.exists && existingDoc.data()?.creatorUid !== req.uid) {
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
      description: String(description || '').trim().slice(0, 400),
      category: String(category || 'General').trim().slice(0, 30),
      tags: Array.isArray(tags) ? tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 6) : [],
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
    res.status(500).json({ success: false, error: err.message || 'Failed to create shareable basket' });
  }
});

// ── GET /api/baskets/:slug (PUBLIC — No Auth Barrier) ─────────────────────────
router.get('/:slug', async (req, res) => {
  const rawSlug = String(req.params.slug || '').trim().toLowerCase();
  if (!rawSlug) {
    return res.status(400).json({ success: false, error: 'Basket slug is required' });
  }

  try {
    const basketDoc = await findBasketDoc(rawSlug);
    if (!basketDoc || !basketDoc.exists) {
      return res.status(404).json({ success: false, error: 'Basket not found' });
    }

    const basketData = basketDoc.data();

    // Increment view count asynchronously (non-blocking)
    basketDoc.ref.update({
      viewsCount: admin.firestore.FieldValue.increment(1),
      lastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    // Fetch recent announcements for stocks inside this basket from MongoDB
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
        createdAt: basketData.createdAt?.toDate ? basketData.createdAt.toDate().toISOString() : basketData.createdAt,
      }
    });

  } catch (err) {
    console.error('[Baskets] GET /:slug error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load basket' });
  }
});

// ── POST /api/baskets/:slug/import (1-Tap Watchlist Import with Plan Protection)
router.post('/:slug/import', verifyToken, async (req, res) => {
  const rawSlug = String(req.params.slug || '').trim().toLowerCase();
  try {
    const basketDoc = await findBasketDoc(rawSlug);
    if (!basketDoc || !basketDoc.exists) {
      return res.status(404).json({ success: false, error: 'Basket not found' });
    }

    const data = basketDoc.data();
    const scripts = Array.isArray(data.scripts) ? data.scripts : [];

    if (scripts.length === 0) {
      return res.json({
        success: true,
        basketTitle: data.title,
        totalScripts: 0,
        addedCount: 0,
        skippedCount: 0,
        alreadyInWatchlistCount: 0,
      });
    }

    // Fetch caller's existing watchlist to dedup
    const existingWatchlist = await watchlistStore.getWatchlist(req.uid);
    const existingKeys = new Set();
    for (const item of existingWatchlist) {
      if (item.ltdCode) existingKeys.add(String(item.ltdCode).trim());
      if (item.bseCode) existingKeys.add(String(item.bseCode).trim());
      if (item.symbol) existingKeys.add(String(item.symbol).trim().toUpperCase());
      if (item.nseSymbol) existingKeys.add(String(item.nseSymbol).trim().toUpperCase());
    }

    // Check user plan limits
    const planCheck = await canAddToWatchlist(req.uid, existingWatchlist.length);
    const maxAllowed = planCheck.maxAllowed;
    const availableSlots = maxAllowed === Infinity ? Infinity : Math.max(0, maxAllowed - existingWatchlist.length);

    if (availableSlots <= 0) {
      return res.status(403).json({
        success: false,
        error: `Watchlist capacity reached (${existingWatchlist.length}/${maxAllowed} scripts on ${planCheck.plan.toUpperCase()} plan). Upgrade to Pro for 50 scripts or Premium for unlimited.`,
        code: 'PLAN_LIMIT_REACHED',
        feature: 'watchlist',
        plan: planCheck.plan,
        current: existingWatchlist.length,
        maxAllowed,
      });
    }

    let addedCount = 0;
    let skippedCount = 0;
    let alreadyInWatchlistCount = 0;
    let planCapped = false;

    for (const s of scripts) {
      const code = String(s.bseCode || s.ltdCode || '').trim();
      const sym = String(s.symbol || s.nseSymbol || '').trim().toUpperCase();

      if ((code && existingKeys.has(code)) || (sym && existingKeys.has(sym))) {
        alreadyInWatchlistCount++;
        continue;
      }

      // Check slot availability
      if (addedCount >= availableSlots) {
        planCapped = true;
        skippedCount++;
        continue;
      }

      await watchlistStore.addScript(req.uid, {
        ltdCode: code,
        bseCode: code,
        symbol: sym,
        scriptName: s.scriptName || sym || code,
        exchange: s.exchange || 'BOTH',
        notes: s.notes ? `[${data.title}] ${s.notes}` : `Imported from basket: ${data.title}`,
      });

      if (code) existingKeys.add(code);
      if (sym) existingKeys.add(sym);
      addedCount++;
    }

    // Invalidate local watchlist cache so subsequent queries see new items
    watchlistStore.invalidateWatchlistCache();

    // Increment basket importsCount
    basketDoc.ref.update({
      importsCount: admin.firestore.FieldValue.increment(1),
      lastImportedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    res.json({
      success: true,
      basketTitle: data.title,
      totalScripts: scripts.length,
      addedCount,
      skippedCount,
      alreadyInWatchlistCount,
      planCapped,
      maxAllowed,
      plan: planCheck.plan,
    });

  } catch (err) {
    console.error('[Baskets] Import error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to import basket to watchlist' });
  }
});

// ── DELETE /api/baskets/:slug (Owner or Admin Delete) ──────────────────────────
router.delete('/:slug', verifyToken, async (req, res) => {
  const rawSlug = String(req.params.slug || '').trim().toLowerCase();
  try {
    const basketDoc = await findBasketDoc(rawSlug);
    if (!basketDoc || !basketDoc.exists) {
      return res.status(404).json({ success: false, error: 'Basket not found' });
    }

    const data = basketDoc.data();
    if (data.creatorUid !== req.uid && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this basket' });
    }

    await basketDoc.ref.delete();
    res.json({ success: true, message: 'Basket deleted successfully' });
  } catch (err) {
    console.error('[Baskets] Delete error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete basket' });
  }
});

module.exports = router;
