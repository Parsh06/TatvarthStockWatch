'use strict';

const express = require('express');
const router = express.Router();

const { getOrFetchSpurt } = require('../lib/spurtStore');
const { fetchIpoGmpData } = require('../services/ipoService');
const { getLatestOfs, fetchOfsList, fetchOfsDetail } = require('../lib/ofsScraper');

module.exports = function marketRoutes(verifyToken) {
  // GET /api/market/volume-spurt
  // Returns real-time BSE Volume Spurt data with 45-second cache and force refresh support.
  router.get('/volume-spurt', verifyToken, async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const snapshot = await getOrFetchSpurt(force);
      if (!snapshot) {
        return res.status(503).json({
          error: 'Volume spurt data is temporarily unavailable. Please try again.',
        });
      }
      res.json(snapshot);
    } catch (err) {
      console.error('Failed to fetch volume spurt:', err.message);
      res.status(500).json({ error: 'Failed to fetch volume spurt', details: err.message });
    }
  });

  // GET /api/market/ipo-gmp
  // Fetches live IPO GMP data from mainboardgmp.com and investorgain.com, merges and paginates
  router.get('/ipo-gmp', verifyToken, async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const search = (req.query.search || '').toLowerCase();
      const finalData = await fetchIpoGmpData(page, search);
      res.json(finalData);
    } catch (err) {
      console.error('Failed to fetch IPO GMP data:', err.message);
      res.status(500).json({ error: 'Failed to fetch IPO GMP data', details: err.message });
    }
  });

  // GET /api/market/ofs
  // Returns the latest in-memory OFS snapshot.
  router.get('/ofs', verifyToken, async (req, res) => {
    try {
      let snapshot = getLatestOfs();
      if (!snapshot) {
        // Fallback: fetch once if poller hasn't finished first tick
        snapshot = await fetchOfsList();
      }
      if (!snapshot) {
        return res.status(503).json({
          error: 'OFS data not yet available. The server is warming up. Please try again in 60 seconds.',
        });
      }
      res.json(snapshot);
    } catch (err) {
      console.error('Failed to fetch OFS data:', err.message);
      res.status(500).json({ error: 'Failed to fetch OFS data', details: err.message });
    }
  });

  // GET /api/market/ofs/:slug
  // Fetches cutoff price and bid book for a specific OFS
  router.get('/ofs/:slug', verifyToken, async (req, res) => {
    try {
      const { slug } = req.params;
      const detail = await fetchOfsDetail(slug);
      res.json(detail);
    } catch (err) {
      console.error(`Failed to fetch OFS detail for ${req.params.slug}:`, err.message);
      res.status(500).json({ error: 'Failed to fetch OFS detail', details: err.message });
    }
  });

  return router;
};
