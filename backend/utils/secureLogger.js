'use strict';

/**
 * secureLogger.js
 * Redacts sensitive fields (PAN, application numbers, API keys, tokens, DB URIs) from logs.
 */

const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi;
const APP_NO_REGEX = /\b(application|appNo|applNo)[:=]\s*([a-zA-Z0-9]+)\b/gi;
const TOKEN_REGEX = /Bearer\s+([a-zA-Z0-9._-]+)/gi;
const MONGO_URI_REGEX = /mongodb(\+srv)?:\/\/[^\s]+/gi;

function maskPanString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(PAN_REGEX, (match) => {
    return match.substring(0, 2) + 'XXXX' + match.substring(6);
  });
}

function sanitizeLogMessage(msg) {
  if (typeof msg !== 'string') {
    try {
      msg = JSON.stringify(msg);
    } catch {
      msg = String(msg);
    }
  }
  return msg
    .replace(PAN_REGEX, (m) => m.substring(0, 2) + 'XXXX' + m.substring(6))
    .replace(TOKEN_REGEX, 'Bearer [REDACTED]')
    .replace(MONGO_URI_REGEX, 'mongodb://[REDACTED]')
    .replace(APP_NO_REGEX, '$1: [REDACTED]');
}

const secureLogger = {
  info: (msg, ...args) => {
    const cleanMsg = sanitizeLogMessage(msg);
    const cleanArgs = args.map(a => typeof a === 'string' ? sanitizeLogMessage(a) : a);
    console.log(`[INFO]`, cleanMsg, ...cleanArgs);
  },
  warn: (msg, ...args) => {
    const cleanMsg = sanitizeLogMessage(msg);
    const cleanArgs = args.map(a => typeof a === 'string' ? sanitizeLogMessage(a) : a);
    console.warn(`[WARN]`, cleanMsg, ...cleanArgs);
  },
  error: (msg, ...args) => {
    const cleanMsg = sanitizeLogMessage(msg);
    const cleanArgs = args.map(a => typeof a === 'string' ? sanitizeLogMessage(a) : a);
    console.error(`[ERROR]`, cleanMsg, ...cleanArgs);
  },
  maskPan: maskPanString,
};

module.exports = secureLogger;
