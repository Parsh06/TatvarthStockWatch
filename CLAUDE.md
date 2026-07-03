# StockWatch — CLAUDE.md

## What this app does
BSE/NSE corporate announcement tracker. Fetches all BSE announcements daily, filters to user's watchlist, sends email alerts. 3–4 users, up to 4000 scripts each.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend (local) | Express (`backend/server.js`) |
| Backend (prod) | Vercel serverless (`backend/api/**`) |
| Auth | Firebase Auth (skipped in local mode) |
| DB (prod) | Firestore |
| DB (local) | `backend/scripts.json` (watchlist) + `backend/announcements.json` (fetched) |
| Email | Nodemailer + Gmail SMTP |
| BSE API | `api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w` |

---

## Running locally

```
# Terminal 1 — backend
cd stockwatch/backend && npm start       # http://localhost:3000

# Terminal 2 — frontend
cd stockwatch/frontend && npm run dev    # http://localhost:5173
```

Vite proxies `/api/*` → `http://localhost:3000` — no CORS issues.

---

## Local vs Production mode

Controlled by `FIREBASE_ENABLED = Boolean(VITE_FIREBASE_API_KEY && VITE_FIREBASE_PROJECT_ID)` in `frontend/src/services/firebase.js`.

| Feature | Local (no Firebase vars) | Production (Firebase vars set) |
|---|---|---|
| Auth | Auto-login as DEMO_USER | Firebase Auth |
| Watchlist storage | `backend/scripts.json` via REST | Firestore `users/{uid}/watchlist` |
| Announcements | `backend/announcements.json` | Firestore `announcements/` |
| Login page | Never shown | Shown when unauthenticated |

**To go to production:** add Firebase + Gmail env vars, deploy backend to Vercel. Zero code changes needed.

---

## Key files — read these before any feature work

```
backend/
  server.js                      Express server (local only) — all REST endpoints
  scripts.json                   Local watchlist DB
  announcements.json             Local announcements DB (populated by Fetch News)
  lib/
    bseScraper.js                BSE API + Akamai bypass + pagination
    mailer.js                    Email HTML builder + Nodemailer sender
    firebaseAdmin.js             Admin SDK init (lazy, deferred on missing creds)
    announcementStore.js         Firestore announcement CRUD (prod only)
  api/cron/
    check-announcements.js       Vercel cron — fetches BSE, notifies users

frontend/src/
  services/
    firebase.js                  FIREBASE_ENABLED flag — controls local vs prod
    watchlistService.js          Dual-mode: REST API (local) / Firestore (prod)
    announcementService.js       Announcement fetch + Firestore reads
  contexts/
    AuthContext.jsx              Auto-login as DEMO_USER when FIREBASE_ENABLED=false
    WatchlistContext.jsx         Global watchlist state — no mock data
  hooks/
    useWatchlist.js              Adds filtering (search/exchange) on top of context
    useAnnouncements.js          Dual-mode: GET /api/announcements (local) / Firestore (prod)
  components/
    Watchlist/WatchlistPage.jsx  "Fetch News" button → POST /api/trigger
    Announcements/AnnouncementsPage.jsx
    Announcements/AnnouncementCard.jsx  Normalises scriptCode/scripCode/ltdCode fields
    Dashboard/DashboardPage.jsx
```

---

## Backend REST API (local)

| Method | Path | Description |
|---|---|---|
| GET | `/api/watchlist` | Read scripts.json |
| POST | `/api/watchlist` | Add script (body: `{bseCode, scriptName, nseSymbol, exchange, notes}`) |
| DELETE | `/api/watchlist/:id` | Remove script by id |
| DELETE | `/api/watchlist/all` | Clear all |
| POST | `/api/watchlist/bulk` | Bulk add (body: `{scripts: [...]}`) |
| PATCH | `/api/watchlist/:id` | Update script |
| GET | `/api/announcements` | Read announcements.json (query: `exchange`, `scriptCode`, `limit`) |
| POST | `/api/trigger` | Fetch all BSE → filter to watchlist → save to announcements.json → email |
| GET | `/api/email-preview` | Returns email HTML using real announcements.json data |

---

## BSE API — critical details

- URL: `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w`
- Required params: `strSearch=P`, `subcategory=-1`, `strType=C`, `strCat=-1`
- Date format: `yyyyMMdd` (NOT `DD/MM/YYYY`)
- `strScrip=''` fetches ALL companies (paginated)
- Akamai bot protection — **must** include `Sec-Fetch-*` headers + `insecureHTTPParser: true` in axios
- Session init: visit `https://www.bseindia.com` first to capture cookies
- Response shape: `{Table: [...items], Table1: [{ROWCNT: N}]}`
- Page concurrency: 5 parallel pages (`PAGE_CONCURRENCY = 5`)

---

## Data field names (BSE normalized)

```js
{
  id, exchange, scriptName, scriptCode,
  category, subCategory, subject, description,
  announcementDate,   // ISO string
  date,               // "15 Jun 2026"
  time,               // "14:30:00"
  datetimeIST,        // "15 Jun 2026 14:30:00 IST"
  pdfUrl, sourceUrl, critical
}
```

`AnnouncementCard` also handles legacy Firestore fields: `scripCode`, `companyName`, `url`, `link`.

---

## Watchlist field names

```js
{
  id,           // Firestore docId or "local-{timestamp}"
  bseCode,      // canonical — "500325"
  nseSymbol,    // optional — "RELIANCE"
  scriptName,   // display name
  exchange,     // "BSE" | "NSE" | "BOTH"
  notes,
  addedAt
}
```

Legacy input fields (`ltdCode`, `scripCode`, `scriptCode`) are normalised to `bseCode` in both `watchlistService.js` and `server.js`.

---

## Scale design (prod)

- 4 users × 4000 scripts = `bseCodesIndex: string[]` array on each `users/{uid}` doc
- Cron reads 4 user docs → builds reverse map in-memory → fetches ALL BSE (~500 items) → filters in O(N)
- No per-script API calls. No scanning subcollections.
- Announcement writes use NEWSID as doc ID → idempotent, no existence checks

---

## Env vars

**`backend/.env`**
```
PORT=3000
GMAIL_USER=           # optional for local
GMAIL_APP_PASSWORD=   # optional for local
NOTIFY_EMAIL=         # optional for local
# Production only:
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
CRON_SECRET=
```

**`frontend/.env`** — leave all `VITE_FIREBASE_*` commented out for local mode.

---

## Common tasks

**Add a new backend endpoint:**
Edit `backend/server.js` — add `app.get/post/delete(...)` before the `app.listen` call.

**Add a new frontend page:**
1. Create component in `frontend/src/components/`
2. Add route in `frontend/src/App.jsx` (wrap in `ProtectedRoute + AppLayout`)

**Change email template:**
Edit `buildSingleEmailHtml()` in `backend/lib/mailer.js`. One email is sent per announcement (`sendAnnouncementEmails` loops). Preview at `http://localhost:3000/api/email-preview` — shows all stored announcements rendered as individual emails stacked.

**Add a new watchlist field:**
1. `server.js` — add to POST/bulk handlers
2. `watchlistService.js` — add to both local and Firebase paths
3. `ScriptCard.jsx` / `AddScriptModal.jsx` — display/input

**Add a new announcement field:**
1. `bseScraper.js` → `normalizeItem()` — parse from raw BSE item
2. `AnnouncementCard.jsx` — display it

---

## Do not

- Call BSE API from the browser — CORS blocked. Always call server-side.
- Hardcode credentials — use `process.env.*` (backend) or `import.meta.env.VITE_*` (frontend).
- Add mock/demo data fallbacks — show empty states instead.
- Use `vercel dev` for local work — use `node server.js`.
