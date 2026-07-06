'use strict';

const DEFAULT_PREFS = {
  emailEnabled:    true,
  telegramEnabled: true,
  inAppEnabled:    true,
  frequency:       'realtime',
};

async function getPrefs(uid) {
  if (!uid) return { ...DEFAULT_PREFS };
  try {
    const { db } = require('./firebaseAdmin');
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(snap.data().prefs || {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function savePrefs(uid, prefs) {
  if (!uid) return { ...DEFAULT_PREFS };
  const merged = { ...DEFAULT_PREFS, ...prefs };
  const { db } = require('./firebaseAdmin');
  await db.collection('users').doc(uid).set({ prefs: merged }, { merge: true });
  return merged;
}

module.exports = { getPrefs, savePrefs, DEFAULT_PREFS };
