# StockWatch

A high-performance full-stack web application designed for comprehensive tracking of the Indian Stock Market (BSE & NSE). Easily track corporate announcements, volume spurts, block deals, insider trading, and track IPO allotment status across your entire family portfolio. Receive multi-channel alerts enhanced with AI-generated summaries and on-demand AI analysis.

---

## 🌟 Key Features

- **IPO Allotment Tracker & GMP** — Bulk verify IPO allotment status for up to 10 family members simultaneously using PAN or Application Number. Track Grey Market Premium (GMP) and active IPO symbols. Integrates directly with KFintech AWS gateways. Applicant data is securely AES-256 encrypted before being stored.
- **BSE/NSE Announcements & AI Analysis** — Browse, filter, and export corporate announcements from both exchanges in real-time. Includes an on-demand AI analysis endpoint (`/api/announcements/:id/analyze`) for deep insights using Google Gemini AI.
- **Insider Trading Tracker** — Monitor and download insider trading activities and regulatory filings to stay ahead of market movements.
- **Top Gainers & Losers** — Daily tracking and downloading capabilities for top gainers and losers across BSE and NSE.
- **Volume Spurts & Block Deals** — Track abnormal trading spikes and massive institutional trades (Bulk & Block deals) across both exchanges.
- **Personal Watchlist** — Add, remove, search, and filter specific scripts to monitor.
- **Bulk Import** — Upload CSV or Excel files with intelligent cross-file and intra-file duplicate detection to populate your watchlist.
- **Multi-Channel Alerts** — Receive instantaneous alerts for your watchlisted stocks via Web Push Notifications, Telegram, Email, and In-App Notifications.
- **Advanced Market Tracking**:
  - Upcoming Board Meetings & AGM Updates
  - Intraday charts, historical data tables, and company quotes
  - Market indices and economic calendars
- **Premium Glassmorphism UI** — Responsive, sleek, and animated interfaces built with Tailwind CSS and Framer Motion. Supports Dark and Light themes.

---

## 🛠️ Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 18, Vite, Tailwind CSS, Framer Motion |
| Backend    | Node.js, Express, Vercel Serverless Functions |
| Primary DB | MongoDB Atlas (High Volume Data & Caching) |
| Relational DB | Firebase Firestore (User Prefs, Watchlists, Logs) |
| Auth       | Firebase Authentication (Email/Password, Google) |
| AI / LLM   | Google Gemini AI (`@google/genai`)       |
| Messaging  | Web Push (VAPID), Telegram Bot API, Nodemailer |
| Hosting    | Firebase Hosting (frontend), Vercel (backend) |

---

## 🚀 Setup & Local Development

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com) → Create project `stockwatch-app`
2. Enable **Authentication** (Email/Password + Google).
3. Create **Firestore Database**.
4. Set Firestore Rules to protect user documents.

### 2. Environment Variables
You will need to configure environment variables for both the frontend and backend.

**Frontend (`frontend/.env`)**:
Firebase Web App config keys (API Key, Auth Domain, Project ID, etc.) and `VITE_BACKEND_URL`.

**Backend (`backend/.env`)**:
Firebase Admin credentials, MongoDB URI, VAPID Keys (for Web Push), Telegram Bot Token, Google AI API Key, and Upstash Redis credentials.

### 3. Running Locally

```bash
# Frontend
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173

# Backend
cd backend
npm install
npm run dev
# API runs at http://localhost:3000
```

---

## 🏗️ Architecture & APIs

- **BSE / NSE Proxies**: The backend serves as a proxy to public BSE and NSE APIs to bypass browser CORS restrictions and implement rate-limiting and in-memory caching.
- **Rich Endpoint Ecosystem**: Specialized routes for `bse`, `nse`, `ipo`, `market`, and `dashboard` analytics providing everything from intraday charts to insider trading data.
- **KFintech Integration**: Live IPO allotment verification is routed through AWS API gateways.
- **Cron Jobs**: Vercel cron triggers periodically to scrape the latest announcements, pass them through user-defined blocked-category filters, generate AI summaries for passing announcements, and dispatch notifications via Web Push and Telegram. Duplicate alerts are prevented using ephemeral locking mechanisms.

---

## 📜 Disclaimer

StockWatch is for informational purposes only. It is not financial advice. All data is sourced from BSE/NSE public APIs, third-party registrars, and AI generation, which may be delayed or inaccurate. Always verify with official sources before making financial decisions.

---

## License

MIT
