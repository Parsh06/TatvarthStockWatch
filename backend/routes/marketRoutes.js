'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function marketRoutes(verifyToken) {
  const { getLatestSpurt } = require('../lib/spurtStore');
  const axios = require('axios');

  // GET /api/market/volume-spurt
  // Returns the latest in-memory BSE Volume Spurt snapshot.
  // No MongoDB involved — pure real-time.
  router.get('/volume-spurt', verifyToken, (req, res) => {
    const snapshot = getLatestSpurt();

    if (!snapshot) {
      return res.status(503).json({
        error: 'Data not yet available. The server is warming up. Please try again in 60 seconds.',
      });
    }

    res.json(snapshot);
  });

  // GET /api/market/ipo-gmp
  // Fetches live IPO GMP data from mainboardgmp.com and investorgain.com, merges and paginates
  router.get('/ipo-gmp', verifyToken, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const search = (req.query.search || '').toLowerCase();
      const { fetchIpoGmpData } = require('../services/ipoService');
      const finalData = await fetchIpoGmpData(page, search);
      res.json(finalData);
    } catch (err) {
      console.error('Failed to fetch IPO GMP data:', err.message);
      res.status(500).json({ error: 'Failed to fetch IPO GMP data', details: err.message });
    }
  });

  return router;
};
