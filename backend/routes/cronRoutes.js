'use strict';

const express = require('express');
const router = express.Router();
const { runGlobalCronTick, runManualIpoClosingTick } = require('../services/cronService');

function verifyCronSecret(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const secret = req.query.secret || authHeader.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * ALL /api/cron/trigger
 * Global cronjob trigger (every 5 minutes via cron-job.org or Vercel cron).
 */
router.all('/trigger', verifyCronSecret, async (req, res) => {
  try {
    const result = await runGlobalCronTick();
    res.json(result);
  } catch (err) {
    console.error('[CronRoute /trigger] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ALL /api/cron/ipo-closing
 * Manual trigger for testing IPO closing queue ticks.
 */
router.all('/ipo-closing', verifyCronSecret, async (req, res) => {
  const t0 = Date.now();
  try {
    const stats = await runManualIpoClosingTick(true);
    res.json({ success: true, durationMs: Date.now() - t0, tick: stats });
  } catch (err) {
    console.error('[CronRoute /ipo-closing] Error:', err);
    res.status(500).json({ error: err.message, durationMs: Date.now() - t0 });
  }
});

module.exports = router;
