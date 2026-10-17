'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const compression = require('compression');

const { verifyToken, SECURE_MODE } = require('./lib/authMiddleware');
const { requireAdmin }              = require('./middleware/requireAdmin');
const { requestIdMiddleware }       = require('./utils/requestId');
const { stripClientUserParams }     = require('./middleware/authorization');
const { globalRateLimiter }         = require('./middleware/rateLimiter');
const { runUserManualTrigger }      = require('./services/cronService');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security Headers (Enhanced Helmet Configuration) ───────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com", "https://*.firebaseapp.com", "https://checkout.razorpay.com"],
      connectSrc: [
        "'self'", 
        "https://*.firebaseio.com", 
        "https://*.googleapis.com", 
        "https://identitytoolkit.googleapis.com", 
        "https://securetoken.googleapis.com", 
        "https://api.qrserver.com",
        "https://api.bseindia.com",
        "https://www.bseindia.com",
        "https://*.onrender.com",
        "https://tatvarthstockwatch.web.app",
      ],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  dnsPrefetchControl: { allow: false },
}));

// ── Request ID & Parameter Strip Middleware ────────────────────────────────────
app.use(requestIdMiddleware);
app.use(stripClientUserParams);

// ── Runtime Detection (Hybrid Architecture: Vercel Serverless + Render Worker) ─
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const RUNTIME_HOST = IS_VERCEL ? 'vercel' : (IS_RENDER ? 'render' : 'standalone');

// ── Strict CORS Whitelist ─────────────────────────────────────────────────────
const ALLOWED_EXACT_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  'https://tatvarthstockwatch.web.app',
  'https://tatvarthstockwatch.firebaseapp.com',
  'https://tatvarth-stockwatch.vercel.app',
  'https://tatvarth-stock-watch.vercel.app',
  'https://tatvarthstockwatch.onrender.com',
].filter(Boolean));

const DEV_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1):(5173|4173|3000|5000)$/;

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // Server-to-server or non-browser tools
    if (ALLOWED_EXACT_ORIGINS.has(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production' && DEV_ORIGIN_REGEX.test(origin)) return cb(null, true);
    // Explicit subdomain pattern for official deployments only
    if (/^https:\/\/(tatvarthstockwatch|tatvarth-stockwatch|tatvarth-stock-watch)(-[a-z0-9]+)?\.(web\.app|firebaseapp\.com|vercel\.app|onrender\.com)$/.test(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Blocked by CORS: Unauthorized origin'));
  },
  credentials: true,
}));

// ── Body Parsers with DoS Protection Limits ───────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Global Security Sanitizer (NoSQL, Prototype Pollution & XSS Shield) ───────
const { securitySanitizer } = require('./middleware/securitySanitizer');
app.use(securitySanitizer);

// ── HTTP Response Compression (Gzip / Brotli for 100+ Concurrent Scale) ───────
app.use(compression({
  threshold: 1024, // Only compress responses above 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

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
app.use('/api/alerts',        require('./routes/alertRoutes'));
app.use('/api/dashboard',     require('./routes/dashboardRoutes'));
app.use('/api/ipo',           require('./routes/ipoVerificationRoutes')(verifyToken));
app.use('/api/bse',           require('./routes/bseRoutes')(verifyToken));
app.use('/api/nse',           require('./routes/nseRoutes')(verifyToken));
app.use('/api/market',        require('./routes/marketRoutes')(verifyToken));
app.use('/api/admin',         require('./routes/adminRoutes')(verifyToken, requireAdmin));
app.use('/api/baskets',       require('./routes/basketRoutes'));
app.use('/api/plans',         require('./routes/planRoutes')(verifyToken));

// ── Root & Runtime Diagnostic Endpoints ────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Tatvarth StockWatch API',
    version: '1.0.0',
    runtime: RUNTIME_HOST,
    architecture: 'Hybrid Vercel Serverless + Render Worker Engine',
    documentation: '/api/health',
    frontend: 'https://tatvarthstockwatch.web.app',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/system/runtime-info', (req, res) => {
  res.json({
    success: true,
    runtime: RUNTIME_HOST,
    isVercel: IS_VERCEL,
    isRender: IS_RENDER,
    workerActive: !IS_VERCEL && (process.env.ENABLE_BACKGROUND_WORKER === 'true' || process.env.RUN_CRON_WORKER === 'true'),
    architecture: 'Hybrid Vercel Serverless + Render Worker Engine',
    uptimeSec: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

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

// ── User Onboarding Access Request & Admin Notification ─────────────────────
app.post('/api/auth/onboarding-request', verifyToken, async (req, res) => {
  try {
    const { db, admin } = require('./lib/firebaseAdmin');
    const { notifyAdminsOfNewAccessRequest } = require('./lib/userApprovalNotificationService');
    const userRef = db.collection('users').doc(req.uid);
    const snap = await userRef.get();

    const email = (req.user?.email || req.body?.email || '').toLowerCase().trim();
    const displayName = req.user?.name || req.body?.displayName || '';

    // Check if this email was previously approved by an admin
    let wasPreviouslyApproved = false;
    if (email) {
      try {
        const approvedDoc = await db.collection('approved_emails').doc(email).get();
        if (approvedDoc.exists && approvedDoc.data()?.status !== 'rejected') {
          wasPreviouslyApproved = true;
        } else {
          // Fallback query across existing approved users
          const priorSnap = await db.collection('users')
            .where('email', '==', email)
            .where('approvalStatus', '==', 'approved')
            .limit(1)
            .get();
          if (!priorSnap.empty) {
            wasPreviouslyApproved = true;
            await db.collection('approved_emails').doc(email).set({
              email,
              approvedAt: admin.firestore.FieldValue.serverTimestamp(),
              retained: true,
            }, { merge: true }).catch(() => {});
          }
        }
      } catch (checkErr) {
        console.warn('[Approval Retention Check Warning]', checkErr.message);
      }
    }

    if (snap.exists) {
      const data = snap.data();
      if (data.role === 'admin') {
        if (data.approvalStatus !== 'approved') {
          await userRef.set({ approvalStatus: 'approved' }, { merge: true });
        }
        return res.json({ success: true, approvalStatus: 'approved', role: 'admin' });
      }

      // If user document is already approved OR this email was approved before
      if (data.approvalStatus === 'approved' || wasPreviouslyApproved) {
        if (data.approvalStatus !== 'approved') {
          await userRef.set({
            approvalStatus: 'approved',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvalRetained: true,
          }, { merge: true });
        }
        if (email) {
          db.collection('approved_emails').doc(email).set({
            email,
            uid: req.uid,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            retained: true,
          }, { merge: true }).catch(() => {});
        }
        return res.json({ success: true, approvalStatus: 'approved', retained: true });
      }

      if (data.approvalStatus === 'rejected') {
        return res.json({ success: true, approvalStatus: 'rejected', rejectedReason: data.rejectedReason });
      }

      if (data.approvalStatus === 'pending') {
        // If notification has not been sent yet, or if forced resend was requested:
        if (!data.approvalNotificationSent || req.body?.forceResend) {
          await userRef.set({
            approvalNotificationSent: true,
            approvalNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          const notifyResult = await notifyAdminsOfNewAccessRequest({ uid: req.uid, email, displayName }).catch((e) => {
            console.error('[Onboarding Request] Error sending admin notification:', e.message);
            return { error: e.message };
          });

          return res.json({
            success: true,
            approvalStatus: 'pending',
            notificationDispatched: true,
            notifyResult,
          });
        }

        return res.json({
          success: true,
          approvalStatus: 'pending',
          notificationAlreadySent: true,
          notificationSentAt: data.approvalNotificationSentAt,
        });
      }

      // First time setting approvalStatus for this account
      await userRef.set({
        approvalStatus: 'pending',
        approvalNotificationSent: true,
        approvalNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Notify admins via Web Push & Telegram asynchronously with error tracking
      const notifyResult = await notifyAdminsOfNewAccessRequest({ uid: req.uid, email, displayName }).catch((e) => {
        console.error('[Onboarding Request] Error sending admin notification:', e.message);
        return { error: e.message };
      });

      return res.json({ success: true, approvalStatus: 'pending', isNewRequest: true, notifyResult });
    }

    // New user document creation
    const initialStatus = wasPreviouslyApproved ? 'approved' : 'pending';
    const isPending = initialStatus === 'pending';
    await userRef.set({
      displayName,
      email,
      role: 'user',
      entitlements: { read: false, write: false },
      disabled: false,
      approvalStatus: initialStatus,
      approvalNotificationSent: isPending,
      ...(isPending ? { approvalNotificationSentAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(initialStatus === 'approved' ? { approvedAt: admin.firestore.FieldValue.serverTimestamp(), approvalRetained: true } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      prefs: { telegramEnabled: true, inAppEnabled: true, frequency: 'realtime' },
    });

    let notifyResult = null;
    if (isPending) {
      notifyResult = await notifyAdminsOfNewAccessRequest({ uid: req.uid, email, displayName }).catch((e) => {
        console.error('[Onboarding Request] Error sending admin notification:', e.message);
        return { error: e.message };
      });
    }

    res.json({
      success: true,
      approvalStatus: initialStatus,
      isNewRequest: isPending,
      retained: wasPreviouslyApproved,
      notifyResult,
    });
  } catch (err) {
    console.error('[Onboarding Request Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Manual Resend Approval Notification to Admins ──────────────────────────
app.post('/api/auth/resend-approval-notification', verifyToken, async (req, res) => {
  try {
    const { db, admin } = require('./lib/firebaseAdmin');
    const { notifyAdminsOfNewAccessRequest } = require('./lib/userApprovalNotificationService');
    const userRef = db.collection('users').doc(req.uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }

    const data = snap.data();
    if (data.approvalStatus !== 'pending') {
      return res.json({ success: true, approvalStatus: data.approvalStatus, message: 'Account is not pending approval.' });
    }

    // Cooldown check (2 minutes)
    if (data.approvalNotificationSentAt) {
      const lastSent = data.approvalNotificationSentAt?.toDate ? data.approvalNotificationSentAt.toDate() : new Date(data.approvalNotificationSentAt);
      const elapsedMs = Date.now() - (lastSent?.getTime() || 0);
      if (elapsedMs < 120 * 1000) {
        const remainingSec = Math.ceil((120 * 1000 - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          error: `Administrator was notified recently. Please wait ${remainingSec}s before requesting again.`,
          retryAfterSec: remainingSec,
        });
      }
    }

    const email = (req.user?.email || data.email || '').toLowerCase().trim();
    const displayName = req.user?.name || data.displayName || '';

    await userRef.set({
      approvalNotificationSent: true,
      approvalNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const notifyResult = await notifyAdminsOfNewAccessRequest({ uid: req.uid, email, displayName });

    res.json({
      success: true,
      message: 'Approval notification dispatched to all administrator devices successfully.',
      notifyResult,
    });
  } catch (err) {
    console.error('[Resend Approval Notification Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
    console.log(`  CORS origins:  ${Array.from(ALLOWED_EXACT_ORIGINS).join(', ')}`);
    // Autonomous background worker if enabled (Render / standalone container)
    // On Vercel serverless, background intervals are suppressed; background duties are handled exclusively by Render
    if (!IS_VERCEL && (process.env.ENABLE_BACKGROUND_WORKER === 'true' || process.env.RUN_CRON_WORKER === 'true')) {
      console.log('  Alert cron:    ACTIVE (Autonomous 24/7 background worker polling every 90s on Render)');
      const { runGlobalCronTick } = require('./services/cronService');
      // Run initial tick after boot stagger (5s)
      setTimeout(() => {
        runGlobalCronTick().catch((e) => console.error('[Background Worker Boot Error]', e.message));
      }, 5000);
      // Scheduled tick every 90 seconds (1.5 minutes) for near real-time announcement ingestion
      const WORKER_INTERVAL_MS = 90 * 1000;
      setInterval(async () => {
        try {
          await runGlobalCronTick();
        } catch (e) {
          console.error('[Background Worker Loop Error]', e.message);
        }
      }, WORKER_INTERVAL_MS);
    } else if (IS_VERCEL) {
      console.log('  Alert cron:    DELEGATED TO RENDER (Vercel running in stateless serverless mode)');
    } else {
      console.log('  Alert cron:    PASSIVE (Trigger via /api/cron/trigger)');
    }
    console.log(`  Engine Mode:   ${RUNTIME_HOST.toUpperCase()} (Hybrid Multi-Host Topology)`);
    console.log('');
  });
}

// ── Global Error Handler (CORS, Security Violations & Unhandled Errors) ────────
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('Blocked by CORS')) {
    return res.status(403).json({ success: false, error: 'Cross-Origin Request Blocked: Origin not authorized' });
  }
  const status = err.status || (err.name === 'SyntaxError' ? 400 : 500);
  const message = err.message || 'Internal server error';
  if (status >= 500) {
    console.error(`[Unhandled Server Error] [${req.method} ${req.originalUrl}]`, err.stack || err.message);
  }
  res.status(status).json({
    success: false,
    error: message,
    code: err.code || undefined,
  });
});

// Export for Vercel serverless
module.exports = app;
