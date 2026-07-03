"""
BSE Script Name Search
Search BSE for scripts by company name or symbol.
Returns matching BSE codes, symbols, ISIN, and URLs.

Usage (interactive — loops until you quit):
    python searchname.py

Usage (CLI — single query):
    python searchname.py --query "nava"
    python searchname.py --query "reliance" --save
    python searchname.py --query "hdfc" --type "T+1"
"""

import requests
import json
import os
import sys
import argparse
from datetime import datetime, timezone, timedelta

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))       # test_data/
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")             # test_data/results/
OUTPUT_JSON = os.path.join(RESULTS_DIR, "searchname.json")    # test_data/results/searchname.json

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── BSE endpoints ─────────────────────────────────────────────────────────────
BSE_HOME       = "https://www.bseindia.com"
BSE_SEARCH_URL = "https://api.bseindia.com/BseIndiaAPI/api/GetQuoteAllSearchDatabeta/w"

IST = timezone(timedelta(hours=5, minutes=30))

def now_ist():
    return datetime.now(IST).isoformat()

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
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Referer":         "https://www.bseindia.com/",
    "Origin":          "https://www.bseindia.com",
    "Sec-Fetch-Dest":  "empty",
    "Sec-Fetch-Mode":  "cors",
    "Sec-Fetch-Site":  "same-site",
    "Connection":      "keep-alive",
}

# ── Session ───────────────────────────────────────────────────────────────────
def build_session():
    session = requests.Session()
    try:
        r = session.get(BSE_HOME, headers=BSE_HOMEPAGE_HEADERS, timeout=15, allow_redirects=True)
        cookies = list(session.cookies.keys())
        print(f"[BSE] Session ready — HTTP {r.status_code}"
              f"  |  Cookies: {', '.join(cookies) if cookies else 'none'}\n")
    except Exception as e:
        print(f"[BSE] Session warning: {e} — proceeding without cookies\n")
    return session

# ── Search ────────────────────────────────────────────────────────────────────
def search(session, query):
    try:
        r = session.get(
            BSE_SEARCH_URL,
            params={"searchString": query},
            headers=BSE_API_HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            print(f"  [ERROR] HTTP {r.status_code} — {r.text[:200]}")
            return []
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"  [ERROR] {e}")
        return []

# ── Normalise ─────────────────────────────────────────────────────────────────
def normalise(item):
    return {
        "bseCode":   (item.get("strSricpCode") or "").strip(),
        "symbol":    (item.get("shortName")    or "").strip(),
        "scripName": (item.get("scripName")    or "").strip(),
        "isin":      (item.get("Isin")         or "").strip(),
        "type":      (item.get("Type")         or "").strip(),
        "url":       (item.get("SEOUrl")       or "").strip(),
    }

# ── Print results ─────────────────────────────────────────────────────────────
def print_results(results, query):
    if not results:
        print(f"  No results found for \"{query}\".\n")
        return

    print(f"  {len(results)} result(s) for \"{query}\":\n")
    print(f"  {'#':<4} {'BSE Code':<10} {'Symbol':<15} {'Company Name':<42} {'ISIN':<14} Type")
    print(f"  {'-'*3} {'-'*9} {'-'*14} {'-'*41} {'-'*13} {'-'*20}")

    for i, r in enumerate(results, 1):
        print(f"  {i:<4} {r['bseCode']:<10} {r['symbol']:<15} "
              f"{r['scripName'][:41]:<42} {r['isin']:<14} {r['type']}")

    print()

# ── Save JSON ─────────────────────────────────────────────────────────────────
def save_results(searches):
    output = {
        "generatedAt":   now_ist(),
        "totalSearches": len(searches),
        "searches":      searches,
    }
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  Saved {len(searches)} search(es) → {OUTPUT_JSON}\n")

# ── Interactive loop ──────────────────────────────────────────────────────────
def interactive_mode(session, type_filter):
    print("=" * 62)
    print("  BSE Script Name Search  (type 'quit' or Ctrl+C to exit)")
    print("=" * 62 + "\n")

    all_searches = []

    while True:
        try:
            query = input("  Search: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n  Exiting.")
            break

        if not query:
            continue
        if query.lower() in ("quit", "exit", "q"):
            break

        raw     = search(session, query)
        results = [normalise(r) for r in raw]
        if type_filter:
            results = [r for r in results if type_filter.lower() in r["type"].lower()]

        print_results(results, query)
        all_searches.append({"query": query, "resultCount": len(results), "results": results})

    if all_searches:
        save_results(all_searches)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="BSE Script Name Search")
    parser.add_argument("--query", "-q", default=None,
                        help="Search string (company name or BSE symbol)")
    parser.add_argument("--type",  default=None,
                        help="Filter by settlement type, e.g. 'T+1' or 'T+0'")
    parser.add_argument("--save",  action="store_true", default=False,
                        help="Save results to searchname.json (CLI mode only)")
    args = parser.parse_args()

    session = build_session()

    if args.query:
        # ── CLI mode: single query, print, optionally save ──────────────────
        raw     = search(session, args.query)
        results = [normalise(r) for r in raw]
        if args.type:
            results = [r for r in results if args.type.lower() in r["type"].lower()]

        print_results(results, args.query)

        print(f"  {'='*60}")
        print(f"  Query   : {args.query}")
        if args.type:
            print(f"  Filter  : type contains \"{args.type}\"")
        print(f"  Results : {len(results)}")
        print(f"  {'='*60}\n")

        if args.save:
            save_results([{"query": args.query, "resultCount": len(results), "results": results}])
    else:
        # ── Interactive mode: loop until quit, always saves on exit ─────────
        interactive_mode(session, type_filter=args.type)

if __name__ == "__main__":
    main()
