'use strict';

/**
 * poll-and-notify.js
 *
 * Standalone polling script — runs on your machine.
 * Polls BSE every 60 seconds, matches against your watchlist,
 * sends an email immediately when a new announcement is found.
 *
 * Run: node poll-and-notify.js
 *
 * Requirements in .env:
 *   GMAIL_USER         — your Gmail address
 *   GMAIL_APP_PASSWORD — Gmail App Password (16 chars, no spaces)
 *   NOTIFY_EMAIL       — where to send alerts (can be same as GMAIL_USER)
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *     — only needed if reading watchlist from Firestore
 *     — OR set WATCHLIST below manually for quick testing
 */

require('dotenv').config();
const axios = require('axios');
const nodemailer = require('nodemailer');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

// Manual watchlist — scrip codes to watch (BSE codes as strings)
// If Firebase is configured below, this is overridden by your real Firestore watchlist
const MANUAL_WATCHLIST = [
  { scriptName: 'Reliance Industries', scriptCode: '500325' },
  { scriptName: 'TCS',                 scriptCode: '532540' },
  { scriptName: 'HDFC Bank',           scriptCode: '500180' },
  { scriptName: 'Infosys',             scriptCode: '500209' },
  { scriptName: 'ITC Ltd',             scriptCode: '500875' },
  { scriptName: 'Wipro',               scriptCode: '507685' },
  { scriptName: 'ICICI Bank',          scriptCode: '532174' },
  { scriptName: 'Bajaj Finance',       scriptCode: '532187' },
  { scriptName: 'Asian Paints',        scriptCode: '500820' },
  { scriptName: 'Maruti Suzuki',       scriptCode: '532500' },
];

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER;
// ─────────────────────────────────────────────────────────────────────────────

const BSE_API_URL = 'https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w';

const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.bseindia.com/',
  'Origin': 'https://www.bseindia.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
};

// Track which announcement IDs we have already notified about (in-memory)
const notifiedIds = new Set();
let isFirstRun = true;

// ── EMAIL SETUP ───────────────────────────────────────────────────────────────
function createTransport() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendEmail(transport, announcements) {
  if (!transport) {
    console.log('[EMAIL] No transport configured — printing to console instead');
    announcements.forEach((a) => {
      console.log(`\n  📢 ${a.scriptName} (${a.scriptCode})`);
      console.log(`     ${a.subject}`);
      console.log(`     Category: ${a.category}`);
      console.log(`     Time:     ${a.announcementDate}`);
      if (a.pdfUrl) console.log(`     PDF:      ${a.pdfUrl}`);
    });
    return;
  }

  const rows = announcements.map((a) => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:12px 8px;font-weight:600;color:#1a1a2e">${a.scriptName}</td>
      <td style="padding:12px 8px;color:#555">${a.scriptCode}</td>
      <td style="padding:12px 8px">
        <span style="background:#e8f4fd;color:#1565c0;padding:2px 8px;border-radius:12px;font-size:12px">${a.category}</span>
      </td>
      <td style="padding:12px 8px;color:#333">${a.subject}</td>
      <td style="padding:12px 8px;color:#888;font-size:12px">${new Date(a.announcementDate).toLocaleTimeString('en-IN')}</td>
      ${a.pdfUrl ? `<td style="padding:12px 8px"><a href="${a.pdfUrl}" style="color:#1565c0">PDF</a></td>` : '<td></td>'}
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto">
      <div style="background:#1a1a2e;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:20px">📈 StockWatch — New BSE Announcements</h2>
        <p style="margin:6px 0 0;opacity:0.7;font-size:13px">
          ${announcements.length} new announcement${announcements.length > 1 ? 's' : ''} for your watchlist
          · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-top:none">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888">COMPANY</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888">CODE</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888">CATEGORY</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888">SUBJECT</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888">TIME</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888">DOC</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#aaa;font-size:11px;padding:16px 0 0">
        Sent by StockWatch · BSE data polled every 60 seconds
      </p>
    </div>
  `;

  await transport.sendMail({
    from: `"StockWatch Alerts" <${process.env.GMAIL_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `📈 ${announcements.length} New BSE Announcement${announcements.length > 1 ? 's' : ''} — ${announcements.map((a) => a.scriptName).join(', ')}`,
    html,
  });

  console.log(`[EMAIL] Sent to ${NOTIFY_EMAIL} — ${announcements.length} announcement(s)`);
}

// ── BSE FETCH ─────────────────────────────────────────────────────────────────
async function fetchTodayBSE(scriptCode = '') {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const params = {
    pageno: 1,
    strCat: -1,
    strPrevDate: dateStr,
    strScrip: scriptCode,
    strSearch: 'P',
    strToDate: dateStr,
    strType: 'C',
    subcategory: -1,
  };

  const resp = await axios.get(BSE_API_URL, { params, headers: BSE_HEADERS, timeout: 15000 });
  const body = resp.data;

  let items = [];
  if (Array.isArray(body)) {
    items = body;
  } else if (body && Array.isArray(body.Table)) {
    items = body.Table;
  }

  return items.map((item) => {
    const code = String(item.SCRIP_CD || '').trim();
    const pdf = item.ATTACHMENTNAME || '';
    return {
      id: item.NEWSID || `BSE-${code}-${Date.now()}`,
      exchange: 'BSE',
      scriptName: (item.SLONGNAME || item.scrip_name || code).trim(),
      scriptCode: code,
      category: (item.CATEGORYNAME || 'General').trim(),
      subject: (item.HEADLINE || item.NEWSSUB || '').trim(),
      announcementDate: item.NEWS_DT || item.DissemDT || new Date().toISOString(),
      pdfUrl: pdf ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${pdf}` : null,
      sourceUrl: `https://www.bseindia.com/stock-share-price/${code}/`,
    };
  });
}

// ── FIREBASE WATCHLIST (optional) ─────────────────────────────────────────────
async function getFirestoreWatchlist() {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return null; // not configured
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    const db = admin.firestore();
    // Get all users' watchlists
    const usersSnap = await db.collection('users').get();
    const scripts = [];
    for (const userDoc of usersSnap.docs) {
      const wlSnap = await db.collection('users').doc(userDoc.id).collection('watchlist').get();
      wlSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.ltdCode) scripts.push({ scriptName: data.scriptName, scriptCode: data.ltdCode });
      });
    }
    return scripts.length > 0 ? scripts : null;
  } catch (e) {
    console.warn('[FIREBASE] Could not load watchlist:', e.message);
    return null;
  }
}

// ── MAIN POLL LOOP ────────────────────────────────────────────────────────────
async function poll(watchlist, transport) {
  const timestamp = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`\n[${timestamp}] Polling BSE for ${watchlist.length} watchlisted stocks...`);

  const newAnnouncements = [];

  for (const stock of watchlist) {
    try {
      const items = await fetchTodayBSE(stock.scriptCode);
      for (const item of items) {
        if (!notifiedIds.has(item.id)) {
          notifiedIds.add(item.id);
          if (!isFirstRun) {
            // Only notify on subsequent runs — first run just seeds the known IDs
            newAnnouncements.push(item);
            console.log(`  [NEW] ${item.scriptName} (${item.scriptCode}) — ${item.subject.slice(0, 80)}`);
          }
        }
      }
      if (items.length > 0) {
        console.log(`  [OK]  ${stock.scriptName} (${stock.scriptCode}) — ${items.length} announcement(s) today`);
      }
    } catch (err) {
      console.warn(`  [ERR] ${stock.scriptName}: ${err.message}`);
    }
  }

  if (isFirstRun) {
    console.log(`[INIT] Seeded ${notifiedIds.size} existing announcement IDs — will notify on new ones from next poll.`);
    isFirstRun = false;
  } else if (newAnnouncements.length > 0) {
    console.log(`\n[ALERT] ${newAnnouncements.length} new announcement(s) found — sending email...`);
    await sendEmail(transport, newAnnouncements);
  } else {
    console.log(`  No new announcements since last check.`);
  }
}

// ── STARTUP ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  StockWatch — BSE Real-time Polling');
  console.log(`  Polling every ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log(`  Notify: ${NOTIFY_EMAIL || '(no email — console only)'}`);
  console.log('='.repeat(60));

  // Load watchlist — Firestore if available, else manual
  let watchlist = await getFirestoreWatchlist();
  if (watchlist) {
    console.log(`\n[WATCHLIST] Loaded ${watchlist.length} stocks from Firestore`);
  } else {
    watchlist = MANUAL_WATCHLIST;
    console.log(`\n[WATCHLIST] Using manual list (${watchlist.length} stocks) — add Firebase to use your real watchlist`);
  }
  watchlist.forEach((s) => console.log(`  • ${s.scriptName} (${s.scriptCode})`));

  // Check email config
  const transport = createTransport();
  if (transport) {
    console.log(`\n[EMAIL] Gmail configured ✓ — alerts will go to ${NOTIFY_EMAIL}`);
  } else {
    console.log('\n[EMAIL] Not configured — set GMAIL_USER and GMAIL_APP_PASSWORD in .env to enable emails');
    console.log('         New announcements will be printed to console instead.');
  }

  // Run immediately, then on interval
  await poll(watchlist, transport);
  setInterval(() => poll(watchlist, transport), POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
