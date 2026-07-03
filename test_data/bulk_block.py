"""
BSE Bulk & Block Deals Fetcher
Fetches bulk deals (DealType=1) and block deals (DealType=2) for a chosen
date range.  Filters to your Equity.csv watchlist unless --all is passed.

Usage (interactive):
    python bulk_block.py

Usage (CLI):
    python bulk_block.py --from 20260617
    python bulk_block.py --from 20260610 --to 20260617
    python bulk_block.py --from 20260617 --all
    python bulk_block.py --from 20260617 --type bulk     # bulk only
    python bulk_block.py --from 20260617 --type block    # block only
    python bulk_block.py --from 20260617 --code 500325   # single BSE code
"""

import requests
import json
import csv
import os
import sys
import argparse
from datetime import datetime, date, timedelta, timezone
from collections import defaultdict

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))    # test_data/
STOCKWATCH  = os.path.dirname(SCRIPT_DIR)                   # stockwatch/
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")          # test_data/results/
EQUITY_CSV  = os.path.join(STOCKWATCH, "Equity.csv")       # stockwatch/Equity.csv
OUTPUT_JSON = os.path.join(RESULTS_DIR, "bulk_block.json") # test_data/results/bulk_block.json

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── BSE endpoints ─────────────────────────────────────────────────────────────
BSE_HOME     = "https://www.bseindia.com"
BSE_DEAL_URL = "https://api.bseindia.com/BseIndiaAPI/api/BulkDealData_ng/w"

IST = timezone(timedelta(hours=5, minutes=30))

def now_ist():
    return datetime.now(IST).isoformat()

def today_ist():
    return datetime.now(IST).strftime("%Y%m%d")

# ── Headers ───────────────────────────────────────────────────────────────────
BSE_HOMEPAGE_HEADERS = {
    "User-Agent":                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language":           "en-US,en;q=0.9",
    "Accept-Encoding":           "gzip, deflate",
    "Connection":                "keep-alive",
    "Sec-Fetch-Dest":            "document",
    "Sec-Fetch-Mode":            "navigate",
    "Sec-Fetch-Site":            "none",
    "Upgrade-Insecure-Requests": "1",
}

BSE_API_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Referer":         "https://www.bseindia.com/",
    "Origin":          "https://www.bseindia.com",
    "Sec-Fetch-Dest":  "empty",
    "Sec-Fetch-Mode":  "cors",
    "Sec-Fetch-Site":  "same-site",
    "Connection":      "keep-alive",
}

DEAL_TYPE_LABELS = {1: "Bulk", 2: "Block"}

# ── Session ───────────────────────────────────────────────────────────────────
def build_session():
    session = requests.Session()
    print("[BSE] Initialising session (visiting homepage for Akamai cookies) ...")
    try:
        r = session.get(BSE_HOME, headers=BSE_HOMEPAGE_HEADERS, timeout=15, allow_redirects=True)
        cookies = list(session.cookies.keys())
        print(f"[BSE] Homepage status: {r.status_code}  |  Cookies: {', '.join(cookies) if cookies else 'none'}")
    except Exception as e:
        print(f"[BSE] Homepage warning: {e} — proceeding without cookies")
    return session

# ── Load watchlist ────────────────────────────────────────────────────────────
def load_watchlist():
    watchlist = {}
    if not os.path.exists(EQUITY_CSV):
        print(f"[CSV] WARNING: {EQUITY_CSV} not found")
        return watchlist
    with open(EQUITY_CSV, newline="", encoding="utf-8-sig") as f:
        sample = f.read(2048); f.seek(0)
        delim  = "\t" if sample.count("\t") > sample.count(",") else ","
        for row in csv.DictReader(f, delimiter=delim):
            code   = (row.get("Security Code") or "").strip()
            symbol = (row.get("Security Id")   or "").strip()
            name   = (row.get("Security Name") or "").strip()
            if code:
                watchlist[code] = {"bseCode": code, "nseSymbol": symbol, "scriptName": name}
    print(f"[CSV] Loaded {len(watchlist)} scripts from Equity.csv")
    return watchlist

# ── Date helpers ──────────────────────────────────────────────────────────────
def parse_yyyymmdd(s):
    return datetime.strptime(s, "%Y%m%d").date()

def to_bse_date(d):
    return d.strftime("%d/%m/%Y")

def trading_days(from_d, to_d):
    days = []
    cur = from_d
    while cur <= to_d:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days

# ── Fetch one day / one type ──────────────────────────────────────────────────
def fetch_deals_one_day(session, deal_date, deal_type):
    params = {
        "DealType": deal_type,
        "sc_code":  "",
        "FDate":    to_bse_date(deal_date),
        "TDate":    to_bse_date(deal_date),
    }
    try:
        r = session.get(BSE_DEAL_URL, params=params, headers=BSE_API_HEADERS, timeout=15)
        if r.status_code != 200:
            print(f"  [{DEAL_TYPE_LABELS[deal_type]}] {deal_date}  HTTP {r.status_code}")
            return []
        data  = r.json()
        items = data.get("Table") or []
        return items
    except Exception as e:
        print(f"  [{DEAL_TYPE_LABELS[deal_type]}] {deal_date}  Error: {e}")
        return []

# ── Normalise ─────────────────────────────────────────────────────────────────
def normalise(item, deal_type, watchlist):
    code      = str(item.get("SCRIP_CODE") or "").strip()
    scripname = (item.get("scripname") or "").strip()
    tx_raw    = (item.get("TRANSACTION_TYPE") or "").strip().upper()
    qty       = item.get("QUANTITY")
    price     = item.get("PRICE")
    deal_date = (item.get("DEAL_DATE") or "")[:10]   # "2026-06-17T00:00:00" → "2026-06-17"

    wl_entry   = watchlist.get(code, {})
    name       = wl_entry.get("scriptName") or scripname
    nse_symbol = wl_entry.get("nseSymbol")  or scripname

    qty_int   = int(qty)   if qty   is not None else None
    price_flt = float(price) if price is not None else None
    value     = round(qty_int * price_flt, 2) if qty_int and price_flt else None

    return {
        "dealType":        DEAL_TYPE_LABELS.get(deal_type, str(deal_type)),
        "dealDate":        deal_date,
        "bseCode":         code,
        "scripname":       scripname,
        "scriptName":      name,
        "nseSymbol":       nse_symbol,
        "inWatchlist":     code in watchlist,
        "clientName":      (item.get("CLIENT_NAME") or "").strip(),
        "transactionType": "Buy"  if tx_raw == "P" else "Sell" if tx_raw == "S" else tx_raw,
        "transactionCode": tx_raw,
        "quantity":        qty_int,
        "price":           price_flt,
        "valueLakh":       round(value / 1e5, 2) if value else None,
        "valueCr":         round(value / 1e7, 2) if value else None,
        "sourceUrl":       "https://www.bseindia.com/markets/equity/EQReports/bulk-block-deals.html",
    }

# ── Main fetch ────────────────────────────────────────────────────────────────
def fetch_all(from_date_str, to_date_str, deal_types, watchlist,
              fetch_all_companies=False, filter_code=None):
    from_d = parse_yyyymmdd(from_date_str)
    to_d   = parse_yyyymmdd(to_date_str)
    days   = trading_days(from_d, to_d)

    if not days:
        print("[BSE] No trading days in selected range.")
        return [], []

    single = from_d == to_d
    if single:
        print(f"\n[BSE] Fetching deals for {from_date_str} ...")
    else:
        print(f"\n[BSE] Fetching deals for {len(days)} trading day(s): "
              f"{days[0].strftime('%Y%m%d')} → {days[-1].strftime('%Y%m%d')} ...")

    session  = build_session()
    all_raw  = []   # list of (item_dict, deal_type_int)

    for day in days:
        day_counts = []
        for dt in deal_types:
            items = fetch_deals_one_day(session, day, dt)
            all_raw.extend([(item, dt) for item in items])
            day_counts.append(f"{DEAL_TYPE_LABELS[dt]}: {len(items)}")
        print(f"  {day.strftime('%Y%m%d')}  {' | '.join(day_counts)}")

    print(f"\n[BSE] Total raw deals fetched: {len(all_raw)}")

    normalised = [normalise(item, dt, watchlist) for item, dt in all_raw]

    # apply filters
    if filter_code:
        normalised = [r for r in normalised if r["bseCode"] == filter_code]
    elif not fetch_all_companies:
        normalised = [r for r in normalised if r["inWatchlist"]]

    return all_raw, normalised

# ── Print results ─────────────────────────────────────────────────────────────
def print_results(normalised):
    if not normalised:
        print("\n  No deals matched your filters.")
        return

    by_date = defaultdict(list)
    for r in normalised:
        by_date[r["dealDate"]].append(r)

    for dt in sorted(by_date.keys(), reverse=True):
        items = by_date[dt]
        try:
            label = datetime.strptime(dt, "%Y-%m-%d").strftime("%d %b %Y")
        except Exception:
            label = dt
        print(f"\n  ── {label}  ({len(items)} deal{'s' if len(items) != 1 else ''}) ──\n")
        print(f"  {'Type':<6} {'Code':<8} {'Scrip':<14} {'Client':<38} "
              f"{'B/S':<5} {'Qty':>12} {'Price':>9} {'Val(Cr)':>9}")
        print(f"  {'-'*5} {'-'*7} {'-'*13} {'-'*37} "
              f"{'-'*4} {'-'*12} {'-'*9} {'-'*8}")
        for r in items:
            qty_s   = f"{r['quantity']:>12,.0f}" if r['quantity'] is not None else f"{'N/A':>12}"
            price_s = f"{r['price']:>9.2f}"      if r['price']    is not None else f"{'N/A':>9}"
            val_s   = f"{r['valueCr']:>9.2f}"    if r['valueCr']  is not None else f"{'N/A':>9}"
            tx      = "BUY" if r['transactionCode'] == "P" else "SELL"
            wl      = " *" if r['inWatchlist'] else ""
            print(f"  {r['dealType']:<6} {r['bseCode']:<8} {r['scripname'][:13]:<14} "
                  f"{r['clientName'][:37]:<38} {tx:<5}{qty_s} {price_s} {val_s}{wl}")

    print("\n  * = in your Equity.csv watchlist")

# ── Interactive prompt ────────────────────────────────────────────────────────
def interactive_prompt(cfg):
    today = today_ist()
    print("\n" + "=" * 60)
    print("  BSE Bulk & Block Deals — Date Range Picker")
    print("=" * 60)
    print("  Press Enter to accept the default in [brackets].\n")

    cfg["from"] = input(f"  From date (YYYYMMDD) [{today}]: ").strip() or today
    cfg["to"]   = input(f"  To date   (YYYYMMDD) [{cfg['from']}]: ").strip() or cfg["from"]
    raw_all     = input("  Fetch ALL companies (not just your watchlist)? [y/N]: ").strip().lower()
    raw_type    = input("  Deal type — bulk / block / both [both]: ").strip().lower() or "both"
    raw_code    = input("  Single BSE code filter (blank = none): ").strip()

    cfg["all"]  = raw_all in ("y", "yes")
    cfg["type"] = raw_type if raw_type in ("bulk", "block", "both") else "both"
    cfg["code"] = raw_code or None

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="BSE Bulk & Block Deals Fetcher")
    parser.add_argument("--from",  dest="from_date", default=None)
    parser.add_argument("--to",    dest="to_date",   default=None)
    parser.add_argument("--all",   action="store_true", default=False)
    parser.add_argument("--type",  choices=["bulk", "block", "both"], default="both")
    parser.add_argument("--code",  default=None, help="Filter to a single BSE scrip code")
    args = parser.parse_args()

    cfg = {
        "from": args.from_date,
        "to":   args.to_date,
        "all":  args.all,
        "type": args.type,
        "code": args.code,
    }

    if args.from_date is None:
        interactive_prompt(cfg)
    else:
        cfg["from"] = args.from_date
        cfg["to"]   = args.to_date or args.from_date

    # validate
    try:
        from_d = parse_yyyymmdd(cfg["from"])
        to_d   = parse_yyyymmdd(cfg["to"])
    except ValueError as e:
        print(f"\nERROR: Invalid date — {e}")
        sys.exit(1)

    if from_d > to_d:
        print(f"\nERROR: --from ({cfg['from']}) must be ≤ --to ({cfg['to']})")
        sys.exit(1)

    type_map   = {"bulk": [1], "block": [2], "both": [1, 2]}
    deal_types = type_map.get(cfg["type"], [1, 2])

    scope = "ALL companies" if cfg["all"] else "Equity.csv watchlist"
    if cfg["code"]:
        scope = f"BSE code {cfg['code']}"

    print("\n" + "=" * 60)
    print(f"  From       : {cfg['from']}")
    print(f"  To         : {cfg['to']}")
    print(f"  Deal types : {', '.join(DEAL_TYPE_LABELS[dt] for dt in deal_types)}")
    print(f"  Scope      : {scope}")
    print("=" * 60)

    watchlist = load_watchlist()

    all_raw, normalised = fetch_all(
        from_date_str       = cfg["from"],
        to_date_str         = cfg["to"],
        deal_types          = deal_types,
        watchlist           = watchlist,
        fetch_all_companies = cfg["all"],
        filter_code         = cfg["code"],
    )

    print_results(normalised)

    bulk_count  = sum(1 for r in normalised if r["dealType"] == "Bulk")
    block_count = sum(1 for r in normalised if r["dealType"] == "Block")
    buy_count   = sum(1 for r in normalised if r["transactionCode"] == "P")
    sell_count  = sum(1 for r in normalised if r["transactionCode"] == "S")

    print(f"\n{'='*60}")
    print(f"  BSE Deals  {cfg['from']} → {cfg['to']}")
    print(f"  Deal types : {', '.join(DEAL_TYPE_LABELS[dt] for dt in deal_types)}")
    print(f"  Scope      : {scope}")
    print(f"  Total raw  : {len(all_raw)}")
    print(f"  Matched    : {len(normalised)}  (Bulk: {bulk_count}  Block: {block_count})")
    print(f"  Buy / Sell : {buy_count} / {sell_count}")
    print(f"  Saved to   : {OUTPUT_JSON}")
    print(f"{'='*60}\n")

    output = {
        "generatedAt":     now_ist(),
        "fromDate":        cfg["from"],
        "toDate":          cfg["to"],
        "dealTypes":       [DEAL_TYPE_LABELS[dt] for dt in deal_types],
        "scope":           scope,
        "filterCode":      cfg["code"],
        "totalBSEFetched": len(all_raw),
        "matchedCount":    len(normalised),
        "bulkCount":       bulk_count,
        "blockCount":      block_count,
        "buyCount":        buy_count,
        "sellCount":       sell_count,
        "deals":           normalised,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"  Full data → {OUTPUT_JSON}\n")

if __name__ == "__main__":
    main()
