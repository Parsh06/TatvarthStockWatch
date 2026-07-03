# StockWatch

A full-stack web application for tracking BSE/NSE stock announcements. Add scripts to your personal watchlist, get real-time corporate announcements, and receive email alerts — all for free.

---

## Features

- **Firebase Authentication** — Email/Password and Google Sign-In
- **Personal Watchlist** — Add, remove, search, and filter scripts
- **Bulk Import** — Upload CSV or Excel file with duplicate detection
- **BSE/NSE Announcements** — Live corporate announcements from BSE and NSE India
- **Email Notifications** — Gmail-based alerts for new announcements on your watchlist
- **In-App Notifications** — Real-time bell notifications via Firestore
- **Dashboard** — Charts, stats, and quick-add
- **Auto-refresh** — Vercel cron runs every 6 hours to check for new announcements

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 18, Vite, Tailwind CSS            |
| Backend    | Node.js, Vercel Serverless Functions    |
| Database   | Firebase Firestore                      |
| Auth       | Firebase Authentication                 |
| Email      | Nodemailer + Gmail SMTP                 |
| Charts     | Recharts                                |
| CI/CD      | GitHub Actions                          |
| Hosting    | Firebase Hosting (frontend) + Vercel (backend) |

---

## Project Structure

```
stockwatch/
├── .github/workflows/
│   ├── deploy-frontend.yml    # Firebase deploy on push to main
│   └── deploy-backend.yml     # Vercel deploy on push to main
├── frontend/                  # React + Vite app
│   └── src/
│       ├── components/        # UI components
│       ├── contexts/          # AuthContext, WatchlistContext
│       ├── hooks/             # useAnnouncements, useWatchlist
│       ├── services/          # Firebase, watchlist, announcement APIs
│       └── utils/             # CSV parser, duplicate checker, formatters
└── backend/                   # Vercel serverless functions
    ├── api/
    │   ├── announcements/     # BSE + NSE endpoints
    │   ├── notify/            # Email trigger
    │   └── cron/              # Auto-check every 6h
    └── lib/                   # Scrapers, mailer, Firebase Admin
```

---

## Setup

### 1. Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) → Create project `stockwatch-app`
2. Enable **Authentication** → Email/Password + Google providers
3. Create **Firestore Database** (production mode)
4. Add **Firestore Security Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

5. Enable **Firebase Hosting**
6. Download **Service Account JSON** (Project Settings → Service Accounts)

### 2. Frontend Environment Variables

Copy `frontend/.env.example` to `frontend/.env` and fill in:

| Variable | Where to find it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web App |
| `VITE_FIREBASE_AUTH_DOMAIN` | Same |
| `VITE_FIREBASE_PROJECT_ID` | Same |
| `VITE_FIREBASE_STORAGE_BUCKET` | Same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Same |
| `VITE_FIREBASE_APP_ID` | Same |
| `VITE_BACKEND_URL` | Your Vercel deployment URL |

### 3. Backend Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `GMAIL_USER` | Gmail address used for sending alerts |
| `GMAIL_APP_PASSWORD` | 16-character App Password (not your Gmail password) — [generate here](https://myaccount.google.com/apppasswords) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Stringified JSON of the service account key downloaded from Firebase |

**Stringify the service account JSON:**
```bash
node -e "const fs = require('fs'); console.log(JSON.stringify(JSON.parse(fs.readFileSync('serviceAccount.json', 'utf8'))))"
```

### 4. Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `backend/`
3. Add the three backend environment variables above
4. Deploy, then copy the URL to `VITE_BACKEND_URL`

### 5. GitHub Actions Secrets

In your GitHub repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_BACKEND_URL` | Vercel deployment URL |
| `FIREBASE_SERVICE_ACCOUNT` | Entire Firebase service account JSON (for hosting deploy) |
| `VERCEL_TOKEN` | Vercel API token (vercel.com → Account → Tokens) |

---

## Local Development

```bash
# Frontend
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173

# Backend
cd backend
npm install
vercel dev
# API runs at http://localhost:3000
```

---

## How BSE/NSE APIs Are Used

### BSE
- **Endpoint:** `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w`
- **Free, no API key required**
- Must be called server-side (backend) due to CORS restrictions
- Returns JSON with corporate announcements

### NSE
- **Endpoint:** `https://www.nseindia.com/api/corp-announcements?index=equities`
- **Free, no API key required**
- Requires two-step fetch: first GET the homepage to receive cookies, then use those cookies to call the API
- Called server-side from Vercel functions

Both APIs are polled by the backend and results are cached in-memory for 5 minutes to avoid hammering the free endpoints.

---

## Limitations (Free Tier)

| Service | Free Limit | Usage |
|---|---|---|
| Firebase Firestore | 50k reads/day, 20k writes/day | Sufficient for personal use |
| Firebase Hosting | 10GB/month transfer | Sufficient for personal use |
| Vercel Functions | 100k invocations/month | Sufficient |
| Vercel Cron | 2 cron jobs | Used: 1 (every 6h) |
| Gmail SMTP | ~500 emails/day | Sufficient |

---

## Disclaimer

StockWatch is for informational purposes only. It is not financial advice. All data is sourced from BSE/NSE public APIs and may be delayed. Always verify with official BSE/NSE websites before making any financial decisions.

---

## License

MIT
