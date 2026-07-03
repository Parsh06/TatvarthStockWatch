"""
NSE Corporate Announcements Fetcher
Reads watchlist from Equity.csv, fetches today's NSE announcements,
filters to watchlist symbols, saves to nse_data.json
"""

import requests
import json
import csv
import os
import sys
from datetime import datetime, timezone, timedelta

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))            # test_data/
STOCKWATCH  = os.path.dirname(BASE_DIR)                             # stockwatch/
RESULTS_DIR = os.path.join(BASE_DIR, "results")                    # test_data/results/
EQUITY_CSV  = os.path.join(STOCKWATCH, "Equity.csv")               # stockwatch/Equity.csv
OUTPUT_JSON = os.path.join(RESULTS_DIR, "nse_data.json")           # test_data/results/nse_data.json

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── NSE endpoints ─────────────────────────────────────────────────────────────
NSE_HOME = "https://www.nseindia.com"
NSE_API  = "https://www.nseindia.com/api/corporate-announcements?index=equities"

# ── IST helper ────────────────────────────────────────────────────────────────
IST = timezone(timedelta(hours=5, minutes=30))

def now_ist():
    return datetime.now(IST)

# ── Load watchlist from Equity.csv ────────────────────────────────────────────
def load_watchlist():
    """Returns dict: {nse_symbol -> {bseCode, nseSymbol, scriptName}}"""
    watchlist = {}
    with open(EQUITY_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            bse_code   = (row.get("Security Code") or "").strip()
            nse_symbol = (row.get("Security Id")   or "").strip()
            name       = (row.get("Security Name") or "").strip()
            if nse_symbol:
                watchlist[nse_symbol.upper()] = {
                    "bseCode":    bse_code,
                    "nseSymbol":  nse_symbol,
                    "scriptName": name,
                }
    return watchlist

# ── Build a requests session with NSE cookies ─────────────────────────────────
def build_nse_session():
    import time

    session = requests.Session()
    session.headers.update({
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection":      "keep-alive",
    })

    # Step 1: hit homepage to get Akamai cookies
    print("  [1/3] Initialising NSE session (homepage)...")
    r = session.get(NSE_HOME, headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}, timeout=15)
    r.raise_for_status()
    print(f"        Status {r.status_code} — cookies: {list(session.cookies.keys())}")

    # Step 2: visit the corporate filings page (NSE checks Referer chain)
    FILINGS_PAGE = "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
    print("        Visiting filings page to warm up session...")
    time.sleep(1)
    r2 = session.get(FILINGS_PAGE, headers={
        "Accept":   "text/html,application/xhtml+xml,*/*;q=0.8",
        "Referer":  NSE_HOME,
    }, timeout=15)
    print(f"        Status {r2.status_code} — cookies now: {list(session.cookies.keys())}")

    return session

# ── Fetch NSE announcements (all equities, today) ─────────────────────────────
def fetch_nse_announcements(session):
    import time
    time.sleep(1)   # small delay after page visit before hitting API

    api_headers = {
        "Accept":             "*/*",
        "Accept-Encoding":    "gzip, deflate",
        "Accept-Language":    "en-US,en;q=0.9",
        "Referer":            "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
        "Sec-Fetch-Dest":     "empty",
        "Sec-Fetch-Mode":     "cors",
        "Sec-Fetch-Site":     "same-origin",
        "sec-ch-ua":          '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        "sec-ch-ua-mobile":   "?0",
        "sec-ch-ua-platform": '"Windows"',
        "X-Requested-With":   "XMLHttpRequest",
    }

    print("  [2/3] Fetching NSE announcements API...")
    r = session.get(NSE_API, headers=api_headers, timeout=20)

    encoding = r.headers.get("content-encoding", "")
    print(f"        HTTP {r.status_code} — {len(r.content)} bytes — encoding: {encoding or 'none'}")

    if r.status_code != 200:
        raise RuntimeError(f"NSE API returned HTTP {r.status_code}: {r.text[:300]}")

    if not r.content:
        raise RuntimeError("NSE API returned empty body — Akamai may have blocked the request. Try again.")

    # requests handles gzip/deflate automatically; brotli needs manual decode
    if encoding == "br":
        try:
            import brotli
            body = brotli.decompress(r.content).decode("utf-8")
        except ImportError:
            raise RuntimeError(
                "Brotli-encoded response received but brotli is not installed.\n"
                "Run:  pip install brotli\nthen retry."
            )
    else:
        body = r.text

    if not body.strip():
        raise RuntimeError("Response body is empty after decompression.")

    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON parse failed: {e}\nBody preview: {body[:200]}")

    print(f"        Got {len(data)} total announcements")
    return data

# ── Normalise a raw NSE item ───────────────────────────────────────────────────
def normalise(item, meta):
    symbol = (item.get("symbol") or "").strip().upper()
    return {
        "id":           f"nse-{item.get('seq_id', item.get('dt', ''))}",
        "exchange":     "NSE",
        "nseSymbol":    symbol,
        "bseCode":      meta.get("bseCode", ""),
        "scriptName":   meta.get("scriptName") or item.get("sm_name", ""),
        "category":     item.get("desc", ""),
        "subject":      item.get("attchmntText", ""),
        "pdfUrl":       item.get("attchmntFile", ""),
        "sourceUrl":    f"https://www.nseindia.com/companies-listing/corporate-filings-announcements",
        "announcementDate": item.get("sort_date", ""),
        "datetimeIST":  item.get("an_dt", ""),
        "isin":         item.get("sm_isin", ""),
        "industry":     item.get("smIndustry", ""),
        "seqId":        item.get("seq_id", ""),
        "critical":     False,
    }

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("\n=== NSE Corporate Announcements Fetcher ===\n")

    # 1. Load watchlist
    watchlist = load_watchlist()
    print(f"Watchlist: {len(watchlist)} NSE symbols loaded from Equity.csv")
    sample = list(watchlist.keys())[:5]
    print(f"  Sample symbols: {sample}\n")

    # 2. Build session + fetch
    try:
        session      = build_nse_session()
        raw_items    = fetch_nse_announcements(session)
    except Exception as e:
        print(f"\nERROR fetching NSE data: {e}")
        sys.exit(1)

    # 3. Filter to watchlist
    matched = []
    for item in raw_items:
        sym = (item.get("symbol") or "").strip().upper()
        if sym in watchlist:
            matched.append(normalise(item, watchlist[sym]))

    print(f"\n  [3/3] Filtered: {len(matched)} / {len(raw_items)} match your watchlist\n")

    # 4. Print results table
    if matched:
        print(f"{'Symbol':<15} {'Company':<40} {'Category':<35} {'Date/Time'}")
        print("-" * 110)
        for a in matched:
            sym  = a["nseSymbol"][:14]
            name = a["scriptName"][:39]
            cat  = a["category"][:34]
            dt   = a["datetimeIST"][:20]
            print(f"{sym:<15} {name:<40} {cat:<35} {dt}")
    else:
        print("  No matching announcements found for your watchlist symbols today.")
        print("  (NSE API returns only the most recent ~20 announcements; try again later)")

    # 5. Save to nse_data.json
    output = {
        "fetchedAt":   now_ist().isoformat(),
        "exchange":    "NSE",
        "totalFetched": len(raw_items),
        "totalMatched": len(matched),
        "announcements": matched,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(matched)} matched announcements -> {OUTPUT_JSON}")
    print(f"  (Full fetch: {len(raw_items)} announcements from NSE)")

if __name__ == "__main__":
    main()
