'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../lib/authMiddleware');
const pushStore = require('../lib/pushStore');
const { sendWebPushToUser, sendWebPushToDevice } = require('../lib/webPushNotifier');

/**
 * GET /api/push/public-key
 * Retrieve VAPID public key for Web Push subscription.
 */
router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

/**
 * POST /api/push/subscribe
 * Register a browser push subscription for a user device.
 */
router.post('/subscribe', verifyToken, async (req, res) => {
  try {
    let subscription = req.body.subscription;
    let deviceId = req.body.deviceId;
    let platform = req.body.platform || 'unknown';
    let browser = req.body.browser || 'unknown';
    let userAgent = req.body.userAgent || '';

    if (!subscription && req.body.endpoint) {
      // Backward compatibility: old client sent subscription directly
      subscription = req.body;
      deviceId = 'legacy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      browser = 'unknown (legacy client)';
    }

    if (!subscription || !deviceId) {
      return res.status(400).json({ error: 'subscription and deviceId are required' });
    }

    await pushStore.registerDevice(req.uid, deviceId, subscription, {
      platform,
      browser,
      userAgent,
    });

    // Migrate any legacy prefs.pushSubscription if present
    await pushStore.migrateLegacySubscription(req.uid).catch(() => {});

    res.json({ success: true });
  } catch (e) {
    console.error('[Push Subscribe]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/push/unsubscribe
 * Remove a registered push subscription device.
 */
router.post('/unsubscribe', verifyToken, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    await pushStore.removeDevice(req.uid, deviceId);
    res.json({ success: true });
  } catch (e) {
    console.error('[Push Unsubscribe]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/push/test
 * Send a test push notification to user's device(s).
 */
router.post('/test', verifyToken, async (req, res) => {
  try {
    const { deviceId } = req.body || {};
    const pdfUrl = req.body?.pdfUrl || req.body?.url || null;
    const payload = {
      title: req.body?.title || 'Tatvarth Stock Watch — Test',
      body: req.body?.body || '✅ Push notifications are working! Click to view sample document.',
      pdfUrl: pdfUrl,
      url: pdfUrl || req.body?.url || 'https://tatvarthstockwatch.web.app/settings',
      tag: 'test-notification-' + Date.now(),
    };

    let result;
    if (deviceId) {
      result = await sendWebPushToDevice(req.uid, deviceId, payload);
    } else {
      result = await sendWebPushToUser(req.uid, payload);
    }

    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Push Test]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/push/devices
 * List registered push devices for user.
 */
router.get('/devices', verifyToken, async (req, res) => {
  try {
    await pushStore.migrateLegacySubscription(req.uid).catch(() => {});
    const devices = await pushStore.getAllDevices(req.uid);
    const sanitized = devices.map((d) => ({
      deviceId: d.deviceId,
      platform: d.platform,
      browser: d.browser,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
    }));
    res.json({ devices: sanitized, count: sanitized.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/push/heartbeat
 * Update last seen timestamp for a push device.
 */
router.post('/heartbeat', verifyToken, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (deviceId) {
      await pushStore.touchDevice(req.uid, deviceId);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

module.exports = router;
