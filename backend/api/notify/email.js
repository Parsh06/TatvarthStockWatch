'use strict';

require('dotenv').config();
const { sendAnnouncementEmail } = require('../../lib/mailer');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Parse JSON body from request.
 * @param {object} req
 * @returns {Promise<object>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      // Prevent extremely large payloads
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Basic email validation.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'This endpoint only accepts POST requests.' }));
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (parseErr) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request', message: parseErr.message }));
    return;
  }

  const { userEmail, userName, announcements } = body;

  // Input validation
  if (!userEmail) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request', message: 'userEmail is required' }));
    return;
  }

  if (!isValidEmail(userEmail)) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request', message: 'userEmail must be a valid email address' }));
    return;
  }

  if (!Array.isArray(announcements) || announcements.length === 0) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request', message: 'announcements must be a non-empty array' }));
    return;
  }

  // Validate each announcement has required fields
  for (let i = 0; i < announcements.length; i++) {
    const ann = announcements[i];
    if (!ann || typeof ann !== 'object') {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: `announcements[${i}] must be an object` }));
      return;
    }
    if (!ann.scriptName && !ann.scriptCode) {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: `announcements[${i}] must have scriptName or scriptCode` }));
      return;
    }
  }

  try {
    const result = await sendAnnouncementEmail(userEmail, userName || 'Investor', announcements);

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Email sent successfully to ${userEmail}`,
      messageId: result.messageId,
      accepted: result.accepted,
      announcementsCount: announcements.length,
    }));
  } catch (error) {
    console.error('[API/Notify/Email] Error sending email:', error.message);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Internal Server Error',
      message: `Failed to send email: ${error.message}`,
    }));
  }
};
