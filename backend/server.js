'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const { verifyToken }           = require('./lib/authMiddleware');
const alertStore                = require('./lib/alertStore');
const prefsStore                = require('./lib/prefsStore');
const watchlistStore            = require('./lib/watchlistStore');

const app                = express();
// WebSockets removed for Vercel Serverless compatibility

const PORT               = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:4173',
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ── Simple in-memory rate limiter (120 req / min per IP) ─────────────────────
const _rlMap    = new Map();
// In-memory quote cache (pseudo-Redis, 5-min TTL per BSE code)
const _qCache   = new Map();
const QUOTE_TTL = 5 * 60 * 1000;
function rateLimiter(req, res, next) {
  const ip  = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const WIN = 60_000, MAX = 120;
  let e = _rlMap.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + WIN }; _rlMap.set(ip, e); }
  if (++e.count > MAX) return res.status(429).json({ error: 'Too many requests — slow down.' });
  next();
}
app.use(rateLimiter);
setInterval(() => { const now = Date.now(); for (const [k, v] of _rlMap) if (now > v.resetAt + 60_000) _rlMap.delete(k); }, 5 * 60_000);

// ── In-memory cache (announcements only — rates handled by ratesStore)
const _cache = { announcements: [] };

// ── Announcements helpers ─────────────────────────────────────────────────────

function readAnnouncements() { return _cache.announcements; }

function writeAnnouncements(announcements, meta = {}) { _cache.announcements = announcements; }

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { SECURE_MODE } = require('./lib/authMiddleware');
  const watchlistStore = require('./lib/watchlistStore');
  let scriptCount = 0;
  try {
    const all = await watchlistStore.getAllTrackedScripts();
    scriptCount = all.length;
  } catch (e) {}

  res.json({
    status:     'ok',
    uptime:     Math.floor(process.uptime()),
    timestamp:  new Date().toISOString(),
    authMode:   SECURE_MODE ? 'secure' : 'local',
    emailOk:    !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    telegramOk: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    scriptCount,
  });
});


// ── OPEN: Telegram status ─────────────────────────────────────────────────────
app.get('/api/telegram-status', (req, res) => {
  const { isConfigured } = require('./lib/telegramNotifier');
  res.json({
    configured:  isConfigured(),
    hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
    hasChatId:   !!process.env.TELEGRAM_CHAT_ID,
  });
});

// ── PROTECTED: Telegram test ──────────────────────────────────────────────────
app.post('/api/telegram-test', verifyToken, async (req, res) => {
  const { sendTelegramTest, isConfigured } = require('./lib/telegramNotifier');
  if (!isConfigured()) {
    return res.status(400).json({
      sent: false, reason: 'not_configured',
      message: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env',
    });
  }
  res.json(await sendTelegramTest());
});

// ── PROTECTED: Email preview ──────────────────────────────────────────────────
app.get('/api/email-preview', verifyToken, (req, res) => {
  const { buildEmailHtml } = require('./lib/mailer');
  const stored  = readAnnouncements();
  const preview = stored.length > 0 ? stored.slice(0, 20) : [
    {
      id: 'SAMPLE-001', exchange: 'BSE', scriptName: 'Reliance Industries Ltd',
      scriptCode: '500325', category: 'Board Meeting',
      subject: 'Board Meeting to consider Quarterly Financial Results',
      announcementDate: new Date().toISOString(), date: '15 Jun 2026', time: '14:30:00',
      datetimeIST: '15 Jun 2026 14:30:00 IST', pdfUrl: null,
      sourceUrl: 'https://www.bseindia.com/corporates/ann.html?scripcd=500325', critical: false,
    },
  ];
  try {
    const html = buildEmailHtml('Investor', preview);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send(`<pre>Error: ${e.message}</pre>`);
  }
});

// ── PROTECTED: Announcements ──────────────────────────────────────────────────
app.get('/api/announcements', verifyToken, async (req, res) => {
  const { exchange, scriptCode, nseSymbol, limit: lim, since } = req.query;
  const { getAnnouncements } = require('./lib/announcementStore');
  try {
    const list = await getAnnouncements({
      exchange,
      scriptCode,
      nseSymbol,
      limitCount: lim,
      sinceDate: since
    });
    res.json({ data: list, total: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROTECTED: Alert history ──────────────────────────────────────────────────
app.get('/api/alerts', verifyToken, async (req, res) => {
  try {
    const { limit: lim } = req.query;
    const alerts = await alertStore.getAlerts(req.uid, lim ? Number(lim) : 200);
    res.json({ alerts, total: alerts.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Returns alerts fired after ?since=ISO (for frontend toast polling)
app.get('/api/alerts/recent', verifyToken, async (req, res) => {
  try {
    const all    = await alertStore.getAlerts(req.uid, 100);
    const since  = req.query.since ? new Date(req.query.since).getTime() : 0;
    const recent = isNaN(since) ? [] : all.filter((a) => new Date(a.triggeredAt).getTime() > since);
    res.json({ alerts: recent, total: recent.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/alerts/:id', verifyToken, async (req, res) => {
  try {
    await alertStore.deleteAlert(req.uid, req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/alerts', verifyToken, async (req, res) => {
  try {
    await alertStore.clearAlerts(req.uid);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROTECTED: Notification preferences ──────────────────────────────────────
app.get('/api/prefs', verifyToken, async (req, res) => {
  try { res.json(await prefsStore.getPrefs(req.uid)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/prefs', verifyToken, async (req, res) => {
  try { res.json(await prefsStore.savePrefs(req.uid, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROTECTED: Watchlist CRUD ─────────────────────────────────────────────────
app.get('/api/watchlist', verifyToken, async (req, res) => {
  try {
    const scripts = await watchlistStore.getWatchlist(req.uid);
    res.json({ scripts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/watchlist', verifyToken, async (req, res) => {
  try {
    const body       = req.body || {};
    const ltdCode    = String(body.ltdCode    || body.bseCode  || body.scripCode || '').trim();
    const symbol     = String(body.symbol     || body.nseSymbol || '').trim().toUpperCase();
    const scriptName = String(body.scriptName || body.name     || ltdCode || symbol).trim();
    const exchange   = String(body.exchange   || 'BOTH').trim().toUpperCase();
    const notes      = String(body.notes      || '').trim();
    const group      = String(body.group      || '').trim();
    const isin       = String(body.isin       || '').trim();

    if (!ltdCode && !symbol) return res.status(400).json({ error: 'ltdCode or symbol is required' });

    const result = await watchlistStore.addScript(req.uid, {
      ltdCode, symbol, scriptName, exchange, notes, group, isin
    });
    
    if (result.alreadyExists) {
      return res.json({ ...result, alreadyExists: true });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/watchlist/bulk', verifyToken, async (req, res) => {
  const incoming = Array.isArray(req.body.scripts) ? req.body.scripts : [];
  if (!incoming.length) return res.json({ added: 0, skipped: 0 });

  const existing      = await watchlistStore.getWatchlist(req.uid);
  const existingCodes = new Set(existing.map((s) => s.ltdCode));
  let added = 0, skipped = 0;

  const toAdd = [];
  for (const item of incoming) {
    const ltdCode    = String(item.ltdCode || item.bseCode || item.scripCode || '').trim();
    const symbol     = String(item.symbol  || item.nseSymbol || '').trim().toUpperCase();
    const scriptName = String(item.scriptName || item.name || ltdCode || symbol).trim();

    if (!ltdCode && !symbol) { skipped++; continue; }
    const key = ltdCode || symbol;
    if (existingCodes.has(key)) { skipped++; continue; }
    existingCodes.add(key);
    
    toAdd.push({
      ltdCode, symbol, scriptName,
      exchange: 'BOTH',
      notes:    item.notes || '',
      group:    String(item.group || '').trim(),
      addedAt:  new Date()
    });
    added++;
  }

  if (toAdd.length > 0) {
    const { getDb } = require('./lib/mongoClient');
    const db = await getDb();
    const docs = toAdd.map(s => ({ ...s, userId: req.uid }));
    await db.collection('watchlists').insertMany(docs);
    watchlistStore.invalidateWatchlistCache();
  }

  res.json({ added, skipped });
});

// ── PROTECTED: Watchlist catch-up emails ─────────────────────────────────────
app.post('/api/watchlist/catchup', verifyToken, async (req, res) => {
  try {
    const { scriptCode } = req.body;
    if (!scriptCode) return res.status(400).json({ error: 'scriptCode required' });

    const { db, admin } = require('./lib/firebaseAdmin');
    const { sendAnnouncementEmail } = require('./lib/mailer');
    const { invalidateWatchlistCache } = require('./lib/watchlistStore');
    
    // Invalidate the cache so the cron background jobs pick up this new script immediately
    invalidateWatchlistCache();
    
    // 1. Fetch today's announcements for this script from the global DB
    const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
    const annsSnap = await db.collection('announcements')
      .where('scriptCode', '==', scriptCode)
      // date string like '04 Jul 2026' doesn't easily compare, but the frontend/backend wipes old data daily
      // so whatever is in the DB *is* today's data. 
      .get();
      
    if (annsSnap.empty) {
      return res.json({ sent: 0, skipped: 0, reason: 'no announcements found today' });
    }

    const announcements = [];
    annsSnap.forEach(d => announcements.push(d.data()));

    // 2. Check which ones have NOT been added to notifications
    const toNotify = [];
    const ts = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    
    const docIds = announcements.map(a => String(a.id));
    const notifRefs = docIds.map(id => db.collection('users').doc(req.uid).collection('notifications').doc(id));
    
    const existingNotifs = await db.getAll(...notifRefs);
    
    for (let i = 0; i < announcements.length; i++) {
      if (!existingNotifs[i].exists) {
        toNotify.push(announcements[i]);
        batch.set(notifRefs[i], {
          id:               announcements[i].id               || '',
          exchange:         announcements[i].exchange         || '',
          scriptName:       announcements[i].scriptName       || '',
          scriptCode:       announcements[i].scriptCode       || '',
          category:         announcements[i].category         || '',
          subCategory:      announcements[i].subCategory      || '',
          subject:          announcements[i].subject          || '',
          announcementDate: announcements[i].announcementDate || '',
          date:             announcements[i].date             || '',
          time:             announcements[i].time             || '',
          datetimeIST:      announcements[i].datetimeIST      || '',
          pdfUrl:           announcements[i].pdfUrl           || null,
          critical:         announcements[i].critical         || false,
          read:             false,
          createdAt:        ts,
        });
      }
    }

    if (toNotify.length === 0) {
      return res.json({ sent: 0, skipped: announcements.length, reason: 'already notified' });
    }

    let emailsSent = 0;
    if (toNotify.length > 0) {
      let userEmail = null, userName = 'Investor';
      const userDoc = await db.collection('users').doc(req.uid).get();
      if (userDoc.exists && userDoc.data().email) {
        userEmail = userDoc.data().email;
        userName = userDoc.data().displayName || 'Investor';
      } else {
        try {
          const record = await admin.auth().getUser(req.uid);
          userEmail = record.email;
          userName = record.displayName || 'Investor';
        } catch (e) {}
      }

      if (userEmail) {
        await sendAnnouncementEmail(userEmail, userName, toNotify);
        emailsSent = toNotify.length;
        
        // Update receive_email in MongoDB
        const { getDb } = require('./lib/mongoClient');
        const mongoDb = await getDb();
        const receiveEmailCol = mongoDb.collection('receive_email');
        const bulkOps = toNotify.map(ann => ({
          updateOne: {
            filter: { _id: String(ann.id) },
            update: {
              $addToSet: { sentTo: req.uid },
              $setOnInsert: { announcementId: String(ann.id), createdAt: new Date() }
            },
            upsert: true
          }
        }));
        await receiveEmailCol.bulkWrite(bulkOps, { ordered: false });
      }
    }
    
    // 4. Update watchlist count for this script
    // Note: The frontend just added it, so it might not be in the 'watchlist' subcollection yet if they used bulkAdd
    // But it will eventually be.
    const wlSnap = await db.collection('users').doc(req.uid).collection('watchlist')
      .where('ltdCode', '==', scriptCode)
      .limit(1)
      .get();
      
    if (!wlSnap.empty) {
      const latestAnn = toNotify.reduce((latest, a) => (!latest || a.announcementDate > latest) ? a.announcementDate : latest, null);
      batch.update(wlSnap.docs[0].ref, {
        announcementCount:  admin.firestore.FieldValue.increment(toNotify.length),
        lastAnnouncementAt: latestAnn,
        lastCheckedAt:      ts,
      });
    }

    await batch.commit();
    res.json({ sent: toNotify.length, skipped: announcements.length - toNotify.length });

  } catch (e) {
    console.error('[Catchup Error]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── PROTECTED: Watchlist export as CSV ───────────────────────────────────────
app.get('/api/watchlist/export', verifyToken, async (req, res) => {
  try {
    const scripts = await watchlistStore.getWatchlist(req.uid);
    const stored  = await ratesStore.readRates();
    const rates   = stored?.rates || {};
    const header  = 'BSE Code,NSE Symbol,Company Name,Exchange,Group,Notes,LTP,Added At\n';
    const rows = scripts.map((s) => {
      const code = s.ltdCode || s.bseCode || '';
      const ltp  = rates[code]?.ltp ?? '';
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [cell(code), cell(s.symbol || ''), cell(s.scriptName || ''), cell(s.exchange || ''),
              cell(s.group || ''), cell(s.notes || ''), cell(ltp), cell(s.addedAt || '')].join(',');
    }).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="watchlist_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('﻿' + header + rows); // BOM for Excel UTF-8
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/watchlist/all', verifyToken, async (req, res) => {
  await watchlistStore.saveWatchlist(req.uid, []);
  res.json({ success: true });
});

app.delete('/api/watchlist/:id', verifyToken, async (req, res) => {
  await watchlistStore.removeScript(req.uid, req.params.id);
  res.json({ success: true });
});

app.patch('/api/watchlist/:id', verifyToken, async (req, res) => {
  await watchlistStore.updateScript(req.uid, req.params.id, req.body);
  res.json({ success: true });
});

app.patch('/api/watchlist/:id/alert', verifyToken, async (req, res) => {
  const { alertAbove, alertBelow, alertEnabled } = req.body;
  const updates = {
    alertAbove:   alertAbove   != null ? Number(alertAbove)    : null,
    alertBelow:   alertBelow   != null ? Number(alertBelow)    : null,
    alertEnabled: alertEnabled != null ? Boolean(alertEnabled) : true,
  };
  await watchlistStore.updateScript(req.uid, req.params.id, updates);
  res.json({ success: true });
});

// ── PROTECTED: Rates refresh (cron-safe — skips if already running) ───────────
app.post('/api/rates/refresh', verifyToken, async (req, res) => {
  const scripts = await watchlistStore.getWatchlist(req.uid);
  if (!scripts.length)        return res.json({ started: false, reason: 'no_scripts' });
  if (_ratesFetchInProgress)  return res.json({ started: false, reason: 'already_running' });

  _triggerRatesFetch(scripts, req.uid);
  res.json({ started: true, total: scripts.length });
});

// ── PROTECTED: Trigger — fetch BSE/NSE announcements + kick off rates ─────────
app.post('/api/trigger', verifyToken, async (req, res) => {
  const scripts = await watchlistStore.getWatchlist(req.uid);
  if (!scripts.length) {
    return res.json({ announcements: [], total: 0, emailSent: false, message: 'No scripts in watchlist' });
  }

  const { fetchAllBSEAnnouncements } = require('./lib/bseScraper');
  const { fetchAllNSEAnnouncements } = require('./lib/nseScraper');
  const { sendAnnouncementEmail }    = require('./lib/mailer');

  const bseSet = new Set(), nseSet = new Set(), metaMap = new Map();
  for (const s of scripts) {
    const ltd = (s.ltdCode || s.bseCode || '').trim();
    const sym = (s.symbol  || '').trim().toUpperCase();
    if (ltd) { bseSet.add(ltd); metaMap.set(ltd, { scriptName: s.scriptName || ltd }); }
    if (sym) { nseSet.add(sym); metaMap.set(sym, { scriptName: s.scriptName || sym }); }
  }

  console.log(`[Trigger] BSE: ${bseSet.size} codes | NSE: ${nseSet.size} symbols`);

  try {
    const nseWatchedMap = new Map([...nseSet].map((c) => [c.toUpperCase(), metaMap.get(c) || {}]));
    const [bseAll, nseAll] = await Promise.all([
      bseSet.size > 0 ? fetchAllBSEAnnouncements() : Promise.resolve([]),
      nseSet.size > 0 ? fetchAllNSEAnnouncements(nseWatchedMap) : Promise.resolve([]),
    ]);


    const bseMatched = bseAll.filter((a) => bseSet.has(a.scriptCode));
    const nseMatched = nseAll.filter((a) => nseSet.has((a.scriptCode || '').toUpperCase()));
    const matched    = [...bseMatched, ...nseMatched];
    console.log(`[Trigger] BSE ${bseMatched.length} | NSE ${nseMatched.length}`);

    const { saveAnnouncements } = require('./lib/announcementStore');
    
    let freshAnnouncements = [];
    if (bseAll.length > 0 || nseAll.length > 0) {
      const allFetched = [];
      const seenFetched = new Set();
      for (const a of [...bseAll, ...nseAll]) {
        const id = String(a.id);
        if (!seenFetched.has(id)) {
          seenFetched.add(id);
          allFetched.push(a);
        }
      }

      // 1. Save ALL to MongoDB (only writes if genuinely new)
      const { saved, newAnnouncements } = await saveAnnouncements(allFetched);
      
      // But only alert for the ones in the watchlist!
      const freshAll = newAnnouncements || [];
      freshAnnouncements = freshAll.filter((a) => bseSet.has(a.scriptCode) || nseSet.has((a.scriptCode || '').toUpperCase()));
      
      console.log(`[Trigger] Saved ${saved} new announcements to MongoDB`);
      
      // 2. Also keep memory cache updated (for email preview, etc)
      const existing = readAnnouncements();
      writeAnnouncements([...freshAnnouncements, ...existing].slice(0, 1000), {
        lastTriggeredAt: new Date().toISOString(),
        lastBSEFetched:  bseAll.length,
        lastNSEFetched:  nseAll.length,
      });
    }

    const { sendTelegramAlert, isConfigured: isTelegramOk } = require('./lib/telegramNotifier');
    const emailOk     = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    let targetEmail   = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER;
    let targetName    = 'Investor';

    // Fetch actual user email if authenticated
    if (req.uid && req.uid !== 'local') {
      try {
        const { admin } = require('./lib/firebaseAdmin');
        const userRecord = await admin.auth().getUser(req.uid);
        if (userRecord.email) {
          targetEmail = userRecord.email;
          targetName = userRecord.displayName || targetName;
        }
      } catch (err) {
        console.error('[Trigger] Failed to fetch user email for UID', req.uid, err.message);
      }
    }

    const silent = req.query.silent === '1';
    let emailSent = false, emailError = null;
    
    // ONLY send notifications for TRULY FRESH announcements
    if (emailOk && targetEmail && freshAnnouncements.length > 0) {
      try { await sendAnnouncementEmail(targetEmail, targetName, freshAnnouncements); emailSent = true; }
      catch (e) { emailError = e.message; console.error('[Trigger] Email failed:', e.message); }
    }

    let telegramSent = false, telegramError = null;
    if (isTelegramOk() && freshAnnouncements.length > 0) {
      try {
        const r = await sendTelegramAlert(freshAnnouncements);
        telegramSent  = r.sent;
        if (!r.sent) telegramError = r.errors?.join(', ') || r.reason;
      } catch (e) { telegramError = e.message; }
    }

    res.json({
      announcements: matched, total: matched.length,
      bseMatched: bseMatched.length, nseMatched: nseMatched.length,
      bseFetched: bseAll.length,    nseFetched: nseAll.length,
      emailSent, emailConfigured: emailOk, emailError,
      telegramSent, telegramConfigured: isTelegramOk(), telegramError,
    });
  } catch (e) {
    console.error('[Trigger] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


if (require.main === module) {
  app.listen(PORT, async () => {
    const { SECURE_MODE } = require('./lib/authMiddleware');
    console.log('');
    console.log('  StockWatch Backend');
    console.log(`  API:           http://localhost:${PORT}/api/watchlist`);
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    console.log(`  Email preview: ${appUrl}/api/email-preview`);
    console.log(`  Auth mode:     ${SECURE_MODE ? 'SECURE (Firebase token required)' : 'LOCAL (no auth)'}`);
    console.log(`  CORS origins:  ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`  Alert cron:    (Disabled locally, trigger via /api/cron/trigger)`);
    console.log('');
  });
}

// Export for Vercel serverless
module.exports = app;

// ── GLOBAL CRONJOB ────────────────────────────────────────────────────────────
// Supports GET for external cron services (e.g. cron-job.org)
app.all('/api/cron/trigger', async (req, res) => {
  const auth = req.headers.authorization || '';
  const secret = req.query.secret || auth.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // ── Step 0: Daily Midnight Cleanup ──────────────────────────────────────────
    // Removed: We now check 'updatedAt' dynamically to prevent massive quota spikes.

    const watchlistStore = require('./lib/watchlistStore');
    const scripts = await watchlistStore.getAllTrackedScripts();
    // Do NOT abort if scripts.length === 0, we still want to fetch BSE announcements globally

    const { fetchAllBSEAnnouncements } = require('./lib/bseScraper');
    const { fetchAllNSEAnnouncements } = require('./lib/nseScraper');

    const bseSet = new Set(), nseSet = new Set(), metaMap = new Map();
    for (const s of scripts) {
      const ltd = (s.ltdCode || s.bseCode || '').trim();
      const sym = (s.symbol  || '').trim().toUpperCase();
      if (ltd) { bseSet.add(ltd); metaMap.set(ltd, { scriptName: s.scriptName || ltd }); }
      if (sym) { nseSet.add(sym); metaMap.set(sym, { scriptName: s.scriptName || sym }); }
    }

    console.log('[Global Cron] Triggering for BSE: ' + bseSet.size + ' codes | NSE: ' + nseSet.size + ' symbols');

    // 1. Fetch Announcements
    const nseWatchedMap = new Map([...nseSet].map((c) => [c.toUpperCase(), metaMap.get(c) || {}]));
    const [bseAll, nseAll] = await Promise.all([
      fetchAllBSEAnnouncements(), // Fetch ALL BSE announcements unconditionally
      nseSet.size > 0 ? fetchAllNSEAnnouncements(nseWatchedMap) : Promise.resolve([]),
    ]);

    const allFetched = [];
    const seenFetched = new Set();
    for (const a of [...bseAll, ...nseAll]) {
      const id = String(a.id);
      if (!seenFetched.has(id)) {
        seenFetched.add(id);
        allFetched.push(a);
      }
    }

    // Match against watchlists for notifications
    const bseMatched = allFetched.filter((a) => bseSet.has(a.scriptCode));
    const nseMatched = allFetched.filter((a) => nseSet.has((a.scriptCode || '').toUpperCase()));
    const matched = [...bseMatched, ...nseMatched];

    if (allFetched.length > 0) {
      const { saveAnnouncements } = require('./lib/announcementStore');
      // Save ALL announcements to global DB (MongoDB)
      await saveAnnouncements(allFetched);
      
      if (matched.length > 0) {
        const { getDb } = require('./lib/mongoClient');
        const mongoDb = await getDb();
        const receiveEmailCol = mongoDb.collection('receive_email');
        
        // Fetch existing sent states for these announcements
        const matchedIds = matched.map(a => String(a.id));
        const emailStates = await receiveEmailCol.find({ _id: { $in: matchedIds } }).toArray();
        const emailStateMap = new Map();
        for (const state of emailStates) {
           emailStateMap.set(String(state._id), new Set(state.sentTo || []));
        }

        const admin = require('firebase-admin');
        const prefsStore = require('./lib/prefsStore');
        const { sendAnnouncementEmails } = require('./lib/mailer');
        const emailOk = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const { sendTelegramAlert, isConfigured: isTelegramOk } = require('./lib/telegramNotifier');

        const updatesToMongo = new Map(); // annId -> Set of new UIDs to add

        let pageToken;
        do {
          const result = await admin.auth().listUsers(100, pageToken);
          for (const user of result.users) {
            const uid = user.uid;
            const uScripts = await watchlistStore.getWatchlist(uid);
            if (!uScripts || uScripts.length === 0) continue;

            const uBse = new Set(), uNse = new Set();
            for (const s of uScripts) {
              if (s.ltdCode || s.bseCode) uBse.add((s.ltdCode || s.bseCode).trim());
              if (s.symbol || s.nseSymbol) uNse.add((s.symbol || s.nseSymbol).trim().toUpperCase());
            }

            // Find matching announcements for this user
            const uMatched = matched.filter((a) => {
              const code = (a.scriptCode || '').toUpperCase();
              return uBse.has(code) || uNse.has(code);
            });

            // Filter out announcements already sent to this user
            const uPending = uMatched.filter(a => {
              const sentSet = emailStateMap.get(String(a.id));
              return !sentSet || !sentSet.has(uid);
            });

            if (uPending.length > 0) {
              try {
                const prefs = await prefsStore.getPrefs(uid);
                
                // Email Dispatch
                if (emailOk && prefs.emailEnabled !== false && user.email) {
                  await sendAnnouncementEmails(user.email, user.displayName || 'User', uPending);
                }
                
                // Telegram Dispatch
                if (isTelegramOk() && prefs.telegramEnabled !== false) {
                  for (const ann of uPending) {
                    await sendTelegramAlert(ann);
                  }
                }
                
                // Mark as sent for this user
                for (const ann of uPending) {
                   const aId = String(ann.id);
                   if (!updatesToMongo.has(aId)) updatesToMongo.set(aId, new Set());
                   updatesToMongo.get(aId).add(uid);
                }
              } catch (err) {
                console.error(`[Global Cron] Error dispatching announcements for ${uid}:`, err.message);
              }
            }
          }
          pageToken = result.pageToken;
        } while (pageToken);

        // Bulk update MongoDB receive_email collection
        if (updatesToMongo.size > 0) {
           const bulkOps = [];
           for (const [aId, uidsSet] of updatesToMongo.entries()) {
              bulkOps.push({
                 updateOne: {
                    filter: { _id: aId },
                    update: { 
                       $addToSet: { sentTo: { $each: Array.from(uidsSet) } },
                       $setOnInsert: { announcementId: aId, createdAt: new Date() }
                    },
                    upsert: true
                 }
              });
           }
           await receiveEmailCol.bulkWrite(bulkOps, { ordered: false });
        }
      }
    }
    
    // Write meta status to Firestore for real-time frontend updates
    try {
      const admin = require('firebase-admin');
      const db = admin.firestore();
      await db.collection('system_meta').doc('cron_status').set({
        lastRun: new Date().toISOString(),
        matchedAnnouncements: matched.length
      }, { merge: true });
    } catch (metaErr) {
      console.error('[Global Cron] Meta update failed:', metaErr.message);
    }

    res.json({ started: true, scriptsFetched: scripts.length, matchedAnnouncements: matched.length });
  } catch (err) {
    console.error('[Global Cron] Error:', err);
    res.status(500).json({ error: err.message });
  }
});
