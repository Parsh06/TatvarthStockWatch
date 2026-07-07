'use strict';

const webpush = require('web-push');

let isInitialized = false;

function initWebPush() {
  if (isInitialized) return true;

  const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
  const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicVapidKey || !privateVapidKey) {
    console.warn('[WebPush] VAPID keys not configured, push notifications disabled');
    return false;
  }

  webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
  isInitialized = true;
  return true;
}

/**
 * Send a web push notification to a specific subscription.
 * Returns { sent: boolean, expired: boolean } so callers can clean up.
 *
 * @param {Object} subscription - the push subscription object from the browser
 * @param {Object} payload - { title, body, url, tag, ... }
 * @param {number} retries - number of retries on transient failure (default 1)
 */
async function sendWebPush(subscription, payload, retries = 1) {
  if (!initWebPush()) return { sent: false, expired: false };
  if (!subscription || !subscription.endpoint) return { sent: false, expired: false };

  // Add a notification tag for deduplication if not present
  if (!payload.tag) {
    payload.tag = `sw-${Date.now()}`;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return { sent: true, expired: false };
    } catch (err) {
      // 404 or 410 = subscription is gone (user unsubscribed or browser revoked it)
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[WebPush] Subscription expired (${err.statusCode}) — endpoint: ${subscription.endpoint.slice(0, 60)}...`);
        return { sent: false, expired: true };
      }

      // 429 = rate limited — retry after a delay
      if (err.statusCode === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s...
        console.log(`[WebPush] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Other transient errors — retry
      if (attempt < retries && err.statusCode >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[WebPush] Server error ${err.statusCode}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`[WebPush] Error sending notification (attempt ${attempt + 1}):`, err.message);
      return { sent: false, expired: false };
    }
  }

  return { sent: false, expired: false };
}

/**
 * Send a push notification to ALL devices registered for a user.
 * Automatically cleans up expired subscriptions.
 *
 * @param {string} uid - Firebase user ID
 * @param {Object} payload - { title, body, url, ... }
 * @returns {Promise<{ sent: number, failed: number, expired: number, total: number }>}
 */
async function sendWebPushToUser(uid, payload) {
  if (!initWebPush()) return { sent: 0, failed: 0, expired: 0, total: 0 };
  if (!uid) return { sent: 0, failed: 0, expired: 0, total: 0 };

  const pushStore = require('./pushStore');
  const devices = await pushStore.getAllDevices(uid);

  if (devices.length === 0) {
    return { sent: 0, failed: 0, expired: 0, total: 0 };
  }

  let sent = 0, failed = 0, expired = 0;

  await Promise.all(devices.map(async (device) => {
    if (!device.subscription) {
      failed++;
      return;
    }

    const result = await sendWebPush(device.subscription, payload);

    if (result.sent) {
      sent++;
    } else if (result.expired) {
      expired++;
      // Auto-cleanup: remove the expired device
      try {
        await pushStore.removeDevice(uid, device.deviceId);
        console.log(`[WebPush] Auto-removed expired device ${device.deviceId} for user ${uid}`);
      } catch (e) {
        console.error(`[WebPush] Failed to auto-remove device:`, e.message);
      }
    } else {
      failed++;
    }
  }));

  if (devices.length > 0) {
    console.log(`[WebPush] User ${uid}: sent=${sent} failed=${failed} expired=${expired} total=${devices.length}`);
  }

  return { sent, failed, expired, total: devices.length };
}

/**
 * Send a push notification to a specific device.
 * Automatically cleans up if the subscription is expired.
 */
async function sendWebPushToDevice(uid, deviceId, payload) {
  if (!initWebPush()) return { sent: 0, failed: 0, expired: 0, total: 0 };
  if (!uid || !deviceId) return { sent: 0, failed: 0, expired: 0, total: 0 };

  const pushStore = require('./pushStore');
  const device = await pushStore.getDevice(uid, deviceId);

  if (!device || !device.subscription) {
    return { sent: 0, failed: 1, expired: 0, total: 1 };
  }

  const result = await sendWebPush(device.subscription, payload);

  if (result.expired) {
    try {
      await pushStore.removeDevice(uid, deviceId);
      console.log(`[WebPush] Auto-removed expired device ${deviceId} for user ${uid}`);
    } catch (e) {}
    return { sent: 0, failed: 0, expired: 1, total: 1 };
  }

  return { 
    sent: result.sent ? 1 : 0, 
    failed: result.sent ? 0 : 1, 
    expired: 0, 
    total: 1 
  };
}

module.exports = {
  sendWebPush,
  sendWebPushToUser,
  sendWebPushToDevice,
};
