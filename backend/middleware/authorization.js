'use strict';

/**
 * authorization.js
 * Helpers for resource ownership validation and access control.
 */

/**
 * Ensures user is authenticated.
 */
function requireAuth(req, res, next) {
  if (!req.user || !req.user.uid) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHORIZED'
    });
  }
  next();
}

/**
 * Enforces ownership check against a resource owner UID.
 * Rejects with 403 Forbidden if req.user.uid !== ownerUid.
 */
function checkOwnership(req, ownerUid) {
  if (!req.user || !req.user.uid) return false;
  if (!ownerUid) return false;
  return String(req.user.uid) === String(ownerUid);
}

/**
 * Middleware wrapper to enforce ownership on requests where owner ID is available in params/query.
 */
function requireOwnership(getOwnerIdFn) {
  return (req, res, next) => {
    const ownerUid = typeof getOwnerIdFn === 'function' ? getOwnerIdFn(req) : null;
    if (!checkOwnership(req, ownerUid)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not own this resource',
        code: 'FORBIDDEN'
      });
    }
    next();
  };
}

/**
 * Strips client-supplied userId / uid query or body params so backend code cannot accidentally
 * trust req.body.userId or req.query.userId over req.user.uid.
 */
function stripClientUserParams(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    delete req.body.userId;
    delete req.body.uid;
    delete req.body.firebaseUid;
  }
  if (req.query && typeof req.query === 'object') {
    delete req.query.userId;
    delete req.query.uid;
    delete req.query.firebaseUid;
  }
  next();
}

module.exports = {
  requireAuth,
  checkOwnership,
  requireOwnership,
  stripClientUserParams,
};
