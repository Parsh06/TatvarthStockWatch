# StockWatch — Comprehensive Project Reference & Architecture

## 1. Executive Summary

StockWatch is a full-stack web application designed to track corporate announcements, board meetings, volume spurts, block deals, and IPO allotments for companies listed on the BSE and NSE.
Users curate a custom watchlist and manage family portfolios, and the system actively monitors and alerts them of critical market events via Web Push and Telegram notifications, enhanced with AI-generated summaries.

**Core Technology Stack:**

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion. Deployed on Firebase Hosting.
- **Backend**: Node.js, Express. Deployed as Vercel Serverless Functions.
- **Authentication**: Firebase Auth (JWT verified via backend middleware).
- **Primary Database**: MongoDB Atlas (Transient high-volume data: Announcements).
- **Secondary Database**: Google Cloud Firestore (Persistent data: User preferences, Watchlists, Push devices, Alert logs, Deduplication locks, Encrypted IPO Applicants).
- **AI Processing**: Google Gemini AI (`@google/genai`) for announcement summarization.
- **Registrar APIs**: KFintech AWS Gateway for live IPO allotment checking.
- **Caching & Rate Limiting**: In-memory caching and basic rate limiting maps.

---

## 2. Core Flows & Architecture

### 2.1 The Notification & Cron System Flow

This is the heart of the application, running continuously via a cron trigger (`/api/cron/trigger`):

1. **Midnight Wipe**: If the system detects a new calendar date (IST timezone), it wipes the `announcements` collection in MongoDB and the `alert_dedup_locks` collection in Firestore. This ensures the app only tracks "today's" data and prevents stale alerts.
2. **Fetch Phase**: The backend scrapes BSE and NSE APIs for the latest announcements.
3. **Database Insertion**: The announcements are inserted into MongoDB. `NEWSID` is used as a unique index to prevent duplicate entries.
4. **User Match Phase**: For every registered user, the system pulls their watchlist and checks if any new announcements match their saved scripts.
5. **Filtering Phase (`notificationFilter.js`)**:
   - The user's `blockedCategories` preferences are loaded from Firestore.
   - The filter runs a case-insensitive check to see if the announcement's `Category` or `Subcategory` matches a blocked string.
   - If blocked, the announcement is skipped for this user.
6. **Deduplication Phase (`alert_dedup_locks`)**:
   - To prevent spamming if the cron runs twice quickly, the system attempts to create a lock document in Firestore (`users/{uid}/alert_dedup_locks/{newsId}`).
   - If the lock already exists, the notification is skipped.
7. **AI Summarization (`aiSummarizer.js`)**:
   - If the announcement passes all filters, the raw PDF text or announcement subject is sent to Gemini AI to generate a concise, human-readable summary.
8. **Delivery Phase**:
   - **Web Push**: Sent via VAPID (`web-push`) to all registered devices for the user.
   - **Telegram**: Sent via `node-telegram-bot-api` if the user has linked their Telegram Chat ID.
9. **Fail-Safe Mechanism**: If fetching user preferences from Firestore fails, the system throws an error and **skips** sending notifications to prevent alerting a user for a category they blocked.

### 2.2 IPO Verification & Bulk Checking Flow

1. **Applicant Portfolio**: Users can save up to 10 family members (Name + PAN) into their portfolio (`users/{uid}/applicants`).
2. **Encryption**: PAN numbers are AES-256-GCM encrypted server-side before being written to Firestore to preserve PII privacy.
3. **Fetching Active IPOs**: The backend dynamically scrapes KFintech's React application to extract the live Javascript bundle and parse out the hardcoded active IPOs (Symbol & ClientID). Fallbacks are provided if parsing fails.
4. **Validation Pipeline**:
   - The frontend queries `/api/ipo/verify` or `/api/ipo/verify-bulk`.
   - The backend proxies requests to KFintech AWS gateways (`0uz601ms56.execute-api.ap-south-1.amazonaws.com`).
   - Responses of `404 Not Found` with `{"error":"Record Not Found"}` are intercepted and mapped gracefully to a `not_found` status without throwing 500 errors.
5. **UI Rendering**: The React frontend uses an ultra-premium glassmorphic dashboard to display metrics (Applied, Allotted, Not Applied) alongside copyable application numbers and demat client IDs.

### 2.3 Web Push Registration Flow

1. The React frontend calls `useWebPush()`, prompting the user for browser permission.
2. If granted, the browser generates a unique PushSubscription object.
3. The frontend calls `POST /api/push/subscribe` with the subscription and a generated UUID `deviceId`.
4. The backend stores this in Firestore at `users/{uid}/pushDevices/{deviceId}`.

### 2.4 User Authentication Flow

1. User logs in via Google/Email on the frontend using Firebase Client SDK.
2. Firebase issues an ID Token (JWT).
3. The frontend attaches `Authorization: Bearer <token>` to all `/api/*` requests.
4. `authMiddleware.js` on the backend uses Firebase Admin SDK (`admin.auth().verifyIdToken()`) to validate the token and inject `req.user`.

---

## 3. Data Architecture

### 3.1 MongoDB Atlas (High Volume / Transient)

| Collection        | Purpose                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `announcements`   | Stores today's BSE+NSE announcements. Wiped daily at midnight. Unique index on `id` (NEWSID).  |

### 3.2 Google Cloud Firestore (Persistent / Relational)

| Collection Path                            | Purpose                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `users/{uid}`                              | User document. Contains `.prefs` object (Telegram ID, blocked categories, etc).  |
| `users/{uid}/watchlist/{docId}`            | User's personalized watchlist of scripts.                                        |
| `users/{uid}/applicants/{docId}`           | Encrypted list of family members for IPO Bulk Validation.                        |
| `users/{uid}/pushDevices/{deviceId}`       | Subcollection of active Web Push devices for a user.                             |
| `users/{uid}/alerts/{newsId}`              | Log of historical alerts sent to the user.                                       |
| `users/{uid}/alert_dedup_locks/{newsId}`   | Ephemeral locks to prevent duplicate notifications. Wiped daily.                 |
| `system_meta/cron_status`                  | Global system state (last run time, last wipe date).                             |

---

## 4. Frontend Application Map (`src/components/`)

The frontend is a modular React SPA with the following key views:

- **Dashboard (`DashboardPage.jsx`)**: The homepage. Shows a consolidated feed of announcements specifically for the user's watchlist.
- **Watchlist (`WatchlistPage.jsx`)**: Where users add/remove specific BSE/NSE scrip codes to monitor.
- **IPO Verification (`IpoVerificationPage.jsx`)**: Complete Bulk & Single IPO Allotment verification engine.
- **All Announcements (`AllAnnouncementsPage.jsx`)**: A raw, unfiltered firehose of every announcement happening in the market today.
- **Board Meetings (`BoardMeetingsPage.jsx`)**: Tracks upcoming board meetings and their outcomes. Defaults to alphabetical sort by Company Name.
- **AGM Updates (`AGMUpdatesPage.jsx`)**: Tracks scheduled Annual General Meetings.
- **Gainers / Losers (`GainersLosersPage.jsx`)**: Tracks the top movers of the day across exchanges.
- **Volume Spurt (`VolumeSpurtSection.jsx`)**: Tracks abnormal volume spikes in specific stocks, pulling directly from BSE APIs.
- **Bulk & Block Deals (`BulkBlockPage.jsx`)**: Displays massive institutional trades, sorted alphabetically by default. Includes statistical breakdown (Buy vs Sell Cr value).
- **Settings (`SettingsPage.jsx`)**: Notification preferences, Telegram linking, and category blocking logic.

---

## 5. Backend API Routes (`server.js`)

| Method          | Path                      | Auth   | Description                                          |
| --------------- | ------------------------- | ------ | ---------------------------------------------------- |
| **GET**         | `/api/rates`              | Open   | Live BSE rates (cached)                              |
| **GET**         | `/api/cron/trigger`       | Secret | Global cron trigger                                  |
| **GET**         | `/api/announcements`      | 🔒     | Fetch today's announcements from Mongo               |
| **GET**         | `/api/prefs`              | 🔒     | Get user preferences from Firestore                  |
| **GET/POST/DEL**| `/api/watchlist`          | 🔒     | Manage user's watchlist scripts                      |
| **GET/POST/DEL**| `/api/ipo/applicants`     | 🔒     | Manage encrypted family portfolio                    |
| **GET**         | `/api/ipo/symbols`        | 🔒     | Fetch active IPOs from KFintech payload              |
| **POST**        | `/api/ipo/verify[-bulk]`  | 🔒     | Validates PAN against KFintech Gateway               |
| **POST**        | `/api/push/subscribe`     | 🔒     | Register a new web push device                       |
| **GET**         | `/api/bse/*`              | 🔒     | Proxies BSE specific APIs (Deals, Spurt, AGM, etc)   |

---

## 6. Critical Developer Rules

1. **Category Mapping Sync**:
   - If you add or remove an announcement category, you MUST update BOTH `frontend/src/utils/bseCategories.js` AND `backend/lib/alertCategories.js`. They must be identical for the filtering logic to work.
2. **CORS Restrictions**:
   - Never call BSE (`api.bseindia.com`), NSE (`www.nseindia.com`), or KFintech directly from the React frontend. Browser CORS policies will block it or it will be subjected to Akamai bot protection. Always create a proxy route in backend and have the frontend call the backend.
3. **Database Operations**:
   - When fetching user preferences in the backend, if the Firebase network request fails, you MUST throw an error to halt notification delivery. Defaulting to an "empty" preferences object can result in users receiving spam for categories they explicitly blocked.
4. **Sorting UI Data**:
   - Always safely clone arrays before sorting in React: `[...data].sort(...)`. Mutating the original state array directly (`data.sort(...)`) can break React's re-rendering lifecycle.
5. **Theme Styling**:
   - Utilize standard Tailwind variables defined in `tailwind.config.js` (`bg-surface`, `text-textPrimary`, `border-border`) rather than hardcoding colors (`bg-slate-900`) to guarantee seamless light/dark mode support.
