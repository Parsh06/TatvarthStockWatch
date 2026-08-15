'use strict';

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const { getDashboardOverview } = require('../services/dashboardService');

const { sanitizeDashboardOverview } = require('../utils/sanitizeResponse');

/**
 * GET /api/dashboard/overview
 * Aggregated market command center data — authenticated (includes private watchlist).
 */
router.get('/overview', verifyToken, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  try {
    const rawOverview = await getDashboardOverview(req.uid);
    const sanitized = sanitizeDashboardOverview(rawOverview);
    res.json(sanitized);
  } catch (err) {
    console.error('[DashboardRoute] Fatal error:', err.message);
    res.status(500).json({ success: false, error: 'Dashboard unavailable' });
  }
});

module.exports = router;
