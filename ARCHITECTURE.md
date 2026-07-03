# StockWatch — Architecture

---

## System Architecture (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│                                                                 │
│   React App (Firebase Hosting)                                  │
│   ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│   │  Auth Pages  │  │  Watchlist   │  │   Announcements    │   │
│   │  Login/Reg   │  │  Page + CRUD │  │   Page + Filters   │   │
│   └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘   │
│          │                │                    │                │
└──────────┼────────────────┼────────────────────┼────────────────┘
           │                │                    │
           ▼                ▼                    ▼
┌──────────────────┐  ┌──────────────────────────────────────────┐
│  Firebase Auth   │  │        Firebase Firestore                │
│  - Email/Pass    │  │  users/{uid}/watchlist                   │
│  - Google OAuth  │  │  users/{uid}/notifications               │
└──────────────────┘  │  users/{uid}/emailLogs                   │
                      └───────────────────────────────────────────┘
                                        ▲
                                        │ Admin SDK
                                        │
┌───────────────────────────────────────┼──────────────────────────┐
│              VERCEL (Backend)         │                          │
│                                       │                          │
│  ┌─────────────────────────────────┐  │                          │
│  │  /api/announcements/index       │  │                          │
│  │  /api/announcements/bse         │──┤                          │
│  │  /api/announcements/nse         │  │                          │
│  │  /api/notify/email              │  │                          │
│  │  /api/health                    │  │                          │
│  │  /api/cron/check-announcements  │──┘                          │
│  └──────────────┬──────────────────┘                            │
│                 │                                                │
│         ┌───────┴──────┐                                        │
│         │              │                                        │
│         ▼              ▼                                        │
│   ┌──────────┐   ┌──────────┐                                  │
│   │  BSE API │   │  NSE API │                                   │
│   │ (public) │   │ (public) │                                   │
│   └──────────┘   └──────────┘                                  │
│                                                                  │
│  Cron: 0 */6 * * * ──► check-announcements.js                  │
│                         → compare vs Firestore                  │
│                         → send email via Nodemailer             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### User Views Announcements
```
User clicks "Fetch Latest"
  → Frontend: GET /api/announcements?exchange=ALL
  → Backend: parallel fetch BSE + NSE APIs (server-side, no CORS)
  → Backend: normalize to unified schema, merge, sort by date
  → Backend: return JSON array
  → Frontend: annotate each announcement with isWatchlisted flag
  → Frontend: render AnnouncementCard components
```

### User Adds Script to Watchlist
```
User submits AddScriptModal
  → Frontend: checkDuplicates() against existing watchlist
  → If duplicate: toast warning, stop
  → Else: Firestore addDoc to users/{uid}/watchlist
  → WatchlistContext optimistic update → re-render ScriptCards
```

### Bulk Upload
```
User uploads CSV/XLSX
  → papaparse / SheetJS parse to rows
  → checkDuplicates(rows, existingWatchlist)
     → intra-file: compare within uploaded rows
     → cross-file: compare against Firestore watchlist
  → Preview table shows valid / duplicate / error per row
  → "Import Valid Only" → Firestore batch write (max 500/batch)
```

### Auto Notification (Cron)
```
Vercel Cron fires every 6 hours
  → GET /api/cron/check-announcements
  → Firebase Admin: list all users (users collection)
  → For each user: get watchlist scripts
  → Fetch BSE/NSE announcements for each script
  → Compare announcementDate with stored lastAnnouncementAt
  → New announcements found?
     → addDoc to users/{uid}/notifications (dedup by announcementId)
     → updateDoc watchlist entry: lastAnnouncementAt, announcementCount
     → Send email via Nodemailer (one email per user, batched announcements)
```

---

## Firestore Data Model

### `users/{uid}/watchlist/{docId}`
```
{
  scriptName:         string,    // "Reliance Industries Ltd"
  ltdCode:            string,    // "500325" or "RELIANCE"
  exchange:           string,    // "BSE" | "NSE" | "BOTH"
  addedAt:            Timestamp,
  lastAnnouncementAt: Timestamp | null,
  announcementCount:  number,    // last 7 days
  notes:              string     // optional user notes
}
```

### `users/{uid}/notifications/{docId}`
```
{
  announcementId: string,    // unique hash from BSE/NSE
  scriptName:     string,
  scriptCode:     string,
  subject:        string,    // announcement headline
  exchange:       string,
  category:       string,
  date:           Timestamp,
  read:           boolean,
  pdfUrl:         string | null,
  sourceUrl:      string,
  createdAt:      Timestamp
}
```

### `users/{uid}/emailLogs/{docId}`
```
{
  sentAt:            Timestamp,
  recipientEmail:    string,
  announcementCount: number,
  status:            "success" | "error",
  error:             string | null
}
```

---

## API Endpoints

### GET `/api/health`
Returns service health status.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-06-15T10:00:00.000Z", "service": "stockwatch-backend" }
```

---

### GET `/api/announcements`
Fetches combined BSE + NSE announcements.

**Query Params:**
| Param | Values | Default |
|---|---|---|
| `exchange` | `BSE`, `NSE`, `ALL` | `ALL` |
| `scripCode` | BSE code e.g. `500325` | (all) |
| `fromDate` | `YYYYMMDD` | 7 days ago |
| `toDate` | `YYYYMMDD` | today |

**Response:** Array of unified announcement objects.

---

### GET `/api/announcements/bse`
BSE-only announcements. Same params as above.

---

### GET `/api/announcements/nse`
NSE-only announcements. Query param: `symbol` (NSE symbol e.g. `RELIANCE`).

---

### POST `/api/notify/email`
Triggers email notification.

**Body:**
```json
{
  "userEmail": "user@example.com",
  "userName": "John",
  "announcements": [
    {
      "scriptName": "Reliance Industries",
      "scriptCode": "500325",
      "exchange": "BSE",
      "category": "Board Meeting",
      "subject": "Board meeting on 20 June 2026",
      "announcementDate": "2026-06-15",
      "pdfUrl": "https://...",
      "sourceUrl": "https://..."
    }
  ]
}
```

**Response:** `{ "success": true, "messageId": "..." }`

---

### GET `/api/cron/check-announcements`
Internal cron endpoint. Called by Vercel cron scheduler.
Optionally protected by `Authorization: Bearer <CRON_SECRET>` header.

---

## Unified Announcement Schema

All announcements from BSE and NSE are normalized to:

```javascript
{
  id:               string,    // unique hash (exchange + scripCode + date)
  exchange:         "BSE" | "NSE",
  scriptName:       string,
  scriptCode:       string,    // BSE numeric code or NSE symbol
  category:         string,    // "Board Meeting", "Results", "Dividend", etc.
  subject:          string,    // headline
  description:      string,    // full text
  announcementDate: string,    // ISO date string
  pdfUrl:           string | null,
  sourceUrl:        string,
  isWatchlisted:    boolean    // computed client-side
}
```

---

## Cron Schedule

```
0 */6 * * *   →  Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
```

Vercel free tier allows 2 cron jobs. Only 1 is used.

---

## Duplicate Detection Algorithm

**File:** `frontend/src/utils/duplicateChecker.js`

```
Input:
  uploadedRows[]     — rows parsed from CSV/Excel
  existingWatchlist[] — user's current Firestore watchlist

Step 1 — Validate each row:
  - scriptName must be non-empty string
  - ltdCode must be non-empty alphanumeric
  - exchange must be one of: BSE, NSE, BOTH (case-insensitive)
  → errors[] collects invalid rows with reason

Step 2 — Intra-file deduplication:
  For each valid row, check against all previous valid rows:
  - scriptName match: normalize(a.scriptName) === normalize(b.scriptName)
  - OR ltdCode match: normalize(a.ltdCode) === normalize(b.ltdCode)
  - normalize = toLowerCase().trim()
  First occurrence: kept in valid[]
  Subsequent: moved to intraFileDuplicates[]

Step 3 — Cross-file deduplication:
  For each remaining valid row, check against existingWatchlist:
  - Same scriptName OR ltdCode match (same normalization)
  - Matches: moved to crossFileDuplicates[]

Output:
  { valid[], intraFileDuplicates[], crossFileDuplicates[], errors[] }
```

---

## Security Model

### Firebase Auth
- All authenticated routes require valid Firebase ID token
- Firebase SDK handles token refresh automatically

### Firestore Rules
```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```
Users can only read/write their own data. No cross-user access.

### Backend (Vercel)
- BSE/NSE API calls are server-side only (avoids browser CORS)
- Rate limiting: 60 requests/minute per IP (in-memory)
- Email endpoint validates recipient email with regex before sending
- Cron endpoint optionally protected by `CRON_SECRET` env var

### Environment Variables
- No credentials in source code — all via `.env` (gitignored)
- GitHub Actions injects secrets at build/deploy time
- Frontend secrets are Vite build-time injected (public Firebase config is safe by design — Firestore rules enforce authorization)

---

## In-Memory Caching

BSE and NSE scrapers cache responses for 5 minutes using a `Map`:

```javascript
const cache = new Map()  // key → { data, expiry }

function getCached(key) {
  const entry = cache.get(key)
  if (entry && Date.now() < entry.expiry) return entry.data
  return null
}

function setCached(key, data) {
  cache.set(key, { data, expiry: Date.now() + 5 * 60 * 1000 })
}
```

This prevents hammering free public APIs on every request. Cache is per-instance (Vercel functions are stateless — cache resets on cold starts, which is acceptable).
