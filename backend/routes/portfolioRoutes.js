'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const portfolioStore = require('../lib/portfolioStore');

/**
 * GET /api/portfolio
 * Retrieve family portfolio holdings.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const data = await portfolioStore.getPortfolio(req.uid);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

/**
 * PUT /api/portfolio
 * Save family portfolio holdings.
 */
router.put('/', verifyToken, async (req, res) => {
  const { holdings } = req.body || {};
  if (!Array.isArray(holdings)) {
    return res.status(400).json({ error: 'holdings must be an array' });
  }

  try {
    const payload = { holdings, updatedAt: new Date().toISOString() };
    await portfolioStore.savePortfolio(req.uid, payload);
    res.json({ ok: true, count: holdings.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save portfolio' });
  }
});

module.exports = router;
