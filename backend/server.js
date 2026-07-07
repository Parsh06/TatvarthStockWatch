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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
app.get('/api/telegram-status', verifyToken, async (req, res) => {
  const { isConfigured } = require('./lib/telegramNotifier');
  let userChatId = null;
  try {
    const prefs = await prefsStore.getPrefs(req.uid);
    userChatId = prefs.telegramChatId;
  } catch (e) {}

  res.json({
    configured:  isConfigured(userChatId),
    hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
    hasChatId:   !!(userChatId || process.env.TELEGRAM_CHAT_ID),
  });
});

// ── PROTECTED: Telegram test ──────────────────────────────────────────────────
app.post('/api/telegram-test', verifyToken, async (req, res) => {
  const { sendTelegramTest, isConfigured } = require('./lib/telegramNotifier');
  const userChatId = req.body.telegramChatId;
  
  if (!isConfigured(userChatId)) {
    return res.status(400).json({
      sent: false, reason: 'not_configured',
      message: 'TELEGRAM_BOT_TOKEN must be set globally, and Chat ID must be set in your settings.',
    });
  }
  res.json(await sendTelegramTest(userChatId));
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

// ── PROTECTED: Announcement stats (no limit) ─────────────────────────────────
app.get('/api/announcements/stats', verifyToken, async (req, res) => {
  try {
    const { getDb } = require('./lib/mongoClient');
    const mongoDb = await getDb();
    const col = mongoDb.collection('announcements');
    const [total, bseCount, nseCount] = await Promise.all([
      col.countDocuments(),
      col.countDocuments({ exchange: 'BSE' }),
      col.countDocuments({ exchange: 'NSE' }),
    ]);
    res.json({ total, bse: bseCount, nse: nseCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ── PROTECTED: Fetch NSE live & save to DB ────────────────────────────────────
app.post('/api/announcements/fetch-nse', verifyToken, async (req, res) => {
  try {
    const { fetchAllNSEAnnouncements } = require('./lib/nseScraper');
    const { saveAnnouncements } = require('./lib/announcementStore');
    const nseAll = await fetchAllNSEAnnouncements(new Map());
    if (nseAll.length > 0) {
      const result = await saveAnnouncements(nseAll);
      console.log(`[FetchNSE] Saved ${result.saved} new NSE announcements`);
      res.json({ fetched: nseAll.length, saved: result.saved });
    } else {
      res.json({ fetched: 0, saved: 0 });
    }
  } catch (e) {
    console.error('[FetchNSE] Error:', e.message);
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



// ── Web Push Notifications (Multi-Device) ─────────────────────────────────────
app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

app.post('/api/push/subscribe', verifyToken, async (req, res) => {
  try {
    const pushStore = require('./lib/pushStore');
    const { subscription, deviceId, platform, browser, userAgent } = req.body;

    if (!subscription || !deviceId) {
      return res.status(400).json({ error: 'subscription and deviceId are required' });
    }

    await pushStore.registerDevice(req.uid, deviceId, subscription, {
      platform: platform || 'unknown',
      browser:  browser  || 'unknown',
      userAgent: userAgent || '',
    });

    // Also migrate any legacy prefs.pushSubscription if present
    await pushStore.migrateLegacySubscription(req.uid).catch(() => {});

    res.json({ success: true });
  } catch (e) {
    console.error('[Push Subscribe]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/push/unsubscribe', verifyToken, async (req, res) => {
  try {
    const pushStore = require('./lib/pushStore');
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    await pushStore.removeDevice(req.uid, deviceId);
    res.json({ success: true });
  } catch (e) {
    console.error('[Push Unsubscribe]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send a test push notification to all devices of the current user
app.post('/api/push/test', verifyToken, async (req, res) => {
  try {
    const { sendWebPushToUser } = require('./lib/webPushNotifier');
    const result = await sendWebPushToUser(req.uid, {
      title: 'Tatvarth Stock Watch — Test',
      body: '✅ Push notifications are working! You will receive alerts on this device.',
      url: 'https://tatvarthstockwatch.web.app/settings',
      tag: 'test-notification',
    });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Push Test]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get registered push devices for the current user
app.get('/api/push/devices', verifyToken, async (req, res) => {
  try {
    const pushStore = require('./lib/pushStore');

    // Migrate legacy subscription on first check
    await pushStore.migrateLegacySubscription(req.uid).catch(() => {});

    const devices = await pushStore.getAllDevices(req.uid);
    // Don't expose full subscription details to the frontend
    const sanitized = devices.map(d => ({
      deviceId:  d.deviceId,
      platform:  d.platform,
      browser:   d.browser,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
    }));
    res.json({ devices: sanitized, count: sanitized.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Heartbeat: touch device lastSeenAt (called on app load)
app.post('/api/push/heartbeat', verifyToken, async (req, res) => {
  try {
    const pushStore = require('./lib/pushStore');
    const { deviceId } = req.body;
    if (deviceId) {
      await pushStore.touchDevice(req.uid, deviceId);
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ── PROTECTED: Trigger — fetch BSE/NSE announcements + kick off rates ─────────
app.post('/api/trigger', verifyToken, async (req, res) => {
  const scripts = await watchlistStore.getWatchlist(req.uid);
  
  if (!scripts.length) {
    return res.json({ announcements: [], total: 0, emailSent: false, message: 'No scripts in watchlist' });
  }

  const { fetchAllBSEAnnouncements } = require('./lib/bseScraper');
  const { fetchAllNSEAnnouncements } = require('./lib/nseScraper');

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
      fetchAllNSEAnnouncements(nseWatchedMap), // Always fetch NSE for All Announcements page
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
    const admin = require('firebase-admin');
    const dbAdmin = admin.firestore();
    const metaRef = dbAdmin.collection('system_meta').doc('cron_status');
    const metaSnap = await metaRef.get();
    
    // Get current date in IST
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const todayDateStr = nowIST.toISOString().split('T')[0];
    
    let lastWipeDate = '';
    if (metaSnap.exists) {
      lastWipeDate = metaSnap.data().lastWipeDate || '';
    }
    
    // If we've crossed midnight IST, wipe the database clean
    if (lastWipeDate !== todayDateStr) {
      console.log(`[Global Cron] New day detected (${todayDateStr})! Wiping legacy announcements...`);
      const { getDb } = require('./lib/mongoClient');
      const mongoDb = await getDb();
      await mongoDb.collection('announcements').deleteMany({});
      await mongoDb.collection('alert_dedup_locks').deleteMany({});
      
      await metaRef.set({ lastWipeDate: todayDateStr }, { merge: true });
      console.log('[Global Cron] Midnight wipe complete.');
    }

    const watchlistStore = require('./lib/watchlistStore');
    const scripts = await watchlistStore.getAllTrackedScripts();

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

    const nseWatchedMap = new Map([...nseSet].map((c) => [c.toUpperCase(), metaMap.get(c) || {}]));
    const [bseAll, nseAll] = await Promise.all([
      fetchAllBSEAnnouncements(),
      fetchAllNSEAnnouncements(nseWatchedMap), // Always fetch NSE — data needs to be in DB for All Announcements page
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

    const bseMatched = allFetched.filter((a) => bseSet.has(a.scriptCode));
    const nseMatched = allFetched.filter((a) => nseSet.has((a.scriptCode || '').toUpperCase()));
    const matched = [...bseMatched, ...nseMatched];

    if (allFetched.length > 0) {
      const { saveAnnouncements } = require('./lib/announcementStore');
      const saveResult = await saveAnnouncements(allFetched);
      const newAnns = saveResult.newAnnouncements || [];
      
      const newMatched = newAnns.filter((a) => {
        const code = (a.scriptCode || '').toUpperCase();
        return bseSet.has(a.scriptCode) || nseSet.has(code);
      });
      
      if (newMatched.length > 0) {
        const { getDb } = require('./lib/mongoClient');
        const mongoDb = await getDb();
        const alertDedupLocksCol = mongoDb.collection('alert_dedup_locks');
        
        const admin = require('firebase-admin');
        const prefsStore = require('./lib/prefsStore');
        const { sendTelegramAlert } = require('./lib/telegramNotifier');

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

            const uMatched = newMatched.filter((a) => {
              const code = (a.scriptCode || '').toUpperCase();
              return uBse.has(code) || uNse.has(code);
            });

            if (uMatched.length > 0) {
              let prefs = {};
              try {
                prefs = await prefsStore.getPrefs(uid) || {};
              } catch (err) {
                console.error(`[Global Cron] Failed to get prefs for ${uid}:`, err.message);
              }
              const blocked = prefs.blockedCategories || [];
              const { resolveCategoryGroup } = require('./lib/alertCategories');

              const uActuallyPending = [];
              for (const ann of uMatched) {
                const catGroup = resolveCategoryGroup(ann.category);
                const subCatGroup = resolveCategoryGroup(ann.subCategory);
                
                const isBlocked = blocked.includes(catGroup) || blocked.includes(subCatGroup);
                if (isBlocked) continue;

                try {
                  await alertDedupLocksCol.insertOne({ _id: `${ann.id}_${uid}`, announcementId: String(ann.id), userId: uid, createdAt: new Date() });
                  const dedupId = getDedupId(ann, uid);
                  await alertDedupLocksCol.insertOne({ _id: dedupId, type: 'dedup_lock', userId: uid, createdAt: new Date() });
                  
                  uActuallyPending.push(ann);
                } catch (e) {
                  if (e.code !== 11000) console.error(`[Global Cron] Error getting lock for ${uid}:`, e.message);
                }
              }

              if (uActuallyPending.length > 0) {
                try {
                  // Telegram Dispatch
                  const isTelegramOk = () => !!(process.env.TELEGRAM_BOT_TOKEN && (prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID));
                  if (isTelegramOk() && prefs.telegramEnabled !== false) {
                    for (const ann of uActuallyPending) {
                      const targetChat = prefs.telegramChatId || process.env.TELEGRAM_CHAT_ID;
                      const tgRes = await sendTelegramAlert([ann], targetChat);
                      if (tgRes.sent && tgRes.messageIds && tgRes.messageIds.length > 0) {
                        try {
                          await mongoDb.collection('announcements').updateOne(
                            { _id: String(ann.id) },
                            { $push: { telegramMessages: { userId: uid, chatId: targetChat, messageId: tgRes.messageIds[0] } } }
                          );
                        } catch (err) {
                          console.error('[Global Cron] Failed to save telegram message ID:', err);
                        }
                      }
                    }
                  }
                  
                  // Web Push Dispatch (multi-device)
                  const { sendWebPushToUser } = require('./lib/webPushNotifier');
                  for (const ann of uActuallyPending) {
                    await sendWebPushToUser(uid, {
                      title: `${ann.scriptName || ann.scriptCode} (${ann.exchange || 'BSE'})`,
                      body: `[${ann.category || 'Announcement'}] ${ann.subject || 'New update'}`,
                      url: ann.pdfUrl || `https://tatvarthstockwatch.web.app/`,
                      tag: `ann-${String(ann.id).slice(0, 20)}`,
                    });
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
    const startTime = Date.now();
    const maxTime = 8000; // 8 seconds maximum (Vercel hobby limit is 10s)

    for (const ann of pending) {
      if (Date.now() - startTime > maxTime) {
        console.log('[AI Cron] Vercel timeout approaching! Breaking early.');
        break;
      }

      console.log(`[AI Cron] Summarizing ${ann._id} (${ann.scriptName})`);
      const summaryJson = await generateAnnouncementSummary(ann);
      
      if (summaryJson) {
        await annCol.updateOne(
          { _id: ann._id },
          { $set: { aiSummary: summaryJson, aiSummaryStatus: 'completed' } }
        );
        successCount++;
        
        // --- Edit existing Telegram Messages ---
        if (ann.telegramMessages && ann.telegramMessages.length > 0) {
          try {
            const { editTelegramMessage, rebuildSingleAlertText } = require('./lib/telegramNotifier');
            ann.aiSummary = summaryJson; // ensure rebuilding uses the new summary
            const updatedText = rebuildSingleAlertText(ann);
            
            for (const tgMsg of ann.telegramMessages) {
               try {
                 await editTelegramMessage(tgMsg.messageId, updatedText, tgMsg.chatId);
               } catch (editErr) {
                 console.error(`[AI Cron] Failed to edit telegram message ${tgMsg.messageId}:`, editErr.message);
               }
            }
          } catch (outerErr) {
            console.error(`[AI Cron] Failed to process telegram edits for ${ann._id}:`, outerErr.message);
          }
        }
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
