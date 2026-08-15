'use strict';

const crypto = require('crypto');

/**
 * Middleware — attaches X-Request-ID header to incoming requests and outgoing responses
 * for request tracing and debugging without exposing private user data.
 */
function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'] || req.headers['X-Request-ID'];
  const requestId = incomingId && typeof incomingId === 'string'
    ? incomingId.trim().slice(0, 64)
    : `REQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

module.exports = {
  requestIdMiddleware,
};
