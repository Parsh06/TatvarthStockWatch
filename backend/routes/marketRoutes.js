'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function marketRoutes(verifyToken) {
  const { getLatestSpurt } = require('../lib/spurtStore');

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

  return router;
};
