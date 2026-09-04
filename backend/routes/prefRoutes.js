'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const prefsStore = require('../lib/prefsStore');

/**
 * GET /api/prefs
 * Get user preferences.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const prefs = await prefsStore.getPrefs(req.uid);
    res.json(prefs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/prefs
 * Save user preferences.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const saved = await prefsStore.savePrefs(req.uid, req.body);
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/prefs
 * Partially update user preferences.
 */
router.patch('/', verifyToken, async (req, res) => {
  try {
    const existing = await prefsStore.getPrefs(req.uid);
    const updated = await prefsStore.savePrefs(req.uid, { ...existing, ...req.body });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
