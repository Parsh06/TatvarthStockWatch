'use strict';

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const { getDashboardOverview } = require('../services/dashboardService');

/**
 * GET /api/dashboard/overview
 * Aggregated market command center data — authenticated (includes private watchlist).
 */
router.get('/overview', verifyToken, async (req, res) => {
  try {
    const overview = await getDashboardOverview(req.uid);
    res.json(overview);
  } catch (err) {
    console.error('[DashboardRoute] Fatal error:', err.message);
    res.status(500).json({ success: false, error: 'Dashboard unavailable' });
  }
});

module.exports = router;
