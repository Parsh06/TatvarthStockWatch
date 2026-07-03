'use strict';

// Firebase Admin credentials present = production secure mode.
// Without them (local dev) every request is treated as the local demo user.
const SECURE_MODE = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL)
);

/**
 * Express middleware — verifies a Firebase ID token from the Authorization header.
 * In local mode (no Firebase creds) it short-circuits and sets req.uid = 'local'.
 *
 * Usage:
 *   app.get('/api/protected', verifyToken, handler)
 */
async function verifyToken(req, res, next) {
  if (!SECURE_MODE) {
    req.uid = 'local';
    return next();
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  try {
    const { admin } = require('./firebaseAdmin');
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    console.error('[Auth] Token verification failed:', e.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyToken, SECURE_MODE };
