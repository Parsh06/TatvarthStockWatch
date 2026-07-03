'use strict';

require('dotenv').config();
const { fetchBSEAnnouncements } = require('../../lib/bseScraper');
const { fetchNSEAnnouncements } = require('../../lib/nseScraper');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple in-memory rate limiter: ip -> { count, windowStart }
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Check rate limit for IP.
 * @param {string} ip
 * @returns {boolean}
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/**
 * Get client IP from request.
 * @param {object} req
 * @returns {string}
 */
function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.connection && req.connection.remoteAddress) ||
    'unknown'
  );
}

/**
 * Parse announcements date for sorting.
 * @param {string} dateStr
 * @returns {number} timestamp
 */
function parseDateTs(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    res.writeHead(429, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} requests per minute.`,
      retryAfter: 60,
    }));
    return;
  }

  const {
    exchange = 'ALL',
    scripCode,
    symbol,
    fromDate,
    toDate,
  } = req.query || {};

  const upperExchange = (exchange || 'ALL').toUpperCase();
  const fetchBSE = upperExchange === 'ALL' || upperExchange === 'BSE';
  const fetchNSE = upperExchange === 'ALL' || upperExchange === 'NSE';

  if (!fetchBSE && !fetchNSE) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Bad Request',
      message: 'exchange must be one of: ALL, BSE, NSE',
    }));
    return;
  }

  try {
    const promises = [];

    if (fetchBSE) {
      promises.push(
        fetchBSEAnnouncements(scripCode, fromDate, toDate).catch((err) => {
          console.error('[API/Index] BSE fetch error:', err.message);
          return [];
        })
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    if (fetchNSE) {
      // If only a BSE scripCode was given and no NSE symbol, skip NSE filter
      promises.push(
        fetchNSEAnnouncements(symbol || null).catch((err) => {
          console.error('[API/Index] NSE fetch error:', err.message);
          return [];
        })
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    const [bseAnnouncements, nseAnnouncements] = await Promise.all(promises);

    // Merge and deduplicate by id
    const seen = new Set();
    const merged = [];
    for (const ann of [...bseAnnouncements, ...nseAnnouncements]) {
      if (!seen.has(ann.id)) {
        seen.add(ann.id);
        merged.push(ann);
      }
    }

    // Sort by date descending (newest first)
    merged.sort((a, b) => parseDateTs(b.announcementDate) - parseDateTs(a.announcementDate));

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      exchange: upperExchange,
      count: merged.length,
      bseCount: bseAnnouncements.length,
      nseCount: nseAnnouncements.length,
      params: {
        exchange: upperExchange,
        scripCode: scripCode || null,
        symbol: symbol || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      data: merged,
    }));
  } catch (error) {
    console.error('[API/Index] Error:', error.message);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
    }));
  }
};
