'use strict';

const express = require('express');
const router = express.Router();
const { SECURE_MODE, verifyToken } = require('../lib/authMiddleware');
const watchlistStore = require('../lib/watchlistStore');
const prefsStore = require('../lib/prefsStore');
const { isConfigured, sendTelegramTest } = require('../lib/telegramNotifier');

/**
 * GET /api/health
 * System health & runtime diagnostic.
 */
router.get('/', async (req, res) => {
  let scriptCount = 0;
  try {
    const all = await Promise.race([
      watchlistStore.getAllTrackedScripts(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    scriptCount = all ? all.length : 0;
  } catch (e) {}

  const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  const runtime = isVercel ? 'vercel' : (isRender ? 'render' : 'standalone');

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    authMode: SECURE_MODE ? 'secure' : 'local',
    telegramOk: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    scriptCount,
    runtime,
    isVercel,
    isRender,
    workerActive: !isVercel && (process.env.ENABLE_BACKGROUND_WORKER === 'true' || process.env.RUN_CRON_WORKER === 'true'),
    architecture: 'Hybrid Vercel Serverless + Render Worker Engine',
  });
});

/**
 * GET /api/health/notification
 * Notification diagnostic info.
 */
router.get('/notification', async (req, res) => {
  try {
    const { UPSTASH_ENABLED, getCircuitStatus } = require('../lib/redis/redisClient');
    const redisNotifStore = require('../lib/redis/redisNotificationStore');
    const allScopeUsers = await redisNotifStore.getScopeAllUsers();
    const circuit = typeof getCircuitStatus === 'function' ? getCircuitStatus() : {};

    res.json({
      redis: {
        status: circuit.circuitOpen ? 'in-memory-fallback' : (UPSTASH_ENABLED ? 'healthy' : 'disabled'),
        circuit,
      },
      routing: {
        allScopeUsersCount: allScopeUsers.length,
      },
      notificationEngine: {
        mode: process.env.NOTIFICATION_ENGINE_MODE || 'inverted',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/health/telegram-status (and /api/telegram-status)
 */
router.get('/telegram-status', verifyToken, async (req, res) => {
  let userChatId = null;
  try {
    const prefs = await prefsStore.getPrefs(req.uid);
    userChatId = prefs.telegramChatId;
  } catch (e) {}

  res.json({
    configured: isConfigured(userChatId),
    hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
    hasChatId: !!(userChatId || process.env.TELEGRAM_CHAT_ID),
  });
});

/**
 * POST /api/health/telegram-test (and /api/telegram-test)
 */
router.post('/telegram-test', verifyToken, async (req, res) => {
  const userChatId = req.body.telegramChatId;

  if (!isConfigured(userChatId)) {
    return res.status(400).json({
      sent: false,
      reason: 'not_configured',
      message: 'TELEGRAM_BOT_TOKEN must be set globally, and Chat ID must be set in your settings.',
    });
  }
  res.json(await sendTelegramTest(userChatId));
});

/**
 * GET /api/health/broadcast
 * Public endpoint to fetch active system announcement banner.
 */
router.get('/broadcast', async (req, res) => {
  try {
    const { db } = require('../lib/firebaseAdmin');
    const docSnap = await db.collection('system_meta').doc('broadcast').get();
    if (docSnap.exists) {
      res.json({ success: true, broadcast: docSnap.data() });
    } else {
      res.json({ success: true, broadcast: { active: false } });
    }
  } catch (err) {
    res.json({ success: true, broadcast: { active: false } });
  }
});

module.exports = router;
