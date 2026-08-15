'use strict';

const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');

const { verifyToken }           = require('./lib/authMiddleware');
const alertStore                = require('./lib/alertStore');
const prefsStore                = require('./lib/prefsStore');
const ratesStore                = require('./lib/ratesStore');
const watchlistStore            = require('./lib/watchlistStore');

const { requestIdMiddleware }   = require('./utils/requestId');
const { stripClientUserParams } = require('./middleware/authorization');
const { globalRateLimiter, strictRateLimiter, userMutationRateLimiter } = require('./middleware/rateLimiter');
const secureLogger              = require('./utils/secureLogger');
const { sanitizeWatchlistScript, sanitizeDashboardOverview } = require('./utils/sanitizeResponse');

const app                = express();
// WebSockets removed for Vercel Serverless compatibility

const PORT               = process.env.PORT || 3000;

// ── Security Headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ── Request ID & Parameter Strip Middleware ────────────────────────────────────
app.use(requestIdMiddleware);
app.use(stripClientUserParams);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://tatvarthstockwatch.web.app',
  'https://tatvarthstockwatch.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
].filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.web.app') || origin.endsWith('.firebaseapp.com') || origin.endsWith('.vercel.app')) {
      return cb(null, true);
    }
    return cb(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Global Rate Limiter ───────────────────────────────────────────────────────
app.use(globalRateLimiter);

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



// ── OPEN: Announcements ──────────────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
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

app.get('/api/announcements/my-count', verifyToken, async (req, res) => {
  try {
    const since = req.query.since;
    if (!since) return res.json({ total: 0 }); // if no since date, 0 new announcements

    const { getWatchlist } = require('./lib/watchlistStore');
    const { getDb } = require('./lib/mongoClient');

    const watchlist = await getWatchlist(req.uid);
    if (!watchlist || !watchlist.length) return res.json({ total: 0 });

    const codes = new Set();
    const symbols = new Set();

    watchlist.forEach(s => {
      const bse = s.ltdCode || s.bseCode;
      const nse = s.nseSymbol || s.symbol;
      if (bse) codes.add(String(bse).trim());
      if (nse) symbols.add(String(nse).trim().toUpperCase());
    });

    const $or = [];
    if (codes.size > 0) $or.push({ scriptCode: { $in: Array.from(codes) } });
    if (symbols.size > 0) $or.push({ nseSymbol: { $in: Array.from(symbols) } });

    if ($or.length === 0) return res.json({ total: 0 });

    const db = await getDb();
    const count = await db.collection('announcements').countDocuments({
      announcementDate: { $gt: since },
      $or
    });

    res.json({ total: count });
  } catch (e) {
    console.error('my-count error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: Announcement stats (no limit) ─────────────────────────────────
app.get('/api/announcements/stats', async (req, res) => {
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
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  try {
    const scripts = await watchlistStore.getWatchlist(req.uid);
    const sanitized = scripts.map(s => sanitizeWatchlistScript(s)).filter(Boolean);
    res.json({ scripts: sanitized });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve watchlist' });
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

app.delete('/api/watchlist/:id', verifyToken, userMutationRateLimiter, async (req, res) => {
  const result = await watchlistStore.removeScript(req.uid, req.params.id);
  if (!result || result.deletedCount === 0) {
    return res.status(404).json({ success: false, error: 'Script not found or access denied', code: 'NOT_FOUND' });
  }
  res.json({ success: true });
});

app.patch('/api/watchlist/:id', verifyToken, userMutationRateLimiter, async (req, res) => {
  const result = await watchlistStore.updateScript(req.uid, req.params.id, req.body || {});
  if (!result || result.modifiedCount === 0) {
    return res.status(404).json({ success: false, error: 'Script not found or access denied', code: 'NOT_FOUND' });
  }
  res.json({ success: true });
});

app.patch('/api/watchlist/:id/alert', verifyToken, userMutationRateLimiter, async (req, res) => {
  const { alertAbove, alertBelow, alertEnabled } = req.body || {};
  const updates = {
    alertAbove:   alertAbove   != null ? Number(alertAbove)    : null,
    alertBelow:   alertBelow   != null ? Number(alertBelow)    : null,
    alertEnabled: alertEnabled != null ? Boolean(alertEnabled) : true,
  };
  const result = await watchlistStore.updateScript(req.uid, req.params.id, updates);
  if (!result || result.modifiedCount === 0) {
    return res.status(404).json({ success: false, error: 'Script not found or access denied', code: 'NOT_FOUND' });
  }
  res.json({ success: true });
});



// ── Web Push Notifications (Multi-Device) ─────────────────────────────────────
app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

app.post('/api/push/subscribe', verifyToken, async (req, res) => {
  try {
    const pushStore = require('./lib/pushStore');
    
    // Backwards compatibility for old frontends (where req.body IS the subscription)
    let subscription = req.body.subscription;
    let deviceId = req.body.deviceId;
    let platform = req.body.platform || 'unknown';
    let browser = req.body.browser || 'unknown';
    let userAgent = req.body.userAgent || '';

    if (!subscription && req.body.endpoint) {
      // Old frontend sent the subscription object directly
      subscription = req.body;
      deviceId = 'legacy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      browser = 'unknown (legacy client)';
    }

    if (!subscription || !deviceId) {
      return res.status(400).json({ error: 'subscription and deviceId are required' });
    }

    await pushStore.registerDevice(req.uid, deviceId, subscription, {
      platform,
      browser,
      userAgent,
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

// Send a test push notification
app.post('/api/push/test', verifyToken, async (req, res) => {
  try {
    const { sendWebPushToUser, sendWebPushToDevice } = require('./lib/webPushNotifier');
    const { deviceId } = req.body || {};
    
    const payload = {
      title: 'Tatvarth Stock Watch — Test',
      body: '✅ Push notifications are working! You will receive alerts on this device.',
      url: 'https://tatvarthstockwatch.web.app/settings',
      tag: 'test-notification',
    };

    let result;
    if (deviceId) {
      result = await sendWebPushToDevice(req.uid, deviceId, payload);
    } else {
      // Fallback for old frontend that doesn't send deviceId
      result = await sendWebPushToUser(req.uid, payload);
    }
    
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

// ── Midnight Wipe helper (IST) ─────────────────────────────────────────────
async function performMidnightWipeIfNeeded() {
  try {
    const admin = require('firebase-admin');
    const dbAdmin = admin.firestore();
    const metaRef = dbAdmin.collection('system_meta').doc('cron_status');
    const metaSnap = await metaRef.get();

    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET);
    const todayDateStr = nowIST.toISOString().split('T')[0];

    let lastWipeDate = '';
    if (metaSnap.exists) {
      lastWipeDate = metaSnap.data().lastWipeDate || '';
    }

    if (lastWipeDate !== todayDateStr) {
      console.log(`[Midnight Wipe] New day in IST (${todayDateStr})! Wiping announcements & dedup locks...`);
      const { getDb } = require('./lib/mongoClient');
      const { cleanupHistoricalIpos } = require('./lib/ipoStore');
      const mongoDb = await getDb();

      await Promise.all([
        mongoDb.collection('announcements').deleteMany({}),
        mongoDb.collection('alert_dedup_locks').deleteMany({}),
        cleanupHistoricalIpos().catch(() => {}),
      ]);

      writeAnnouncements([], { lastTriggeredAt: new Date().toISOString() });

      await metaRef.set({
        lastWipeDate: todayDateStr,
        lastWipedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`[Midnight Wipe] Successfully cleared MongoDB for ${todayDateStr}`);
      return { wiped: true, date: todayDateStr };
    }

    return { wiped: false, date: todayDateStr };
  } catch (err) {
    console.error('[Midnight Wipe] Error executing midnight wipe:', err.message);
    return { wiped: false, error: err.message };
  }
}

// ── PROTECTED: Trigger — fetch BSE/NSE announcements + kick off rates ─────────
app.post('/api/trigger', verifyToken, async (req, res) => {
  // Midnight Wipe (IST) check
  await performMidnightWipeIfNeeded();

  try {
    const { fetchAllBSEAnnouncements } = require('./lib/bseScraper');
    const { fetchAllNSEAnnouncements } = require('./lib/nseScraper');
    const { saveAnnouncements }        = require('./lib/announcementStore');
    const { processNewAnnouncements }  = require('./lib/notificationEngine');

    // Fetch ALL announcements — not gated on watchlist size
    // (users with ALL_ANNOUNCEMENTS scope need the full market dataset)
    const [bseAll, nseAll] = await Promise.all([
      fetchAllBSEAnnouncements(),
      fetchAllNSEAnnouncements(new Map()), // NSE with empty map = fetch all
    ]);

    // Global dedup — unique by announcement ID
    const seenIds    = new Set();
    const allFetched = [];
    for (const a of [...bseAll, ...nseAll]) {
      const id = String(a.id);
      if (!seenIds.has(id)) { seenIds.add(id); allFetched.push(a); }
    }

    // Persist all to MongoDB — returns only genuinely new announcements
    const { saved, newAnnouncements } = await saveAnnouncements(allFetched);
    console.log(`[Trigger] BSE=${bseAll.length} NSE=${nseAll.length} total=${allFetched.length} new=${saved}`);

    // Update memory cache (for email preview, latency, etc)
    writeAnnouncements(allFetched.slice(0, 1000), {
      lastTriggeredAt: new Date().toISOString(),
      lastBSEFetched:  bseAll.length,
      lastNSEFetched:  nseAll.length,
    });

    // Run notification engine — handles ALL scope partition + dedup per user
    let engineStats = {};
    if ((newAnnouncements || []).length > 0) {
      engineStats = await processNewAnnouncements(newAnnouncements);
    }

    res.json({
      bseFetched:     bseAll.length,
      nseFetched:     nseAll.length,
      totalFetched:   allFetched.length,
      newSaved:       saved,
      engine:         engineStats,
    });
  } catch (e) {
    console.error('[Trigger] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});



const { bseGet, getBseCookies, getYahooFundamentals, sanitizeCode } = require('./lib/apiClients');

app.use("/api/bse", require("./routes/bseRoutes")(verifyToken));
app.use("/api/nse", require("./routes/nseRoutes")(verifyToken));
app.use("/api/announcements", require("./routes/analyzeRoute")(verifyToken));
app.use("/api/market", require("./routes/marketRoutes")(verifyToken));
app.use("/api/ipo", require("./routes/ipoVerificationRoutes")(verifyToken));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.get("/api/search/scripts", (req, res) => res.redirect(`/api/bse/search?q=${encodeURIComponent(req.query.q || "")}`));


// Start the Volume Spurt in-memory poller (no MongoDB writes)
const { startSpurtPoller } = require('./lib/spurtStore');
startSpurtPoller().catch(e => console.error('[Spurt Poller] init error:', e.message));


// ── PROTECTED: Portfolio storage (User Scoped) ──────────────────────────────
app.get('/api/portfolio', verifyToken, async (req, res) => {
  try {
    const portfolioStore = require('./lib/portfolioStore');
    const data = await portfolioStore.getPortfolio(req.uid);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

app.put('/api/portfolio', verifyToken, async (req, res) => {
  const { holdings } = req.body || {};
  if (!Array.isArray(holdings)) return res.status(400).json({ error: 'holdings must be an array' });
  try {
    const portfolioStore = require('./lib/portfolioStore');
    const payload = { holdings, updatedAt: new Date().toISOString() };
    await portfolioStore.savePortfolio(req.uid, payload);
    res.json({ ok: true, count: holdings.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save portfolio' });
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
    // ── Midnight Wipe (IST) ──────────────────────────────────────────────────
    const wipeResult = await performMidnightWipeIfNeeded();

    const watchlistStore = require('./lib/watchlistStore');
    // ── Fetch ALL announcements from BSE/NSE ──────────────────────────────────
    // Not gated on watchlist — users with ALL_ANNOUNCEMENTS scope need full data
    const { fetchAllBSEAnnouncements } = require('./lib/bseScraper');
    const { fetchAllNSEAnnouncements } = require('./lib/nseScraper');
    const { saveAnnouncements }        = require('./lib/announcementStore');
    const { processNewAnnouncements }  = require('./lib/notificationEngine');

    const [bseAll, nseAll] = await Promise.all([
      fetchAllBSEAnnouncements(),
      fetchAllNSEAnnouncements(new Map()),
    ]);

    // Global dedup — unique by announcement ID
    const seenIds    = new Set();
    const allFetched = [];
    for (const a of [...bseAll, ...nseAll]) {
      const id = String(a.id);
      if (!seenIds.has(id)) { seenIds.add(id); allFetched.push(a); }
    }

    console.log(`[Global Cron] BSE=${bseAll.length} NSE=${nseAll.length} unique=${allFetched.length}`);

    let newAnnouncements = [];
    if (allFetched.length > 0) {
      const saveResult = await saveAnnouncements(allFetched);
      newAnnouncements = saveResult.newAnnouncements || [];
      console.log(`[Global Cron] Saved ${saveResult.saved} new announcements`);
    }

    // Notification engine handles scope partitioning, category filtering,
    // per-user dedup, and channel dispatch for ALL users
    const engineStats = newAnnouncements.length > 0
      ? await processNewAnnouncements(newAnnouncements)
      : { newAnnouncements: 0 };

    // ── IPO Allotment Symbol Discovery & Alert Pipeline ─────────────────────
    let ipoStats = { newIpos: 0 };
    try {
      const { scrapeKfinCompanies } = require('./lib/ipoScraper');
      const { saveIpoSymbols, reconcileMissingIpos } = require('./lib/ipoStore');
      const { processNewIpos } = require('./lib/notificationEngine');

      const scrapedIpos = await scrapeKfinCompanies();
      const newIpos = await saveIpoSymbols(scrapedIpos);
      await reconcileMissingIpos(scrapedIpos).catch(() => {});

      if (newIpos && newIpos.length > 0) {
        ipoStats = await processNewIpos(newIpos);
      }
    } catch (ipoErr) {
      console.error('[Global Cron] IPO Discovery Error:', ipoErr.message);
    }
    
    // Write meta status to Firestore for real-time frontend updates
    try {
      const admin = require('firebase-admin');
      const db = admin.firestore();
      await db.collection('system_meta').doc('cron_status').set({
        lastRun:              new Date().toISOString(),
        fetchedBSE:           bseAll.length,
        fetchedNSE:           nseAll.length,
        newAnnouncements:     newAnnouncements.length,
        notificationUsers:    engineStats.usersProcessed  || 0,
        notificationQueued:   engineStats.queued          || 0,
        notificationSent:     (engineStats.pushSent || 0) + (engineStats.telegramSent || 0),
        durationMs:           engineStats.durationMs      || 0,
      }, { merge: true });
    } catch (metaErr) {
      console.error('[Global Cron] Meta update failed:', metaErr.message);
    }

    res.json({
      started:          true,
      bseFetched:       bseAll.length,
      nseFetched:       nseAll.length,
      totalFetched:     allFetched.length,
      newAnnouncements: newAnnouncements.length,
      engine:           engineStats,
    });
  } catch (err) {
    console.error('[Global Cron] Error:', err);
    res.status(500).json({ error: err.message });
  }
});


// /api/cron/generate-summaries has been removed.
// AI analysis is now on-demand via POST /api/announcements/:id/analyze
// See backend/routes/analyzeRoute.js

