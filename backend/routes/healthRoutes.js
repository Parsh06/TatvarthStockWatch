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
    const all = await watchlistStore.getAllTrackedScripts();
    scriptCount = all.length;
  } catch (e) {}

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    authMode: SECURE_MODE ? 'secure' : 'local',
    telegramOk: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    scriptCount,
  });
});

/**
 * GET /api/health/notification
 * Notification diagnostic info.
 */
router.get('/notification', async (req, res) => {
  try {
    const { UPSTASH_ENABLED } = require('../lib/redis/redisClient');
    const redisNotifStore = require('../lib/redis/redisNotificationStore');
    const allScopeUsers = await redisNotifStore.getScopeAllUsers();

    res.json({
      redis: {
        status: UPSTASH_ENABLED ? 'healthy' : 'disabled',
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

module.exports = router;
