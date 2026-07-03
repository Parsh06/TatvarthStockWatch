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
app.get('/api/announcements', verifyToken, (req, res) => {
  const all = readAnnouncements();
  const { exchange, scriptCode, nseSymbol, limit: lim, since } = req.query;
  let list = all;
  if (exchange && exchange !== 'ALL') list = list.filter((a) => a.exchange === exchange);
  if (scriptCode) list = list.filter((a) => a.scriptCode === scriptCode || a.nseSymbol === scriptCode);
  if (nseSymbol)  list = list.filter((a) => a.nseSymbol  === nseSymbol.toUpperCase());
  // `since` = ISO timestamp — count/return only announcements newer than this
  if (since) {
    const sinceTs = new Date(since).getTime();
    if (!isNaN(sinceTs)) list = list.filter((a) => new Date(a.announcementDate || a.date || 0).getTime() > sinceTs);
  }
  if (lim) list = list.slice(0, Number(lim));
  res.json({ data: list, total: list.length });
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

    const scripts  = await watchlistStore.getWatchlist(req.uid);
    const existing = scripts.find((s) =>
      (ltdCode && s.ltdCode === ltdCode) || (symbol && s.symbol === symbol)
    );
    if (existing) return res.json({ ...existing, alreadyExists: true });

    const script = {
      id: `local-${Date.now()}`,
      ltdCode, symbol, scriptName, exchange, notes, group, isin,
      addedAt: new Date().toISOString(),
    };
    scripts.push(script);
    await watchlistStore.saveWatchlist(req.uid, scripts);
    res.json(script);
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

  for (const item of incoming) {
    const ltdCode    = String(item.ltdCode || item.bseCode || item.scripCode || '').trim();
    const symbol     = String(item.symbol  || item.nseSymbol || '').trim().toUpperCase();
    const scriptName = String(item.scriptName || item.name || ltdCode || symbol).trim();

    if (!ltdCode && !symbol) { skipped++; continue; }
    const key = ltdCode || symbol;
    if (existingCodes.has(key)) { skipped++; continue; }
    existingCodes.add(key);
    existing.push({
      id:       `local-${Date.now()}-${added}`,
      ltdCode, symbol, scriptName,
      exchange: 'BOTH',
      notes:    item.notes || '',
      group:    String(item.group || '').trim(),
      addedAt:  new Date().toISOString(),
    });
    added++;
  }

  await watchlistStore.saveWatchlist(req.uid, existing);
  res.json({ added, skipped });
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
  const scripts = await watchlistStore.getWatchlist(req.uid);
  const filtered = scripts.filter((s) => s.id !== req.params.id);
  await watchlistStore.saveWatchlist(req.uid, filtered);
  res.json({ success: true });
});

app.patch('/api/watchlist/:id', verifyToken, async (req, res) => {
  const scripts = await watchlistStore.getWatchlist(req.uid);
  const idx     = scripts.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  scripts[idx]  = { ...scripts[idx], ...req.body };
  await watchlistStore.saveWatchlist(req.uid, scripts);
  res.json(scripts[idx]);
});

app.patch('/api/watchlist/:id/alert', verifyToken, async (req, res) => {
  const scripts = await watchlistStore.getWatchlist(req.uid);
  const idx     = scripts.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const { alertAbove, alertBelow, alertEnabled } = req.body;
  scripts[idx] = {
    ...scripts[idx],
    alertAbove:   alertAbove   != null ? Number(alertAbove)    : null,
    alertBelow:   alertBelow   != null ? Number(alertBelow)    : null,
    alertEnabled: alertEnabled != null ? Boolean(alertEnabled) : true,
  };
  await watchlistStore.saveWatchlist(req.uid, scripts);
  res.json(scripts[idx]);
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

    // Kick off rates fetch in the background (non-blocking)
    if (!_ratesFetchInProgress) _triggerRatesFetch(scripts, req.uid);
    else console.log('[Trigger] Rates fetch already in progress');

    const bseMatched = bseAll.filter((a) => bseSet.has(a.scriptCode));
    const nseMatched = nseAll.filter((a) => nseSet.has((a.scriptCode || '').toUpperCase()));
    const matched    = [...bseMatched, ...nseMatched];
    console.log(`[Trigger] BSE ${bseMatched.length} | NSE ${nseMatched.length}`);

    const { saveAnnouncements } = require('./lib/announcementStore');
    
    let freshAnnouncements = [];
    if (matched.length > 0) {
      // 1. Save to Firestore (only writes if genuinely new)
      const { saved, newAnnouncements } = await saveAnnouncements(matched);
      freshAnnouncements = newAnnouncements || [];
      console.log(`[Trigger] Saved ${saved} new announcements to Firestore`);
      
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
      ratesFetching: _ratesFetchInProgress,
    });
  } catch (e) {
    console.error('[Trigger] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Shared rates fetch helper ─────────────────────────────────────────────────
// Called from both /api/trigger and /api/rates/refresh.
// Progressively updates _ratesInMemory for live polling.
// Writes to Redis/JSON ONLY on completion (1 write per fetch cycle).

function _triggerRatesFetch(scripts, uid) {
  const { fetchRatesForScripts }       = require('./lib/bseRates');
  const { checkPriceAlerts }           = require('./lib/priceAlertChecker');
  const { sendTelegramPriceAlert: _tg, isConfigured: _tgOk } = require('./lib/telegramNotifier');

  _ratesFetchInProgress = true;
  _resetInMemory();

  fetchRatesForScripts(scripts, {
    onProgress: async (snapshot) => {
      // Merge partial batch into in-memory state (full rates for alert checking)
      const slimBatch = ratesStore.slimRates(snapshot.rates || {});
      _ratesInMemory = {
        fetchedAt: snapshot.fetchedAt,
        updatedAt: snapshot.updatedAt || new Date().toISOString(),
        total:     snapshot.total,
        success:   snapshot.success,
        failed:    snapshot.failed,
        complete:  snapshot.complete,
        fetching:  !snapshot.complete,
        rates:     { ..._ratesInMemory.rates, ...slimBatch },
      };

      // Check price alerts against full (unslimmed) rates — needs real ltp values
      try {
        const { checkPriceAlerts }    = require('./lib/priceAlertChecker');
        const { sendPriceAlertEmail } = require('./lib/mailer');
        const emailOk = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        
        const evaluateUserAlerts = async (userId, userScripts) => {
          const prefs = await prefsStore.getPrefs(userId);
          let userEmail = null;
          
          const sendEmailFn = emailOk && prefs.emailEnabled !== false ? async (a) => {
            if (!userEmail) {
              const admin = require('firebase-admin');
              try {
                const userRecord = await admin.auth().getUser(userId);
                userEmail = userRecord.email;
              } catch (err) { console.error('Failed to fetch user email:', err.message); }
            }
            if (userEmail) await sendPriceAlertEmail(userEmail, a);
          } : null;

          const fired = await checkPriceAlerts(
            userScripts, snapshot.rates, prefs,
            sendEmailFn,
            _tgOk() && prefs.telegramEnabled !== false ? (a) => _tg(a) : null
          );
          for (const a of fired) await alertStore.appendAlert(userId, a);
        };

        if (uid === 'GLOBAL_CRON') {
          // Triggered by global cron — evaluate for all users
          const admin = require('firebase-admin');
          let pageToken;
          do {
            const result = await admin.auth().listUsers(100, pageToken);
            for (const user of result.users) {
              const uScripts = await watchlistStore.getWatchlist(user.uid);
              if (uScripts && uScripts.length > 0) {
                 await evaluateUserAlerts(user.uid, uScripts);
              }
            }
            pageToken = result.pageToken;
          } while (pageToken);
        } else {
          // Triggered by a specific user manually
          await evaluateUserAlerts(uid, scripts);
        }
      } catch (e) {
        console.error('[Rates] Price alert check error:', e.message);
      }

      // WebSockets removed: clients will now HTTP poll GET /api/rates

      // Persist to Redis/JSON ONLY on completion — avoids write amplification
      if (snapshot.complete) {
        try {
          await ratesStore.writeRates(snapshot);
          console.log(`[Rates] Persisted: ${snapshot.success}/${snapshot.total} to ${ratesStore.UPSTASH_ENABLED ? 'Redis' : 'local'}`);
        } catch (e) {
          console.error('[Rates] Persist error:', e.message);
        }
      }
    },
  })
    .catch((e) => console.error('[Rates] Fetch error:', e.message))
    .finally(() => {
      _ratesFetchInProgress = false;
      _ratesInMemory.fetching = false;
      console.log(`[Rates] Fetch complete — ${_ratesInMemory.success}/${_ratesInMemory.total} ok`);
    });
}

const { bseGet, getBseCookies, getYahooFundamentals, sanitizeCode } = require('./lib/apiClients');

app.use("/api/bse", require("./routes/bseRoutes")(verifyToken));
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


// ── Background price-alert cron ───────────────────────────────────────────────
// Every 5 minutes during BSE market hours (Mon–Fri 09:00–15:35 IST) we:
//   1. Re-fetch live rates for all watchlist scripts
//   2. Run checkPriceAlerts (cooldown prevents spam — 5 min per direction)
// This means alerts fire even when the user hasn't clicked "Fetch Latest Data".

const ALERT_CRON_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function _isMarketOpen() {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset - now.getTimezoneOffset() * 60000);
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 && mins <= 15 * 60 + 35;
}

async function _runAlertCron() {
  if (_ratesFetchInProgress) return; // a manual fetch is already running
  if (!_isMarketOpen()) return;

  const scripts = await watchlistStore.getWatchlist(req.uid).filter((s) => s.alertEnabled && (s.alertAbove != null || s.alertBelow != null));
  if (scripts.length === 0) return; // nothing to watch

  console.log(`[AlertCron] Market open — checking ${scripts.length} alert script(s)…`);
  const LOCAL_UID = 'local';
  _triggerRatesFetch(scripts, LOCAL_UID);
}

// In Vercel, background intervals don't work. 
// Instead, external cron services will hit /api/cron/trigger
// setInterval(_runAlertCron, ALERT_CRON_INTERVAL_MS);

if (require.main === module) {
  app.listen(PORT, async () => {
    const { SECURE_MODE } = require('./lib/authMiddleware');
    console.log('');
    console.log('  StockWatch Backend');
    console.log(`  API:           http://localhost:${PORT}/api/watchlist`);
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    console.log(`  Email preview: ${appUrl}/api/email-preview`);
    console.log(`  Auth mode:     ${SECURE_MODE ? 'SECURE (Firebase token required)' : 'LOCAL (no auth)'}`);
    console.log(`  Rates store:   ${ratesStore.UPSTASH_ENABLED ? 'Upstash Redis' : 'Local JSON'}`);
    console.log(`  CORS origins:  ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`  Alert cron:    (Disabled locally, trigger via /api/cron/trigger)`);
    console.log('');
    
    try {
      const stored = await ratesStore.readRates();
      if (stored && stored.rates) {
        _ratesInMemory = { ..._ratesInMemory, ...stored };
        console.log(`[Rates] Loaded ${Object.keys(stored.rates).length} rates from store into memory`);
      }
    } catch(e) {
      console.error('[Rates] Failed to load initial rates:', e.message);
    }
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
    const watchlistStore = require('./lib/watchlistStore');
    const scripts = await watchlistStore.getAllTrackedScripts();
    if (!scripts.length) return res.json({ started: false, reason: 'no_scripts_tracked_globally' });

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

    // 1. Kick off rates fetch
    if (!_ratesFetchInProgress) _triggerRatesFetch(scripts, 'GLOBAL_CRON');

    // 2. Fetch Announcements
    const nseWatchedMap = new Map([...nseSet].map((c) => [c.toUpperCase(), metaMap.get(c) || {}]));
    const [bseAll, nseAll] = await Promise.all([
      bseSet.size > 0 ? fetchAllBSEAnnouncements() : Promise.resolve([]),
      nseSet.size > 0 ? fetchAllNSEAnnouncements(nseWatchedMap) : Promise.resolve([]),
    ]);

    const bseMatched = bseAll.filter((a) => bseSet.has(a.scriptCode));
    const nseMatched = nseAll.filter((a) => nseSet.has((a.scriptCode || '').toUpperCase()));
    const matched    = [...bseMatched, ...nseMatched];

    if (matched.length > 0) {
      const { saveAnnouncements } = require('./lib/announcementStore');
      const { saved, newAnnouncements } = await saveAnnouncements(matched);
      const fresh = newAnnouncements || [];
      
      const existing = readAnnouncements();
      writeAnnouncements([...fresh, ...existing].slice(0, 1000), {
        lastTriggeredAt: new Date().toISOString(),
      });
      console.log('[Global Cron] Saved ' + fresh.length + ' new announcements to Firestore');
      
      if (fresh.length > 0) {
        const admin = require('firebase-admin');
        const prefsStore = require('./lib/prefsStore');
        const { sendAnnouncementEmails } = require('./lib/mailer');
        const emailOk = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
        const { sendTelegramAlert, isConfigured: isTelegramOk } = require('./lib/telegramNotifier');

        let pageToken;
        do {
          const result = await admin.auth().listUsers(100, pageToken);
          for (const user of result.users) {
            const uid = user.uid;
            const uScripts = await watchlistStore.getWatchlist(uid);
            if (!uScripts || uScripts.length === 0) continue;

            // Find which fresh announcements belong to this user's watchlist
            const uBse = new Set(), uNse = new Set();
            for (const s of uScripts) {
              if (s.ltdCode || s.bseCode) uBse.add((s.ltdCode || s.bseCode).trim());
              if (s.symbol || s.nseSymbol) uNse.add((s.symbol || s.nseSymbol).trim().toUpperCase());
            }

            const uFresh = fresh.filter((a) => {
              const code = (a.scriptCode || '').toUpperCase();
              return uBse.has(code) || uNse.has(code);
            });

            if (uFresh.length > 0) {
              try {
                const prefs = await prefsStore.getPrefs(uid);
                
                // Email Dispatch
                if (emailOk && prefs.emailEnabled !== false && user.email) {
                  await sendAnnouncementEmails(user.email, user.displayName || 'User', uFresh);
                }
                
                // Telegram Dispatch
                if (isTelegramOk() && prefs.telegramEnabled !== false) {
                  for (const ann of uFresh) {
                    await sendTelegramAlert(ann); // Requires telegram notifier to handle announcement object
                  }
                }
              } catch (err) {
                console.error(`[Global Cron] Error dispatching announcements for ${uid}:`, err.message);
              }
            }
          }
          pageToken = result.pageToken;
        } while (pageToken);
      }
    }
    res.json({ started: true, scriptsFetched: scripts.length, newAnnouncements: matched.length });
  } catch (err) {
    console.error('[Global Cron] Error:', err);
    res.status(500).json({ error: err.message });
  }
});
