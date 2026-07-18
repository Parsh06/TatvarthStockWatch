# StockWatch — Comprehensive Project Reference & Architecture

## 1. Executive Summary

StockWatch is a full-stack web application designed to track corporate announcements, board meetings, volume spurts, and block deals for companies listed on the BSE (Bombay Stock Exchange) and NSE (National Stock Exchange).
Users curate a custom watchlist, and the system actively monitors and alerts them of critical market events via Web Push and Telegram notifications, enhanced with AI-generated summaries.

**Core Technology Stack:**

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons. Deployed on Firebase Hosting.
- **Backend**: Node.js, Express. Deployed on vercel.
- **Authentication**: Firebase Auth (JWT verified via backend middleware).
- **Primary Database**: MongoDB Atlas (Transient high-volume data: Announcements, Watchlists).
- **Secondary Database**: Google Cloud Firestore (Persistent data: User preferences, Push devices, Alert logs, Deduplication locks).
- **AI Processing**: Google Gemini AI (`@google/genai`) for announcement summarization.
- **Caching & Rate Limiting**: Upstash Redis.

---

## 2. Core Flows & Architecture

### 2.1 The Notification & Cron System Flow

This is the heart of the application, running continuously via a cron trigger (`/api/cron/trigger`):

1. **Midnight Wipe**: If the system detects a new calendar date (IST timezone), it wipes the `announcements` collection in MongoDB and the `alert_dedup_locks` collection in Firestore. This ensures the app only tracks "today's" data and prevents stale alerts.
2. **Fetch Phase**: The backend scrapes BSE and NSE APIs for the latest announcements.
3. **Database Insertion**: The announcements are inserted into MongoDB. `NEWSID` is used as a unique index to prevent duplicate entries.
4. **User Match Phase**: For every registered user, the system pulls their watchlist and checks if any new announcements match their saved `bseCode` or `nseCode`.
5. **Filtering Phase (`notificationFilter.js`)**:
   - The user's `blockedCategories` preferences are loaded from Firestore.
   - The filter runs a **case-insensitive** check to see if the announcement's `Category` or `Subcategory` matches a blocked string.
   - If blocked, the announcement is skipped for this user.
6. **Deduplication Phase (`alert_dedup_locks`)**:
   - To prevent spamming if the cron runs twice quickly, the system attempts to create a lock document in Firestore (`users/{uid}/alert_dedup_locks/{newsId}`).
   - If the lock already exists, the notification is skipped.
7. **AI Summarization (`aiSummarizer.js`)**:
   - If the announcement passes all filters, the raw PDF text or announcement subject is sent to Gemini AI to generate a concise, human-readable summary.
8. **Delivery Phase**:
   - **Web Push**: Sent via VAPID (`web-push`) to all registered devices for the user (`pushDevices` subcollection).
   - **Telegram**: Sent via `node-telegram-bot-api` if the user has linked their Telegram Chat ID.
9. **Fail-Safe Mechanism**: If fetching user preferences from Firestore fails (e.g., Firebase timeout), the system throws an error and **skips** sending notifications to prevent accidentally alerting a user for a category they blocked.

### 2.2 Web Push Registration Flow

1. The React frontend calls `useWebPush()`, prompting the user for browser permission.
2. If granted, the browser generates a unique PushSubscription object.
3. The frontend calls `POST /api/push/subscribe` with the subscription and a generated UUID `deviceId`.
4. The backend stores this in Firestore at `users/{uid}/pushDevices/{deviceId}`.
5. A "heartbeat" is sent on app load (`POST /api/push/heartbeat`) to update `lastSeenAt`, allowing the backend to eventually prune dead devices.

### 2.3 User Authentication Flow

1. User logs in via Google/Email on the frontend using Firebase Client SDK.
2. Firebase issues an ID Token (JWT).
3. The frontend attaches `Authorization: Bearer <token>` to all `/api/*` requests.
4. `authMiddleware.js` on the backend uses Firebase Admin SDK (`admin.auth().verifyIdToken()`) to validate the token and inject `req.user = { uid, email }`.

---

## 3. Data Architecture

### 3.1 MongoDB Atlas (High Volume / Transient)

| Collection        | Purpose                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `announcements` | Stores today's BSE+NSE announcements. Wiped daily at midnight. Unique index on`id` (NEWSID). |
| `watchlists`    | Stores user watchlists. Indexed by`userId`.                                                  |

**Announcement Document Schema:**

```js
{
  id: String, exchange: String, scriptName: String, scriptCode: String,
  category: String, subCategory: String, subject: String,
  description: String, announcementDate: String, time: String,
  datetimeIST: Date, pdfUrl: String, sourceUrl: String,
  critical: Boolean, aiSummary: String
}
```

### 3.2 Google Cloud Firestore (Persistent / Relational)

| Collection Path                            | Purpose                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `users/{uid}`                            | User document. Contains`.prefs` object (Telegram ID, blocked categories, etc). |
| `users/{uid}/pushDevices/{deviceId}`     | Subcollection of active Web Push devices for a user.                             |
| `users/{uid}/alerts/{newsId}`            | Log of historical alerts sent to the user.                                       |
| `users/{uid}/alert_dedup_locks/{newsId}` | Ephemeral locks to prevent duplicate notifications. Wiped daily.                 |
| `system_meta/cron_status`                | Global system state (last run time, last wipe date).                             |

**Prefs Object Schema (`users/{uid}.prefs`):**

```js
{
  telegramEnabled: Boolean, inAppEnabled: Boolean, pushEnabled: Boolean,
  telegramChatId: String, frequency: String,
  blockedCategories: Array<String> // e.g., ["Board Meeting", "Company Update"]
}
```

---

## 4. Frontend Application Map (`src/components/`)

The frontend is a modular React SPA with the following key views:

- **Dashboard (`DashboardPage.jsx`)**: The homepage. Shows a consolidated feed of announcements specifically for the user's watchlist.
- **Watchlist (`WatchlistPage.jsx`)**: Where users add/remove specific BSE/NSE scrip codes to monitor.
- **All Announcements (`AllAnnouncementsPage.jsx`)**: A raw, unfiltered firehose of every announcement happening in the market today.
- **Board Meetings (`BoardMeetingsPage.jsx`)**: Tracks upcoming board meetings and their outcomes. Defaults to alphabetical sort by Company Name.
- **AGM Updates (`AGMUpdatesPage.jsx`)**: Tracks scheduled Annual General Meetings. Defaults to alphabetical sort. Filterable by watchlist.
- **Gainers / Losers (`GainersLosersPage.jsx`)**: Tracks the top movers of the day across exchanges.
- **Volume Spurt (`VolumeSpurtSection.jsx`)**: Tracks abnormal volume spikes in specific stocks, pulling directly from BSE APIs.
- **Bulk & Block Deals (`BulkBlockPage.jsx`)**: Displays massive institutional trades, sorted alphabetically by default. Includes statistical breakdown (Buy vs Sell Cr value).
- **Settings (`SettingsPage.jsx`)**: Notification preferences, Telegram linking, and category blocking logic.

---

## 5. Backend API Routes (`server.js`)

| Method          | Path                      | Auth   | Description                                          |
| --------------- | ------------------------- | ------ | ---------------------------------------------------- |
| **GET**   | `/api/rates`            | Open   | Live BSE rates (cached)                              |
| **POST**  | `/api/trigger`          | 🔒     | Manually trigger the fetch/notify loop               |
| **GET**   | `/api/cron/trigger`     | Secret | Global cron trigger (requires`CRON_SECRET` header) |
| **GET**   | `/api/announcements`    | 🔒     | Fetch today's announcements from Mongo               |
| **GET**   | `/api/prefs`            | 🔒     | Get user preferences from Firestore                  |
| **PATCH** | `/api/prefs`            | 🔒     | Update user preferences                              |
| **GET**   | `/api/watchlist`        | 🔒     | Get user's watchlist scripts                         |
| **POST**  | `/api/watchlist`        | 🔒     | Add a new script to watchlist                        |
| **POST**  | `/api/push/subscribe`   | 🔒     | Register a new web push device                       |
| **POST**  | `/api/push/test`        | 🔒     | Send a test notification to the user                 |
| **GET**   | `/api/bse/agm-updates`  | 🔒     | Proxies BSE Forthcoming Board Meeting API            |
| **GET**   | `/api/bse/deals`        | 🔒     | Proxies BSE Bulk/Block Deals API                     |
| **GET**   | `/api/bse/volume-spurt` | 🔒     | Fetches live volume spurt data                       |

---

## 6. Environment Variables

### Backend (`backend/.env`)

```bash
PORT=3000
FRONTEND_URL=https://tatvarthstockwatch.web.app
CRON_SECRET=super_secret_cron_key

# Firebase Admin
FIREBASE_PROJECT_ID=tatvarthstockwatch
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# MongoDB
MONGODB_URI=mongodb+srv://...

# Web Push (VAPID)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com

# Integrations
TELEGRAM_BOT_TOKEN=...
GOOGLE_AI_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Frontend (`frontend/.env`)

```bash
VITE_API_URL=https://your-railway-app.up.railway.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=tatvarthstockwatch
VITE_FIREBASE_APP_ID=...
```

---

## 7. Critical Developer Rules

1. **Category Mapping Sync**:
   - If you add or remove an announcement category, you MUST update BOTH `frontend/src/utils/bseCategories.js` AND `backend/lib/alertCategories.js`. They must be identical for the filtering logic to work.
2. **CORS Restrictions**:
   - Never call BSE (`api.bseindia.com`) or NSE (`www.nseindia.com`) directly from the React frontend. Browser CORS policies will block it. Always create a proxy route in `backend/routes/bseRoutes.js` and have the frontend call the backend.
3. **Database Operations**:
   - When fetching user preferences in the backend, if the Firebase network request fails, you MUST throw an error to halt notification delivery. Defaulting to an "empty" preferences object can result in users receiving spam for categories they explicitly blocked.
4. **Sorting UI Data**:
   - Always safely clone arrays before sorting in React: `[...data].sort(...)`. Mutating the original state array directly (`data.sort(...)`) can break React's re-rendering lifecycle.
