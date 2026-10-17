'use strict';

/**
 * securitySanitizer.js
 *
 * Enterprise Security Middleware:
 * 1. NoSQL Injection Prevention (detects and rejects keys starting with $ or containing .)
 * 2. Prototype Pollution Prevention (rejects __proto__, constructor, prototype)
 * 3. Cross-Site Scripting (XSS) Sanitization (strips <script>, <iframe>, event handlers, javascript: pseudo-protocols)
 * 4. Path Traversal & Null Byte Protection (prevents ../ and \0 in params)
 * 5. String length bounding to prevent ReDoS and memory abuse
 */

// Characters/patterns forbidden in query/body keys (NoSQL injection & prototype pollution)
const PROTOTYPE_POLLUTION_REGEX = /^(__proto__|constructor|prototype)$/i;
const NOSQL_INJECTION_REGEX = /^\$|\./;

// Dangerous script tags, event handlers, and pseudo-protocols
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<script[\s\S]*?>/gi,
  /<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
  /<embed[\s\S]*?>/gi,
  /<base[\s\S]*?>/gi,
  /\bon\w+\s*=\s*["']?[^"'>\s]+/gi, // e.g. onerror=, onload=, onclick=
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:\s*text\/html/gi,
];

/**
 * Strips dangerous HTML, scripts, null bytes, and path traversal from string inputs
 */
function sanitizeString(str, maxLength = 2000) {
  if (typeof str !== 'string') return str;
  let cleaned = str;
  for (const pattern of XSS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Remove null bytes
  cleaned = cleaned.replace(/\0/g, '');
  // Neutralize path traversal
  cleaned = cleaned.replace(/\.\.[/\\]/g, '');
  // Trim and bound length
  return cleaned.trim().slice(0, maxLength);
}

/**
 * Recursively inspects and sanitizes objects/arrays
 * Throws an error if a malicious NoSQL operator or prototype pollution key is detected.
 */
function deepSanitize(val, depth = 0) {
  if (depth > 12) {
    const err = new Error('Payload nesting limit exceeded (potential DoS attempt)');
    err.statusCode = 400;
    err.status = 400;
    err.code = 'SECURITY_PAYLOAD_TOO_LARGE';
    throw err;
  }

  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === 'string') {
    if (val.length > 100000) {
      const err = new Error('Payload string length exceeds allowable safety limits');
      err.statusCode = 400;
      err.status = 400;
      err.code = 'SECURITY_PAYLOAD_TOO_LARGE';
      throw err;
    }
    return sanitizeString(val);
  }

  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }

  if (Array.isArray(val)) {
    if (val.length > 500) {
      const err = new Error('Array items exceed maximum allowable limit (500)');
      err.statusCode = 400;
      err.status = 400;
      err.code = 'SECURITY_PAYLOAD_TOO_LARGE';
      throw err;
    }
    return val.map(item => deepSanitize(item, depth + 1));
  }

  if (typeof val === 'object') {
    const cleanObj = {};
    for (const [key, value] of Object.entries(val)) {
      // 1. Guard against prototype pollution keys
      if (PROTOTYPE_POLLUTION_REGEX.test(key)) {
        const err = new Error(`Prototype pollution key detected: "${key}"`);
        err.statusCode = 400;
        err.status = 400;
        err.code = 'SECURITY_PROTOTYPE_POLLUTION';
        throw err;
      }

      // 2. Guard against NoSQL injection operator keys
      if (NOSQL_INJECTION_REGEX.test(key)) {
        const err = new Error(`Illegal NoSQL operator key detected: "${key}"`);
        err.statusCode = 400;
        err.status = 400;
        err.code = 'SECURITY_NOSQL_INJECTION';
        throw err;
      }

      // 3. Sanitize key string
      const sanitizedKey = key.trim().slice(0, 100);

      // 4. Recurse into value
      cleanObj[sanitizedKey] = deepSanitize(value, depth + 1);
    }
    return cleanObj;
  }

  return val;
}

/**
 * Checks URL parameters for path traversal attacks
 */
function checkParamTraversal(params) {
  if (!params || typeof params !== 'object') return;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      if (value.includes('..') || value.includes('\0') || value.includes('\\') || value.includes('%2e%2e')) {
        const err = new Error(`Path traversal attempt blocked in parameter "${key}"`);
        err.statusCode = 400;
        err.status = 400;
        err.code = 'SECURITY_VIOLATION_PATH';
        throw err;
      }
    }
  }
}

/**
 * Express middleware
 */
function securitySanitizer(req, res, next) {
  try {
    // 1. Check URL parameters for path traversal
    if (req.params) {
      checkParamTraversal(req.params);
    }

    // 2. Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = deepSanitize(req.query);
    }

    // 3. Sanitize request body (if parsed)
    if (req.body && typeof req.body === 'object') {
      req.body = deepSanitize(req.body);
    }

    if (typeof next === 'function') {
      next();
    }
  } catch (err) {
    console.warn(`[SecuritySanitizer Blocked] ip=${req.ip} path=${req.originalUrl}: ${err.message}`);
    if (res && typeof res.status === 'function') {
      return res.status(err.statusCode || err.status || 400).json({
        success: false,
        error: 'Invalid or prohibited request payload: Security policy violation',
        code: err.code || 'BAD_REQUEST',
        detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
      });
    }
    // If res mock not provided or next handler preferred, propagate error
    if (typeof next === 'function') {
      return next(err);
    }
    throw err;
  }
}

module.exports = {
  securitySanitizer,
  sanitizeString,
  deepSanitize,
};
