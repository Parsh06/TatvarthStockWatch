'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const { verifyToken }           = require('./lib/authMiddleware');
const alertStore                = require('./lib/alertStore');
const prefsStore                = require('./lib/prefsStore');
const ratesStore                = require('./lib/ratesStore');
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

// ── Rates fetch state ─────────────────────────────────────────────────────────
// _ratesInMemory: grows progressively as batches complete during an active fetch.
// Clients poll GET /api/rates and receive this growing partial snapshot.
// On fetch complete → persisted to Redis/JSON via ratesStore.writeRates().

let _ratesFetchInProgress = false;
let _ratesInMemory = {
  fetchedAt: null, updatedAt: null,
  total: 0, success: 0, failed: 0,
  complete: false, fetching: false, rates: {},
};

function _resetInMemory() {
  _ratesInMemory = {
    fetchedAt: null, updatedAt: null,
    total: 0, success: 0, failed: 0,
    complete: false, fetching: false, rates: {},
  };
}

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
    ratesStore: ratesStore.UPSTASH_ENABLED ? 'redis' : 'local',
    emailOk:    !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    telegramOk: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    scriptCount,
  });
});

// ── OPEN: Live rates ──────────────────────────────────────────────────────────
// During an active fetch: returns growing in-memory partial rates (zero DB reads).
// When idle: returns last persisted snapshot from Redis/JSON.
// Clients poll this every 5s during active fetch, 60s otherwise.

app.get('/api/rates', async (req, res) => {
  // Tell Vercel CDN to cache this response for 15 seconds.
  // This drastically reduces Upstash Redis GETs even if 1000 users are polling.
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');

  if (_ratesFetchInProgress) {
    return res.json({ ..._ratesInMemory, fetching: true });
  }
  try {
    const stored = await ratesStore.readRates();
    res.json({ ...stored, fetching: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: Rates status (tiny response — ~100 bytes, safe to poll frequently) ──
app.get('/api/rates/status', (req, res) => {
  res.json({
    fetching:  _ratesFetchInProgress,
    complete:  _ratesInMemory.complete,
    fetchedAt: _ratesInMemory.fetchedAt,
    total:     _ratesInMemory.total,
    success:   _ratesInMemory.success,
    failed:    _ratesInMemory.failed,
    backend:   ratesStore.UPSTASH_ENABLED ? 'redis' : 'local',
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
        const { getDb } = require('./lib/mongoClient');
        const mongoDb = await getDb();
        const receiveEmailCol = mongoDb.collection('receive_email');
        const toActuallyNotify = [];

        const getDedupId = (ann, uid) => {
          const dateStr = new Date().toISOString().slice(0, 10);
          const company = (ann.scriptName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
          let subj = (ann.subject || '').toLowerCase();
          subj = subj.replace(/outcome of board meeting/g, '').replace(/press release/g, '').replace(/announcement under regulation/g, '').replace(/regarding/g, '').replace(/update/g, '').replace(/copy of newspaper publication/g, '').replace(/newspaper publication/g, '').replace(/[^a-z0-9]/g, '');
          return `DEDUP_${dateStr}_${company}_${subj.substring(0, 15)}_${uid}`;
        };

        for (const ann of toNotify) {
          try {
            // 1. Try to lock the specific announcement
            await receiveEmailCol.insertOne({ _id: `${ann.id}_${req.uid}`, announcementId: String(ann.id), userId: req.uid, createdAt: new Date() });
            
            // 2. Try to lock the global deduplication hash for cross-exchange spam prevention
            const dedupId = getDedupId(ann, req.uid);
            await receiveEmailCol.insertOne({ _id: dedupId, type: 'dedup_lock', userId: req.uid, createdAt: new Date() });
            
            toActuallyNotify.push(ann);
          } catch (e) {
            // e.code === 11000 means Duplicate Key Error (already locked/sent by another thread or exchange)
            if (e.code !== 11000) {
              console.error('[Catchup] Error getting atomic lock:', e.message);
            }
          }
        }

        if (toActuallyNotify.length > 0) {
          await sendAnnouncementEmail(userEmail, userName, toActuallyNotify);
          emailsSent = toActuallyNotify.length;
        }
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

// ── PROTECTED: Preferences ────────────────────────────────────────────────────
app.get('/api/prefs', verifyToken, async (req, res) => {
  try {
    const { getPrefs } = require('./lib/prefsStore');
    const prefs = await getPrefs(req.uid);
    res.json(prefs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/prefs', verifyToken, async (req, res) => {
  try {
    const { getPrefs, savePrefs } = require('./lib/prefsStore');
    const existing = await getPrefs(req.uid);
    const updated = await savePrefs(req.uid, { ...existing, ...req.body });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

  // --- Midnight Wipe (IST) ---
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const getISTDateString = (d) => new Date(d.getTime() + IST_OFFSET).toISOString().slice(0, 10);
  
  const existingMeta = readAnnouncements();
  const lastDate = existingMeta.lastTriggeredAt ? getISTDateString(new Date(existingMeta.lastTriggeredAt)) : null;
  const todayDate = getISTDateString(new Date());

  if (lastDate && lastDate !== todayDate) {
    console.log(`[Trigger] New day detected! Wiping MongoDB for fresh start (${lastDate} -> ${todayDate})`);
    try {
      const { getDb } = require('./lib/mongoClient');
      const mongoDb = await getDb();
      await mongoDb.collection('announcements').deleteMany({});
      await mongoDb.collection('receive_email').deleteMany({});
      await mongoDb.collection('board_meeting_email_logs').deleteMany({});
      await mongoDb.collection('board_meeting_processing').deleteMany({});
      writeAnnouncements([], { lastTriggeredAt: new Date().toISOString() });
    } catch (e) {
      console.error('[Trigger] Error during midnight wipe:', e.message);
    }
  }
  // -----------------------------

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
    const { processBoardMeetingAnnouncements } = require('./lib/boardMeetingNotifier');
    
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
      
      // 1.5 Send Global Board Meeting Email Alerts
      if (newAnnouncements && newAnnouncements.length > 0) {
        // Run this in the background to not block the trigger response
        processBoardMeetingAnnouncements(newAnnouncements).catch(e => {
          console.error('[Trigger] Error in Board Meeting Notifier:', e.message);
        });
      }
      
      // But only alert for the ones in the watchlist!
      const freshAll = newAnnouncements || [];
      freshAnnouncements = freshAll.filter((a) => bseSet.has(a.scriptCode) || nseSet.has((a.scriptCode || '').toUpperCase()));
      
      // Run AI Summarization on all fresh watchlist announcements!
      if (freshAnnouncements.length > 0) {
        try {
          console.log(`[Trigger] Running AI Summarizer on ${freshAnnouncements.length} new announcements...`);
          const { generateAnnouncementSummary } = require('./lib/aiSummarizer');
          const { getDb } = require('./lib/mongoClient');
          const mongoDb = await getDb();
          
          await Promise.all(freshAnnouncements.map(async (ann) => {
            if (ann.pdfUrl) {
              const summary = await generateAnnouncementSummary(ann);
              if (summary) {
                ann.aiSummary = summary;
                // Also update it in the database
                await mongoDb.collection('announcements').updateOne(
                  { _id: String(ann.id) },
                  { $set: { aiSummary: summary } }
                );
              }
            }
          }));
          console.log(`[Trigger] AI Summarization complete!`);
        } catch (err) {
          console.error(`[Trigger] AI Summarization error:`, err.message);
        }
      }
      
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



const { bseGet, getBseCookies, getYahooFundamentals, sanitizeCode } = require('./lib/apiClients');

app.use("/api/bse", require("./routes/bseRoutes")(verifyToken));
app.use("/api/nse", require("./routes/nseRoutes")(verifyToken));
app.get("/api/search/scripts", (req, res) => res.redirect(`/api/bse/search?q=${encodeURIComponent(req.query.q || "")}`));

// ── Portfolio storage (local mode) ────────────────────────────────────────────
app.get('/api/portfolio', (req, res) => {
  try {
    const raw = fs.readFileSync(PORTFOLIO_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch { res.json({ holdings: [], updatedAt: null }); }
});

app.put('/api/portfolio', (req, res) => {
  const { holdings } = req.body;
  if (!Array.isArray(holdings)) return res.status(400).json({ error: 'holdings must be an array' });
  const data = { holdings, updatedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, count: holdings.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── In-memory caches for calendar and movers ─────────────────────────────────
const _calCache   = new Map(); // key: `${from}|${to}|${cat}`, val: { data, exp }
const CAL_TTL     = 30 * 60 * 1000; // 30 min
let   _moversCache    = null;
let   _moversCacheExp = 0;
const MOVERS_TTL  = 5 * 60 * 1000;  // 5 min

// ── OPEN: BSE top gainers / losers (market-wide, 5-min cache) ────────────────
app.get('/api/bse/movers', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

  if (_moversCache && Date.now() < _moversCacheExp) {
    return res.json({
      gainers:   _moversCache.gainers.slice(0, limit),
      losers:    _moversCache.losers.slice(0, limit),
      fetchedAt: _moversCache.fetchedAt,
      cached: true,
    });
  }

  const _f = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? null : n; };

  function parseMovers(r) {
    if (r.status !== 'fulfilled' || !r.value) return [];
    const rows = r.value?.Table || r.value?.Table1 || r.value?.Data || (Array.isArray(r.value) ? r.value : []);
    return rows.map((i) => ({
      bseCode:   String(i.SCRIP_CODE  || i.scripcode   || i.ScripCode  || '').trim(),
      company:   (i.SCRIP_NAME  || i.scripname    || i.ScripName  || i.CompanyName || '').trim(),
      symbol:    (i.NSE_SYMBOL  || i.nseSymbol    || i.Symbol     || '').trim(),
      ltp:       _f(i.LTP        || i.ltp          || i.CURRENT_VALUE),
      change:    _f(i.NET_CHANGE || i.NetChange    || i.change     || i.NETCHANGE),
      pctChange: _f(i.PERCENT_CHG|| i.PercentChg   || i.PctChg     || i.PERCHANGE  || i.perChange),
      volume:    parseInt(String(i.VOLUME || i.volume || i.TotalTradedQuantity || '0').replace(/,/g,''), 10) || null,
    })).filter((m) => m.bseCode && m.ltp != null);
  }

  try {
    const [grR, lrR] = await Promise.allSettled([
      bseGet('https://api.bseindia.com/BseIndiaAPI/api/GetTopGainerLoser/w',
        { Type: 'gainer', CategoryName: 'equity', IndexName: '' }, 12000),
      bseGet('https://api.bseindia.com/BseIndiaAPI/api/GetTopGainerLoser/w',
        { Type: 'loser',  CategoryName: 'equity', IndexName: '' }, 12000),
    ]);
    const gainers = parseMovers(grR);
    const losers  = parseMovers(lrR);
    _moversCache    = { gainers, losers, fetchedAt: new Date().toISOString() };
    _moversCacheExp = Date.now() + MOVERS_TTL;
    res.json({ gainers: gainers.slice(0, limit), losers: losers.slice(0, limit), fetchedAt: _moversCache.fetchedAt, cached: false });
  } catch (e) {
    console.error('[BSE Movers]', e.message);
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
      const saveResult = await saveAnnouncements(allFetched);
      const newAnns = saveResult.newAnnouncements || [];
      
      const newMatched = newAnns.filter((a) => {
        const code = (a.scriptCode || '').toUpperCase();
        return bseSet.has(a.scriptCode) || nseSet.has(code);
      });
      
      if (newMatched.length > 0) {
        console.log(`[Global Cron] Running AI Summarizer on ${newMatched.length} new watchlist announcements...`);
        const { generateAnnouncementSummary } = require('./lib/aiSummarizer');
        const { getDb } = require('./lib/mongoClient');
        const mongoDb = await getDb();
        // Run summaries in chunks of 5 to avoid API rate limits, with a 1.5s delay between chunks
        // Vercel maxDuration is set to 60s, which gives us plenty of time.
        const chunkSize = 5;
        for (let i = 0; i < newMatched.length; i += chunkSize) {
          const chunk = newMatched.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async (ann) => {
            if (ann.pdfUrl) {
              const summary = await generateAnnouncementSummary(ann);
              if (summary) {
                ann.aiSummary = summary;
                await mongoDb.collection('announcements').updateOne(
                  { _id: String(ann.id) },
                  { $set: { aiSummary: summary, aiSummaryStatus: 'completed' } }
                );
              }
            }
          }));
          if (i + chunkSize < newMatched.length) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        console.log(`[Global Cron] AI Summarization complete!`);
      }
      
      if (newMatched.length > 0) {
        const { getDb } = require('./lib/mongoClient');
        const mongoDb = await getDb();
        const receiveEmailCol = mongoDb.collection('receive_email');
        
        // The atomic lock eliminates the need to pre-fetch state maps
        const admin = require('firebase-admin');
        const prefsStore = require('./lib/prefsStore');
        const { sendAnnouncementEmails } = require('./lib/mailer');
        const emailOk = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const { sendTelegramAlert, isConfigured: isTelegramOk } = require('./lib/telegramNotifier');

        const getDedupId = (ann, uid) => {
          const dateStr = new Date().toISOString().slice(0, 10);
          const company = (ann.scriptName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
          let subj = (ann.subject || '').toLowerCase();
          subj = subj.replace(/outcome of board meeting/g, '').replace(/press release/g, '').replace(/announcement under regulation/g, '').replace(/regarding/g, '').replace(/update/g, '').replace(/copy of newspaper publication/g, '').replace(/newspaper publication/g, '').replace(/[^a-z0-9]/g, '');
          return `DEDUP_${dateStr}_${company}_${subj.substring(0, 15)}_${uid}`;
        };

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

            // Find matching newly-discovered announcements for this user
            const uMatched = newMatched.filter((a) => {
              const code = (a.scriptCode || '').toUpperCase();
              return uBse.has(code) || uNse.has(code);
            });

            if (uMatched.length > 0) {
              const uActuallyPending = [];
              for (const ann of uMatched) {
                try {
                  // 1. Try to lock the specific announcement
                  await receiveEmailCol.insertOne({ _id: `${ann.id}_${uid}`, announcementId: String(ann.id), userId: uid, createdAt: new Date() });
                  
                  // 2. Try to lock the global deduplication hash for cross-exchange spam prevention
                  const dedupId = getDedupId(ann, uid);
                  await receiveEmailCol.insertOne({ _id: dedupId, type: 'dedup_lock', userId: uid, createdAt: new Date() });
                  
                  uActuallyPending.push(ann);
                } catch (e) {
                  // Duplicate Key Error = already sent or deduplicated
                  if (e.code !== 11000) console.error(`[Global Cron] Error getting lock for ${uid}:`, e.message);
                }
              }

              if (uActuallyPending.length > 0) {
                try {
                  const prefs = await prefsStore.getPrefs(uid);
                  
                  // Email Dispatch
                  if (emailOk && prefs.emailEnabled !== false && user.email) {
                    await sendAnnouncementEmails(user.email, user.displayName || 'User', uActuallyPending);
                  }
                  
                  // Telegram Dispatch
                  if (isTelegramOk() && prefs.telegramEnabled !== false) {
                    for (const ann of uActuallyPending) {
                      await sendTelegramAlert(ann);
                    }
                  }
                } catch (err) {
                  console.error(`[Global Cron] Error dispatching announcements for ${uid}:`, err.message);
                }
              }
            }
          }
          pageToken = result.pageToken;
        } while (pageToken);
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

/**
 * NEW ROUTE: Background AI Summary Generator
 * Triggered periodically to process announcements that don't have an aiSummary yet.
 */
app.all('/api/cron/generate-summaries', async (req, res) => {
  try {
    const { getDb } = require('./lib/mongoClient');
    const { generateAnnouncementSummary } = require('./lib/aiSummarizer');
    const db = await getDb();
    const annCol = db.collection('announcements');

    // Find up to 5 most recent announcements (from last 48 hours) that don't have aiSummary
    // and aren't marked as 'failed_ai' to avoid infinite retries
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pending = await annCol.find({
      savedAt: { $gte: twoDaysAgo },
      aiSummary: { $exists: false },
      aiSummaryStatus: { $ne: 'failed' }
    }).sort({ savedAt: -1 }).limit(5).toArray();

    if (pending.length === 0) {
      return res.status(200).json({ success: true, processed: 0, message: 'No pending summaries' });
    }

    let successCount = 0;
    for (const ann of pending) {
      console.log(`[AI Cron] Summarizing ${ann._id} (${ann.scriptName})`);
      const summaryJson = await generateAnnouncementSummary(ann);
      
      if (summaryJson) {
        await annCol.updateOne(
          { _id: ann._id },
          { $set: { aiSummary: summaryJson, aiSummaryStatus: 'completed' } }
        );
        successCount++;
      } else {
        await annCol.updateOne(
          { _id: ann._id },
          { $set: { aiSummaryStatus: 'failed' } }
        );
      }
    }

    res.status(200).json({ success: true, processed: pending.length, successful: successCount });
  } catch (err) {
    console.error('[AI Cron] Error:', err);
    res.status(500).json({ error: 'Failed to generate summaries' });
  }
});
