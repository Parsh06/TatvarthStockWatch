'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const { verifyToken, SECURE_MODE } = require('./lib/authMiddleware');
const { requestIdMiddleware }       = require('./utils/requestId');
const { stripClientUserParams }     = require('./middleware/authorization');
const { globalRateLimiter }         = require('./middleware/rateLimiter');
const { runUserManualTrigger }      = require('./services/cronService');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet());

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
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Global Rate Limiter ───────────────────────────────────────────────────────
app.use(globalRateLimiter);

// ── Domain Route Modules ──────────────────────────────────────────────────────
app.use('/api/health',        require('./routes/healthRoutes'));
app.use('/api/cron',          require('./routes/cronRoutes'));
app.use('/api/announcements', require('./routes/announcementRoutes'));
app.use('/api/announcements', require('./routes/analyzeRoute')(verifyToken));
app.use('/api/watchlist',     require('./routes/watchlistRoutes'));
app.use('/api/prefs',         require('./routes/prefRoutes'));
app.use('/api/push',          require('./routes/pushRoutes'));
app.use('/api/portfolio',     require('./routes/portfolioRoutes'));
app.use('/api/alerts',        require('./routes/alertRoutes'));
app.use('/api/dashboard',     require('./routes/dashboardRoutes'));
app.use('/api/ipo',           require('./routes/ipoVerificationRoutes')(verifyToken));
app.use('/api/bse',           require('./routes/bseRoutes')(verifyToken));
app.use('/api/nse',           require('./routes/nseRoutes')(verifyToken));
app.use('/api/market',        require('./routes/marketRoutes')(verifyToken));

// ── Legacy Aliases & Convenience Endpoints ────────────────────────────────────
app.get('/api/search/scripts', (req, res) => res.redirect(`/api/bse/search?q=${encodeURIComponent(req.query.q || '')}`));
app.get('/api/telegram-status', verifyToken, (req, res, next) => {
  req.url = '/telegram-status';
  require('./routes/healthRoutes')(req, res, next);
});
app.post('/api/telegram-test', verifyToken, (req, res, next) => {
  req.url = '/telegram-test';
  require('./routes/healthRoutes')(req, res, next);
});

// User-authenticated manual data refresh
app.post('/api/trigger', verifyToken, async (req, res) => {
  try {
    const stats = await runUserManualTrigger();
    res.json(stats);
  } catch (e) {
    console.error('[User Trigger Error]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Server Bootstrap (Local) ──────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log('');
    console.log('  StockWatch Backend (Modular)');
    console.log(`  API:           http://localhost:${PORT}/api/health`);
    console.log(`  Auth mode:     ${SECURE_MODE ? 'SECURE (Firebase token required)' : 'LOCAL (no auth)'}`);
    console.log(`  CORS origins:  ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`  Alert cron:    (Disabled locally, trigger via /api/cron/trigger)`);
    console.log('');
  });
}

// Export for Vercel serverless
module.exports = app;
