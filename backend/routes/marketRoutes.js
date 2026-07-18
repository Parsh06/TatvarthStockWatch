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
  // Fetches live IPO GMP data from mainboardgmp.com
  router.get('/ipo-gmp', verifyToken, async (req, res) => {
    try {
      const response = await axios.get('https://mainboardgmp.com/ipos-pagination.php?type=all&page=1&search=&year=', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
          'Accept': '*/*',
          'Referer': 'https://mainboardgmp.com/'
        },
        timeout: 10000 // 10 second timeout
      });
      
      // Send the entire response data to frontend
      res.json(response.data);
    } catch (err) {
      console.error('Failed to fetch IPO GMP data:', err.message);
      res.status(500).json({ error: 'Failed to fetch IPO GMP data', details: err.message });
    }
  });

  return router;
};
