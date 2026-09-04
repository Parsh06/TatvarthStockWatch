'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const alertStore = require('../lib/alertStore');

/**
 * GET /api/alerts
 * Retrieve historical notification alerts for user.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { limit: lim } = req.query;
    const alerts = await alertStore.getAlerts(req.uid, lim ? Number(lim) : 200);
    res.json({ alerts, total: alerts.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/alerts/recent
 * Retrieve alerts fired after ?since=ISO timestamp.
 */
router.get('/recent', verifyToken, async (req, res) => {
  try {
    const all = await alertStore.getAlerts(req.uid, 100);
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const recent = isNaN(since) ? [] : all.filter((a) => new Date(a.triggeredAt).getTime() > since);
    res.json({ alerts: recent, total: recent.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/alerts/:id
 * Delete a specific alert record.
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await alertStore.deleteAlert(req.uid, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/alerts
 * Clear all alerts for user.
 */
router.delete('/', verifyToken, async (req, res) => {
  try {
    await alertStore.clearAlerts(req.uid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
