"""
BSE Live Rates Fetcher
Reads all scripts from Equity.csv, fetches current market price for each
via BSE API, stores results in rates.json

Usage:  python test_rates.py
        python test_rates.py --limit 100     # test with first 100 scripts
        python test_rates.py --workers 40    # tune concurrency (default: 30)
"""

import requests
import json
import csv
import os
import sys
import time
import argparse
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))            # test_data/
STOCKWATCH  = os.path.dirname(BASE_DIR)                             # stockwatch/
RESULTS_DIR = os.path.join(BASE_DIR, "results")                    # test_data/results/
EQUITY_CSV  = os.path.join(STOCKWATCH, "Equity.csv")               # stockwatch/Equity.csv
OUTPUT_JSON = os.path.join(RESULTS_DIR, "rates.json")              # test_data/results/rates.json

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── BSE endpoints ──────────────────────────────────────────────────────────────
BSE_HOME       = "https://www.bseindia.com"
BSE_PRICE_URL  = "https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w"
# Note: BSE's volume/52w endpoints require a browser-level Akamai session (JS challenge).
# They return HTML when called via requests. Only getScripHeaderData works without cookies.

IST = timezone(timedelta(hours=5, minutes=30))

def now_ist():
    return datetime.now(IST).isoformat()

# ── Load scripts from Equity.csv ──────────────────────────────────────────────
def load_scripts(limit=None):
    scripts = []
    with open(EQUITY_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code   = (row.get("Security Code") or "").strip()
            symbol = (row.get("Security Id")   or "").strip()
            name   = (row.get("Security Name") or "").strip()
            if code:
                scripts.append({"bseCode": code, "symbol": symbol, "name": name})
    if limit:
        scripts = scripts[:limit]
    return scripts

# ── Build BSE session (Akamai cookie handshake) ───────────────────────────────
def build_bse_session():
    session = requests.Session()
    session.headers.update({
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection":      "keep-alive",
    })

    print("  Initialising BSE session (homepage)...")
    try:
        r = session.get(BSE_HOME, headers={
            "Accept":           "text/html,application/xhtml+xml,*/*;q=0.8",
            "Sec-Fetch-Dest":   "document",
            "Sec-Fetch-Mode":   "navigate",
            "Sec-Fetch-Site":   "none",
        }, timeout=15, allow_redirects=True)
        cookies = list(session.cookies.keys())
        print(f"  Session ready — HTTP {r.status_code} — {len(cookies)} cookie(s): {cookies}")
    except Exception as e:
        print(f"  Session init warning: {e} — proceeding without cookies")

    return session

# ── Fetch price for a single script ───────────────────────────────────────────
_debug_printed = False   # print raw keys only once

def fetch_price(session, script, retries=2, debug=False):
    global _debug_printed
    code = script["bseCode"]
    api_headers = {
        "Accept":           "*/*",
        "Accept-Encoding":  "gzip, deflate",
        "Referer":          f"https://www.bseindia.com/stock-share-price/{code}",
        "Sec-Fetch-Dest":   "empty",
        "Sec-Fetch-Mode":   "cors",
        "Sec-Fetch-Site":   "same-site",
        "Origin":           BSE_HOME,
    }

    for attempt in range(retries + 1):
        try:
            # ── Call 1: header data (LTP / OHLC) ──────────────────────────────
            r = session.get(BSE_PRICE_URL, params={"Debtflag": "", "scripcode": code, "seriesid": ""},
                            headers=api_headers, timeout=10)
            if r.status_code != 200:
                if attempt < retries:
                    time.sleep(0.5)
                    continue
                return {"bseCode": code, "symbol": script["symbol"], "name": script["name"], "error": f"HTTP {r.status_code}"}

            data = r.json()
            h = (data.get("Header") or (data.get("ScripHeaderData") or [{}])[0] or {})

            if (debug or not _debug_printed) and h:
                _debug_printed = True
                print(f"\n  [DEBUG-1] getScripHeaderData keys for {code}: {list(h.keys())}")
                print(f"  [DEBUG-1] values: { {k: v for k, v in list(h.items())[:20]} }\n")

            ltp        = _num(h.get("LTP") or h.get("CurrRate") or h.get("Ltp") or "")
            prev_close = _num(h.get("PrevClose") or h.get("Prevclose") or h.get("PrevCls") or "")
            high       = _num(h.get("High")  or h.get("DayHigh")  or h.get("HIGH")  or "")
            low        = _num(h.get("Low")   or h.get("DayLow")   or h.get("LOW")   or "")
            open_p     = _num(h.get("Open")  or h.get("DayOpen")  or h.get("OPEN")  or "")

            change_raw = _num(h.get("Change") or h.get("Chg") or h.get("NetChg") or h.get("CHANGE") or "")
            pct_raw    = _num(h.get("PerChange") or h.get("Perchng") or h.get("PerChng") or h.get("PCHANGE") or h.get("PChange") or "")
            if change_raw is None and ltp is not None and prev_close is not None and prev_close != 0:
                change_raw = round(ltp - prev_close, 2)
            if pct_raw is None and ltp is not None and prev_close is not None and prev_close != 0:
                pct_raw = round(((ltp - prev_close) / prev_close) * 100, 2)

            # volume and 52w are not available from BSE's public API (other endpoints require
            # a browser-level Akamai JS session which requests cannot obtain)
            volume   = None
            week52_h = None
            week52_l = None

            return {
                "bseCode":     code,
                "symbol":      script["symbol"],
                "name":        script["name"],
                "ltp":         ltp,
                "prevClose":   prev_close,
                "change":      change_raw,
                "pctChange":   pct_raw,
                "open":        open_p,
                "high":        high,
                "low":         low,
                "volume":      volume,
                "week52High":  week52_h,
                "week52Low":   week52_l,
                "updatedAt":   now_ist(),
                "error":       None,
            }

        except requests.exceptions.Timeout:
            if attempt < retries:
                time.sleep(0.3)
                continue
            return {"bseCode": code, "symbol": script["symbol"], "name": script["name"], "error": "timeout"}
        except Exception as e:
            if attempt < retries:
                time.sleep(0.3)
                continue
            return {"bseCode": code, "symbol": script["symbol"], "name": script["name"], "error": str(e)[:80]}

def _num(val):
    """Convert string to float, return None on failure."""
    try:
        v = str(val).replace(",", "").strip()
        return float(v) if v and v not in ("-", "N/A", "--") else None
    except (ValueError, TypeError):
        return None

def _int(val):
    try:
        v = str(val).replace(",", "").strip()
        return int(float(v)) if v and v not in ("-", "N/A", "--") else None
    except (ValueError, TypeError):
        return None

# ── Progress printer ───────────────────────────────────────────────────────────
class Progress:
    def __init__(self, total):
        self.total    = total
        self.done     = 0
        self.success  = 0
        self.failed   = 0
        self.lock     = Lock()
        self.start    = time.time()

    def update(self, ok):
        with self.lock:
            self.done += 1
            if ok: self.success += 1
            else:  self.failed  += 1
            elapsed = time.time() - self.start
            rate    = self.done / elapsed if elapsed > 0 else 0
            eta     = (self.total - self.done) / rate if rate > 0 else 0
            pct     = (self.done / self.total) * 100
            bar_len = 30
            filled  = int(bar_len * self.done / self.total)
            bar     = "#" * filled + "-" * (bar_len - filled)
            print(
                f"\r  [{bar}] {pct:5.1f}%  {self.done}/{self.total}"
                f"  ok={self.success} err={self.failed}"
                f"  {rate:.1f}/s  ETA {eta:.0f}s   ",
                end="", flush=True
            )

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="BSE Live Rates Fetcher")
    parser.add_argument("--limit",   type=int,            default=None,  help="Max scripts to fetch (for testing)")
    parser.add_argument("--workers", type=int,            default=30,    help="Concurrent workers (default: 30)")
    parser.add_argument("--debug",   action="store_true", default=False, help="Print raw API response keys for first script")
    args = parser.parse_args()

    print("\n========================================")
    print("  BSE Live Rates Fetcher")
    print("========================================\n")

    # 1. Load scripts
    scripts = load_scripts(limit=args.limit)
    print(f"  Loaded {len(scripts)} scripts from Equity.csv")
    if args.limit:
        print(f"  (limited to first {args.limit})")
    print(f"  Workers: {args.workers}\n")

    # 2. Build session
    session = build_bse_session()
    print()

    # 3. Fetch prices concurrently
    print(f"  Fetching prices...\n")
    prog    = Progress(len(scripts))
    results = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(fetch_price, session, s, debug=args.debug): s for s in scripts}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            prog.update(result.get("error") is None)

    print("\n")  # newline after progress bar

    # 4. Sort by BSE code
    results.sort(key=lambda r: r["bseCode"])

    # 5. Summary
    ok      = [r for r in results if r.get("error") is None]
    failed  = [r for r in results if r.get("error") is not None]
    elapsed = time.time() - prog.start

    print(f"  Done in {elapsed:.1f}s")
    print(f"  Success : {len(ok)}")
    print(f"  Failed  : {len(failed)}")

    if failed[:5]:
        print(f"\n  First errors:")
        for r in failed[:5]:
            print(f"    {r['bseCode']} ({r['symbol']}) — {r['error']}")

    # Sample of successful results
    sample = [r for r in ok if r.get("ltp")][:5]
    if sample:
        print(f"\n  Sample prices:")
        print(f"  {'Code':<8} {'Symbol':<15} {'Name':<35} {'LTP':>10} {'Chg%':>8}")
        print(f"  {'-'*80}")
        for r in sample:
            chg = f"{r['pctChange']:+.2f}%" if r.get('pctChange') is not None else "  N/A"
            ltp = f"{r['ltp']:.2f}" if r.get('ltp') is not None else "N/A"
            print(f"  {r['bseCode']:<8} {r['symbol']:<15} {r['name'][:34]:<35} {ltp:>10} {chg:>8}")

    # 6. Save to rates.json
    output = {
        "fetchedAt":    now_ist(),
        "totalScripts": len(scripts),
        "totalSuccess": len(ok),
        "totalFailed":  len(failed),
        "elapsedSec":   round(elapsed, 2),
        "rates":        results,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n  Saved {len(results)} rates -> {OUTPUT_JSON}")
    print("========================================\n")

if __name__ == "__main__":
    main()
