"""
datechoiceannouncements.py
==========================
Fetch BSE corporate announcements for any date range you choose.

Uses the paginated AnnSubCategoryGetData/w endpoint — same one the app uses,
but with user-selectable from/to dates and optional category filters.

Reads  : stockwatch/Equity.csv                            (watchlist)
Writes : test_data/results/datechoiceannouncements.json

Usage (CLI):
    python datechoiceannouncements.py                            # interactive prompts
    python datechoiceannouncements.py --from 20260610 --to 20260617
    python datechoiceannouncements.py --from 20260617 --to 20260617 --all
    python datechoiceannouncements.py --from 20260601 --to 20260617 --cat "Board Meeting"
    python datechoiceannouncements.py --from 20260617 --sub "Award of Order"
    python datechoiceannouncements.py --from 20260617 --limit 50   # quick test

Flags:
    --from   YYYYMMDD   Start date          (default: last trading day)
    --to     YYYYMMDD   End date            (default: same as --from)
    --all               Include ALL companies, not just Equity.csv watchlist
    --cat    TEXT       Filter by CATEGORYNAME  (partial, case-insensitive)
    --sub    TEXT       Filter by SUBCATNAME    (partial, case-insensitive)
    --limit  N          Stop after N raw items  (for testing)
    --workers N         Parallel page fetch threads (default 5)

Dependencies:
    pip install requests
"""

import argparse
import csv
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import requests

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))          # test_data/
STOCKWATCH  = os.path.dirname(SCRIPT_DIR)                          # stockwatch/
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")                 # test_data/results/
EQUITY_CSV  = os.path.join(STOCKWATCH, "Equity.csv")              # stockwatch/Equity.csv
OUTPUT_JSON = os.path.join(RESULTS_DIR, "datechoiceannouncements.json")

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── BSE API ────────────────────────────────────────────────────────────────────
BSE_HOME    = "https://www.bseindia.com"
BSE_API_URL = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"

BSE_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0",
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://www.bseindia.com/",
    "Origin":          "https://www.bseindia.com",
    "Sec-Fetch-Dest":  "empty",
    "Sec-Fetch-Mode":  "cors",
    "Sec-Fetch-Site":  "same-site",
}

BSE_HOMEPAGE_HEADERS = {
    "User-Agent":                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                 "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0",
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":           "en-US,en;q=0.9",
    "Sec-Fetch-Dest":            "document",
    "Sec-Fetch-Mode":            "navigate",
    "Sec-Fetch-Site":            "none",
    "Upgrade-Insecure-Requests": "1",
}

PAGE_CONCURRENCY = 5

_session = None


def get_session():
    global _session
    if _session:
        return _session
    _session = requests.Session()
    print("[BSE] Initialising session (visiting homepage for Akamai cookies) ...")
    try:
        resp = _session.get(BSE_HOME, headers=BSE_HOMEPAGE_HEADERS, timeout=15)
        cookies = list(_session.cookies.keys())
        print(f"[BSE] Homepage status: {resp.status_code}  |  Cookies: {cookies or 'none'}")
    except Exception as e:
        print(f"[BSE] WARNING: homepage visit failed ({e}) — proceeding without cookies")
    # Set API headers for all subsequent requests
    _session.headers.update(BSE_HEADERS)
    return _session


# ── CSV loader ────────────────────────────────────────────────────────────────

def load_equity_csv():
    """Returns (watched_codes: set, stock_map: dict bseCode -> info)."""
    if not os.path.exists(EQUITY_CSV):
        print(f"ERROR: Equity.csv not found at {EQUITY_CSV}")
        sys.exit(1)

    with open(EQUITY_CSV, encoding="utf-8-sig") as f:
        first = f.readline()
    delim = "\t" if first.count("\t") > first.count(",") else ","

    stock_map     = {}
    watched_codes = set()

    with open(EQUITY_CSV, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=delim):
            row      = {k.strip(): v.strip() for k, v in row.items() if k}
            code     = row.get("Security Code", "").strip()
            symbol   = row.get("Security Id",   "").strip().upper()
            name     = row.get("Security Name", "").strip()
            if not code or not code.isdigit():
                continue
            stock_map[code] = {
                "bseCode":    code,
                "nseSymbol":  symbol,
                "scriptName": name or code,
            }
            watched_codes.add(code)

    print(f"[CSV] Loaded {len(stock_map)} scripts from Equity.csv")
    return watched_codes, stock_map


# ── BSE pagination ────────────────────────────────────────────────────────────

def fetch_page(date_str, page_no):
    """
    Fetch one page of announcements for a SINGLE day.
    BSE's API only supports single-day queries — strPrevDate and strToDate must be equal.
    Returns (items: list, total_row_count: int).
    """
    params = {
        "pageno":      page_no,
        "strCat":      -1,
        "strPrevDate": date_str,    # must equal strToDate — BSE rejects ranges
        "strScrip":    "",          # empty = all companies
        "strSearch":   "P",         # required — empty string returns {}
        "strToDate":   date_str,
        "strType":     "C",
        "subcategory": -1,          # required — missing causes empty response
    }
    try:
        r = get_session().get(BSE_API_URL, params=params, timeout=18)
        r.raise_for_status()
        body = r.json()
    except requests.exceptions.Timeout:
        print(f"  [WARN] Page {page_no} ({date_str}): timeout — skipping")
        return [], 0
    except Exception as e:
        print(f"  [WARN] Page {page_no} ({date_str}): {e} — skipping")
        return [], 0

    items     = []
    row_count = 0

    if isinstance(body, dict):
        items = body.get("Table") or []
        t1    = body.get("Table1") or []
        if t1 and t1[0].get("ROWCNT"):
            row_count = int(t1[0]["ROWCNT"])
    elif isinstance(body, list):
        items = body

    if not row_count:
        row_count = len(items)

    return items, row_count


def _trading_days_in_range(from_date, to_date):
    """
    Return list of YYYYMMDD strings for every weekday from from_date to to_date inclusive.
    BSE API only supports single-day queries, so we call it once per day.
    """
    start = datetime.strptime(from_date, "%Y%m%d")
    end   = datetime.strptime(to_date,   "%Y%m%d")
    days  = []
    cur   = start
    while cur <= end:
        if cur.weekday() < 5:          # Mon–Fri only
            days.append(cur.strftime("%Y%m%d"))
        cur += timedelta(days=1)
    return days


def _fetch_one_day(date_str, workers=5, limit=None):
    """
    Fetch paginated announcements for a single YYYYMMDD date.
    Stops fetching pages early if limit is reached.
    Returns list of raw items.
    """
    items_p1, total_count = fetch_page(date_str, 1)

    if not items_p1:
        return []

    page_size   = len(items_p1)
    total_pages = math.ceil(total_count / page_size) if page_size else 1
    all_items   = list(items_p1)

    print(f"  {date_str}  Page 1/{total_pages}: {page_size} items  |  Total: {total_count}")

    if limit and len(all_items) >= limit:
        return all_items[:limit]

    if total_pages > 1:
        remaining = list(range(2, total_pages + 1))
        with ThreadPoolExecutor(max_workers=min(workers, PAGE_CONCURRENCY)) as pool:
            futures = {pool.submit(fetch_page, date_str, pg): pg for pg in remaining}
            for future in as_completed(futures):
                pg = futures[future]
                try:
                    page_items, _ = future.result()
                    all_items.extend(page_items)
                    print(f"  {date_str}  Page {pg:>3}/{total_pages}: {len(page_items):>4} items"
                          f"  |  Day total: {len(all_items)}", flush=True)
                    if limit and len(all_items) >= limit:
                        break
                except Exception as e:
                    print(f"  {date_str}  Page {pg} error: {e}")

    if limit and len(all_items) > limit:
        all_items = all_items[:limit]

    return all_items


def fetch_all_for_range(from_date, to_date, limit=None, workers=5):
    """
    Fetch ALL BSE announcements across a date range.
    BSE API only supports single-day queries, so we loop day by day and aggregate.
    Returns combined list of raw announcement dicts.
    """
    days = _trading_days_in_range(from_date, to_date)

    if not days:
        print("[BSE] No trading days found in the selected range (weekends only?).")
        return []

    single = from_date == to_date
    if single:
        print(f"\n[BSE] Fetching announcements for {from_date} ...")
    else:
        print(f"\n[BSE] Fetching announcements for {len(days)} trading day(s): "
              f"{days[0]} → {days[-1]} ...")

    all_items = []

    for day in days:
        remaining_limit = (limit - len(all_items)) if limit else None
        day_items = _fetch_one_day(day, workers=workers, limit=remaining_limit)
        if day_items:
            all_items.extend(day_items)
            print(f"  {day}  → {len(day_items)} announcements  |  Running total: {len(all_items)}")
        else:
            print(f"  {day}  → 0 announcements (holiday or no filings)")
        if limit and len(all_items) >= limit:
            all_items = all_items[:limit]
            print(f"  [limit] Reached {limit} items — stopping")
            break

    print(f"\n[BSE] Total fetched across all days: {len(all_items)}")
    return all_items


# ── Normalise ─────────────────────────────────────────────────────────────────

def normalize_item(item, stock_map):
    """Convert one raw BSE announcement dict into the app's canonical schema."""
    bse_code    = str(item.get("SCRIP_CD") or "").strip()
    bse_name    = (item.get("SLONGNAME") or item.get("SCRIP_NAME") or bse_code).strip()
    csv_entry   = stock_map.get(bse_code, {})
    script_name = csv_entry.get("scriptName") or bse_name
    nse_symbol  = csv_entry.get("nseSymbol") or ""

    raw_date = item.get("NEWS_DT") or item.get("DissemDT") or ""
    try:
        dt_obj            = datetime.fromisoformat(raw_date)
        announcement_date = dt_obj.isoformat()
        date_formatted    = dt_obj.strftime("%d %b %Y")
        time_formatted    = dt_obj.strftime("%H:%M:%S")
        datetime_ist      = dt_obj.strftime("%d %b %Y %H:%M:%S IST")
    except Exception:
        announcement_date = raw_date
        date_formatted    = raw_date
        time_formatted    = ""
        datetime_ist      = raw_date

    attachment    = item.get("ATTACHMENTNAME") or ""
    pdf_url       = (
        f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{attachment}"
        if attachment else None
    )
    inv_pres_file = item.get("INVESTOR_PRESENTATION")
    inv_pres_url  = (
        f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{inv_pres_file}"
        if inv_pres_file else None
    )

    return {
        "id":                     str(item.get("NEWSID") or f"BSE-{bse_code}-unknown"),
        "exchange":               "BSE",
        "bseCode":                bse_code,
        "nseSymbol":              nse_symbol,
        "scriptName":             script_name,
        "category":               (item.get("CATEGORYNAME") or "General").strip(),
        "subCategory":            (item.get("SUBCATNAME")   or "").strip(),
        "subject":                (item.get("NEWSSUB")      or "").strip(),
        "headline":               (item.get("HEADLINE")     or "").strip(),
        "more":                   (item.get("MORE")         or "").strip(),
        "announcementDate":       announcement_date,
        "date":                   date_formatted,
        "time":                   time_formatted,
        "datetimeIST":            datetime_ist,
        "pdfUrl":                 pdf_url,
        "investorPresentationUrl": inv_pres_url,
        "audioVideoUrl":          item.get("AUDIO_VIDEO_FILE"),
        "sourceUrl":              (
            item.get("NSURL")
            or f"https://www.bseindia.com/corporates/ann.html?scripcd={bse_code}"
        ),
        "critical":               item.get("CRITICALNEWS") == 1,
        "attachSizeBytes":        item.get("Fld_Attachsize"),
        "agendaId":               item.get("AGENDA_ID"),
        "recordId":               item.get("RECORDID"),
    }


# ── Filter + save ─────────────────────────────────────────────────────────────

def filter_and_save(raw_items, watched_codes, stock_map, args):
    cat_filter = (args.cat or "").strip().lower()
    sub_filter = (args.sub or "").strip().lower()
    fetch_all  = args.all

    seen_ids = set()
    matched  = []

    for item in raw_items:
        bse_code = str(item.get("SCRIP_CD") or "").strip()

        if not fetch_all and bse_code not in watched_codes:
            continue

        news_id = str(item.get("NEWSID") or "")
        if news_id and news_id in seen_ids:
            continue
        if news_id:
            seen_ids.add(news_id)

        norm = normalize_item(item, stock_map)

        if cat_filter and cat_filter not in norm["category"].lower():
            continue
        if sub_filter and sub_filter not in norm["subCategory"].lower():
            continue

        matched.append(norm)

    matched.sort(key=lambda a: a["announcementDate"], reverse=True)

    output = {
        "generatedAt":       datetime.now().isoformat(),
        "fromDate":          args.date_from,
        "toDate":            args.date_to,
        "filterAll":         fetch_all,
        "filterCategory":    args.cat or None,
        "filterSubCategory": args.sub or None,
        "watchedScripts":    len(watched_codes),
        "totalBSEFetched":   len(raw_items),
        "matchedCount":      len(matched),
        "announcements":     matched,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    return matched


# ── Console summary ───────────────────────────────────────────────────────────

def print_summary(matched, total_bse, args):
    SEP = "=" * 72
    print(f"\n{SEP}")
    print(f"  BSE Announcements  {args.date_from} → {args.date_to}")
    if args.cat:
        print(f"  Category filter    : {args.cat}")
    if args.sub:
        print(f"  Sub-category filter: {args.sub}")
    scope = "ALL companies" if args.all else "Equity.csv watchlist only"
    print(f"  Scope              : {scope}")
    print(f"  Total BSE fetched  : {total_bse}")
    print(f"  Matched            : {len(matched)}")
    print(f"  Saved to           : {OUTPUT_JSON}")
    print(SEP)

    if not matched:
        print("\n  No announcements matched your filters.\n")
        return

    # Group by date for clean display
    by_date = {}
    for ann in matched:
        by_date.setdefault(ann["date"], []).append(ann)

    for date_label in sorted(by_date.keys(), reverse=True):
        anns = by_date[date_label]
        print(f"\n  ── {date_label}  ({len(anns)} announcement{'s' if len(anns) != 1 else ''}) ──")
        shown = anns[:25]
        for ann in shown:
            crit  = "  [CRITICAL]" if ann["critical"] else ""
            name  = f"{ann['scriptName']} ({ann['bseCode']})"
            cat   = ann["category"] + (f" / {ann['subCategory']}" if ann["subCategory"] else "")
            print(f"\n    {name}{crit}")
            print(f"    {ann['time']} IST  |  {cat}")
            print(f"    {ann['headline'][:110]}")
        if len(anns) > 25:
            print(f"\n    ... and {len(anns) - 25} more (open the JSON to see all)")

    print(f"\n  Full data → {OUTPUT_JSON}\n")


# ── Date helpers ──────────────────────────────────────────────────────────────

def last_trading_day():
    d = datetime.now()
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.strftime("%Y%m%d")


def prompt_date(label, default):
    val = input(f"  {label} [{default}]: ").strip()
    return val if val else default


def validate_date(s, label):
    try:
        datetime.strptime(s, "%Y%m%d")
    except ValueError:
        print(f"ERROR: {label} must be YYYYMMDD — got '{s}'")
        sys.exit(1)
    return s


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Fetch BSE announcements for a user-chosen date range",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--from",    dest="date_from", default=None)
    parser.add_argument("--to",      dest="date_to",   default=None)
    parser.add_argument("--all",     action="store_true",             help="Include all BSE companies")
    parser.add_argument("--cat",     default=None,                    help="Category filter (partial)")
    parser.add_argument("--sub",     default=None,                    help="Sub-category filter (partial)")
    parser.add_argument("--limit",   type=int, default=None,          help="Max raw items (testing)")
    parser.add_argument("--workers", type=int, default=5,             help="Parallel page threads")
    args = parser.parse_args()

    today = last_trading_day()

    # ── Interactive mode when no --from supplied ──────────────────────────────
    if args.date_from is None:
        print("\n" + "=" * 60)
        print("  BSE Announcements — Date Range Picker")
        print("=" * 60)
        print("  Press Enter to accept the default in [brackets].\n")
        args.date_from = prompt_date("From date (YYYYMMDD)", today)
        args.date_to   = prompt_date("To date   (YYYYMMDD)", args.date_from)
        if input("  Fetch ALL companies (not just your watchlist)? [y/N]: ").strip().lower() == "y":
            args.all = True
        cat_in = input("  Category filter (blank = all): ").strip()
        if cat_in:
            args.cat = cat_in
        sub_in = input("  Sub-category filter (blank = all): ").strip()
        if sub_in:
            args.sub = sub_in
        print()

    if args.date_to is None:
        args.date_to = args.date_from

    validate_date(args.date_from, "--from")
    validate_date(args.date_to,   "--to")

    if args.date_from > args.date_to:
        print(f"ERROR: --from ({args.date_from}) must be ≤ --to ({args.date_to})")
        sys.exit(1)

    print("=" * 60)
    print(f"  From       : {args.date_from}")
    print(f"  To         : {args.date_to}")
    print(f"  Scope      : {'ALL companies' if args.all else 'Equity.csv watchlist'}")
    if args.cat: print(f"  Category   : {args.cat}")
    if args.sub: print(f"  Sub-cat    : {args.sub}")
    if args.limit: print(f"  Limit      : {args.limit} raw items")
    print("=" * 60)

    # Load watchlist
    watched_codes, stock_map = load_equity_csv()

    # Fetch
    raw_items = fetch_all_for_range(
        args.date_from, args.date_to,
        limit=args.limit, workers=args.workers,
    )

    if not raw_items:
        print("\n  No data returned. Possible causes:")
        print("   • Weekend / market holiday (use --from with a weekday date)")
        print("   • Date range too narrow — try a wider range")
        print("   • Akamai block — run again after a few seconds")
        sys.exit(0)

    # Filter + normalise + save
    matched = filter_and_save(raw_items, watched_codes, stock_map, args)

    # Print summary
    print_summary(matched, len(raw_items), args)


if __name__ == "__main__":
    main()
