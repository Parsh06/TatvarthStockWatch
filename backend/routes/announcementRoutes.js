'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const { getAnnouncements, saveAnnouncements } = require('../lib/announcementStore');
const { getWatchlist } = require('../lib/watchlistStore');
const { getDb } = require('../lib/mongoClient');
const { fetchAllNSEAnnouncements } = require('../lib/nseScraper');

/**
 * GET /api/announcements
 * Retrieve market announcements with optional query filters.
 * Automatically fetches and populates from BSE/NSE if DB is empty for today or on refresh.
 */
router.get('/', async (req, res) => {
  const { exchange, scriptCode, nseSymbol, limit: lim, since, refresh } = req.query;
  try {
    let list = await getAnnouncements({
      exchange,
      scriptCode,
      nseSymbol,
      limitCount: lim,
      sinceDate: since,
    });

    // If MongoDB is empty or explicit refresh requested, poll live BSE + NSE
    const shouldLiveFetch = (list.length === 0 && !since && !scriptCode && !nseSymbol) || refresh === 'true' || refresh === '1';

    if (shouldLiveFetch) {
      try {
        const { fetchAllBSEAnnouncements } = require('../lib/bseScraper');
        const { fetchAllNSEAnnouncements } = require('../lib/nseScraper');

        const [bseAll, nseAll] = await Promise.all([
          fetchAllBSEAnnouncements().catch((err) => {
            console.warn('[Announcements Route] BSE fetch error:', err.message);
            return [];
          }),
          fetchAllNSEAnnouncements(new Map()).catch((err) => {
            console.warn('[Announcements Route] NSE fetch error:', err.message);
            return [];
          }),
        ]);

        const seenIds = new Set();
        const allFetched = [];
        for (const a of [...bseAll, ...nseAll]) {
          const id = String(a.id);
          if (!seenIds.has(id)) {
            seenIds.add(id);
            allFetched.push(a);
          }
        }

        if (allFetched.length > 0) {
          await saveAnnouncements(allFetched);
          list = await getAnnouncements({
            exchange,
            scriptCode,
            nseSymbol,
            limitCount: lim,
            sinceDate: since,
          });
        }
      } catch (liveErr) {
        console.warn('[Announcements Route] Live fetch fallback error:', liveErr.message);
      }
    }

    res.json({ data: list, total: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/announcements/my-count
 * Count new announcements for the user's watchlist since a given date.
 */
router.get('/my-count', verifyToken, async (req, res) => {
  try {
    const since = req.query.since;
    if (!since) return res.json({ total: 0 });

    const watchlist = await getWatchlist(req.uid);
    if (!watchlist || !watchlist.length) return res.json({ total: 0 });

    const codes = new Set();
    const symbols = new Set();

    watchlist.forEach((s) => {
      const bse = s.ltdCode || s.bseCode;
      const nse = s.nseSymbol || s.symbol;
      if (bse) codes.add(String(bse).trim());
      if (nse) symbols.add(String(nse).trim().toUpperCase());
    });

    const $or = [];
    if (codes.size > 0) $or.push({ scriptCode: { $in: Array.from(codes) } });
    if (symbols.size > 0) $or.push({ nseSymbol: { $in: Array.from(symbols) } });

    if ($or.length === 0) return res.json({ total: 0 });

    const db = await getDb();
    const count = await db.collection('announcements').countDocuments({
      announcementDate: { $gt: since },
      $or,
    });

    res.json({ total: count });
  } catch (e) {
    console.error('my-count error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/announcements/stats
 * Announcement counts summary.
 */
router.get('/stats', async (req, res) => {
  try {
    const mongoDb = await getDb();
    const col = mongoDb.collection('announcements');
    const [total, bseCount, nseCount] = await Promise.all([
      col.countDocuments(),
      col.countDocuments({ exchange: 'BSE' }),
      col.countDocuments({ exchange: 'NSE' }),
    ]);
    res.json({ total, bse: bseCount, nse: nseCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/announcements/fetch-nse
 * Trigger live NSE announcement scrape and save to DB.
 */
router.post('/fetch-nse', verifyToken, async (req, res) => {
  try {
    const nseAll = await fetchAllNSEAnnouncements(new Map());
    if (nseAll.length > 0) {
      const result = await saveAnnouncements(nseAll);
      console.log(`[FetchNSE] Saved ${result.saved} new NSE announcements`);
      res.json({ fetched: nseAll.length, saved: result.saved });
    } else {
      res.json({ fetched: 0, saved: 0 });
    }
  } catch (e) {
    console.error('[FetchNSE] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
