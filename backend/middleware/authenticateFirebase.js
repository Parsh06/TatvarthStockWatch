'use strict';

const { admin } = require('../lib/firebaseAdmin');

// Firebase Admin credentials present = production secure mode.
// Without them (local dev) requests are assigned the local demo user.
const SECURE_MODE = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL)
);

/**
 * Express middleware — verifies a Firebase ID token from the Authorization header.
 * Attaches verified req.user = { uid, email, emailVerified } and req.uid.
 *
 * Usage:
 *   app.get('/api/protected', verifyToken, handler)
 */
async function verifyToken(req, res, next) {
  if (!SECURE_MODE) {
    req.uid = 'local';
    req.user = {
      uid: 'local',
      email: 'local@stockwatch.dev',
      emailVerified: true,
    };
    return next();
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header with Bearer token is required',
      code: 'UNAUTHORIZED'
    });
  }

  try {
    // Passing true as second argument checks token revocation and user disabled status
    const decoded = await admin.auth().verifyIdToken(token, true);
    req.uid = decoded.uid;
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: !!decoded.email_verified,
    };
    next();
  } catch (e) {
    const isRevokedOrDisabled = 
      e.code === 'auth/id-token-revoked' || 
      e.code === 'auth/user-disabled' ||
      (typeof e.message === 'string' && (e.message.toLowerCase().includes('revoked') || e.message.toLowerCase().includes('disabled')));

    if (isRevokedOrDisabled) {
      return res.status(403).json({
        success: false,
        error: 'Your account has been disabled or session has been revoked. Please contact administrator.',
        code: 'ACCOUNT_DISABLED',
        disabled: true
      });
    }
    console.error('[Auth] Token verification failed:', e.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token',
      code: 'INVALID_TOKEN'
    });
  }
}

module.exports = {
  verifyToken,
  SECURE_MODE,
};
