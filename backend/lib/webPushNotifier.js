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
 * Send a web push notification to a specific subscription
 * @param {Object} subscription - the push subscription object from the browser
 * @param {Object} payload - { title, body, url, ... }
 */
async function sendWebPush(subscription, payload) {
  if (!initWebPush()) return false;
  if (!subscription) return false;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log('[WebPush] Subscription expired or unsubscribed');
      // In a robust system we would delete this subscription from the DB
    } else {
      console.error('[WebPush] Error sending notification:', err.message);
    }
    return false;
  }
}

module.exports = {
  sendWebPush
};
