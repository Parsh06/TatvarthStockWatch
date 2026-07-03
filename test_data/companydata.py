"""
companydata.py
==============
Fetches company data from BSE APIs for all scripts in Equity.csv.

APIs used (all captured from bseindia.com DevTools):
  1. getScripHeaderData  — LTP, OHLC, prev close, company name
  2. TabResults_PAR      — tabtype=RESULTS  (latest quarterly financials)
  3. TabResults_PAR      — tabtype=NEWS     (recent announcements list)
  4. StockReachGraph     — intraday price+volume series (today's chart)

Output: companydata.json
  {
    "fetchedAt": "2026-06-17T13:23:43",
    "total": 1234,
    "success": 1200,
    "failed": 34,
    "scripts": {
      "500325": {
        "bseCode": "500325",
        "securityId": "RELIANCE",
        "name": "Reliance Industries Ltd",
        "quote": { "ltp", "prevClose", "open", "high", "low", "change", "pctChange", "52wHigh", "52wLow", "pe", "marketCap" },
        "financials": { "col1", "col2", "col3", "col4", "resultinCr": [...] },
        "recentNews": [ { "Newsid", "NewsSubj", "Newsdt" }, ... ],
        "intradayChart": { "currDate", "currVal", "prevClose", "data": [{dttm, vale1, vole}, ...] },
        "fetchedAt": "2026-06-17T13:23:43",
        "error": null
      }
    }
  }

Usage:
  pip install requests
  python companydata.py                        # fetch all scripts
  python companydata.py --limit 10             # fetch first 10 only (for testing)
  python companydata.py --code 500325          # fetch single script by BSE code
  python companydata.py --resume               # skip scripts already in companydata.json
  python companydata.py --workers 8            # use 8 concurrent threads
"""

import argparse
import csv
import json
import os
import re
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))          # test_data/
STOCKWATCH   = os.path.dirname(SCRIPT_DIR)                          # stockwatch/
RESULTS_DIR  = os.path.join(SCRIPT_DIR, "results")                 # test_data/results/
EQUITY_CSV   = os.path.join(STOCKWATCH, "Equity.csv")              # stockwatch/Equity.csv
OUTPUT_FILE  = os.path.join(RESULTS_DIR, "companydata.json")       # test_data/results/companydata.json

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── BSE API base ───────────────────────────────────────────────────────────────
BASE_URL = "https://api.bseindia.com/BseIndiaAPI/api"

# Exact headers captured from DevTools — required to pass Akamai bot check
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Referer": "https://www.bseindia.com/",
    "Sec-Ch-Ua": '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    ),
    "Origin": "https://www.bseindia.com",
}

# Shared session — reuses TCP connections and cookies across all requests
session = requests.Session()
session.headers.update(HEADERS)


def _init_session():
    """Visit BSE homepage to seed Akamai session cookies."""
    try:
        session.get("https://www.bseindia.com", timeout=15)
        print("[companydata] Session initialised (BSE homepage visited)")
    except Exception as e:
        print(f"[companydata] WARNING: could not seed session cookie: {e}")


# ── API fetchers ───────────────────────────────────────────────────────────────

def _parse_float(value):
    """Safely convert BSE string numbers like '1,332.55' to float."""
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def fetch_quote(bse_code):
    """
    GET /getScripHeaderData/w?scripcode=500325&Debtflag=&seriesid=
    Returns: LTP, change, pctChange, prevClose, open, high, low, 52w range, P/E, market cap.
    """
    url = f"{BASE_URL}/getScripHeaderData/w"
    params = {"Debtflag": "", "scripcode": bse_code, "seriesid": ""}
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    d = r.json()

    curr = d.get("CurrRate") or {}
    hdr  = d.get("Header")   or {}
    cmp  = d.get("Cmpname")  or {}

    return {
        "name":      cmp.get("FullN") or cmp.get("ShortN") or cmp.get("SeriesN"),
        "ltp":       _parse_float(curr.get("LTP")),
        "change":    _parse_float(curr.get("Chg")),
        "pctChange": _parse_float(curr.get("PcChg")),
        "prevClose": _parse_float(hdr.get("PrevClose")),
        "open":      _parse_float(hdr.get("Open")),
        "high":      _parse_float(hdr.get("High")),
        "low":       _parse_float(hdr.get("Low")),
        "52wHigh":   _parse_float(hdr.get("wkhigh")   or hdr.get("High52week")),
        "52wLow":    _parse_float(hdr.get("wklow")    or hdr.get("Low52week")),
        "pe":        _parse_float(hdr.get("PE")       or hdr.get("pe")),
        "marketCap": _parse_float(hdr.get("MktCap")   or hdr.get("marketcap")),
    }


def fetch_financials(bse_code):
    """
    GET /TabResults_PAR/w?scripcode=500325&tabtype=RESULTS
    Returns latest quarterly results: Revenue, Net Profit, EPS, OPM%, NPM%.
    BSE wraps the payload in a double-encoded JSON string — we unwrap it.
    """
    url = f"{BASE_URL}/TabResults_PAR/w"
    params = {"scripcode": bse_code, "tabtype": "RESULTS"}
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    raw = r.json()
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict):
        return None
    # Drop the URL-only resultinS and the duplicate millions table
    raw.pop("resultinS", None)
    raw.pop("resultinM", None)
    return raw


def fetch_news(bse_code):
    """
    GET /TabResults_PAR/w?scripcode=500325&tabtype=NEWS
    Returns up to 10 most recent announcements: Newsid, NewsSubj, Newsdt.
    """
    url = f"{BASE_URL}/TabResults_PAR/w"
    params = {"scripcode": bse_code, "tabtype": "NEWS"}
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    raw = r.json()
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, list):
        return []
    return raw[:10]


def fetch_intraday(bse_code):
    """
    GET /StockReachGraph/w?scripcode=500325&flag=0&fromdate=&todate=&seriesid=
    Returns minute-level intraday price + volume for today's session.
    The 'Data' field is a JSON string — we parse it into a proper array.
    """
    url = f"{BASE_URL}/StockReachGraph/w"
    params = {
        "scripcode": bse_code,
        "flag": "0",
        "fromdate": "",
        "todate": "",
        "seriesid": "",
    }
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    d = r.json()

    # Parse the inner Data string into a proper list
    data_raw = d.get("Data", "[]")
    if isinstance(data_raw, str):
        try:
            data_raw = json.loads(data_raw)
        except Exception:
            data_raw = []

    return {
        "currDate":  d.get("CurrDate"),
        "currTime":  d.get("CurrTime"),
        "currVal":   d.get("CurrVal"),
        "prevClose": d.get("PrevClose"),
        "highVal":   d.get("HighVal"),
        "lowVal":    d.get("LowVal"),
        "highVol":   d.get("HighVol"),
        "lowVol":    d.get("LowVol"),
        "data":      data_raw,
    }


def fetch_bulk_deals(bse_code):
    """
    GET /TabResults_PAR/w?scripcode=500325&tabtype=BULK
    Returns recent bulk/block deals for the script.
    BSE returns "[]" (empty JSON array) when there are no deals.
    Shape when populated: [{ DealDate, Type, Qty, Rate, "T/O (Cr.)" }, ...]
    """
    url = f"{BASE_URL}/TabResults_PAR/w"
    params = {"scripcode": bse_code, "tabtype": "BULK"}
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    raw = r.json()
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return []
    if not isinstance(raw, list):
        return []
    return raw


def fetch_shareholding(bse_code):
    """
    GET /TabResults_PAR/w?scripcode=500325&tabtype=SHP
    BSE returns an HTML <table> string — not JSON data.
    We parse it into a structured dict:
      {
        "quarters": ["Mar-26", "Dec-25", "Sep-25"],
        "rows": [
          { "category": "Promoter", "values": ["--", "--", "50.01"] },
          { "category": "Public",   "values": ["--", "--", "49.99"] },
          ...
        ]
      }
    """
    url = f"{BASE_URL}/TabResults_PAR/w"
    params = {"scripcode": bse_code, "tabtype": "SHP"}
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    raw = r.json()

    # BSE returns a double-encoded HTML string
    html = raw if isinstance(raw, str) else json.dumps(raw)
    if html.startswith('"') and html.endswith('"'):
        try:
            html = json.loads(html)
        except Exception:
            pass

    # Extract column headers (quarters) from <thead>
    quarters = re.findall(r'<th><strong>([^<]+)</strong></th>', html)
    # First header is "(in %)" label — skip it
    quarters = [q for q in quarters if q != "(in %)"]

    # Extract data rows from <tbody> <td> cells
    # Each row: first cell = category label, remaining = values per quarter
    rows = []
    for tr in re.findall(r'<tr>(.*?)</tr>', html, re.DOTALL):
        cells = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL)
        if not cells:
            continue
        # Strip HTML tags from each cell
        cleaned = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        # Skip rows that are purely links or have colspan (like "Promoters Pledge...")
        if len(cleaned) < 2:
            continue
        # Skip the "Promoters Pledge Holding" colspan row (merged cell, no useful split)
        if "Pledge" in cleaned[0] or "colspan" in cells[0]:
            continue
        label = cleaned[0]
        values = cleaned[1:]
        if label:
            rows.append({"category": label, "values": values})

    return {
        "quarters": quarters,
        "rows":     rows,
        "unit":     "% holding",
    }


def fetch_price_performance(bse_code):
    """
    GET /PriceGainLoss_New/w?scripcode=500325
    Returns price % change for the stock vs Sensex vs sector indices
    over durations: 1W, 2W, 1M, 3M, YTD, 6M, 1Y, 2Y, 3Y, 5Y, 10Y.
    Shape:
      {
        "indices": ["BSE Energy", "BSE OIL & GAS"],   # sector indices the stock belongs to
        "data": [
          {
            "duration": "1 Week",
            "stockChgPct":  5.80,
            "sensexChgPct": 4.29,
            "indexChgPct":  4.10,    # primary sector index
            "indexCode":    "BANKEX"
          },
          ...
        ]
      }
    """
    url = f"{BASE_URL}/PriceGainLoss_New/w"
    params = {"scripcode": bse_code}
    r = session.get(url, params=params, timeout=12)
    r.raise_for_status()
    d = r.json()

    # Extract sector index names from Headers array
    header_row = (d.get("Headers") or [{}])[0]
    indices = [
        v for k, v in header_row.items()
        if k.startswith("Index_name_") and v
    ]

    rows = []
    for item in (d.get("Data") or []):
        rows.append({
            "duration":      item.get("Duration"),
            "stockChgAbs":   _parse_float(item.get("AbsoluteChg")),
            "stockChgPct":   _parse_float(item.get("change_percent")),
            "sensexChgAbs":  _parse_float(item.get("SensexChg")),
            "sensexChgPct":  _parse_float(item.get("SensexPerc")),
            "indexChgAbs":   _parse_float(item.get("IndexChange")),
            "indexChgPct":   _parse_float(item.get("IndexPerc")),
            "indexCode":     item.get("IndexCode"),
        })

    return {
        "indices": indices,
        "data":    rows,
    }


# ── Per-script orchestrator ────────────────────────────────────────────────────

def fetch_all_for_script(bse_code, security_id, security_name):
    """Fetch all 7 data types for one script. Errors are captured per-field."""
    result = {
        "bseCode":          bse_code,
        "securityId":       security_id,
        "name":             security_name,
        "quote":            None,   # LTP, OHLC, P/E, market cap
        "financials":       None,   # quarterly Revenue / Net Profit / EPS / OPM% / NPM%
        "recentNews":       [],     # last 10 announcements
        "intradayChart":    None,   # minute-level price+volume for today
        "bulkDeals":        [],     # recent bulk/block deals (empty list = no deals)
        "shareholding":     None,   # promoter / public % for last 3 quarters
        "pricePerformance": None,   # stock vs Sensex vs sector index over multiple horizons
        "fetchedAt":        datetime.now().isoformat(timespec="seconds"),
        "errors":           {},
    }

    # 1. Quote (LTP, OHLC, P/E, market cap)
    try:
        q = fetch_quote(bse_code)
        if q.get("name"):
            result["name"] = q.pop("name")
        else:
            q.pop("name", None)
        result["quote"] = q
    except Exception as e:
        result["errors"]["quote"] = str(e)

    # 2. Financial results (quarterly)
    try:
        result["financials"] = fetch_financials(bse_code)
    except Exception as e:
        result["errors"]["financials"] = str(e)

    # 3. Recent news / announcements
    try:
        result["recentNews"] = fetch_news(bse_code)
    except Exception as e:
        result["errors"]["recentNews"] = str(e)

    # 4. Intraday chart (minute candles)
    try:
        result["intradayChart"] = fetch_intraday(bse_code)
    except Exception as e:
        result["errors"]["intradayChart"] = str(e)

    # 5. Bulk / block deals
    try:
        result["bulkDeals"] = fetch_bulk_deals(bse_code)
    except Exception as e:
        result["errors"]["bulkDeals"] = str(e)

    # 6. Shareholding pattern (parsed from HTML table)
    try:
        result["shareholding"] = fetch_shareholding(bse_code)
    except Exception as e:
        result["errors"]["shareholding"] = str(e)

    # 7. Price performance vs Sensex & sector indices
    try:
        result["pricePerformance"] = fetch_price_performance(bse_code)
    except Exception as e:
        result["errors"]["pricePerformance"] = str(e)

    # Collapse empty errors dict to None for cleaner JSON
    if not result["errors"]:
        result["errors"] = None

    return result


# ── CSV loader ────────────────────────────────────────────────────────────────

def load_equity_csv():
    scripts = []
    with open(EQUITY_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = str(row.get("Security Code", "")).strip()
            sid  = str(row.get("Security Id",   "")).strip()
            name = str(row.get("Security Name", "")).strip()
            if code and code.isdigit():
                scripts.append({"bseCode": code, "securityId": sid, "name": name})
    return scripts


# ── Output helpers ────────────────────────────────────────────────────────────

def load_existing():
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"fetchedAt": None, "total": 0, "success": 0, "failed": 0, "scripts": {}}


def save_output(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch BSE company data for all scripts in Equity.csv")
    parser.add_argument("--limit",   type=int, default=None, help="Fetch first N scripts only")
    parser.add_argument("--code",    type=str, default=None, help="Fetch a single BSE code")
    parser.add_argument("--resume",  action="store_true",    help="Skip scripts already in companydata.json")
    parser.add_argument("--workers", type=int, default=5,    help="Concurrent threads (default 5, max 8)")
    args = parser.parse_args()

    workers = min(args.workers, 8)

    print(f"[companydata] Loading {EQUITY_CSV} ...")
    all_scripts = load_equity_csv()
    print(f"[companydata] {len(all_scripts)} scripts found in CSV")

    # Single-code mode
    if args.code:
        all_scripts = [s for s in all_scripts if s["bseCode"] == args.code]
        if not all_scripts:
            print(f"[companydata] ERROR: BSE code '{args.code}' not found in Equity.csv")
            sys.exit(1)

    # Limit
    if args.limit:
        all_scripts = all_scripts[:args.limit]

    # Load existing for resume / merge
    output = load_existing()
    if not isinstance(output.get("scripts"), dict):
        output["scripts"] = {}

    # Skip already-fetched in resume mode
    if args.resume:
        before = len(all_scripts)
        all_scripts = [s for s in all_scripts if s["bseCode"] not in output["scripts"]]
        print(f"[companydata] Resume: {before - len(all_scripts)} already fetched, {len(all_scripts)} remaining")

    total = len(all_scripts)
    if total == 0:
        print("[companydata] Nothing to fetch.")
        return

    print(f"[companydata] Fetching {total} scripts with {workers} threads ...\n")
    _init_session()

    success_count = 0
    failed_count  = 0
    done_count    = 0
    start_time    = time.time()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(fetch_all_for_script, s["bseCode"], s["securityId"], s["name"]): s
            for s in all_scripts
        }

        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as exc:
                s = futures[future]
                result = {
                    "bseCode": s["bseCode"], "securityId": s["securityId"],
                    "name": s["name"], "quote": None, "financials": None,
                    "recentNews": [], "intradayChart": None,
                    "fetchedAt": datetime.now().isoformat(timespec="seconds"),
                    "errors": {"fatal": str(exc)},
                }

            bse_code    = result["bseCode"]
            done_count += 1

            has_quote = result.get("quote") is not None
            if has_quote:
                success_count += 1
            else:
                failed_count += 1

            output["scripts"][bse_code] = result

            # Progress
            elapsed = time.time() - start_time
            rate    = done_count / elapsed if elapsed > 0 else 0
            eta_s   = (total - done_count) / rate if rate > 0 else 0
            status  = "OK " if has_quote else "ERR"
            print(
                f"  [{status}] {done_count:>5}/{total:<5}  "
                f"{bse_code:>6}  "
                f"{result['name'][:38]:<38}  "
                f"ETA {eta_s/60:.1f}min",
                flush=True,
            )

            # Checkpoint every 200 scripts
            if done_count % 200 == 0:
                output["fetchedAt"] = datetime.now().isoformat(timespec="seconds")
                output["total"]     = total
                output["success"]   = success_count
                output["failed"]    = failed_count
                save_output(output)
                print(f"\n  [checkpoint] Saved {done_count}/{total} → {OUTPUT_FILE}\n")

    # Final save
    output["fetchedAt"] = datetime.now().isoformat(timespec="seconds")
    output["total"]     = total
    output["success"]   = success_count
    output["failed"]    = failed_count
    save_output(output)

    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"[companydata] Completed in {elapsed:.1f}s  ({elapsed/60:.1f}min)")
    print(f"  Success : {success_count}")
    print(f"  Failed  : {failed_count}")
    print(f"  Output  : {OUTPUT_FILE}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
