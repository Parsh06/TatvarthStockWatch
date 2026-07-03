'use strict';

/**
 * GET /api/announcements/saved
 *
 * Reads the global `announcements` Firestore collection — the
 * persistent store built up by the cron job. Returns the most
 * recent N announcements, optionally filtered.
 *
 * Query params:
 *   exchange    BSE | NSE | ALL   (default ALL)
 *   scripCode   string            filter by BSE code
 *   limit       number            max results (default 100, max 500)
 */

require('dotenv').config();
const { getAnnouncements } = require('../../lib/announcementStore');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
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

  const { exchange, scripCode, limit: limitParam } = req.query || {};
  const limitCount = Math.min(parseInt(limitParam, 10) || 100, 500);

  try {
    const data = await getAnnouncements({
      exchange: exchange && exchange !== 'ALL' ? exchange : undefined,
      scriptCode: scripCode || undefined,
      limitCount,
    });

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: data.length, data }));
  } catch (err) {
    console.error('[API/saved] Error:', err.message);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message, data: [] }));
  }
};
