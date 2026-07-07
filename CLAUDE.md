# StockWatch — Project Reference

## App Summary
BSE/NSE corporate announcement tracker. Users add stocks to a watchlist → backend fetches all BSE/NSE announcements daily → matches against watchlists → sends Telegram + Web Push + In-App notifications. Production on Firebase Hosting + Railway backend.

---

## Stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Express `backend/server.js` (Railway) |
| Auth | Firebase Auth (JWT via `verifyToken` middleware) |
| Primary DB | MongoDB Atlas (`mongoClient.js`) |
| Secondary DB | Firestore (user prefs, push devices, alerts, system meta) |
| Push Notifications | Web Push (VAPID) via `web-push` npm package |
| Telegram | `node-telegram-bot-api` (per-user chat IDs) |
| Rates/Cache | Upstash Redis (rate data) or local JSON fallback |
| BSE Data | `api.bseindia.com` — Akamai-protected, cookie-based |
| NSE Data | `www.nseindia.com` — cookie-based |

---

## Running Locally
```
# Terminal 1
cd backend && npm start        # http://localhost:3000

# Terminal 2
cd frontend && npm run dev     # http://localhost:5173
```
Vite proxies `/api/*` → `http://localhost:3000`.

---

## Key Files
```
backend/
  server.js                   All Express routes + cron job + rate limiter
  routes/
    bseRoutes.js               BSE proxy routes (quote, chart, company info, search)
    nseRoutes.js               NSE proxy routes
  lib/
    alertCategories.js         Parent-group → subcategory mapping (used by cron filter)
    alertStore.js              Firestore: users/{uid}/alerts CRUD
    aiSummarizer.js            GPT-based announcement summarizer
    announcementStore.js       MongoDB 'announcements' collection CRUD
    apiClients.js              BSE/NSE/Yahoo HTTP clients (Akamai bypass)
    authMiddleware.js          Firebase token verification (verifyToken)
    bseScraper.js              BSE announcements fetcher + normalizer
    bseRates.js                BSE live rate fetcher (batch)
    firebaseAdmin.js           Admin SDK init
    mongoClient.js             MongoDB Atlas connection
    nseScraper.js              NSE announcements fetcher + normalizer
    prefsStore.js              Firestore: users/{uid}.prefs read/write
    priceAlertChecker.js       Checks watchlist price alerts vs live rates
    prompts.js                 AI prompt templates
    pushStore.js               Firestore: users/{uid}/pushDevices CRUD
    ratesStore.js              Upstash Redis / local JSON for live rates
    telegramNotifier.js        Telegram message sender (per-user chatId)
    watchlistStore.js          MongoDB 'watchlists' collection CRUD
    webPushNotifier.js         Web Push sender (per-device + per-user)

frontend/src/
  services/
    firebase.js                Firebase init + FIREBASE_ENABLED flag
    apiClient.js               Authenticated fetch wrapper
    alertService.js            Save/load notification prefs
    announcementService.js     Fetch announcements from backend
    watchlistService.js        Watchlist CRUD
  contexts/
    AuthContext.jsx             Firebase Auth state + auto-login
    WatchlistContext.jsx        Global watchlist state
    TierContext.jsx             Premium tier gating
  hooks/
    useAnnouncements.js        Announcements fetch + filtering
    useWebPush.js              Web push subscribe/unsubscribe/test
    useWatchlist.js            Watchlist search/filter
    useRatesSocket.js          Live rates polling
    useCronStatus.js           Cron job status polling
  utils/
    bseCategories.js           ALERT_CATEGORIES (parent groups → subcategories) — frontend copy
  components/
    Dashboard/                 Main view: watchlisted announcements + rates
    AllAnnouncements/          All BSE+NSE announcements (unfiltered)
    Watchlist/                 Watchlist management, price alerts, set alerts modal
    Settings/                  Notification prefs, category filters, push setup
    GainersLosers/             Top gainers/losers (BSE + NSE)
    BoardMeetings/             Board meeting calendar
    CorporateCalendar/         BSE corporate action calendar
    InsiderTrading/            NSE insider trading data
    CompanyData/               Company fundamentals/details
    Portfolio/                 Portfolio holdings tracker
    News/                      Market news
    BulkBlock/                 Bulk watchlist import
    Premium/                   Premium tier page
    Auth/                      Login/Register pages
```

---

## Database Collections

### MongoDB Atlas
| Collection | Purpose |
|---|---|
| `announcements` | All BSE+NSE announcements. `_id` = NEWSID (idempotent). Wiped daily at midnight IST. |
| `watchlists` | All users' watchlist scripts. Indexed by `userId`. |

**Announcement doc fields:**
```js
{ id, exchange, scriptName, scriptCode, category, subCategory, subject,
  description, announcementDate, date, time, datetimeIST, pdfUrl, sourceUrl,
  critical, aiSummary }
```

**Watchlist doc fields:**
```js
{ userId, ltdCode, symbol, scriptName, exchange, notes, group, isin,
  alertAbove, alertBelow, alertEnabled, addedAt }
```

### Firestore Collections
| Path | Purpose |
|---|---|
| `users/{uid}` | User prefs doc (`.prefs` field) |
| `users/{uid}/pushDevices/{deviceId}` | Per-device push subscriptions |
| `users/{uid}/alerts/{id}` | Alert history (cron-fired announcements) |
| `system_meta/cron_status` | Last cron run time, last wipe date |

**Prefs fields (`users/{uid}.prefs`):**
```js
{ telegramEnabled, inAppEnabled, telegramChatId, frequency,
  blockedCategories: string[], pushEnabled }
```

**pushDevices doc fields:**
```js
{ subscription, platform, browser, userAgent, createdAt, lastSeenAt }
```

---

## API Routes (backend/server.js)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | open | Server status |
| GET | `/api/rates` | open | Live BSE rates (cached 15s) |
| GET | `/api/rates/status` | open | Rates fetch progress |
| GET | `/api/telegram-status` | 🔒 | Telegram config status |
| POST | `/api/telegram-test` | 🔒 | Send test Telegram message |
| GET | `/api/announcements` | 🔒 | Query MongoDB announcements |
| GET | `/api/announcements/stats` | 🔒 | Count by exchange |
| POST | `/api/announcements/fetch-nse` | 🔒 | Manual NSE fetch + save |
| GET | `/api/alerts` | 🔒 | Firestore alert history |
| GET | `/api/alerts/recent` | 🔒 | Alerts since ?since=ISO |
| DELETE | `/api/alerts/:id` | 🔒 | Delete one alert |
| DELETE | `/api/alerts` | 🔒 | Clear all alerts |
| GET | `/api/prefs` | 🔒 | Get user prefs |
| POST | `/api/prefs` | 🔒 | Save user prefs |
| PATCH | `/api/prefs` | 🔒 | Partial update prefs |
| GET | `/api/watchlist` | 🔒 | Get user watchlist |
| POST | `/api/watchlist` | 🔒 | Add script |
| POST | `/api/watchlist/bulk` | 🔒 | Bulk add scripts |
| POST | `/api/watchlist/catchup` | 🔒 | Re-notify for script added today |
| GET | `/api/watchlist/export` | 🔒 | CSV export |
| DELETE | `/api/watchlist/all` | 🔒 | Clear watchlist |
| DELETE | `/api/watchlist/:id` | 🔒 | Remove one script |
| PATCH | `/api/watchlist/:id` | 🔒 | Update script fields |
| PATCH | `/api/watchlist/:id/alert` | 🔒 | Set price alert (above/below) |
| GET | `/api/push/public-key` | open | VAPID public key |
| POST | `/api/push/subscribe` | 🔒 | Register device push subscription |
| POST | `/api/push/unsubscribe` | 🔒 | Remove device subscription |
| POST | `/api/push/test` | 🔒 | Send test push to current device (body: `{deviceId}`) |
| GET | `/api/push/devices` | 🔒 | List registered push devices |
| POST | `/api/push/heartbeat` | 🔒 | Touch device lastSeenAt |
| POST | `/api/trigger` | 🔒 | Fetch BSE+NSE, save, notify, AI summarize |
| GET/POST | `/api/cron/trigger` | secret | Global cron (protected by CRON_SECRET) |
| GET | `/api/bse/movers` | open | Top gainers/losers (5-min cache) |
| * | `/api/bse/*` | 🔒 | BSE proxy routes |
| * | `/api/nse/*` | 🔒 | NSE proxy routes |
| GET | `/api/search/scripts` | open | Redirects to `/api/bse/search` |

---

## Notification System

### Category Filtering Logic
Categories have a 2-level hierarchy (parent group → subcategories):
- Defined in `frontend/src/utils/bseCategories.js` (frontend) and `backend/lib/alertCategories.js` (backend)
- Parent groups: `Board Meeting`, `Result`, `AGM/EGM`, `Company Update`, `Corporate Action`, `Insider Trading`, `Others`
- User blocks are stored as string array in `prefs.blockedCategories`

**Filter rule (backend cron, `server.js`):**
```
Should Notify = Parent NOT blocked AND at least one specific category NOT blocked
```
- Parent blocked → skip (master switch)
- All specific subcategories blocked → skip
- Mixed (some blocked, some enabled) → notify (Option A)

### Push Notification Flow
1. Browser calls `POST /api/push/subscribe` with `{subscription, deviceId, platform, browser}`
2. Stored in `users/{uid}/pushDevices/{deviceId}` in Firestore
3. Cron calls `sendWebPushToUser(uid, payload)` → sends to ALL devices
4. Test button calls `POST /api/push/test` with `{deviceId}` → sends to THAT device only
5. Expired subscriptions (410/404) are auto-removed from Firestore

### Cron Job Flow (`/api/cron/trigger`)
1. Midnight IST check → wipes MongoDB `announcements` collection if new day
2. Fetches ALL BSE + NSE announcements
3. Saves new ones to MongoDB (idempotent by NEWSID)
4. For each user: get watchlist → match announcements → filter by `blockedCategories` → send Telegram + Web Push
5. Price alert checker runs against live rates

---

## Env Vars

**`backend/.env`**
```
PORT=3000
FRONTEND_URL=https://tatvarthstockwatch.web.app
CRON_SECRET=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
MONGODB_URI=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:...
TELEGRAM_BOT_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
GOOGLE_AI_API_KEY=
```

**`frontend/.env`**
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=https://your-railway-backend.up.railway.app
```

---

## Common Tasks

**Add new backend route:** Edit `server.js` — add before `app.listen`.

**Add new page:** Create component in `frontend/src/components/`, add route in `App.jsx` (wrap in `ProtectedRoute + AppLayout`).

**Add new watchlist field:** `watchlistStore.js` + `server.js` POST/bulk handlers + `ScriptCard.jsx` + `AddScriptModal.jsx`.

**Add new announcement field:** `bseScraper.js → normalizeItem()` + `AnnouncementCard.jsx`.

**Add new notification category:** Update `frontend/src/utils/bseCategories.js` AND `backend/lib/alertCategories.js` (must stay in sync).

**Deploy backend:** Push to Railway (auto-deploys from git main).

**Deploy frontend:** `npm run build` in `/frontend` → `firebase deploy --only hosting`.

---

## Do Not
- Call BSE/NSE API from the browser — CORS blocked. Always server-side.
- Hardcode credentials — use `process.env.*` (backend) or `import.meta.env.VITE_*` (frontend).
- Add mock/demo data fallbacks — show empty states instead.
- Modify `blockedCategories` logic without updating BOTH `bseCategories.js` (frontend) and `alertCategories.js` (backend).
