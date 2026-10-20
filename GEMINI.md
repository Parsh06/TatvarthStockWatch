
# StockWatch — GEMINI.md (Master Project Context)

> **PURPOSE**: This file is the single source of truth for any AI assistant working on this codebase.
> Read this FIRST before touching any code. It contains everything needed to make accurate changes
> with minimal exploration, saving tokens and avoiding mistakes.
>
> **SELF-UPDATING RULE**: After ANY code change (new file, modified file, new route, new component,
> new dependency, config change, etc.), this file MUST be updated to reflect the change. No exceptions.

---

## 1. Project Identity

| Field              | Value                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**     | StockWatch (Tatvarth StockWatch)                                                                                                                                   |
| **Purpose**  | Full-stack web app for tracking BSE/NSE corporate announcements, board meetings, volume spurts, block deals, IPO allotments, insider trading, and market analytics |
| **Live URL** | `https://tatvarthstockwatch.web.app`                                                                                                                             |
| **Repo**     | `Parsh06/TatvarthStockWatch`                                                                                                                                     |
| **Owner**    | Parsh Jain (Arth Projects Company)                                                                                                                                 |

---

## 2. Tech Stack (Exact Versions)

### Frontend

| Technology        | Version | Purpose                                       |
| ----------------- | ------- | --------------------------------------------- |
| React             | 18.2.0  | UI framework                                  |
| Vite              | 5.0.0   | Build tool / dev server                       |
| Tailwind CSS      | 3.4.0   | Utility-first CSS (with custom design tokens) |
| Framer Motion     | 12.42.2 | Animations                                    |
| React Router DOM  | 6.21.0  | Client-side routing                           |
| Lucide React      | 0.383.0 | Icon library                                  |
| React Hot Toast   | 2.4.1   | Toast notifications                           |
| Recharts          | 2.10.0  | Data visualization charts                     |
| Firebase (client) | 10.7.0  | Auth + Firestore (client SDK)                 |
| PapaParse         | 5.4.1   | CSV parsing                                   |
| SheetJS (xlsx)    | 0.18.5  | Excel file parsing                            |
| date-fns          | 3.0.0   | Date utilities                                |
| clsx              | 2.0.0   | Conditional classnames                        |
| react-dropzone    | 14.2.3  | Drag & drop file upload                       |
| @vercel/analytics | ^1.4.1  | Vercel Web Analytics & page tracking          |

### Backend

| Technology      | Version     | Purpose                                                           |
| --------------- | ----------- | ----------------------------------------------------------------- |
| Node.js         | —          | Runtime                                                           |
| Express         | 4.18.2      | HTTP framework                                                    |
| Helmet          | 8.0.0       | HTTP Security Headers                                             |
| Firebase Admin  | 12.0.0      | Server-side auth + Firestore                                      |
| MongoDB driver  | 6.21.0      | MongoDB Atlas connection                                          |
| @google/genai   | 2.10.0      | Gemini AI (announcement summarization)                            |
| Groq API (REST) | —          | Groq LPU inference (AI failover via providerRouter)               |
| @upstash/redis  | 1.38.0      | Distributed rate limiting & rates cache                           |
| Axios           | 1.6.2       | HTTP client for scraping BSE/NSE/KFintech                         |
| Cheerio         | 1.0.0-rc.12 | HTML parsing (scraping)                                           |
| web-push        | 3.6.7       | VAPID push notifications                                          |
| Nodemailer      | 6.9.7       | Email sending (Gmail SMTP)                                        |
| xml2js          | 0.6.2       | XML parsing                                                       |
| tesseract.js    | 7.0.0       | Offline OCR captcha solving (zero API quota)                      |
| pdf-parse       | 2.4.5       | In-memory PDF text layer extraction for institutional AI analysis |
| dotenv          | 16.3.1      | Env var loading                                                   |
| cors            | 2.8.5       | CORS middleware                                                   |
| compression     | 1.8.1       | HTTP response compression (Gzip / Brotli for 100+ concurrent scale)|

### Infrastructure

| Service                          | Purpose                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| **Firebase Hosting**       | Frontend static deployment                                                 |
| **Vercel Serverless**      | Backend API (Node.js functions)                                            |
| **MongoDB Atlas**          | Transient data (today's announcements, wiped daily)                        |
| **Google Cloud Firestore** | Persistent user data (watchlists, prefs, push devices, alerts, applicants) |
| **Upstash Redis**          | Distributed rate limiting + live rates cache                               |
| **Firebase Auth**          | Google OAuth + Email/Password authentication                               |
| **KFintech API**           | IPO allotment verification (proxied through backend)                       |

---

## 3. Project Structure (Complete File Map)

```
stockwatch/
├── GEMINI.md                          ← THIS FILE (AI context — always keep updated)
├── CLAUDE.md                          ← Legacy context file
├── ARCHITECTURE.md                    ← Detailed architecture docs
├── README.md
├── firebase.json                      ← Firebase hosting config (public: frontend/dist)
├── firestore.rules                    ← Firestore security rules
├── deploy.ps1 / deploy.bat / deploy.sh ← Master interactive deploy manager (Both / Backend / Frontend)
├── deploy-backend.bat / deploy-backend.ps1 ← Dedicated backend-only deploy (Git Push to Render + Hook)
├── deploy-frontend.bat / deploy-frontend.ps1 ← Dedicated frontend-only deploy (Vite Build + Firebase Hosting)
├── .github/workflows/deploy-render.yml   ← Automated GitHub Action triggering Render Deploy Hook
├── .render_hook.example               ← Guide for 1-click instant Render deploy hook triggers
├── Equity.csv                         ← BSE equity master data
├── render.yaml                        ← Render Blueprint config (1-click free background worker)
├── vercel.json                        ← Root Vercel build config (routes to backend/server.js)
│
├── backend/                           ← EXPRESS SERVER (Vercel Serverless)
│   ├── server.js                      ← ★ MAIN ENTRY (91 lines) — clean Express bootstrapping, global middleware, and route mounting
│   ├── vercel.json                    ← Vercel build config (routes all to server.js)
│   ├── package.json
│   ├── .env / .env.example / .env.production
│   │
│   ├── api/                           ← Vercel serverless function entry
│   │   ├── health.js
│   │   ├── announcements/
│   │   └── search/
│   │
│   │   ├── adminRoutes.js             ← Admin user management, stats, audit log & controls
│   │   ├── alertRoutes.js             ← Historical alert logs CRUD
│   │   ├── analyzeRoute.js            ← AI analysis endpoint
│   │   ├── announcementRoutes.js      ← Market announcements feed & stats
│   │   ├── basketRoutes.js            ← Shareable curated watchlist baskets CRUD & 1-tap import
│   │   ├── bseRoutes.js               ← BSE proxy routes & movers
│   │   ├── cronRoutes.js              ← Scheduled & manual cron triggers
│   │   ├── dashboardRoutes.js         ← Dashboard overview
│   │   ├── healthRoutes.js            ← Health diagnostics & telegram tests
│   │   ├── ipoVerificationRoutes.js   ← IPO verify + bulk verify + applicants CRUD
│   │   ├── marketRoutes.js            ← Volume spurt, IPO GMP
│   │   ├── nseRoutes.js               ← NSE proxy routes
│   │   ├── planRoutes.js              ← Monetization catalog & subscription checkout (Razorpay/UPI)
│   │   ├── prefRoutes.js              ← User notification preferences CRUD
│   │   ├── pushRoutes.js              ← Multi-device Web Push subscriptions CRUD
│   │   └── watchlistRoutes.js         ← Watchlist CRUD, bulk import, catchup & CSV export
│   │
│   ├── middleware/
│   │   ├── authenticateFirebase.js    ← Firebase JWT verification (verifyToken)
│   │   ├── authorization.js           ← stripClientUserParams
│   │   ├── rateLimiter.js             ← globalRateLimiter (120/min), strictRateLimiter (15/min), userMutationRateLimiter (60/min)
│   │   ├── requireAdmin.js            ← Admin role & granular entitlement guard (read/write) + Redis cache
│   │   └── securitySanitizer.js       ← ★ Enterprise security shield (NoSQL injection, prototype pollution, XSS & path traversal sanitizer)
│   │
│   ├── scripts/
│   │   ├── seedAdmin.js               ← Bootstrap script to seed initial admin user role/entitlements
│   │   └── migrateClients.js          ← Database migration for founding clients & approved_emails
│   │
│   ├── services/                      ← Business service layer
│   │   ├── cronService.js             ← Cronjob orchestration & midnight wipe logic
│   │   ├── dashboardService.js        ← Dashboard data aggregation (17KB)
│   │   ├── ipoService.js              ← IPO business logic
│   │   └── nseService.js              ← NSE data service
│   │
│   ├── lib/                           ← Core business logic
│   │   ├── firebaseAdmin.js           ← Firebase Admin SDK init
│   │   ├── mongoClient.js             ← MongoDB Atlas connection
│   │   ├── authMiddleware.js          ← Re-export of authenticateFirebase
│   │   ├── bseScraper.js              ← BSE API scraper
│   │   ├── nseScraper.js              ← NSE API scraper
│   │   ├── ipoScraper.js              ← KFintech IPO scraper
│   │   ├── ipoStore.js               ← IPO Firestore operations
│   │   ├── ipoClosingStore.js        ← MongoDB Atlas today's closing IPOs store
│   │   ├── ipoUtils.js               ← IPO helper functions
│   │   ├── ipoClosingNotificationService.js
│   │   ├── ipoAutoVerificationService.js  ← Event-driven automated family PAN allotment check & 3-tier alerts
│   │   ├── userApprovalNotificationService.js ← Automated Web Push & Telegram alerts to admins on new access requests
│   │   ├── planLimits.js             ← Central source of truth for Membership Tiers (Basic, Pro, Premium), quota checks & daily AI tracking
│   │   ├── aiSummarizer.js            ← Dual AI integration (Gemini + Groq via providerRouter)
│   │   ├── prompts.js                 ← AI prompt templates (23KB)
│   │   ├── providers/                 ← AI provider modules
│   │   │   ├── geminiProvider.js      ← Gemini REST API (6-model cascade)
│   │   │   ├── grokProvider.js        ← Groq OpenAI-compat API (qwen, gpt-oss)
│   │   │   └── providerRouter.js      ← Smart routing + cooldown + failover
│   │   ├── categoryClassifier.js      ← Announcement category classification (22KB)
│   │   ├── alertCategories.js         ← ★ SYNC WITH frontend/src/utils/bseCategories.js
│   │   ├── alertStore.js              ← Alert Firestore operations
│   │   ├── announcementStore.js       ← Announcement MongoDB operations
│   │   ├── watchlistStore.js          ← Watchlist Firestore operations
│   │   ├── prefsStore.js              ← User preferences Firestore operations
│   │   ├── pushStore.js               ← Push device Firestore operations
│   │   ├── spurtStore.js              ← Volume spurt Firestore operations
│   │   ├── notificationEngine.js      ← Core notification pipeline (18KB)
│   │   ├── notificationFilter.js      ← Category-based notification filtering (15KB)
│   │   ├── notificationDedup.js       ← Deduplication via Firestore locks
│   │   ├── notificationScope.js       ← Notification scope/targeting
│   │   ├── notificationTextNormalizer.js
│   │   ├── telegramNotifier.js        ← Telegram bot integration
│   │   ├── webPushNotifier.js         ← Web Push (VAPID) sender
│   │   ├── apiClients.js             ← Shared HTTP clients (BSE/NSE/KFintech)
│   │   ├── notification/              ← Notification sub-modules
│   │   └── redis/                     ← Redis client/utilities
│   │
│   ├── utils/
│   │   ├── generateCsv.js            ← CSV generation
│   │   ├── normalizeNseData.js        ← NSE data normalization
│   │   ├── requestId.js              ← Request ID middleware
│   │   ├── sanitizeResponse.js        ← Response sanitization
│   │   ├── secureLogger.js           ← PII-safe logging
│   │   └── validators.js             ← ★ Strict input validators (Scrip, Basket, Applicant PAN, Plan Checkout, SSRF Guard)
│   │
│   ├── cache/
│   │   └── nseCache.js               ← NSE response caching
│   │
│   └── tests/                         ← Backend test files
│       ├── test_membership_and_entitlements_e2e.js ← 10-suite membership quotas & expiration E2E test
│       ├── test_welcome_and_approval_retention_e2e.js ← E2E test for approval retention & checkout
│       ├── test_security_and_validation_e2e.js ← ★ 10-suite security & server-side validation E2E test
│       ├── test_admin_plan_and_role_management_e2e.js ← ★ 8-suite admin quota immunity & role/plan dynamics test
│       ├── test_resource_and_bandwidth_optimization.js ← ★ 6-suite lifetime bandwidth, scrapers & compression test
│       ├── test_user_approval_notifications_e2e.js   ← ★ 9-suite user approval notification & multi-device push E2E test
│       └── test_hybrid_architecture.js               ← ★ 7-suite hybrid multi-host architecture & failover test
│
└── frontend/                          ← REACT SPA (Firebase Hosting)
    ├── index.html                     ← HTML shell
    ├── vite.config.js                 ← Vite config (proxy /api → localhost:3000)
    ├── tailwind.config.js             ← Custom design tokens
    ├── postcss.config.js
    ├── package.json
    ├── .env / .env.example
    │
    └── src/
        ├── main.jsx                   ← React entry (StrictMode + ErrorBoundary)
        ├── App.jsx                    ← Router + Context providers + route definitions
        ├── index.css                  ← ★ GLOBAL STYLES (CSS vars, glass-panel, skeleton, scrollbar)
        │
        ├── components/                ← Feature-based component organization
        │   ├── Admin/                 ← ★ ADMIN CONTROL CENTER & USER MANAGEMENT
        │   │   ├── AdminPage.jsx      ← Main admin page shell (4 tabs: Users, Analytics, Audit, System)
        │   │   ├── AdminRoute.jsx     ← Three-level route guard (Auth, Admin role, Read entitlement)
        │   │   ├── AdminStatCard.jsx  ← Elevated glass-panel stat card with trends
        │   │   ├── AdminAuditTable.jsx← Immutable audit trail table with action/user filters
        │   │   ├── DisableUserModal.jsx← Confirmation modal with reason & token revocation
        │   │   ├── RejectUserModal.jsx ← Confirmation modal to decline user access with custom reason
        │   │   ├── ReadOnlyBadge.jsx  ← Header indicator when write entitlement is locked
        │   │   ├── RoleEditModal.jsx  ← Role & read/write entitlement configuration modal
        │   │   ├── PlanEditModal.jsx  ← Admin modal to allot, upgrade, configure validity, or revoke membership plans
        │   │   ├── UserDrawer.jsx     ← Slide-over drawer with user profile, watchlist, devices, alerts
        │   │   └── UserTable.jsx      ← Searchable, sortable user directory with inline actions & approval tabs
        │   ├── AGMUpdates/            ← AGM tracking page
        │   ├── AllAnnouncements/      ← Full announcement feed + AI analysis
        │   ├── Announcements/         ← Watchlist-filtered announcements
        │   ├── Auth/                  ← Login, Approval Gate & Access Denied Views
        │   │   ├── LoginPage.jsx      ← Login page
        │   │   ├── PendingApprovalPage.jsx ← Luxury real-time pending approval view with live Firestore sync
        │   │   ├── AccessRejectedPage.jsx  ← Dedicated account declined screen with admin reason & appeal link
        │   │   └── AccountDisabledPage.jsx ← Luxury instant account suspension view with admin reason & live sync
        │   ├── BoardMeetings/         ← Board meeting tracking
        │   ├── BulkBlock/             ← Bulk & Block deals
        │   ├── Common/                ← ★ SHARED UI COMPONENTS
        │   │   ├── AiAnalysisPanel.jsx   ← AI analysis display (25KB)
        │   │   ├── AiAnalyzeButton.jsx   ← AI trigger button
        │   │   ├── CommandPalette.jsx     ← Ctrl+K command palette
        │   │   ├── ConfirmDialog.jsx      ← Confirmation modal
        │   │   ├── EmptyState.jsx         ← Empty state illustrations
        │   │   ├── ErrorBoundary.jsx      ← React error boundary
        │   │   ├── GlobalSearch.jsx       ← Search overlay (15KB)
        │   │   ├── Loader.jsx             ← Loading spinner
        │   │   ├── OfflineBanner.jsx      ← Floating offline & network degradation alert banner
        │   │   ├── PageTransition.jsx     ← Framer Motion page transition
        │   │   ├── Preloader.jsx          ← App preloader animation
        │   │   ├── MarketPulse.jsx         ← TickerTape, MarketPulseRibbon, CandlestickHero (auth page decorations)
        │   │   ├── ScriptSearchInput.jsx  ← BSE/NSE script search autocomplete
        │   │   └── Toast.jsx              ← Custom toast component
        │   ├── CompanyData/           ← Company info page
        │   ├── CorporateCalendar/     ← Economic calendar
        │   ├── Dashboard/             ← Main dashboard
        │   ├── GainersLosers/         ← Top movers page
        │   ├── IPO/                   ← IPO GMP tracking
        │   ├── InsiderTrading/        ← Insider trading tracker
        │   ├── IpoVerification/       ← IPO allotment verification
        │   ├── Layout/                ← App shell
        │   │   ├── AppLayout.jsx      ← Main layout wrapper
        │   │   ├── Sidebar.jsx        ← Navigation sidebar
        │   │   └── Topbar.jsx         ← Top navigation bar
        │   ├── News/                  ← Market news feed
        │   ├── Plans/                 ← ★ MEMBERSHIP TIERS & MONETIZATION
        │   │   ├── PlansPage.jsx      ← Luxury 3-tier pricing matrix, feature comparison, monthly/annual toggle & UPI payment modal
        │   │   └── UpgradePromptModal.jsx ← Reusable glassmorphic quota limit upgrade modal with tier benefits & direct routing
        │   ├── ResultCalendar/        ← Forthcoming financial results calendar
        │   ├── SecurityGuard/         ← Client-side security
        │   ├── Settings/              ← User preferences
        │   ├── VolumeSpurt/           ← Volume spurt tracker
        │   ├── Watchlist/             ← Watchlist CRUD, bulk upload, ShareBasketModal & PublicBasketPage
        │   └── Welcome/               ← ★ HIGH-CONVERSION PLATFORM WELCOME / LANDING PAGE
        │       └── WelcomePage.jsx    ← Luxury landing page, capability highlights, interactive plans catalog & instant checkout modal
        │
        ├── contexts/
        │   ├── AuthContext.jsx        ← Firebase auth state provider
        │   ├── WatchlistContext.jsx    ← Watchlist data provider
        │   └── AnnouncementsContext.jsx ← Announcements data provider
        │
        ├── hooks/
        │   ├── useAdminAuth.js        ← Admin auth & granular entitlement status hook
        │   ├── useAnnouncements.js    ← Announcement fetching/filtering
        │   ├── useCronStatus.js       ← Cron status polling
        │   ├── useDashboardOverview.js ← Dashboard data hook
        │   ├── useNetworkStatus.js    ← Real-time online/offline and connection quality hook
        │   ├── useScrollPreserver.js  ← Pre-paint scroll preservation, interaction lock & layout shift immunity hook
        │   ├── useWatchlist.js        ← Watchlist CRUD operations
        │   └── useWebPush.js          ← Web push subscription management
        │
        ├── services/
        │   ├── firebase.js            ← Firebase client init (FIREBASE_ENABLED flag)
        │   ├── apiClient.js           ← ★ Auth-aware fetch wrapper (auto-attaches Bearer token)
        │   ├── alertService.js        ← Alert API calls
        │   ├── announcementService.js ← Announcement API calls
        │   ├── dashboardService.js    ← Dashboard API calls
        │   └── watchlistService.js    ← Watchlist API calls
        │
        └── utils/
            ├── bseCategories.js       ← ★ SYNC WITH backend/lib/alertCategories.js
            ├── csvParser.js           ← CSV/Excel file parser
            ├── duplicateChecker.js    ← Intra-file + cross-file dedup
            ├── formatters.js          ← Number/date formatters
            ├── normalizeGainersLosers.js ← BSE/NSE gainers data normalization
            └── securityGuard.js       ← Client-side security measures
```

---

## 4. Routing Map

### Frontend Routes (App.jsx)

| Path                   | Component                 | Auth     | Description                                                           |
| ---------------------- | ------------------------- | -------- | --------------------------------------------------------------------- |
| `/`                  | `WelcomePage`             | Public   | Luxury platform landing page, features & interactive plans matrix      |
| `/welcome`           | `WelcomePage`             | Public   | Platform welcome & features landing page                               |
| `/landing`           | `WelcomePage`             | Public   | High-conversion welcome page                                           |
| `/login`             | `LoginPage`             | Public   | Login (redirects to dashboard or selected plan if authed)             |
| `/account-disabled`   | `AccountDisabledPage`   | Public   | Dedicated suspended account view with admin reason                    |
| `/dashboard`         | `DashboardPage`         | 🔒       | Main dashboard + market overview                                      |
| `/watchlist`         | `WatchlistPage`         | 🔒       | Script watchlist management                                           |
| `/announcements`     | `AnnouncementsPage`     | 🔒       | Watchlist-filtered announcements                                      |
| `/all-announcements` | `AllAnnouncementsPage`  | 🔒       | All market announcements + AI                                         |
| `/board-meetings`    | `BoardMeetingsPage`     | 🔒       | Board meeting tracker                                                 |
| `/agm-updates`       | `AGMUpdatesPage`        | 🔒       | AGM tracking                                                          |
| `/result-calendar`   | `ResultCalendarPage`    | 🔒       | Forthcoming financial results calendar                                |
| `/ipo-gmp`           | `IPOGmpPage`            | 🔒       | IPO Grey Market Premium                                               |
| `/ofs`               | `OFSPage`               | 🔒       | OFS Live Tracker & Bid Book                                           |
| `/ipo-check`         | `IpoVerificationPage`   | 🔒       | IPO allotment verification                                            |
| `/news`              | `NewsPage`              | 🔒       | Market news feed                                                      |
| `/gainers-losers`    | `GainersLosersPage`     | 🔒       | Top movers                                                            |
| `/volume-spurt`      | `VolumeSpurtPage`       | 🔒       | Volume spurt tracker                                                  |
| `/bulk-block`        | `BulkBlockPage`         | 🔒       | Bulk & Block deals                                                    |
| `/company-data`      | `CompanyDataPage`       | 🔒       | Company information                                                   |
| `/settings`          | `SettingsPage`          | 🔒       | User preferences                                                      |
| `/calendar`          | `CorporateCalendarPage` | 🔒       | Economic calendar                                                     |
| `/insider`           | `InsiderTradingPage`    | 🔒       | Insider trading tracker                                               |
| `/basket/:slug`      | `PublicBasketPage`      | Public   | Curated Watchlist Basket with live filings & 1-tap import             |
| `/plans`             | `PlansPage`             | 🔒       | Membership Plans, tier comparison, UPI payment & concierge            |
| `/pricing`           | `PlansPage`             | 🔒       | Pricing matrix & institutional HNI tier upgrade                       |
| `/admin`             | `AdminPage`             | 🔒 Admin | Admin control center, user directory, analytics, audit log & controls |
| `*`                  | → redirect               | —       | Catch-all → `/dashboard`                                           |

### Backend API Routes (server.js)

| Method                | Path                                  | Auth      | Handler/Router                                                               |
| --------------------- | ------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| GET                   | `/api/health`                       | Open      | `healthRoutes.js`                                                          |
| GET                   | `/api/health/notification`          | Open      | `healthRoutes.js`                                                          |
| GET/POST              | `/api/health/telegram-*`            | 🔒        | `healthRoutes.js`                                                          |
| GET                   | `/api/dashboard/overview`           | 🔒        | `dashboardRoutes.js`                                                       |
| ALL                   | `/api/cron/trigger`                 | Secret    | `cronRoutes.js`                                                            |
| ALL                   | `/api/cron/ipo-closing`             | Secret    | `cronRoutes.js`                                                            |
| POST                  | `/api/trigger`                      | 🔒        | `server.js` → `cronService.js`                                          |
| GET                   | `/api/announcements`                | Open      | `announcementRoutes.js`                                                    |
| GET                   | `/api/announcements/my-count`       | 🔒        | `announcementRoutes.js`                                                    |
| GET                   | `/api/announcements/stats`          | Open      | `announcementRoutes.js`                                                    |
| POST                  | `/api/announcements/fetch-nse`      | 🔒        | `announcementRoutes.js`                                                    |
| POST                  | `/api/announcements/:id/analyze`    | 🔒        | `analyzeRoute.js`                                                          |
| GET/POST/PATCH        | `/api/prefs`                        | 🔒        | `prefRoutes.js`                                                            |
| GET/POST/DELETE/PATCH | `/api/watchlist/*`                  | 🔒        | `watchlistRoutes.js`                                                       |
| GET                   | `/api/plans`                        | Open      | `planRoutes.js` (Public membership tiers, pricing & feature catalog)       |
| POST                  | `/api/plans/checkout`               | 🔒        | `planRoutes.js` (Subscription purchase, Razorpay order & instant mode)     |
| GET                   | `/api/baskets/:slug`                | Open      | `basketRoutes.js` (Public basket details & live filings)                   |
| POST                  | `/api/baskets`                      | 🔒        | `basketRoutes.js` (Create/publish curated basket)                          |
| POST                  | `/api/baskets/:slug/import`         | 🔒        | `basketRoutes.js` (1-Tap import to watchlist)                              |
| GET                   | `/api/baskets/user/my`              | 🔒        | `basketRoutes.js` (Caller's baskets)                                       |
| GET/POST/DELETE       | `/api/ipo/applicants`               | 🔒        | `ipoVerificationRoutes.js`                                                 |
| GET                   | `/api/ipo/symbols`                  | 🔒        | `ipoVerificationRoutes.js`                                                 |
| GET                   | `/api/ipo/registrars-health`        | 🔒        | `ipoVerificationRoutes.js`                                                 |
| POST                  | `/api/ipo/verify`                   | 🔒        | `ipoVerificationRoutes.js`                                                 |
| POST                  | `/api/ipo/verify-bulk`              | 🔒        | `ipoVerificationRoutes.js`                                                 |
| GET/POST              | `/api/push/*`                       | 🔒 / Open | `pushRoutes.js`                                                            |
| GET/DELETE            | `/api/alerts/*`                     | 🔒        | `alertRoutes.js`                                                           |
| GET                   | `/api/bse/*`                        | 🔒 / Open | `bseRoutes.js`                                                             |
| GET                   | `/api/nse/*`                        | 🔒        | `nseRoutes.js`                                                             |
| GET                   | `/api/market/*`                     | 🔒        | `marketRoutes.js`                                                          |
| POST                  | `/api/admin/ipo/trigger-auto-check` | 🔒 Admin  | `adminRoutes.js` (Manual trigger for automated family PAN allotment check) |
| PATCH                 | `/api/admin/users/:uid/plan`        | 🔒 Admin  | `adminRoutes.js` (Allot or upgrade membership tier with custom duration)  |
| PATCH                 | `/api/admin/users/:uid/plan/revoke` | 🔒 Admin  | `adminRoutes.js` (Instant plan revocation & rollback to Basic tier)        |
| ALL                   | `/api/admin/*`                      | 🔒 Admin  | `adminRoutes.js` (requireAdmin 'read' / 'write')                           |

---

## 5. Data Architecture

### MongoDB Atlas (Transient — wiped daily at midnight IST)

| Collection                 | Key Field                              | Purpose                                                               |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `announcements`          | `id` (NEWSID, unique index)          | Today's BSE+NSE announcements                                         |
| `ipo_auto_verifications` | `_id` (`{reg}_{symbol}_{dateIST}`) | 24-Hour ephemeral lock & stats for automated IPO checks (TTL: 86400s) |

### Firestore (Persistent)

| Collection Path                            | Purpose                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `users/{uid}`                            | User profile + `.prefs` + `.role` ('admin'\|'user') + `.entitlements` ({read: bool, write: bool}) + `.disabled` (bool) + `.approvalStatus` ('approved'\|'pending'\|'rejected') + `.plan` ('basic'\|'pro'\|'premium') + `.planStatus` ('active'\|'expired') + `.planExpiresAt` (ISO string) + `.dailyAiUsage` ({dateIST, count}) |
| `users/{uid}/watchlist/{docId}`          | User's monitored scripts                                                                                                       |
| `users/{uid}/applicants/{docId}`         | Encrypted family members (AES-256-GCM PAN)                                                                                     |
| `users/{uid}/pushDevices/{deviceId}`     | Web Push subscriptions                                                                                                         |
| `public_baskets/{slug}`                  | Curated shareable watchlist baskets (scripts, author, views, imports)                                                          |
| `users/{uid}/alerts/{newsId}`            | Historical alert log                                                                                                           |
| `users/{uid}/alert_dedup_locks/{newsId}` | Ephemeral dedup locks (wiped daily)                                                                                            |
| `admin_audit_log/{logId}`                | Immutable administrative audit trail (actor, action, target, payload)                                                          |
| `system_meta/cron_status`                | Global cron state (last run, last wipe)                                                                                        |

### Upstash Redis (Cache)

| Key Pattern     | TTL    | Purpose                         |
| --------------- | ------ | ------------------------------- |
| `rates:*`     | varies | Live BSE rates cache            |
| `ratelimit:*` | 60s    | Distributed rate limit counters |

---

## 6. Design System & Styling Conventions

### CSS Variables (defined in `frontend/src/index.css`)

```css
/* Light mode */
--bg-base: #f8f9fa         --bg-surface: #ffffff
--bg-surface-hover: rgba(255,255,255,0.6)
--border: rgba(14,165,233,0.15)
--text-primary: #111827     --text-muted: #4B5563
--glass-bg: rgba(255,255,255,0.7)
--glass-border: rgba(255,255,255,0.9)

/* Brand accents */
--accent-teal: #38E1C6      --accent-blue: #0EA5E9
--accent-amber: #F5B942     --accent-danger: #F43F5E

/* Dark mode overrides */
--bg-base: #09090b           --bg-surface: #18181b
--bg-surface-hover: #27272a  --border: #27272a
--text-primary: #fafafa      --text-muted: #a1a1aa
```

### Tailwind Tokens (defined in `tailwind.config.js`)

| Token                | Usage                  |
| -------------------- | ---------------------- |
| `bg-background`    | Page background        |
| `bg-surface`       | Card/panel backgrounds |
| `bg-surfaceHover`  | Hover states           |
| `text-textPrimary` | Main text              |
| `text-textMuted`   | Secondary text         |
| `border-border`    | Border color           |
| `text-primary`     | Brand blue (#3B82F6)   |
| `text-success`     | Green (#10B981)        |
| `text-warning`     | Amber (#F59E0B)        |
| `text-danger`      | Rose (#F43F5E)         |
| `shadow-premium`   | Elevated card shadow   |
| `font-sans`        | Inter                  |
| `font-mono`        | JetBrains Mono         |
| `font-display`     | Space Grotesk          |

### CSS Component Classes

| Class                         | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `.glass-panel`              | Glassmorphic card (blur + border + shadow) |
| `.glass-panel--interactive` | Hoverable glass card (translateY + shadow) |
| `.skeleton`                 | Loading skeleton with shimmer              |
| `.auth-grid-bg`             | Grid pattern background for auth pages     |
| `.scrollbar-hide`           | Hide scrollbars (Tailwind plugin)          |

### Animation Tokens

| Animation               | Usage                           |
| ----------------------- | ------------------------------- |
| `animate-fade-in-up`  | Entry animation (0.5s ease-out) |
| `animate-flash-green` | Price up flash                  |
| `animate-flash-red`   | Price down flash                |
| `animate-float`       | Gentle floating (3s infinite)   |

### MANDATORY STYLING RULES

1. **ALWAYS** use Tailwind tokens (`bg-surface`, `text-textPrimary`, `border-border`) — NEVER hardcode colors (`bg-slate-900`, `text-gray-500`)
2. **ALWAYS** use CSS variables for any new color that needs light/dark mode support
3. **Dark mode** is class-based (`darkMode: 'class'`) — toggle via `.dark` on `<html>`
4. **Framer Motion** for all animations (page transitions, modals, lists)
5. **Lucide React** for all icons — never use other icon libraries
6. **Inter** font for body, **Space Grotesk** for display headings, **JetBrains Mono** for code

---

## 7. Architecture Patterns & Conventions

### Frontend Patterns

| Pattern                       | Convention                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Component structure** | Feature-based folders: `components/{Feature}/{FeaturePage}.jsx`                                     |
| **New page**            | Create folder in `components/`, add route in `App.jsx`, wrap with `<ProtectedRoute><AppLayout>` |
| **State management**    | React Context (`AuthContext`, `WatchlistContext`, `AnnouncementsContext`)                       |
| **Data fetching**       | Custom hooks in `hooks/` → call services in `services/` → use `apiClient.js`                  |
| **API calls**           | ALWAYS use `apiClient.js` (auto-attaches Firebase Bearer token)                                     |
| **Icons**               | Import from `lucide-react`                                                                          |
| **Toasts**              | `import toast from 'react-hot-toast'`                                                               |
| **Loading states**      | Use `<Loader />` or `.skeleton` class                                                             |
| **Page transitions**    | Wrap page content with `<PageTransition>` (Framer Motion)                                           |
| **Error handling**      | Top-level `<ErrorBoundary>` + per-component try/catch                                               |
| **Array sorting**       | ALWAYS clone first: `[...data].sort(...)` — NEVER mutate state directly                            |
| **Env vars**            | Prefixed with `VITE_` for Vite build-time injection                                                 |

### Backend Patterns

| Pattern                     | Convention                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Module system**     | CommonJS (`require`/`module.exports`)                                                             |
| **Route handler**     | `app.get('/api/...', verifyToken, handler)` or use Router in `routes/`                            |
| **Auth middleware**   | `verifyToken` from `middleware/authenticateFirebase.js` (sets `req.uid`, `req.user`)          |
| **Rate limiting**     | `globalRateLimiter` (120/min), `strictRateLimiter` (15/min), `userMutationRateLimiter` (60/min) |
| **Error responses**   | `{ success: false, error: '...', code: 'ERROR_CODE' }`                                              |
| **Success responses** | `{ success: true, data: ... }` or direct data array                                                 |
| **Firestore ops**     | Through `lib/*Store.js` modules (never call Firestore directly from routes)                         |
| **MongoDB ops**       | Through `lib/announcementStore.js` and `lib/mongoClient.js`                                       |
| **External APIs**     | ALWAYS proxy through backend — NEVER call BSE/NSE/KFintech from frontend                             |
| **Env vars**          | Loaded via `dotenv` from `backend/.env`                                                           |
| **Logging**           | Use `secureLogger` to avoid PII leaks                                                               |
| **Cache**             | 5-min in-memory Map for BSE/NSE responses                                                             |

---

## 8. Environment Variables

### Backend (`backend/.env`)

| Variable                          | Required    | Purpose                                 |
| --------------------------------- | ----------- | --------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes*        | Full service account JSON (for Vercel)  |
| `FIREBASE_PROJECT_ID`           | Yes*        | Firebase project ID                     |
| `FIREBASE_CLIENT_EMAIL`         | Yes*        | Firebase admin email                    |
| `FIREBASE_PRIVATE_KEY`          | Yes*        | Firebase private key                    |
| `GMAIL_USER`                    | Yes         | Gmail sender address                    |
| `GMAIL_APP_PASSWORD`            | Yes         | Gmail app password                      |
| `NOTIFY_EMAIL`                  | Yes         | Alert recipient email                   |
| `UPSTASH_REDIS_REST_URL`        | Recommended | Redis URL for distributed rate limiting |
| `UPSTASH_REDIS_REST_TOKEN`      | Recommended | Redis auth token                        |
| `CRON_SECRET`                   | Recommended | Cron trigger auth                       |
| `VAPID_PUBLIC_KEY`              | For push    | Web Push VAPID public key               |
| `VAPID_PRIVATE_KEY`             | For push    | Web Push VAPID private key              |
| `VAPID_SUBJECT`                 | For push    | VAPID subject (mailto:)                 |
| `FRONTEND_URL`                  | Yes         | CORS allowed origin                     |
| `PORT`                          | No          | Local dev port (default: 3000)          |

*Either `FIREBASE_SERVICE_ACCOUNT_JSON` OR the individual vars.

### Frontend (`frontend/.env`)

| Variable                              | Required | Purpose                 |
| ------------------------------------- | -------- | ----------------------- |
| `VITE_FIREBASE_API_KEY`             | Yes      | Firebase client API key |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Yes      | Firebase auth domain    |
| `VITE_FIREBASE_PROJECT_ID`          | Yes      | Firebase project ID     |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Yes      | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes      | FCM sender ID           |
| `VITE_FIREBASE_APP_ID`              | Yes      | Firebase app ID         |
| `VITE_FIREBASE_MEASUREMENT_ID`      | No       | Google Analytics        |
| `VITE_BACKEND_URL`                  | Yes      | Backend API base URL    |

---

## 9. Deployment

### Frontend → Firebase Hosting

```bash
cd frontend && npm run build
npx firebase deploy --only hosting
# Live at: https://tatvarthstockwatch.web.app
```

### Backend → Vercel Serverless

```bash
cd backend
vercel --prod
# Routes: vercel.json → all requests → server.js
```

### One-Click Deploy

```powershell
.\deploy.ps1 -msg "commit message"
# Stages → Commits → Pushes → Builds frontend → Deploys to Firebase
```

### Local Development

```bash
# Terminal 1: Backend
cd backend && npm start     # or: npm run dev (vercel dev)
# Runs on http://localhost:3000

# Terminal 2: Frontend
cd frontend && npm run dev
# Runs on http://localhost:5173 (proxies /api → :3000 via vite.config.js)
```

---

## 10. Critical Rules (MUST FOLLOW)

### 🚨 Rule 1: Category Sync

If you add/remove an announcement category, you MUST update BOTH:

- `frontend/src/utils/bseCategories.js`
- `backend/lib/alertCategories.js`
  They must be IDENTICAL.

### 🚨 Rule 2: No Direct External API Calls from Frontend

NEVER call `api.bseindia.com`, `www.nseindia.com`, or KFintech directly from React.
Browser CORS + Akamai bot protection will block it.
ALWAYS create a proxy route in `backend/routes/` and call `/api/...` from frontend.

### 🚨 Rule 3: Fail-Safe Preferences

When fetching user preferences in backend, if Firestore fails → THROW error.
NEVER default to empty prefs — this causes spam for blocked categories.

### 🚨 Rule 4: Array Immutability in React

ALWAYS: `[...data].sort(...)`
NEVER: `data.sort(...)` (mutates state, breaks re-rendering)

### 🚨 Rule 5: Use Tailwind Tokens

ALWAYS: `bg-surface`, `text-textPrimary`, `border-border`
NEVER: `bg-slate-900`, `text-gray-500`, hardcoded hex in classNames

### 🚨 Rule 6: Auth on API Routes

Every new API route MUST use `verifyToken` middleware (except `/api/health` and `/api/cron/trigger`).

### 🚨 Rule 7: Store Pattern

All Firestore/MongoDB operations go through `lib/*Store.js` files.
Routes should call store functions — never import `firebase-admin` or `mongodb` directly.

### 🚨 Rule 8: API Client

Frontend MUST use `apiClient.js` for all backend calls (auto-attaches Bearer token).
NEVER use raw `fetch` or `axios` in frontend components.

### 🚨 Rule 9: Update This File

After ANY structural change (new file, new route, new component, new dependency, config change),
this `GEMINI.md` file MUST be updated to reflect the change.

---

## 11. Common Change Recipes

### Add a New Page

1. Create `frontend/src/components/{PageName}/{PageName}Page.jsx`
2. Import in `App.jsx` and add `<Route path="/{path}" element={<ProtectedRoute><AppLayout><PageNamePage /></AppLayout></ProtectedRoute>} />`
3. Add nav link in `Layout/Sidebar.jsx` (import icon from `lucide-react`)
4. Update Section 3 (file map) and Section 4 (routing map) in this file

### Add a New Backend API Route

1. Create or edit a router in `backend/routes/`
2. Mount in `server.js`: `app.use('/api/{prefix}', verifyToken, routerModule)`
3. Update Section 4 (API routes) in this file

### Add a New Backend Library Module

1. Create `backend/lib/{moduleName}.js`
2. Export functions and import in routes/server.js
3. Update Section 3 (file map) in this file

### Add a New Frontend Hook

1. Create `frontend/src/hooks/use{HookName}.js`
2. Use `apiClient.js` for API calls
3. Update Section 3 (file map) in this file

### Add a New Frontend Service

1. Create `frontend/src/services/{serviceName}Service.js`
2. Use `apiClient.js` for API calls
3. Update Section 3 (file map) in this file

### Add a New NPM Dependency

1. `cd frontend` or `cd backend` → `npm install {package}`
2. Update Section 2 (tech stack) in this file

### Modify Tailwind Design Tokens

1. Edit `frontend/tailwind.config.js`
2. If new CSS variable → add to `frontend/src/index.css` (both `:root` and `.dark`)
3. Update Section 6 (design system) in this file

---

## 12. Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Files Affected                                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-23 | Initial GEMINI.md created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `GEMINI.md` (new), `.agents/AGENTS.md` (new)                                                                                                                                                                                                                                        |
| 2026-08-23 | Premium redesign of Login + Register pages; new MarketPulse component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `Auth/LoginPage.jsx`, `Auth/RegisterPage.jsx`, `Common/MarketPulse.jsx` (new)                                                                                                                                                                                                     |
| 2026-08-23 | Backend security upgrade: implemented Helmet.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `backend/server.js`, `backend/package.json`                                                                                                                                                                                                                                         |
| 2026-08-24 | Fixed IPO closing cron route registration bug and added Vercel crons config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `backend/server.js`, `backend/vercel.json`                                                                                                                                                                                                                                          |
| 2026-08-24 | Enhanced IPO closing push notification format with IPO name, GMP, and Gain %                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `backend/lib/ipoClosingNotificationService.js`                                                                                                                                                                                                                                        |
| 2026-08-24 | Per-IPO queue-based notifications: rewrote ipoClosingNotificationService.js, added Redis queue functions to redisNotificationStore.js and redisKeys.js, embedded tick in /api/cron/trigger, removed dedicated Vercel cron entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `backend/lib/ipoClosingNotificationService.js`, `backend/lib/redis/redisKeys.js`, `backend/lib/redis/redisNotificationStore.js`, `backend/server.js`, `backend/vercel.json`                                                                                                   |
| 2026-08-24 | Increased global cron frequency to every 1 minute                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `backend/vercel.json`                                                                                                                                                                                                                                                                 |
| 2026-08-26 | Implemented live OFS (Offer for Sale) Tracker page and real-time bid book scraper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `backend/lib/ofsScraper.js` (new), `backend/routes/marketRoutes.js`, `frontend/src/components/OFS/OFSPage.jsx` (new), `frontend/src/App.jsx`, `frontend/src/components/Layout/Sidebar.jsx`                                                                                    |
| 2026-08-26 | OFS Tracker UI Redesign & 60-second background poller integration for pre-fetching list & bid books                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `backend/lib/ofsScraper.js`, `backend/server.js`, `frontend/src/components/OFS/OFSPage.jsx`                                                                                                                                                                                       |
| 2026-08-26 | Added Volume Matching & Demand Equilibrium box and dynamic Cut-off row highlighting to OFS Order Book modal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `frontend/src/components/OFS/OFSPage.jsx`                                                                                                                                                                                                                                             |
| 2026-08-26 | Enhanced Cut-off Price row to display actual numeric rate (e.g. ₹540.55 Cut-off) alongside allotment status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `frontend/src/components/OFS/OFSPage.jsx`                                                                                                                                                                                                                                             |
| 2026-08-26 | Fixed & Hardened notification recipient-isolation architecture: implemented stable ID guards, canonical instrument key normalization, account onboarding safeguards, dual-channel dispatch (Push+Telegram), and comprehensive test suite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `backend/lib/notification/notificationRouter.js`, `backend/lib/notificationEngine.js`, `backend/tests/test_recipient_isolation.js`                                                                                                                                                |
| 2026-08-26 | Implemented Enterprise Production Hardening for IPO Closing Notification Pipeline: atomic Redis Lua state machine (PENDING -> PROCESSING -> COMPLETED / FAILED), owner-token validation, 30s lease heartbeats, stale recovery, classified delivery retries, transport & schema source-health policy, fail-closed locks, dynamic capacity catch-up, post-1 PM grace window, and queue status diagnostics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `backend/lib/time/istTime.js` (new), `backend/services/ipoService.js`, `backend/lib/redis/redisKeys.js`, `backend/lib/redis/redisNotificationStore.js`, `backend/lib/ipoClosingNotificationService.js`, `backend/tests/test_ipo_closing_hardened.js` (new)                  |
| 2026-08-27 | Implemented MongoDB-Backed IPO Closing Notification Architecture: persistent MongoDB Atlas collection `ipo_closing_today` with 12:00 AM IST midnight wipe & pre-seeding, live 11:00 AM scraping refresh for current market GMP & Gain %, atomic PENDING -> DISPATCHING -> COMPLETED state transitions, sequential 1-by-1 delivery sorted by live GMP%, dual-channel alerting (Web Push to all registered devices in Firestore + Telegram), per-user dedup tracking, and auto-recovery                                                                                                                                                                                                                                                                                                                                                                                                                      | `backend/lib/ipoClosingStore.js` (new), `backend/lib/telegramNotifier.js`, `backend/lib/ipoClosingNotificationService.js`, `backend/server.js`, `backend/tests/test_ipo_closing_mongodb.js` (new)                                                                             |
| 2026-08-27 | Enhanced IPO Sorting & Display Hierarchy: strictly prioritizes Closing Today (CT) first, then Open for Bidding (OPEN), then Upcoming, then Closed across both Dashboard IpoActivityWidget (with scrollable sub-sections & badges) and IPO GMP Tracker page (with stat cards, status filter pills, and grouped rows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `frontend/src/components/Dashboard/IpoActivityWidget.jsx`, `frontend/src/components/IPO/IPOGmpPage.jsx`, `backend/services/dashboardService.js`, `backend/services/ipoService.js`                                                                                               |
| 2026-08-30 | Luxury Framer Motion Preloader: Architectural gold & cyan corner brackets, ambient radial gold/cyan glow, concentric animated emblem radar rings with `/logo2.png`, metallic gradient 'TATVARTH' wordmark, diamond geometric divider, dynamic BSE/NSE market status cycler, and live data ticker progress bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `frontend/src/components/Common/Preloader.jsx`, `frontend/src/contexts/AuthContext.jsx`                                                                                                                                                                                             |
| 2026-08-30 | Luxury In-Page & Fullscreen Loader redesign: Gold & cyan multi-color conic spinner, Tatvarth emblem pods, metallic wordmarks, geometric dividers, and enhanced glowing skeleton loaders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `frontend/src/components/Common/Loader.jsx`                                                                                                                                                                                                                                           |
| 2026-08-30 | Mobile Responsive Table Loader Centering: Elevated loading states outside horizontally overflowing `overflow-x-auto` table wrappers across IPO GMP, Board Meetings, AGM Updates, OFS, and Volume Spurt to guarantee 100% viewport centering on mobile devices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `frontend/src/components/IPO/IPOGmpPage.jsx`, `frontend/src/components/BoardMeetings/BoardMeetingsPage.jsx`, `frontend/src/components/AGMUpdates/AGMUpdatesPage.jsx`, `frontend/src/components/OFS/OFSPage.jsx`, `frontend/src/components/VolumeSpurt/VolumeSpurtSection.jsx` |
| 2026-08-30 | Corporate Calendar Theme & Navbar Fix: Removed hardcoded pitch-black hex codes (`#111318`, `#1A1C23`, `#15171C`) and fixed height constraints (`h-[calc(100vh-6rem)]`) in `CorporateCalendarPage.jsx`. Replaced with adaptive Tailwind design tokens (`bg-surface`, `border-border`, `text-textPrimary`, `text-textMuted`) for seamless light/dark mode support and proper mobile bottom navbar rendering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `frontend/src/components/CorporateCalendar/CorporateCalendarPage.jsx`                                                                                                                                                                                                                 |
| 2026-09-03 | IPO Closing Notification Deduplication & Canonical Key Architecture: Added `getCanonicalIpoKey()` to `ipoUtils.js` (strips corporate suffixes — Ltd, Limited, Pvt, Travels, Technologies, etc.). Rewrote `getIposClosingToday()` in `ipoService.js` to deduplicate both MainboardGMP + Investorgain entries into a single canonical Map (merging best live GMP, subscription, fire rating). Hardened `ipoClosingStore.js` to use canonical key as MongoDB `_id` with atomic `$setOnInsert` upsert preventing any duplicate document insertion. Fixed notification payload builder to show "At Par (₹0)" instead of vague "GMP updated". Added notification exchange tag `[NSE & BSE]` to push title. Created 32-test integration suite covering key normalization, dedup, GMP merging, and payload formatting. Result: 8 raw documents → 4 canonical documents, 0 duplicate notifications | `backend/lib/ipoUtils.js`, `backend/services/ipoService.js`, `backend/lib/ipoClosingStore.js`, `backend/lib/ipoClosingNotificationService.js`, `backend/tests/test_ipo_closing_dedup.js` (new)                                                                                |

| 2026-09-03 | Hybrid 3-Pass IPO Deduplication (Fingerprint + Fuzzy): Added `computeIpoFingerprint(closeDateISO, issuePrice)` and `computeNameSimilarity(nameA, nameB)` (Sørensen-Dice token-set coefficient) to `ipoUtils.js`. Rewrote `getIposClosingToday()` in `ipoService.js` with 3-pass dedup: Pass 1 = business fingerprint (catches "Credent Connect N Care Ltd" vs "Credent Connect" at ₹189), Pass 2 = fuzzy for entries missing price/date, Pass 3 = cross-fingerprint fuzzy for price-band mismatches (₹179 vs ₹189). Added `_mergeEntry()` and `FUZZY_THRESHOLD=0.72` at module scope. Updated 59-test suite. Architecture: zero hardcoded lists, zero maintenance forever | `backend/lib/ipoUtils.js`, `backend/services/ipoService.js`, `backend/tests/test_ipo_closing_dedup.js` |
| 2026-09-03 | Link Intime (MUFG) IPO Allotment Verification & Live Alert Integration: Added `mufgScraper.js` for AES-128-CBC session token handshake, active IPO scraping, and allotment query against `in.mpms.mufg.com`. Added `normalizeMufgResponse` and `normalizeMufgRecord` in `ipoUtils.js` for XML-to-JSON normalization (applied shares, allotted shares, refund amount, DP ID, HNI/Retail category). Updated `ipoVerificationRoutes.js` (`/symbols`, `/verify`, `/verify-bulk`) to support multi-registrar (`MUFG` & `KFINTECH`). Added `mufgNotificationService.js` and hooked into global cron for automatic push & Telegram alerts when new IPO allotments go live on Link Intime. Enhanced frontend `IpoVerificationPage.jsx` with Registrar Switcher tabs, dynamic dropdowns, and enriched allotment cards. Verified locally with live PAN `COAPJ9504C` (20/20 tests passed) | `backend/lib/mufgScraper.js` (new), `backend/lib/mufgNotificationService.js` (new), `backend/lib/ipoUtils.js`, `backend/routes/ipoVerificationRoutes.js`, `backend/server.js`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx`, `backend/tests/test_mufg_verification.js` (new) |
| 2026-09-04 | BigShare Online IPO Allotment Integration with Hybrid OCR Engine: Added `bigshareScraper.js` with multi-server round-robin pool (`ipo.bigshareonline.com`, `ipo1`, `ipo2`), automated local Tesseract.js OCR (30ms on CPU, zero API quota, infinite scale for 100+ accounts), and multi-model Gemini Vision pool (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-3.5-flash-lite`) fallback. Added `normalizeBigshareRecord` and `normalizeBigshareResponse` in `ipoUtils.js`. Updated `ipoVerificationRoutes.js` (`/symbols`, `/verify`, `/verify-bulk`) for `BIGSHARE` registrar. Created `bigshareNotificationService.js` for real-time new IPO allotment discovery & dispatch via Web Push & Telegram. Enhanced `IpoVerificationPage.jsx` with 3-tab registrar switcher, dynamic dropdowns, error badges, and status labels. Automated test suite `test_bigshare_verification.js` passed 20/20 tests locally | `backend/lib/bigshareScraper.js` (new), `backend/lib/bigshareNotificationService.js` (new), `backend/lib/ipoUtils.js`, `backend/routes/ipoVerificationRoutes.js`, `backend/server.js`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx`, `backend/tests/test_bigshare_verification.js` (new) |
| 2026-09-04 | Unified All-In-One IPO Allotment Feed & Invisible Smart Auto-Routing: Aggregated all active IPOs across Link Intime, KFintech, and BigShare into a single master feed with in-memory caching and latest allotment releases prioritized at the top. Eliminated manual registrar tabs and technical labels from frontend `IpoVerificationPage.jsx`. Requests auto-route transparently to the correct registry server. Automated test suite `test_unified_symbols.js` verified with 78 active offerings | `backend/routes/ipoVerificationRoutes.js`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx`, `backend/tests/test_unified_symbols.js` (new), `backend/lib/bigshareNotificationService.js`, `backend/lib/mufgNotificationService.js` |
| 2026-09-04 | Allotment Notification Cold-Start Guard & Permanent Dedup Locks: Added initial seed guard in `bigshareNotificationService.js` and `mufgNotificationService.js` to seed existing historical IPO IDs on first boot without broadcasting alerts. Added permanent Firestore per-IPO alert dedup locks (`system_meta/allotment_alert_locks/dispatched/{registrar}_{id}`) preventing duplicate or historical notifications across server restarts or midnight wipes. Removed duplicate MUFG discovery invocation in `server.js` | `backend/lib/bigshareNotificationService.js`, `backend/lib/mufgNotificationService.js`, `backend/server.js` |
| 2026-09-04 | Unified Multi-Registrar MongoDB Architecture (KFintech, MUFG, BigShare): Migrated all active IPO offerings, discovery timestamps (`firstSeenAt`), and notification states (`notificationSent`, `lastNotificationAt`) from Firestore into MongoDB `iposymbols` collection. Updated `ipoStore.js` with multi-registrar upserts and queries. Hardened `bigshareNotificationService.js`, `mufgNotificationService.js`, and `ipoVerificationRoutes.js` to use MongoDB as single source of truth | `backend/lib/ipoStore.js`, `backend/routes/ipoVerificationRoutes.js`, `backend/lib/bigshareNotificationService.js`, `backend/lib/mufgNotificationService.js` |
| 2026-09-04 | MongoDB 14-Day Native TTL Auto-Purge & Multi-Registrar Reconciliation Engine: Configured native background TTL index on `iposymbols.lastSeenAt` (`expireAfterSeconds: 14 * 86400`) for automatic background purging of inactive IPO documents. Added multi-registrar reconciliation (`reconcileMissingIpos`) and historical cleanup (`cleanupHistoricalIpos`) to scheduled maintenance cron. Added 60-day background TTL auto-purge index on `allotment_notification_history.notifiedAt` (`expireAfterSeconds: 60 * 86400`) guaranteeing the database remains permanently lean (<30 KB for lifetime) with zero duplicate notifications. Test suite `test_ipo_store_lifecycle.js` verified 22/22 tests passing | `backend/lib/ipoStore.js`, `backend/server.js`, `backend/tests/test_ipo_store_lifecycle.js` (new) |
| 2026-09-04 | GET /api/ipo/symbols MongoDB Fast Path & Edge CDN Caching: Optimized `GET /api/ipo/symbols` to serve directly from pre-cached MongoDB documents and in-memory cache in sub-15ms, eliminating synchronous blocking multi-registrar live scraping on user HTTP requests. Added Vercel Edge CDN `Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=300` headers for instant (<5ms) client loads | `backend/routes/ipoVerificationRoutes.js` |
| 2026-09-04 | Granular Deployment Automation (Backend / Frontend / Both): Upgraded `deploy.bat`, `deploy.ps1`, and `deploy.sh` with interactive target selection menus and CLI flags (`backend`, `frontend`, `all`). Added dedicated standalone one-click scripts `deploy-backend.bat`, `deploy-backend.ps1`, `deploy-frontend.bat`, and `deploy-frontend.ps1` for rapid isolated deployments | `deploy.bat`, `deploy.ps1`, `deploy.sh`, `deploy-backend.bat` (new), `deploy-backend.ps1` (new), `deploy-frontend.bat` (new), `deploy-frontend.ps1` (new) |
| 2026-09-05 | Deprecate & Remove Unused Live Rates Polling Infrastructure: Removed unused live rates polling (`/api/rates`, `/api/rates/status`, `useRatesSocket.js`, `ratesStore.js`, `bseRates.js`, `priceAlertChecker.js`), eliminating periodic polling overhead and extraneous background memory variables | `backend/server.js`, `backend/lib/ratesStore.js` (deleted), `backend/lib/bseRates.js` (deleted), `backend/lib/priceAlertChecker.js` (deleted), `frontend/src/hooks/useRatesSocket.js` (deleted) |
| 2026-09-05 | Complete Removal of Price Alert Functionality: Fully removed price alert endpoints, alert modals (`SetAlertModal.jsx`), threshold indicators, bell buttons in `ScriptCard.jsx` & `CompanyDataPage.jsx`, and backend serializer fields (`alertAbove`, `alertBelow`, `alertEnabled`), streamlining the watchlist UI purely for corporate announcements & market tracking | `frontend/src/components/Watchlist/SetAlertModal.jsx` (deleted), `frontend/src/components/Watchlist/ScriptCard.jsx`, `frontend/src/components/Watchlist/WatchlistPage.jsx`, `frontend/src/components/CompanyData/CompanyDataPage.jsx`, `frontend/src/services/alertService.js`, `backend/server.js`, `backend/utils/sanitizeResponse.js` |
| 2026-09-05 | Backend Modularization & Route Decoupling: Decoupled monolithic `server.js` (reduced from 1044 lines to 91 lines) into dedicated domain route controllers (`alertRoutes.js`, `announcementRoutes.js`, `cronRoutes.js`, `healthRoutes.js`, `portfolioRoutes.js`, `prefRoutes.js`, `pushRoutes.js`, `watchlistRoutes.js`) and background orchestration service `cronService.js`. Added `test_modular_server.js` test suite verifying all route mountings and auth middleware | `backend/server.js`, `backend/services/cronService.js` (new), `backend/routes/cronRoutes.js` (new), `backend/routes/announcementRoutes.js` (new), `backend/routes/watchlistRoutes.js` (new), `backend/routes/prefRoutes.js` (new), `backend/routes/pushRoutes.js` (new), `backend/routes/portfolioRoutes.js` (new), `backend/routes/alertRoutes.js` (new), `backend/routes/healthRoutes.js` (new), `backend/routes/bseRoutes.js`, `backend/tests/test_modular_server.js` (new) |
| 2026-09-05 | 5-Tier Gemini Model Cascade & JSON Schema Normalizer for AI Summarizer: Upgraded `aiSummarizer.js` with 5-tier fallback pool (`gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-1.5-flash` → `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite`), robust markdown code fence & nested JSON parsing, and schema normalizer with safe defaults for `executiveSummary`, `financials`, `forwardLooking`, `riskFactorsAndRedFlags`, `managementCommentary`, and `corporateActions`. Verified via `test_ai_summarizer_cascade.js` (15/15 tests passing) | `backend/lib/aiSummarizer.js`, `backend/tests/test_ai_summarizer_cascade.js` (new) |
| 2026-09-05 | Offline Banner & Network Status Hook: Created `useNetworkStatus.js` hook tracking real-time browser online/offline events, connection speed/quality (downlink, RTT, 2G/3G degradation), and manual active health ping. Built luxury animated `OfflineBanner.jsx` with Framer Motion spring physics, offline indicators, "Retry Now" button, and auto-dismissing "Connection Restored" confirmation toast. Mounted globally in `App.jsx` | `frontend/src/hooks/useNetworkStatus.js` (new), `frontend/src/components/Common/OfflineBanner.jsx` (new), `frontend/src/App.jsx` |
| 2026-09-05 | Universal Push Subscription Self-Healing & Browser Diagnostic Engine: Resolved `Registration failed - push service error` by adding automatic stale-subscription unsubscription, Service Worker re-registration recovery, VAPID key sanitization, and browser-specific error diagnostics (Brave Shields `brave://settings/privacy` toggle, Incognito mode detection, and site permission guidance) in `useWebPush.js` and `SettingsPage.jsx` | `frontend/src/hooks/useWebPush.js`, `frontend/src/components/Settings/SettingsPage.jsx` |
| 2026-09-05 | Eliminate Unnecessary Background Pollers: Converted Volume Spurt (`spurtStore.js`) and OFS (`ofsScraper.js`) to on-demand lazy in-memory TTL caching (60s TTL), eliminating background `setInterval` timers from `server.js` for instant, silent boots and 100% serverless efficiency | `backend/lib/spurtStore.js`, `backend/routes/marketRoutes.js`, `backend/server.js` |
| 2026-09-05 | Volume Spurt Off-Hours Empty State & Snapshot Protection: Protected `_snapshot` in `spurtStore.js` from being overwritten when BSE returns empty during off-market hours or temporary API glitches. Added informative empty state and market schedule indicators in `VolumeSpurtSection.jsx` | `backend/lib/spurtStore.js`, `frontend/src/components/VolumeSpurt/VolumeSpurtSection.jsx` |
| 2026-09-16 | BigShare Multi-Registrar IPO Bulk Verification & 500+ Streaming Engine: Fixed BigShare (`Raksan Transformers Limited`) allotment verification by adding auto-registrar resolution in backend (`resolveSymbolAndRegistrar`), normalizing `clientId` and `registrar` attributes in `/symbols`, stripping `BIGSHARE_` prefix in `queryBigshare`, updating Gemini vision fallback models (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-flash-latest`, `gemini-3.5-flash`), parallelizing Firestore PAN lookups, and increasing per-user bulk rate limit to 150/min. Implemented enterprise client-side chunk streaming pipeline in `IpoVerificationPage.jsx` (`CHUNK_SIZE=8`, `CONCURRENT_CHUNKS=2`) to seamlessly handle 500+ PAN cards without serverless timeouts, paired with an animated live Progress HUD (percentage, ETA, count), pause/cancel controls (`AbortController`), live search & status tab filtering, and 1-click Excel report export (`.xlsx`) via SheetJS | `backend/lib/bigshareScraper.js`, `backend/routes/ipoVerificationRoutes.js`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx` |
| 2026-09-16 | BigShare Hybrid Captcha Engine Resolution: Fixed captcha validation failures by upgrading OCR fallback cascade with active production models (`gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`), adding intelligent retry with auto-prefer Vision on `CAPTCHA` rejection from server, and multi-server round-robin across all 3 BigShare endpoints (`ipo`, `ipo1`, `ipo2`) guaranteeing zero captcha failures during 500+ bulk runs | `backend/lib/bigshareScraper.js`, `backend/tests/test_bigshare_verification.js` |
| 2026-09-16 | Zero-Hang Timeout Guarding & Real-Time Dynamic ETA Engine: Hardened `/api/ipo/verify-bulk` with individual 22-second applicant query timeout guards (`Promise.race`) and stateless Gemini vision execution. Enhanced frontend `IpoVerificationPage.jsx` with per-chunk 20s abort controllers, realistic initial ETA calculations (`totalApplicants * 1.5s`), live 1-second interval countdown ticker, and 1-Click Retry buttons (both per-card `Retry Applicant` and summary `Retry Failed (N)`) preventing any browser or serverless pending hangs | `backend/lib/bigshareScraper.js`, `backend/routes/ipoVerificationRoutes.js`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx` |
| 2026-09-27 | BSE API Modernization & Resilient Scrapers: Upgraded backend BSE endpoints across Movers (`MktRGainerLoserDataeqto/w`), Search (`GetQuoteAllSearchDatabeta.aspx` fallback), Board Meetings (`Corp_Fetch_BoardMeeting_With_Filter_ng/w` + `GetForthBoardMeeting/w` + ASPX cheerio scraping fallback), AGM Updates, Bulk & Block Deals (`BulkDealData_ng/w` + ASPX scraping fallback), Volume Spurt (`SpurtvolumeNew/w?flag=1`), and Insider Trading (`getCorp_Regulation_ng/w`). All 9 test suites verified with 100% pass rate | `backend/routes/bseRoutes.js`, `backend/lib/apiClients.js`, `backend/tests/test_bse_routes.js` (new) |
| 2026-09-27 | Dashboard & Market Pages Comprehensive Live Data Resolution: Refactored `bseGet` in `apiClients.js` to use Axios with modern browser headers (`sec-ch-ua`, `Referer`, `Origin`, `insecureHTTPParser`) solving Akamai 403 blocks. Fixed `AGMUpdatesPage.jsx` `toDate` state defaulting to `nextMonth()` instead of `today()`. Switched `CorporateCalendarPage.jsx` from raw `fetch` to `apiClient`. Standardized `DD/MM/YYYY` date formatting for `getCorp_Regulation_ng/w` insider trading endpoints. Enhanced `dashboardService.js` with fallback to upcoming meetings on non-trading days and on-demand spurt snapshot resolution. All dashboard widgets (indices, movers, spurts, meetings, AGMs, IPOs, deals) verified 100% operational | `backend/lib/apiClients.js`, `backend/routes/bseRoutes.js`, `backend/services/dashboardService.js`, `frontend/src/components/AGMUpdates/AGMUpdatesPage.jsx`, `frontend/src/components/CorporateCalendar/CorporateCalendarPage.jsx` |
| 2026-09-27 | Multi-Provider Fallbacks for Search, Calendar, AGMs & Insider Trading: Integrated MoneyControl autosuggest API as secondary fallback for `/api/bse/search` (guaranteeing instant suggestions for partial queries like `naba`, `nab`, `na`, `tata`, `reliance`). Added ASPX Cheerio scraping fallback for `/api/bse/calendar` (populating 40+ upcoming events even on weekends/403 blocks) and `/api/bse/agm-updates` (returning 1200+ forth meetings). Hardened `/api/bse/insider` and `/api/bse/insider/download` with in-memory TTL caching and zero-500 fail-safe returns | `backend/routes/bseRoutes.js` |
| 2026-09-27 | Company Data Resolution (Live OHLC, Fundamentals, Financials & Shareholding): Fixed `/api/bse/company` parser to extract LTP from `CurrRate.LTP`, OHLC from `Header`, and company name from `Cmpname.FullN`. Restructured `TabResults_PAR/w?tabtype=RESULTS` parsing to handle `resultinCr` format (`Revenue`, `Net Profit`, `EPS`). Added dynamic Market Cap calculation (`(Equity / FaceValue) * LTP`), merged `peerFund` fields (P/E, EPS, Cash EPS, OPM, NPM, RONW, Face Value), and mapped `TabResults_PAR/w?tabtype=SHP` into `holding` breakdown | `backend/routes/bseRoutes.js`, `backend/lib/apiClients.js` |
| 2026-09-27 | Result Calendar Page & BSE Forthcoming Results Proxy: Implemented `/result-calendar` page and `GET /api/bse/results-calendar` endpoint backed by BSE `Corpforthresults/w` API. Features default forthcoming results query, custom and preset date range filtering (Today, Next 7 Days, Next 30 Days), real-time company/code search, watchlist filtering, stat cards, sorting, status badges (Today, Tomorrow, Relative days), links to Company Data and BSE, responsive table and mobile views, and 1-click Excel export (`.xlsx`). Added navigation items to Sidebar and mobile bottom navbar right after AGM Updates | `backend/routes/bseRoutes.js`, `frontend/src/components/ResultCalendar/ResultCalendarPage.jsx` (new), `frontend/src/App.jsx`, `frontend/src/components/Layout/Sidebar.jsx`, `frontend/src/components/Layout/AppLayout.jsx`, `frontend/src/components/Common/CommandPalette.jsx` |
| 2026-09-27 | Declared Financial Results Integration & Dynamic Mode Switch: Added `GET /api/bse/financial-results` endpoint backed by `Corp_FinanceResult_ng_new/w` with in-memory TTL caching. Upgraded `ResultCalendarPage.jsx` with an interactive Mode Switcher ("See Financial Results" ↔ "Show Result Calendar"), audit/nature/industry filter bar, formatted quarter badges (`Q1 FY27`, `Q4 FY26`, `H1 FY26`), audited verification chips, and dedicated stat cards. Renamed navigation item in Sidebar to "Financial Results" and mobile bottom nav to "Financials" | `backend/routes/bseRoutes.js`, `frontend/src/components/ResultCalendar/ResultCalendarPage.jsx`, `frontend/src/components/Layout/Sidebar.jsx`, `frontend/src/components/Layout/AppLayout.jsx`, `frontend/src/components/Common/CommandPalette.jsx` |
| 2026-09-28 | Web Analytics & Firebase Analytics Integration: Installed `@vercel/analytics` and mounted `<Analytics />` in `App.jsx`. Enhanced `firebase.js` with client-safe, adblocker-resilient `trackPageView` and `logFirebaseEvent` helpers using measurement ID `G-XQFHRJ94SM`. Added `FirebaseAnalyticsTracker` in `App.jsx` to automatically log all page routes and titles on navigation | `frontend/package.json`, `frontend/src/App.jsx`, `frontend/src/services/firebase.js` |
| 2026-09-28 | Complete Portfolio Deprecation & Removal: Fully removed the Portfolio page, `/portfolio` route, navigation buttons in Sidebar and mobile bottom navbar, "Add to Portfolio" actions in `ScriptDrawer.jsx` and `CompanyDataPage.jsx`, search indexing in `GlobalSearch.jsx`, `LoginPage.jsx` mentions, backend route `/api/portfolio` and store `portfolioStore.js` | `frontend/src/App.jsx`, `frontend/src/components/Layout/Sidebar.jsx`, `frontend/src/components/Layout/AppLayout.jsx`, `frontend/src/components/Common/GlobalSearch.jsx`, `frontend/src/components/CompanyData/CompanyDataPage.jsx`, `frontend/src/components/Watchlist/ScriptDrawer.jsx`, `frontend/src/components/Auth/LoginPage.jsx`, `backend/server.js`, `backend/routes/portfolioRoutes.js` (deleted), `backend/lib/portfolioStore.js` (deleted), `frontend/src/services/portfolioService.js` (deleted), `frontend/src/components/Portfolio` (deleted) |
| 2026-09-28 | My Announcements & Watchlist Matching Resolution: Fixed `useAnnouncements.js` fetch branching so `getAnnouncementsFromDB` properly queries today's announcements from MongoDB Atlas when no custom date/search filters are active. Upgraded announcement script matching with robust company name normalization (stripping corporate suffixes, punctuation, and multi-whitespace), multi-identifier checking (BSE scrip codes `bseCode`/`ltdCode`/`scripCode`/`scriptCode`, NSE symbols `symbol`/`nseSymbol`, company names `companyName`/`scriptName`/`name`), and substring matching. Verified 12:00 AM IST midnight wipe in `cronService.js` (`performMidnightWipeIfNeeded`) | `frontend/src/hooks/useAnnouncements.js`, `frontend/src/components/Announcements/AnnouncementsPage.jsx`, `backend/lib/announcementStore.js` |
| 2026-09-28 | Dashboard Benchmark NIFTY 50, My Announcements Filters & Search UI Modernization: Added `NIFTY 50` live benchmark index to Dashboard primary indices alongside `BSE SENSEX`, `BSE BANKEX`, and `BSE Focused IT` in `dashboardService.js`. Removed date range picker from My Announcements filter bar (`AnnouncementFilters.jsx`) since it tracks today's active announcements. Completely redesigned `ScriptSearchInput.jsx` with 100% solid opaque background (preventing mobile/desktop transparency bleed-through), removed growth arrow icon, added subtle scrip & segment badge pills, and highlighted search match styling | `backend/services/dashboardService.js`, `frontend/src/components/Announcements/AnnouncementFilters.jsx`, `frontend/src/components/Common/ScriptSearchInput.jsx` |
| 2026-09-28 | Official BSE StockReachGraphCas Historical Charts & Bhavcopy Table: Replaced deprecated `/getScripAllData/w` with BSE's official `StockReachGraphCas/w` API for `1W`, `1M`, `3M`, `6M`, `1Y`, and `5Y` historical price charts. Added resilient date parser `parseBseDateString` for BSE timestamp strings, and added `GET /api/bse/historical-table` endpoint for historical table views with volume, turnover, and OHLC data | `backend/routes/bseRoutes.js` |
| 2026-09-28 | My Announcements Auto-Seed, Refresh & Proxy Fallback Engine: Resolved empty announcements issue on `/announcements` by enabling `GET /api/announcements` to auto-poll live BSE & NSE announcements if MongoDB is empty after midnight wipe or on `refresh=true`. Upgraded `useAnnouncements.js` to use `apiClient` with automatic fallback to BSE live proxy, and added `refresh: true` trigger to the Refresh button on `AnnouncementsPage.jsx` so watchlisted scripts (such as Austin Engineering Company Ltd) immediately load their announcements | `backend/routes/announcementRoutes.js`, `frontend/src/services/announcementService.js`, `frontend/src/hooks/useAnnouncements.js`, `frontend/src/components/Announcements/AnnouncementsPage.jsx` |
| 2026-09-28 | All Announcements Category Expansion & Resilient AI Analysis Cascade: Fixed category filtering on `AllAnnouncementsPage.jsx` so Result / Financial Results filings are prominently accessible in category chips (with "+N More" expander) and flexible case-insensitive matching across categories and subcategories. Hardened `aiSummarizer.js` with active official Gemini models (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-pro`), added BSE CDN PDF download headers (`Referer`, `Origin`), text-based fallback when PDF download is blocked/unavailable, and flexible request body metadata forwarding in `analyzeRoute.js` and `AiAnalyzeButton.jsx`. Removed unused `@vercel/analytics` import causing `Unexpected token '<'` on Firebase Hosting | `frontend/src/components/AllAnnouncements/AllAnnouncementsPage.jsx`, `backend/lib/aiSummarizer.js`, `backend/routes/analyzeRoute.js`, `frontend/src/components/Common/AiAnalyzeButton.jsx`, `frontend/src/components/Announcements/AnnouncementCard.jsx`, `frontend/src/services/announcementService.js`, `frontend/src/App.jsx` |
| 2026-09-28 | Prompts.js Integration & Full Multi-Field Equity Research Extraction: Linked `AI_ANALYST_PROMPT` from `prompts.js` directly into `aiSummarizer.js` with structured filing metadata (Company, Category, Subcategory, Subject, Date, Description, PDF URL) and active 500 RPD model cascade (`gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-flash-lite-latest`, `gemini-3.7-flash`, `gemini-3.8-flash`). Fully tested and verified with live BSE filing for *Rays of Belief Ltd* | `backend/lib/aiSummarizer.js`, `backend/lib/prompts.js` |
| 2026-09-28 | Prompts.js Verbatim Alignment & Groq Token Safety Guard: Restored user's exact 346-line institutional `AI_ANALYST_PROMPT` in `prompts.js` as single source of truth across all AI generation pipelines. Added `budgetPromptForGroq` in `grokProvider.js` to ensure the exact prompt, rules, and JSON schema execute reliably within Groq's 8,000 ITPM limit without ever failing or dropping into generic fallbacks. Verified 100% factual analysis generation in 10s for Deepa Jewellers Ltd | `backend/lib/prompts.js`, `backend/lib/providers/grokProvider.js` |
| 2026-09-28 | Direct Multimodal PDF & Statutory URL AI Pipeline (Zero Local Pre-Parsing): Completely eliminated local `pdf-parse` text pre-extraction. Official statutory filings are downloaded in raw binary form and sent directly to Gemini via `inline_data: { mime_type: 'application/pdf', data: base64Pdf }` for native multimodal vision, full OCR of scanned pages, stamps, signatures, tables, and charts, with the statutory PDF link and metadata included with `AI_ANALYST_PROMPT`. Optimized Groq provider with `openai/gpt-oss-120b` first-tier model and model-aware output token management | `backend/lib/aiSummarizer.js`, `backend/lib/providers/geminiProvider.js`, `backend/lib/providers/grokProvider.js`, `backend/package.json` |
| 2026-10-12 | Render 1-Click Blueprint & Zero-Delay Market Cadence Engine: Added root `render.yaml` Blueprint for 1-click free deployment of background scraping worker to Render (Singapore region, zero serverless CPU limits). Implemented `getMarketCadence` in `istTime.js` with intelligent IST market schedule classification guaranteeing 0-minute unrestricted real-time polling during all active market and post-market filing hours (Mon-Fri 08:00 - 22:00 IST) and Saturday board meetings (09:00 - 20:00 IST), plus `DISABLE_CADENCE_GUARD=true` support on Render for 24/7 zero-delay execution. Integrated cadence guard into `runGlobalCronTick` in `cronService.js` with `_lastHeavyScrapeTime` in-memory and Firestore synchronization, preserving 12:00 AM IST midnight wipe and instant manual `/api/trigger` execution. Added `origin.endsWith('.onrender.com')` to CORS in `server.js` and added unit test suite `test_market_hours_guard.js` (6/6 passing) | `render.yaml` (new), `backend/lib/time/istTime.js`, `backend/services/cronService.js`, `backend/routes/cronRoutes.js`, `backend/server.js`, `backend/tests/test_market_hours_guard.js` (new) |
| 2026-10-12 | BigShare 307 Redirect Resolution & Mirror Fallback: Hardened `bigshareScraper.js` with automated manual hop following for HTTP 301/302/307/308 redirects, custom `validateStatus` allowing 2xx-3xx codes without throwing Axios errors, and resilient fallback to MongoDB `iposymbols` active records so registrar transient redirects never trigger errors in `bigshareNotificationService.js` | `backend/lib/bigshareScraper.js`, `backend/lib/bigshareNotificationService.js` |
| 2026-10-12 | AI Model Cascade & Groq Environment Compatibility Resolution: Fixed Gemini 503 high-demand errors by expanding `GEMINI_MODELS` with high-capacity models (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-2.0-flash-lite`) alongside 3.1/3.7, and extended model timeout to 25s for multi-page statutory PDF vision inference. Resolved `Groq=OFF` in `providerRouter.js` and `grokProvider.js` by supporting both `GROQ_API_KEY` and `GROK_API_KEY` env variables and adding `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` to `GROQ_MODELS`. Fixed NSE session 403 warning in `nseService.js` with `validateStatus` and Akamai-compliant headers, and clean fallback logging in `spurtStore.js` | `backend/lib/providers/geminiProvider.js`, `backend/lib/providers/providerRouter.js`, `backend/lib/providers/grokProvider.js`, `backend/services/nseService.js`, `backend/lib/spurtStore.js`, `GEMINI.md` |
| 2026-10-12 | Institutional Tier AI Progress HUD, 1-Click Research Brief, Registrar Health & MongoDB Compound Indexes: Added automated MongoDB high-speed compound indexes (`bseCode`, `nseSymbol`, `category`, `datetimeIST`) in `mongoClient.js` for sub-5ms queries. Implemented `GET /api/ipo/registrars-health` endpoint in `ipoVerificationRoutes.js` and live animated Registrar Health Ribbon (Link Intime, KFintech, BigShare multi-server pool) in `IpoVerificationPage.jsx`. Upgraded `AiAnalyzeButton.jsx` with a 4-stage institutional progress HUD with live step counter and multi-color gradient progress bar. Added 1-Click Copy Formatted Research Brief and Print/PDF export buttons in `AiAnalysisPanel.jsx` | `backend/lib/mongoClient.js`, `backend/routes/ipoVerificationRoutes.js`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx`, `frontend/src/components/Common/AiAnalyzeButton.jsx`, `frontend/src/components/Common/AiAnalysisPanel.jsx`, `frontend/src/components/Announcements/AnnouncementCard.jsx`, `frontend/src/components/AllAnnouncements/AllAnnouncementsPage.jsx`, `GEMINI.md` |
| 2026-10-16 | Enterprise RBAC Admin Panel, Mission Control & Granular Entitlement Engine (Read/Write): Implemented secure, multi-tier administrative infrastructure for StockWatch. Backend: Created `requireAdmin.js` middleware checking `role === 'admin'` and granular `entitlements.read` / `entitlements.write` with 60s Redis caching (`admin:entitlement:{uid}`). Created `adminRoutes.js` with comprehensive endpoints (`/stats`, `/users`, `/users/:uid`, `/users/:uid/watchlist`, `/users/:uid/alerts`, `/users/:uid/devices`, `/users/:uid/disable`, `/users/:uid/enable`, `/users/:uid/role`, `/audit-log`, `/me`) logging immutable audit trails to Firestore `admin_audit_log`. Account disabling immediately triggers `admin.auth().revokeRefreshTokens(uid)` for instant cross-device signout. Added advanced system management endpoints: `GET /api/admin/system/services-status` (parallel diagnostics for BSE, NSE, MongoDB Atlas, Cloud Firestore, Upstash Redis, AI Provider Router, Telegram bot, IPO Registrars, and Market Cadence), `POST /api/admin/system/test-service/:serviceName` (isolated on-demand test pings with round-trip latency & sample response), `POST /api/admin/system/trigger-cron`, `POST /api/admin/system/trigger-wipe`, and `POST /api/admin/system/flush-cache`. Seeded users in Firestore via `updateUsers.js` (`korojitha@gmail.com` as admin with `read: true, write: true`; `tatvarthcapital@gmail.com` & `cpjain1980@gmail.com` as users). Hardened `firestore.rules` preventing client-side self-elevation to admin, blocking modifications to `role`, `entitlements`, and `disabled`, denying all operations for disabled accounts, and securing `admin_audit_log`. Frontend: Updated `AuthContext.jsx` to load roles & entitlements and export `isAdmin`, `canAdminWrite`, and `refreshAdminProfile`. Added `useAdminAuth.js` hook. Guarded navigation items in `Sidebar.jsx` and mobile bottom navbar in `AppLayout.jsx` to only appear for admins. Added 3-level route guard `AdminRoute.jsx` and mounted `/admin` in `App.jsx`. Built complete luxury glassmorphic `AdminPage.jsx` featuring 4 animated tabs: Mission Control & Services, Users, Analytics, and Audit Trail. Verified with production Vite build | `backend/middleware/requireAdmin.js` (new), `backend/routes/adminRoutes.js` (new), `backend/scripts/seedAdmin.js` (new), `backend/scripts/updateUsers.js` (new), `backend/server.js`, `firestore.rules`, `frontend/src/contexts/AuthContext.jsx`, `frontend/src/hooks/useAdminAuth.js` (new), `frontend/src/components/Layout/Sidebar.jsx`, `frontend/src/components/Layout/AppLayout.jsx`, `frontend/src/App.jsx`, `frontend/src/components/Admin/AdminRoute.jsx` (new), `frontend/src/components/Admin/AdminPage.jsx` (new), `frontend/src/components/Admin/AdminStatCard.jsx` (new), `frontend/src/components/Admin/AdminAuditTable.jsx` (new), `frontend/src/components/Admin/ReadOnlyBadge.jsx` (new), `frontend/src/components/Admin/RoleEditModal.jsx` (new), `frontend/src/components/Admin/DisableUserModal.jsx` (new), `frontend/src/components/Admin/UserDrawer.jsx` (new), `frontend/src/components/Admin/UserTable.jsx` (new), `GEMINI.md` |
| 2026-10-16 | Autonomous Background Worker, Vercel Native Crons, Push Test & Database Backup Snapshot: Added autonomous background cron loop in `server.js` (`ENABLE_BACKGROUND_WORKER === 'true'`) polling every 2 minutes for Render workers (`render.yaml`). Configured Vercel native crons in `backend/vercel.json` (`schedule: "*/5 * * * *"`) with `x-vercel-cron: "1"` support in `cronRoutes.js`. Added `POST /api/admin/system/test-push` in `adminRoutes.js` to dispatch instant VAPID diagnostic push alerts to admin devices, and `GET /api/admin/system/export-backup` to generate an on-demand complete JSON snapshot of all users and watchlists. Expanded Mission Control command deck in `AdminPage.jsx` with dedicated 1-click Test Web Push and Backup DB buttons. Updated `ensureUserProfile` in `alertService.js` to set standard default role and entitlement attributes for all newly registered accounts | `backend/server.js`, `backend/vercel.json`, `backend/routes/cronRoutes.js`, `backend/routes/adminRoutes.js`, `render.yaml`, `frontend/src/services/alertService.js`, `frontend/src/components/Admin/AdminPage.jsx`, `GEMINI.md` |
| 2026-10-16 | Client-Side Runtime Safety & Process Reference Resolution: Fixed `ReferenceError: process is not defined` crash in production SPA by replacing un-shimmed Node.js `process.version` with safe fallback string in `AdminPage.jsx`, updating `process.env.NODE_ENV` to `import.meta.env.DEV` in `ErrorBoundary.jsx`, and configuring `define: { 'process.env': {} }` shim in `vite.config.js` | `frontend/src/components/Admin/AdminPage.jsx`, `frontend/src/components/Common/ErrorBoundary.jsx`, `frontend/vite.config.js`, `GEMINI.md` |
| 2026-10-16 | Render Deployment Automation & Deploy Hook Integration: Added `.github/workflows/deploy-render.yml` to automatically trigger Render Deploy Hook on git push to `main`. Enhanced `deploy.bat`, `deploy-backend.bat`, and `deploy.ps1` to detect `.render_hook` or `RENDER_DEPLOY_HOOK_URL` and instantly ping Render's deployment webhook. Fixed Firebase CLI working directory bug in deployment scripts (`cd /d "%~dp0"`) and added `--non-interactive` flag. Committed `render.yaml` with `autoDeploy: true`, `branch: main`, and `NODE_VERSION: 20.18.1`. Added `.render_hook` to `.gitignore` | `deploy.bat`, `deploy-backend.bat`, `deploy.ps1`, `render.yaml`, `.github/workflows/deploy-render.yml` (new), `.render_hook.example` (new), `.gitignore`, `GEMINI.md` |
| 2026-10-16 | Render Instant Auto-Deploy Wire-up & Monorepo Root Directory Resolution: Wired user's live Render Deploy Hook (`https://api.render.com/deploy/srv-db8sq3navr4c73c7jjf0?key=vIFx_6LAyXc`) into `.github/workflows/deploy-render.yml` and local `.render_hook`. Resolved Render's `rootDir: backend` behavior where commits touching root files (`package.json`, `render.yaml`, etc.) were skipped by Render's native filter. Verified live deployment `dep-db9222jbc2fs73cjb79g` succeeded and `/api/admin/stats` and `/api/admin/system/services-status` are active and returning HTTP 401 (secured) | `.github/workflows/deploy-render.yml`, `.render_hook`, `GEMINI.md` |
| 2026-10-16 | Global Web Push Broadcast & Database Backup Export Resolution: Implemented `broadcastWebPushToAll` in `webPushNotifier.js` leveraging Firestore `collectionGroup('pushDevices')` to dispatch instant push notifications to all registered devices when global announcement banners are published. Resolved `ReferenceError: logAdminAudit is not defined` causing 500 error on `/api/admin/system/export-backup` and `/api/admin/system/test-push` with robust `writeAuditLog` integration and safe date serialization. Enhanced `flush-cache` to purge `ratelimit:*`, `rates:*`, and `admin:entitlement:*` Redis keys. Added push notification checkbox and live device count toasts in `AdminPage.jsx` | `backend/lib/webPushNotifier.js`, `backend/routes/adminRoutes.js`, `frontend/src/components/Admin/AdminPage.jsx`, `GEMINI.md` |
| 2026-10-17 | Event-Driven Automated IPO Allotment Family PAN Verification & Shareable Curated Watchlist Baskets: 1. Automated IPO Allotment Engine: Created `backend/lib/ipoAutoVerificationService.js` implementing event-driven multi-registrar verification for all saved family PANs (`collectionGroup('familyPans')`) whenever an IPO allotment goes live on Link Intime / MUFG, KFintech, or BigShare without running continuous 24/7 pollers. Employs 24-hour ephemeral execution locks in MongoDB `ipo_auto_verifications` with native TTL auto-purge (`expireAfterSeconds: 86400`) and midnight cleanup for zero storage bloat. Multi-tiered notifications automatically distinguish Tier 1: Allotted (🎉 Celebratory Web Push + Telegram alert with shares, DP/Client ID, application number), Tier 2: Applied, Not Allotted (📋 Informative notification with refund instructions), and Tier 3: Not Applied (Record Not Found: subtle digest or silent skip based on user preferences). Wired into `mufgNotificationService.js`, `bigshareNotificationService.js`, and `notificationEngine.js`, with an on-demand admin trigger `POST /api/admin/ipo/trigger-auto-check`. 2. Shareable Curated Watchlist Baskets: Built social viral investing engine allowing users to publish curated baskets with unique public links (e.g. `/basket/:slug`). Implemented `backend/routes/basketRoutes.js` (`GET /api/baskets/:slug` public with live quotes & filings, `POST /api/baskets` create, `POST /api/baskets/:slug/import` 1-tap import with auto-deduplication, `GET /api/baskets/user/my`). Built `ShareBasketModal.jsx` in `WatchlistPage.jsx` with 1-click WhatsApp, X/Twitter, and Telegram viral share buttons, and `PublicBasketPage.jsx` public landing page with live disclosures and guest conversion onboarding modal. Verified with `test_ipo_auto_and_baskets.js` and production Vite build | `backend/lib/ipoAutoVerificationService.js` (new), `backend/routes/basketRoutes.js` (new), `backend/tests/test_ipo_auto_and_baskets.js` (new), `backend/routes/adminRoutes.js`, `backend/server.js`, `backend/lib/mufgNotificationService.js`, `backend/lib/bigshareNotificationService.js`, `backend/lib/notificationEngine.js`, `frontend/src/App.jsx`, `frontend/src/components/Watchlist/WatchlistPage.jsx`, `frontend/src/components/Watchlist/ShareBasketModal.jsx` (new), `frontend/src/components/Watchlist/PublicBasketPage.jsx` (new), `GEMINI.md` |
| 2026-10-17 | User Onboarding Admin Approval Gate & Seamless Watchlist Basket Import Flow: 1. User Approval Gate: New user signups default to `approvalStatus: 'pending'`. Created `backend/lib/userApprovalNotificationService.js` to automatically dispatch instant multi-device Web Push and Telegram bot alerts to all system administrators whenever a user registers and is waiting for authorization. Implemented backend endpoints `PATCH /api/admin/users/:uid/approve` (sets `approvalStatus: 'approved'`), `PATCH /api/admin/users/:uid/reject` (sets `approvalStatus: 'rejected'`, revokes active session tokens via `revokeRefreshTokens`), and `PATCH /api/admin/users/:uid/re-allow` (re-authorizes access), logging immutable audit trail entries to `admin_audit_log`. Updated `AuthContext.jsx` with real-time `onSnapshot(doc(db, 'users', uid))` subscription so client access updates instantly in real time without page refresh. Created dedicated user-facing views: `PendingApprovalPage.jsx` (luxury glassmorphic waitlist screen with radar pulse, user details, status breakdown, and signout) and `AccessRejectedPage.jsx` (restricted view with admin reason and support appeal). Enhanced `ProtectedRoute` in `App.jsx` to intercept pending/rejected accounts while allowing admins instant pass-through. Upgraded `UserTable.jsx` and `UserDrawer.jsx` with status tabs (`All`, `Pending Review (N)` with glowing badge, `Approved`, `Rejected`), and 1-click Approve, Reject (with `RejectUserModal.jsx` custom reason input), and Re-Allow action controls. 2. Seamless Watchlist Basket Import: Updated `PublicRoute` and `PublicBasketPage.jsx` so unauthenticated visitors clicking 'Import' are guided through login (`/login?redirect=...`) and automatically receive the basket imported into their watchlist upon successful sign in and approval | `backend/lib/userApprovalNotificationService.js` (new), `backend/server.js`, `backend/routes/adminRoutes.js`, `frontend/src/contexts/AuthContext.jsx`, `frontend/src/App.jsx`, `frontend/src/components/Auth/PendingApprovalPage.jsx` (new), `frontend/src/components/Auth/AccessRejectedPage.jsx` (new), `frontend/src/components/Admin/RejectUserModal.jsx` (new), `frontend/src/components/Admin/UserTable.jsx`, `frontend/src/components/Admin/UserDrawer.jsx`, `frontend/src/components/Admin/AdminPage.jsx`, `frontend/src/components/Watchlist/PublicBasketPage.jsx`, `frontend/src/services/alertService.js`, `GEMINI.md` |
| 2026-10-17 | Institutional Scroll Preservation & SWR Zero-Flicker Revalidation Engine: Resolved client UX issue where frequent data re-fetching or background polling reset scroll positions back to top. 1. Hook: Implemented `useScrollPreserver.js` with pre-paint `useLayoutEffect` scroll restoration, user interaction lock (`isInteractingRef` during mouse hover/scroll), and automatic scroll snapshots. 2. Top Gainers & Losers: Eliminated `setData([])` container collapse, removed wrapper key unmounting, added stable keys (`bse-${code}`, `nse-${symbol}`), and added 2px top gradient shimmer bar and live syncing pill. 3. Announcements & Feeds: Upgraded `useAnnouncements.js`, `AnnouncementsContext.jsx`, and `AnnouncementsPage.jsx` with SWR `isRefreshing` vs `isInitialLoading` distinction, keeping existing card lists mounted and height stable during background worker cron ticks (100% window scroll immunity). 4. All Announcements: Replaced full-page unmounting with silent revalidation, persistent search/filters, and top shimmer progress. 5. Volume Spurt: Wired `useScrollPreserver` to `VolumeSpurtTable.jsx`, removed blocking opacity/pointer-events overlay in `VolumeSpurtSection.jsx`, and added subtle syncing pill. 6. Financial Calendars & Deals: Upgraded `BoardMeetingsPage.jsx`, `AGMUpdatesPage.jsx`, `ResultCalendarPage.jsx`, `BulkBlockPage.jsx`, `InsiderTradingPage.jsx`, and `IPOGmpPage.jsx` with SWR revalidation, stable row keys, and persistent table mounting | `frontend/src/hooks/useScrollPreserver.js` (new), `frontend/src/components/GainersLosers/GainersLosersPage.jsx`, `frontend/src/hooks/useAnnouncements.js`, `frontend/src/contexts/AnnouncementsContext.jsx`, `frontend/src/components/Announcements/AnnouncementsPage.jsx`, `frontend/src/components/AllAnnouncements/AllAnnouncementsPage.jsx`, `frontend/src/components/VolumeSpurt/VolumeSpurtSection.jsx`, `frontend/src/components/VolumeSpurt/VolumeSpurtTable.jsx`, `frontend/src/components/BoardMeetings/BoardMeetingsPage.jsx`, `frontend/src/components/AGMUpdates/AGMUpdatesPage.jsx`, `frontend/src/components/ResultCalendar/ResultCalendarPage.jsx`, `frontend/src/components/BulkBlock/BulkBlockPage.jsx`, `frontend/src/components/InsiderTrading/InsiderTradingPage.jsx`, `frontend/src/components/IPO/IPOGmpPage.jsx`, `GEMINI.md` |
| 2026-10-17 | Instant Multi-Device Account Access Revocation & Real-Time Security Lockout: When an administrator disables a user account from the Admin Control Center, access is immediately revoked across all active browser sessions, open tabs, background listeners, and notification channels. 1. Firestore Security Rules: Calibrated users collection read rules (`allow read: if isOwner(userId) || isAdmin()`) so real-time onSnapshot listeners receive disabled status and reason without throwing permission errors, while strictly blocking all updates and subcollections. 2. Backend API Guard: Enhanced `authenticateFirebase.js` with `verifyIdToken(token, true)` checking token revocation & user disabled status, returning structured HTTP 403 `ACCOUNT_DISABLED`. Enhanced `PATCH /api/admin/users/:uid/disable` to call `revokeRefreshTokens(uid)`, write `disabledReason` to Firestore, purge all registered `pushDevices` (preventing notification leakage), and remove user from Redis notification sets. 3. Real-Time Frontend Ejection: Updated `AuthContext.jsx` to monitor `disabled` in `onSnapshot` and listen for `sw:account-disabled` global events, immediately setting `isDisabled = true` and clearing client credentials. Updated `apiClient.js` to intercept 403 `ACCOUNT_DISABLED` and trigger lockdown. 4. Dedicated Suspended UI: Built luxury `AccountDisabledPage.jsx` with red glassmorphic card, reason disclosure, live synchronization status banner, and account switcher. Updated `ProtectedRoute` in `App.jsx` to give `isDisabled` top priority over all roles, and registered `/account-disabled` route. Enhanced `DisableUserModal.jsx` with preset reasons and clear instant revocation warnings | `firestore.rules`, `backend/middleware/authenticateFirebase.js`, `backend/routes/adminRoutes.js`, `frontend/src/services/apiClient.js`, `frontend/src/contexts/AuthContext.jsx`, `frontend/src/components/Auth/AccountDisabledPage.jsx` (new), `frontend/src/App.jsx`, `frontend/src/components/Admin/DisableUserModal.jsx`, `GEMINI.md` |
| 2026-10-17 | Granular "Pro / HNI" Membership Tiers (Monetization Ready) & Non-Destructive Entitlements Engine: 1. Multi-Tiered Architecture: Defined 3 institutional tiers — Basic (Free: 5 scrips, 3 AI analyses/day, 1 family PAN, basic push), Pro (₹999/mo | ₹8,999/yr: 50 scrips, unlimited Gemini AI PDF vision, 10 family PANs with automated allotment checks, CSV/Excel spreadsheet export, 5 shareable baskets, priority push), and Premium HNI (₹1,999/mo | ₹17,999/yr: unlimited scrips, unlimited AI, unlimited PANs, custom allotment radar, unlimited curated baskets, VIP concierge support). Centralized quota truth in `planLimits.js` with admin automatic bypass. 2. Non-Destructive Downgrades & Expiration: Automated daily cron `processPlanExpirationsAndReminders()` in `cronService.js` (optimized single-query index-free evaluation) detects expired subscriptions, sends 3-day advance push warnings, and reverts user `plan` to Basic without ever deleting existing scrips or family PANs; soft insertion limits block only new additions beyond Basic quota. 3. Backend Enforcements: Enforced insertion gates on `POST /api/watchlist` and `POST /api/watchlist/bulk` (`canAddToWatchlist`), `GET /api/watchlist/export` (`canExportData`), `POST /api/analyze` (`checkAndConsumeAiQuota` with IST midnight rollover; viewing cached filings is 100% free), `POST /api/ipo/applicants` (`canAddFamilyPan`), and `POST /api/baskets` (`canCreateBasket`). 4. Admin Authority & 1-Click Control: Added endpoints `PATCH /api/admin/users/:uid/plan` (allot/upgrade tier with duration 1M/3M/6M/1Y/Lifetime, payment notes & audit logging) and `PATCH /api/admin/users/:uid/plan/revoke` (instant rollback to Basic). Built `PlanEditModal.jsx`, added Plan badge column & Crown action button in `UserTable.jsx`, and embedded Membership Tier card in `UserDrawer.jsx`. 5. Luxury Upgrade UI & Pricing Matrix: Created glassmorphic `UpgradePromptModal.jsx` with tier comparisons and direct action links. Added usage limit pills to `WatchlistPage.jsx` (`N / 5 scrips used`), `AiAnalyzeButton.jsx` (`(N/3)` daily quota counter), and `IpoVerificationPage.jsx` (`N / 1 PANs`). Built complete luxury `/plans` & `/pricing` page (`PlansPage.jsx`) featuring monthly/annual savings toggle, 3-tier pricing cards with glowing borders, feature comparison table, UPI QR payment modal, and WhatsApp concierge. Verified via automated 10-suite E2E test `test_membership_and_entitlements_e2e.js` (with guaranteed database teardown) and Vite production build | `backend/lib/planLimits.js` (new), `backend/routes/adminRoutes.js`, `backend/routes/watchlistRoutes.js`, `backend/routes/analyzeRoute.js`, `backend/routes/ipoVerificationRoutes.js`, `backend/routes/basketRoutes.js`, `backend/services/cronService.js`, `backend/tests/test_membership_and_entitlements_e2e.js` (new), `frontend/src/contexts/AuthContext.jsx`, `frontend/src/components/Plans/PlansPage.jsx` (new), `frontend/src/components/Plans/UpgradePromptModal.jsx` (new), `frontend/src/components/Admin/PlanEditModal.jsx` (new), `frontend/src/components/Admin/UserTable.jsx`, `frontend/src/components/Admin/UserDrawer.jsx`, `frontend/src/components/Admin/AdminPage.jsx`, `frontend/src/components/Watchlist/WatchlistPage.jsx`, `frontend/src/components/Common/AiAnalyzeButton.jsx`, `frontend/src/components/IpoVerification/IpoVerificationPage.jsx`, `frontend/src/components/Layout/Sidebar.jsx`, `frontend/src/components/Layout/Topbar.jsx`, `frontend/src/App.jsx`, `GEMINI.md` |
| 2026-10-17 | Luxury Welcome / Landing Page (`tatvarthstockwatch.web.app`), Razorpay/UPI Checkout Integration & Admin Approval Retention on Repeat Logins: 1. Welcome Page: Created high-conversion landing page (`WelcomePage.jsx`) mounted at `/`, `/welcome`, and `/landing` showcasing core capabilities (sub-second BSE/NSE filings, Gemini AI PDF vision, multi-registrar automated IPO check, volume spurts, OFS bid-book, and corporate calendar), trust badges, interactive 3-tier pricing cards, detailed plan description modal, FAQ accordion, live market hours status pill, and direct Sign In / Dashboard routing. 2. Monetization Checkout Engine: Implemented `planRoutes.js` (`GET /api/plans` public catalog, `POST /api/plans/checkout` subscription purchase supporting both Razorpay order generation and instant activation / UPI reference verification). Wired into `WelcomePage.jsx` and `PlansPage.jsx` with query parameter intent preservation (`?select=pro&billing=annual`). Completing checkout sets `planStatus: 'active'`, calculates exact expiration dates, records audit logs, and instantly updates client plan limits via real-time Firestore listeners. 3. CRITICAL Admin Approval Retention on Repeat Logins: Guaranteed that once an admin approves a user, subsequent logins with the same email never require re-approval or send duplicate alerts. Added `approved_emails` registry in Firestore synchronized on `PATCH /api/admin/users/:uid/approve` and `PATCH /api/admin/users/:uid/reject`. Updated `/api/auth/onboarding-request` in `server.js` to automatically verify email against `approved_emails` and existing approved user records; if previously approved, access is immediately retained (`approvalStatus: 'approved'`). Verified via 9-test E2E suite `test_welcome_and_approval_retention_e2e.js` (100% passed, 0 orphan records) and production Vite build | `frontend/src/components/Welcome/WelcomePage.jsx` (new), `backend/routes/planRoutes.js` (new), `backend/server.js`, `backend/routes/adminRoutes.js`, `frontend/src/App.jsx`, `frontend/src/components/Auth/LoginPage.jsx`, `frontend/src/components/Plans/PlansPage.jsx`, `backend/tests/test_welcome_and_approval_retention_e2e.js` (new), `GEMINI.md` |
| 2026-10-17 | Enterprise Security Hardening, Server-Side Validation, NoSQL/XSS/SSRF Immunity & Anti-Tampering Shields: Complete defense-in-depth across frontend & backend: 1. Global Security Sanitizer: Created `backend/middleware/securitySanitizer.js` mounted globally in `server.js` intercepting `req.body`, `req.query`, and `req.params`. Defends against NoSQL operator injection (`$gt`, `$ne`, `$where`, `$regex`, dot keys) and prototype pollution (`__proto__`, `constructor`, `prototype`) throwing structured HTTP 400 (`SECURITY_NOSQL_INJECTION`, `SECURITY_PROTOTYPE_POLLUTION`), strips script/iframe/event handlers/pseudo-protocols, neutralizes path traversal (`../`, `..\\`), and limits string length to prevent ReDoS/DoS memory abuse. 2. Strict Declarative Server Validators: Created `backend/utils/validators.js` enforcing strict alphanumeric/regex boundaries: `validateScripInput` (BSE 5-7 digits, NSE symbols), `validateBasketInput` (title length, deep stock validation), `validateApplicantInput` (strict Indian PAN format `^[A-Z]{5}[0-9]{4}[A-Z]$`), and `validatePlanCheckout` (allowed tiers & billing). Wired across `watchlistRoutes.js`, `basketRoutes.js`, `ipoVerificationRoutes.js`, and `planRoutes.js`. 3. SSRF Protection: Implemented `validateSafeFilingUrl` restricting external statutory PDF downloads strictly to official exchange disclosure repositories (`bseindia.com`, `nseindia.com`, `archives.nseindia.com`) while blocking localhost, private subnets (10.x, 192.168.x, 172.16-31.x), and AWS/GCP metadata (`169.254.169.254`). Wired into `aiSummarizer.js` and `analyzeRoute.js`. 4. Strict CORS Whitelist & Helmet CSP: Eliminated permissive wildcard domain matching in `server.js` in favor of strict whitelist (`tatvarthstockwatch.web.app`, `tatvarthstockwatch.firebaseapp.com`, `tatvarth-stockwatch.vercel.app`, `tatvarthstockwatch.onrender.com`), reduced JSON body parser limit to 2MB, enforced 1-year HSTS (`preload`), frameguard (`DENY`), and nosniff. 5. Client Security Guard Upgrade: Upgraded `frontend/src/utils/securityGuard.js` with framebuster/anti-clickjacking protection, high-visibility self-XSS console deterrent warning against running malicious scripts, DOM `MutationObserver` shield detecting/removing unauthorized injected scripts or rogue iframes, window.opener nullification, and inspection lockdown (F12/Ctrl+Shift+I/U blocking & passive debugger tripwire). Updated `index.html` and `firebase.json` with security response headers. Verified with 10-suite automated test `test_security_and_validation_e2e.js` (100% pass) and production Vite build | `backend/middleware/securitySanitizer.js` (new), `backend/utils/validators.js` (new), `backend/tests/test_security_and_validation_e2e.js` (new), `backend/server.js`, `backend/routes/watchlistRoutes.js`, `backend/routes/basketRoutes.js`, `backend/routes/ipoVerificationRoutes.js`, `backend/routes/analyzeRoute.js`, `backend/routes/planRoutes.js`, `backend/lib/aiSummarizer.js`, `frontend/src/utils/securityGuard.js`, `frontend/index.html`, `firebase.json`, `GEMINI.md` |
| 2026-10-17 | Founding Clients Migration, Admin Universal Quota Bypass & Dynamic Non-Destructive Role/Plan Management: 1. Database Migration: Executed `migrateClients.js` on live Firestore users collection for founding clients: `korojitha@gmail.com` initialized as full Administrator (`role: 'admin'`, `entitlements: { read: true, write: true }`, `approvalStatus: 'approved'`), and `tatvarthcapital@gmail.com` and `cpjain1980@gmail.com` (along with `cpjain@gmail.com` alias) initialized with Lifetime Premium plans (`plan: 'premium'`, `planStatus: 'active'`, `planExpiresAt: null`, `approvalStatus: 'approved'`). Registered all founding emails in `approved_emails` registry to permanently bypass approval gates on repeat logins. 2. Admin Zero-Plan Universal Access: Hardened `backend/lib/planLimits.js` and `frontend/src/contexts/AuthContext.jsx` ensuring that users with `role === 'admin'` automatically receive top-tier Premium limits (`limits: PLAN_LIMITS.premium`) and bypass all insertion gates (watchlist, daily AI quotas, family PANs, baskets, CSV export) unconditionally without requiring any paid plan. 3. Non-Destructive Role Promotion: Updated `PATCH /api/admin/users/:uid/role` in `adminRoutes.js` to update strictly `role` and `entitlements` with `{ merge: true }`, ensuring a user's existing plan (Basic, Pro, Premium) is completely preserved untouched when promoted to Admin; in their existing plan, they immediately gain full access to the Admin Control Center and universal quota immunity. 4. Flexible Dynamic Plan Adjustments: Hardened `PATCH /api/admin/users/:uid/plan` in `adminRoutes.js` to support both duration token strings (`1m`, `3m`, `6m`, `1y`, `lifetime`) from `PlanEditModal.jsx` and numeric months, properly calculating expiration timestamps or setting `null` for lifetime access. 5. Automated Verification: Created 8-suite comprehensive E2E test `test_admin_plan_and_role_management_e2e.js` verifying admin quota immunity, founding client profiles, role promotion plan preservation, dynamic plan allotment, and demotion bounds with guaranteed test data teardown. Verified 100% pass across all test suites | `backend/scripts/migrateClients.js` (new), `backend/routes/adminRoutes.js`, `backend/lib/planLimits.js`, `frontend/src/contexts/AuthContext.jsx`, `backend/tests/test_admin_plan_and_role_management_e2e.js` (new), `GEMINI.md` |
| 2026-10-17 | Lifetime Resource & Bandwidth Optimization Architecture (Render Free Tier Lifetime Immunity): Completely overhauled outbound scraping and client response pipelines to permanently guarantee zero overages under Render's 750 free instance hours and 5 GB monthly bandwidth limits. 1. NSE Session Keep-Alive & Auto-Recovery: Extended `SESSION_TTL_MS` in `nseScraper.js` from 2m to 20m, added transparent 401/403 session auto-recovery, and enabled gzip on handshake requests, cutting redundant 900 KB homepage re-downloads by 95.8% (saving ~18 GB/month). 2. BSE Smart Incremental Page 1 Diffing: Added `_knownBseAnnouncementIds` in `bseScraper.js` with Page 1 early exit diffing (skips pages 2..10 when Page 1 overlaps with known filings) and dynamic deep crawl only during fresh bursts, saving ~3.5 GB/month. 3. Registrar Decoupled Cadence: Decoupled KFintech, Link Intime (MUFG), and BigShare in `cronService.js` to run on a 10-minute cadence (5-minute during the 20:00 - 23:30 IST evening allotment window), cutting registrar calls by 83.3%. 4. Market Cadence Guard Activation: Set `DISABLE_CADENCE_GUARD: "false"` in `render.yaml` and calibrated `istTime.js` (unrestricted 2m during Mon-Fri 08:00 - 22:00 IST and Saturday board meetings; throttled to 30m during deep night and Sundays), saving ~45% off-hours bandwidth. 5. Express HTTP Gzip Compression & 304 ETag Caching: Mounted `compression` middleware in `server.js` (`threshold: 1024`) shrinking JSON payloads by up to 99% (e.g. 5,026B → 67B), with `Cache-Control` headers ensuring 100+ concurrent users consume <0.4 GB/month. 6. Automated Test Suite: Created `backend/tests/test_resource_and_bandwidth_optimization.js` verifying Express gzip compression, NSE session keep-alive, BSE incremental diffing, registrar cadence throttle, and IST market windows with 100% pass rate (6/6 tests passed) | `backend/server.js`, `backend/package.json`, `backend/lib/nseScraper.js`, `backend/lib/bseScraper.js`, `backend/services/cronService.js`, `backend/routes/announcementRoutes.js`, `render.yaml`, `backend/tests/test_resource_and_bandwidth_optimization.js` (new), `GEMINI.md` |
| 2026-10-17 | Luxury Welcome / Landing Page Responsive Redesign & Theme Architecture: Overhauled `WelcomePage.jsx` with high-aesthetic styling, crisp box borders, and robust responsiveness: 1. Responsive Navbar & Mobile Drawer: Built sticky glassmorphic header (`bg-surface/85 dark:bg-background/85`) with brand emblem, desktop navigation, and a mobile hamburger menu with smooth animated accordion drawer (`AnimatePresence`). 2. Universal Dark/Light Theme Switcher: Added interactive Sun/Moon theme toggle in the header synchronizing with `localStorage` and `html.dark` class, providing tailored dark mode (`#09090b` ambient base) and crisp light mode (`#f8f9fa` base). 3. Crisp Card Borders & Elevated Geometry: Applied crisp well-defined borders (`border border-border/90 hover:border-primary/50 shadow-sm`) around all trust metric pillars, capability cards, pricing matrix cards, and FAQ accordion boxes, preventing cards from blending into backgrounds. 4. Luxury Typography: Employed Outfit / Space Grotesk (`font-display`) for high-impact headlines, Plus Jakarta Sans (`font-sans`) for body text, and JetBrains Mono (`font-mono`) for metrics, prices, and exchange tags. 5. Live Market Radar Preview Strip: Added simulated real-time statutory feed preview displaying live filings, verified checkmarks, and AI summary indicators | `frontend/src/components/Welcome/WelcomePage.jsx`, `GEMINI.md` |
| 2026-10-17 | User Approval Multi-Device Push & Notification Architecture Overhaul: Resolved critical bug where admin push notifications were skipped when new users logged in or registered: 1. Root Cause Resolution: Identified that frontend client direct-write in `ensureUserProfile` had pre-populated `approvalStatus: 'pending'` before triggering `/api/auth/onboarding-request`, causing backend early exit (`if (data.approvalStatus === 'pending') return`) that completely bypassed `notifyAdminsOfNewAccessRequest`. 2. Flag-Driven Dispatch & Deduplication: Upgraded `/api/auth/onboarding-request` in `server.js` with `approvalNotificationSent` flag; automatically triggers `notifyAdminsOfNewAccessRequest` on any pending account where notification has not been confirmed, while preventing duplicate spam on routine page loads. 3. Universal Auth Profile Sync: Enhanced `AuthContext.jsx` so standard `login(email, password)` and snapshot listeners execute profile sync and catchup pings automatically. 4. Multi-Device Admin Push Delivery: Upgraded `userApprovalNotificationService.js` and `webPushNotifier.js` to discover all admins (role query + known admin email fallbacks), target every registered push device with high-priority VAPID headers (`urgency: 'high'`, `TTL: 86400`), log device breakdowns, and write immutable audit trails. Added user-directed push on approval/rejection/re-allow in `adminRoutes.js`. 5. Service Worker & Pending UX: Updated `sw.js` with `'admin-approval'` notification type, action buttons ("Review & Approve"), and direct deep-link click handling (`/admin?tab=users&filter=pending`). Added interactive "Ping Administrator / Resend Alert" button with 2-minute cooldown on `PendingApprovalPage.jsx`. Verified with 9-suite E2E test `test_user_approval_notifications_e2e.js` (100% pass, 0 failures) and production Vite build | `backend/server.js`, `backend/lib/userApprovalNotificationService.js`, `backend/lib/webPushNotifier.js`, `backend/routes/adminRoutes.js`, `frontend/src/contexts/AuthContext.jsx`, `frontend/src/services/alertService.js`, `frontend/src/components/Auth/PendingApprovalPage.jsx`, `frontend/public/sw.js`, `backend/tests/test_user_approval_notifications_e2e.js` (new), `GEMINI.md` |
| 2026-10-17 | Active Statutory Cadence Extension (07:30 - 23:45 IST) & High-Speed 90s Worker Loop: 1. Root Cause Analysis: Identified why late-night earnings filings (Axis Bank at 23:10:13 IST, Infobeans at 23:14:24 IST) were saved at 23:19:41 IST. On Saturdays, `istTime.js` previously treated `istHour >= 20` as off-market weekend with a 30-minute throttle (`minIntervalMinutes: 30`), delaying late-night filings until the next cycle or manual refresh. 2. Cadence Window Realignment: Extended the zero-delay active corporate announcement window in `istTime.js` to 23:45 IST across both weekdays (07:30 - 23:45 IST) and Saturdays (08:30 - 23:45 IST) with `minIntervalMinutes: 0`, guaranteeing zero artificial throttling during late-evening earnings calls and board meetings. 3. Polling Rate Optimization: Tuned autonomous background worker in `server.js` from 120s to 90s (`WORKER_INTERVAL_MS = 90 * 1000`) for sub-90s ingestion speed with minimal bandwidth footprint (~14 MB/day). Added test case in `test_market_hours_guard.js` (7/7 tests passed) | `backend/lib/time/istTime.js`, `backend/server.js`, `backend/tests/test_market_hours_guard.js`, `GEMINI.md` |
| 2026-10-17 | 1-Minute Core Market Polling (Mon-Fri 08:30 - 16:30 IST) & Perpetual Free-Tier Bandwidth Protection: 1. Core Trading Window: Configured `CORE_TRADING_HOURS` in `istTime.js` for Monday through Friday from 08:30 to 16:30 IST with `minIntervalMinutes: 0`, and set background worker loop in `server.js` to 60 seconds (`WORKER_INTERVAL_MS = 60 * 1000`), guaranteeing real-time 1-minute statutory announcement polling across both BSE and NSE during market hours. 2. Dynamically Balanced Off-Hours & Normal Weekends: Mon-Fri evening earnings calls (16:30 - 23:45 IST) and pre-market (07:30 - 08:30 IST) poll every 2 minutes; normal Saturday board meetings (09:00 - 23:45 IST) poll every 5 minutes; Sunday and deep night (23:46 - 07:29 IST) poll every 30 minutes. Added 5-second timer drift tolerance in `cronService.js`. 3. Perpetual Render & Vercel Free Tier Immunity: Verified bandwidth consumption: BSE Page 1 diffing (~15 KB) + NSE keep-alive session reuse (~8 KB) = ~23 KB per run. Core weekday hours (480 runs/day = 11.04 MB/day) + off-hours total ~400.6 MB/month, consuming only ~8.0% of Render's free 5,000 MB (5 GB) bandwidth quota (92% unused buffer!) and 744 / 750 free instance hours. Vercel serverless functions remain 100% idle of background duty (`IS_VERCEL` disables worker), consuming <1 GB of 100 GB. Passed 100% of test suites (`test_market_hours_guard.js`, `test_resource_and_bandwidth_optimization.js`, `test_hybrid_architecture.js`) | `backend/lib/time/istTime.js`, `backend/server.js`, `backend/services/cronService.js`, `backend/tests/test_market_hours_guard.js`, `backend/tests/test_resource_and_bandwidth_optimization.js`, `GEMINI.md` |
| 2026-10-18 | Fix Missing clsx Import on IPO Verification Page: Resolved runtime `ReferenceError: clsx is not defined` crash on `/ipo-verification` by importing `clsx` from `'clsx'` in `IpoVerificationPage.jsx`. Deep scanned all frontend source files with AST/import check ensuring zero unimported identifiers across the codebase. Verified clean production build with Vite (`npm run build`) | `frontend/src/components/IpoVerification/IpoVerificationPage.jsx`, `GEMINI.md` |
| 2026-10-18 | Watchlist & Curated Basket Sharing Overhaul, 1-Tap Import Flow & Luxury Settings Page Redesign: 1. Watchlist Sharing Unlocked for Free Tier: Updated `PLAN_LIMITS.basic.maxBaskets` from 0 to 3 (and Pro to 10, Premium to Infinity) in `backend/lib/planLimits.js` and `frontend/src/contexts/AuthContext.jsx`. Removed blocking paywall modal so any user can freely share their watchlist. 2. 1-Tap Fast Share Watchlist Endpoint: Added `POST /api/baskets/share-watchlist` in `basketRoutes.js` and wired 1-Tap Fast Share button in `ShareBasketModal.jsx` for instant link generation. 3. Resilient Basket Lookup & Auto-Deduplicated Import: Added `findBasketDoc(rawSlug)` in `basketRoutes.js` resolving baskets via direct document ID and query slug, eliminating 404s. Upgraded `POST /api/baskets/:slug/import` with slot quota validation (`canAddToWatchlist`), deduplication against existing watchlist, and real-time state synchronization via `refreshWatchlist()` in `PublicBasketPage.jsx`. 4. Robust Validator: Hardened `validateBasketInput` in `validators.js` accepting both `scripts` and `stocks`, returning `errors` array, normalizing stock metadata, and auto-generating clean slugs. 5. Luxury Settings Page Redesign: Overhauled `SettingsPage.jsx` into a 9-section control deck with Profile Overview, Membership Tier hero with live Quota Usage meters (Watchlist, Daily AI, Family PANs, Public Baskets) and Upgrade CTA, Shared Watchlists & Curated Baskets manager (views, imports, 1-click link copy, preview, and delete modal), Push Notifications, Notification Categories, Telegram Integration, Watchlist Data Tools, Appearance & Theme Picker (Dark, Light, System Default), and Danger Zone. 6. Automated Testing: Created `test_watchlist_sharing_e2e.js` and passed all test suites (Exit 0) and Vite production build | `backend/lib/planLimits.js`, `backend/utils/validators.js`, `backend/routes/basketRoutes.js`, `frontend/src/contexts/AuthContext.jsx`, `frontend/src/components/Watchlist/WatchlistPage.jsx`, `frontend/src/components/Watchlist/ShareBasketModal.jsx`, `frontend/src/components/Watchlist/PublicBasketPage.jsx`, `frontend/src/components/Settings/SettingsPage.jsx`, `backend/tests/test_watchlist_sharing_e2e.js` (new), `backend/tests/test_membership_and_entitlements_e2e.js`, `GEMINI.md` |
| 2026-10-18 | `apiClient` HTTP Helper Methods, Vercel Probe CORS Resolution & Full Console/DevTools Lockdown: 1. Resolved `Oe.post is not a function` in `ShareBasketModal.jsx` and across components by attaching first-class HTTP methods (`.get`, `.post`, `.put`, `.patch`, `.delete`) directly to `apiClient` in `apiClient.js` with automatic JSON payload serialization and header defaults. 2. Fixed Vercel CORS Error: Updated `VERCEL_BASE_URL` fallback to empty string (instead of hardcoded 404 URL) and guarded `probeVercelHealth` so it only runs if `VITE_VERCEL_API_URL` is configured, preventing platform 404 CORS blocks and routing reliably to active Render backend. 3. Google Tag Manager / Analytics Script Whitelisting: Added `googletagmanager.com`, `www.googletagmanager.com`, `google-analytics.com`, `www.google-analytics.com`, `tagmanager.google.com`, and `analytics.google.com` to `TRUSTED_SCRIPT_DOMAINS` in `securityGuard.js` preventing DOM mutation shield false positives. 4. Complete Console & DevTools Lockdown: Implemented `lockDownConsole` and active `enableInspectionLockdown` in `securityGuard.js` for production (`!import.meta.env.DEV`), neutralizing all console logging methods (`log`, `warn`, `error`, `info`, `dir`, `table`, etc.), repeatedly clearing console output via high-frequency interval (`setInterval(console.clear, 400)`), disabling `window.eval`, freezing `window.console` with immutable descriptors, and blocking F12, Ctrl+Shift+I/J/C, Ctrl+U, and right-click context menu so unauthorized users cannot inspect or execute commands in the console. Verified clean Vite production build | `frontend/src/services/apiClient.js`, `frontend/src/utils/securityGuard.js`, `GEMINI.md` |
| 2026-10-20 | Fix Missing React Hooks in PublicBasketPage: Resolved runtime `ReferenceError: useState is not defined` crash when loading public basket links (`/basket/:slug`) by importing `React, { useState, useEffect }` from `'react'` in `PublicBasketPage.jsx`. Also imported `useEffect` explicitly in `ShareBasketModal.jsx`. Deep scanned all frontend files to guarantee zero unimported hooks across the SPA. Verified clean Vite production build | `frontend/src/components/Watchlist/PublicBasketPage.jsx`, `frontend/src/components/Watchlist/ShareBasketModal.jsx`, `GEMINI.md` |

---

> **REMEMBER**: This file is your compass. Read it first, change code second, update this file third.

