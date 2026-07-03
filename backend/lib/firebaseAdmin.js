'use strict';

require('dotenv').config();
const admin = require('firebase-admin');

let db = null;
let initialized = false;

function initializeFirebase() {
  if (initialized) return;

  try {
    let credential;

    // Option A: full service account JSON as one env var (easiest for Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (e) {
        throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}`);
      }
      credential = admin.credential.cert(serviceAccount);

    // Option B: individual env vars
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    } else {
      throw new Error(
        'Firebase credentials not set. Provide either FIREBASE_SERVICE_ACCOUNT_JSON ' +
        'or all three of FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
      );
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({ credential });
    }

    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    initialized = true;
    console.log('[Firebase] Admin SDK initialized');
  } catch (error) {
    console.error('[Firebase] Init failed:', error.message);
    throw error;
  }
}

try {
  initializeFirebase();
} catch {
  // deferred — will retry on first use
}

module.exports = {
  get db() {
    if (!db) initializeFirebase();
    return db;
  },
  get admin() {
    return admin;
  },
};
