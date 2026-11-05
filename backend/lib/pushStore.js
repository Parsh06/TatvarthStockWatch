'use strict';

/**
 * pushStore.js — Multi-device push subscription manager.
 *
 * Stores each device's push subscription as a separate document in the
 * Firestore subcollection:  users/{uid}/pushDevices/{deviceId}
 *
 * This allows a single user to receive notifications on every logged-in
 * device (desktop, mobile browser, installed PWA, tablet, etc.).
 */

function getDb() {
  const { db } = require('./firebaseAdmin');
  return db;
}

/**
 * Register (upsert) a device's push subscription.
 * Called when the user enables notifications on a device.
 *
 * @param {string} uid        - Firebase user ID
 * @param {string} deviceId   - Stable per-device ID (generated client-side, stored in localStorage)
 * @param {object} subscription - The PushSubscription JSON from the browser
 * @param {object} deviceInfo  - { platform, browser, userAgent }
 */
async function registerDevice(uid, deviceId, subscription, deviceInfo = {}) {
  if (!uid || !deviceId || !subscription || !subscription.endpoint) {
    console.warn('[PushStore] registerDevice called with missing params');
    return false;
  }

  const db = getDb();
  const devicesCol = db.collection('users').doc(uid).collection('pushDevices');
  const now = new Date().toISOString();

  // 1. Clean up any existing devices for this user that share the EXACT same endpoint
  try {
    const duplicateSnap = await devicesCol
      .where('subscription.endpoint', '==', subscription.endpoint)
      .get();
    
    if (!duplicateSnap.empty) {
      const batch = db.batch();
      duplicateSnap.docs.forEach((doc) => {
        if (doc.id !== deviceId) {
          batch.delete(doc.ref);
          console.log(`[PushStore] Pruned duplicate endpoint doc ${doc.id} for user ${uid}`);
        }
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[PushStore] Duplicate endpoint check warning:', err.message);
  }

  // 2. Upsert the current device
  const ref = devicesCol.doc(deviceId);
  await ref.set({
    subscription,
    platform:  deviceInfo.platform  || 'unknown',
    browser:   deviceInfo.browser   || 'unknown',
    userAgent: deviceInfo.userAgent  || '',
    createdAt: now,
    lastSeenAt: now,
  }, { merge: true });

  await ref.update({ lastSeenAt: now });

  // 3. Keep at most 3 newest active devices per user (prune stale devices)
  try {
    const allSnap = await devicesCol.get();
    if (allSnap.size > 3) {
      const docs = allSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
      docs.sort((a, b) => new Date(b.lastSeenAt || b.createdAt || 0) - new Date(a.lastSeenAt || a.createdAt || 0));
      const batch = db.batch();
      // Keep first 3, delete the rest
      docs.slice(3).forEach(d => {
        batch.delete(d.ref);
        console.log(`[PushStore] Auto-pruned stale excess device ${d.id} for user ${uid}`);
      });
      await batch.commit();
    }
  } catch (pruneErr) {
    console.warn('[PushStore] Device pruning warning:', pruneErr.message);
  }

  console.log(`[PushStore] Registered device ${deviceId} for user ${uid} (${deviceInfo.platform}/${deviceInfo.browser})`);
  return true;
}

/**
 * Remove a specific device by its deviceId.
 * Called on logout or when the user disables notifications.
 *
 * @param {string} uid
 * @param {string} deviceId
 */
async function removeDevice(uid, deviceId) {
  if (!uid || !deviceId) return false;

  const db = getDb();
  try {
    await db.collection('users').doc(uid).collection('pushDevices').doc(deviceId).delete();
    console.log(`[PushStore] Removed device ${deviceId} for user ${uid}`);
    return true;
  } catch (e) {
    console.error(`[PushStore] Failed to remove device ${deviceId}:`, e.message);
    return false;
  }
}

/**
 * Remove a device by its push endpoint URL.
 * Used when the push service returns 410 Gone (subscription expired).
 *
 * @param {string} uid
 * @param {string} endpoint - The push subscription endpoint URL
 */
async function removeDeviceByEndpoint(uid, endpoint) {
  if (!uid || !endpoint) return false;

  const db = getDb();
  try {
    const snap = await db.collection('users').doc(uid).collection('pushDevices')
      .where('subscription.endpoint', '==', endpoint)
      .get();

    if (snap.empty) return false;

    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`[PushStore] Removed ${snap.size} device(s) by endpoint for user ${uid}`);
    return true;
  } catch (e) {
    console.error(`[PushStore] Failed to remove by endpoint:`, e.message);
    return false;
  }
}

/**
 * Get all registered push devices for a user.
 *
 * @param {string} uid
 * @returns {Promise<Array<{ deviceId, subscription, platform, browser, createdAt, lastSeenAt }>>}
 */
async function getAllDevices(uid) {
  if (!uid) return [];

  const db = getDb();
  try {
    const snap = await db.collection('users').doc(uid).collection('pushDevices').get();
    const rawDevices = snap.docs.map(doc => ({
      deviceId: doc.id,
      ...doc.data(),
    }));

    // Deduplicate on subscription.endpoint and keep the most recently active device
    rawDevices.sort((a, b) => new Date(b.lastSeenAt || b.createdAt || 0) - new Date(a.lastSeenAt || a.createdAt || 0));

    const seenEndpoints = new Set();
    const uniqueDevices = [];
    for (const d of rawDevices) {
      const ep = d.subscription?.endpoint;
      if (ep && !seenEndpoints.has(ep)) {
        seenEndpoints.add(ep);
        uniqueDevices.push(d);
      }
    }

    return uniqueDevices;
  } catch (e) {
    console.error(`[PushStore] Failed to get devices for ${uid}:`, e.message);
    return [];
  }
}

/**
 * Get the count of registered devices for a user.
 *
 * @param {string} uid
 * @returns {Promise<number>}
 */
async function getDeviceCount(uid) {
  if (!uid) return 0;

  const db = getDb();
  try {
    const snap = await db.collection('users').doc(uid).collection('pushDevices').get();
    return snap.size;
  } catch {
    return 0;
  }
}

/**
 * Remove devices that haven't been seen in the last `maxAgeDays` days.
 * Should be called periodically (e.g., from the cron job).
 *
 * @param {string} uid
 * @param {number} maxAgeDays - default 60 days
 */
async function removeStaleDevices(uid, maxAgeDays = 60) {
  if (!uid) return 0;

  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const snap = await db.collection('users').doc(uid).collection('pushDevices')
      .where('lastSeenAt', '<', cutoff)
      .get();

    if (snap.empty) return 0;

    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`[PushStore] Cleaned up ${snap.size} stale device(s) for user ${uid}`);
    return snap.size;
  } catch (e) {
    console.error(`[PushStore] Failed to clean stale devices:`, e.message);
    return 0;
  }
}

/**
 * Migrate legacy prefs.pushSubscription to pushDevices subcollection.
 * Called once per user when they visit the site after the upgrade.
 *
 * @param {string} uid
 */
async function migrateLegacySubscription(uid) {
  if (!uid) return false;

  const db = getDb();
  const userRef = db.collection('users').doc(uid);

  try {
    const snap = await userRef.get();
    if (!snap.exists) return false;

    const prefs = snap.data()?.prefs;
    if (!prefs?.pushSubscription) return false;

    // Generate a device ID for the legacy subscription
    const legacyDeviceId = 'legacy_' + Date.now().toString(36);

    await registerDevice(uid, legacyDeviceId, prefs.pushSubscription, {
      platform: 'unknown',
      browser: 'unknown (migrated)',
      userAgent: 'migrated from legacy prefs.pushSubscription',
    });

    // Remove the old field
    const { admin } = require('./firebaseAdmin');
    await userRef.update({
      'prefs.pushSubscription': admin.firestore.FieldValue.delete(),
    });

    console.log(`[PushStore] Migrated legacy subscription for user ${uid}`);
    return true;
  } catch (e) {
    console.error(`[PushStore] Migration failed for ${uid}:`, e.message);
    return false;
  }
}

/**
 * Touch the lastSeenAt timestamp for a device (called on each app visit).
 *
 * @param {string} uid
 * @param {string} deviceId
 */
async function touchDevice(uid, deviceId) {
  if (!uid || !deviceId) return;

  const db = getDb();
  try {
    const ref = db.collection('users').doc(uid).collection('pushDevices').doc(deviceId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({ lastSeenAt: new Date().toISOString() });
    }
  } catch (e) {
    // Silently fail — this is a best-effort operation
  }
}

/**
 * Get a specific device by its deviceId.
 */
async function getDevice(uid, deviceId) {
  if (!uid || !deviceId) return null;
  const db = getDb();
  try {
    const snap = await db.collection('users').doc(uid).collection('pushDevices').doc(deviceId).get();
    if (!snap.exists) return null;
    return { deviceId: snap.id, ...snap.data() };
  } catch (e) {
    return null;
  }
}

module.exports = {
  registerDevice,
  removeDevice,
  removeDeviceByEndpoint,
  getAllDevices,
  getDeviceCount,
  getDevice,
  removeStaleDevices,
  migrateLegacySubscription,
  touchDevice,
};
