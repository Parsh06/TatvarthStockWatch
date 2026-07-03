import requests
import json
from datetime import datetime, timedelta

# pip install requests  (only dependency)

BSE_API_URL = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.bseindia.com/",
    "Origin": "https://www.bseindia.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
}

# BSE scrip codes for popular stocks
SCRIPTS = {
    "500180": "HDFC Bank",
    "532174": "ICICI Bank",
    "500112": "State Bank of India",
    "532215": "Axis Bank",
    "532187": "Bajaj Finance",
    "532978": "Bajaj Finserv",
    "532540": "TCS",
    "507685": "Wipro",
    "532755": "Tech Mahindra",
    "500696": "HCL Technologies",
    "500325": "Reliance Industries",
    "500312": "ONGC",
    "524208": "Indian Oil Corp",
    "500547": "GAIL India",
    "500875": "ITC Ltd",
    "500820": "Asian Paints",
    "500790": "Nestle India",
    "500570": "Titan Company",
    "532500": "Maruti Suzuki",
    "500483": "Bajaj Auto",
    "500103": "Mahindra & Mahindra",
    "532977": "Tata Motors",
    "532488": "Cipla",
    "500087": "Lupin",
    "500470": "Tata Steel",
    "500440": "Hindalco",
    "532286": "JSW Steel",
    "500300": "Vedanta",
    "532921": "DLF Ltd",
    "500400": "Tata Power",
    "532454": "Bharti Airtel",
    "500900": "Adani Enterprises",
    # Companies from today's live data
    "544631": "Creative Newtech Ltd",
    "539872": "Bajaj Healthcare Ltd",
    "540709": "Reliance Home Finance Ltd",
    "508869": "Apollo Hospitals Enterprise Ltd",
    "534618": "Waaree Renewable Technologies Ltd",
    "517506": "TTK Prestige Ltd",
    "500488": "Abbott India Ltd",
    "533333": "Fineotex Chemical Ltd",
    "538835": "Intellect Design Arena Ltd",
    "524200": "Vinati Organics Ltd",
    "505160": "Talbros Automotive Components Ltd",
    "532741": "Kamdhenu Ltd",
    "507205": "Tilaknagar Industries Ltd",
    "544439": "Crizac Ltd",
}


def fetch_page(session, scrip_code, date_str, page):
    """Fetch one page of BSE announcements."""
    params = {
        "pageno":      page,
        "strCat":      -1,
        "strPrevDate": date_str,
        "strScrip":    scrip_code,
        "strSearch":   "P",       # required — empty string returns {}
        "strToDate":   date_str,
        "strType":     "C",
        "subcategory": -1,        # required — missing this causes empty response
    }
    resp = session.get(BSE_API_URL, params=params, timeout=15)
    resp.raise_for_status()
    body = resp.json()

    items = []
    total = 0
    if isinstance(body, dict):
        items = body.get("Table") or []
        cnt = body.get("Table1") or []
        if cnt and isinstance(cnt, list) and cnt[0].get("ROWCNT"):
            total = cnt[0]["ROWCNT"]
    elif isinstance(body, list):
        items = body

    return items, total


def fetch_bse(scrip_code="", date=None, fetch_all_pages=False, category_filter=""):
    """
    Fetch BSE announcements for a given date.

    Args:
        scrip_code    : BSE scrip code e.g. "532540". Leave blank for all companies.
        date          : datetime object. Defaults to today.
        fetch_all_pages: If True, fetches all pages (can be slow for all-company queries).
        category_filter: Filter by category keyword e.g. "Board Meeting", "Dividend".
    """
    if date is None:
        date = datetime.now()
    date_str = date.strftime("%Y%m%d")

    label = SCRIPTS.get(scrip_code, scrip_code) if scrip_code else "ALL companies"
    print("=" * 70)
    print("  BSE Announcement Fetcher")
    print(f"  Date        : {date.strftime('%d %b %Y')}")
    print(f"  Scrip       : {label}" + (f" ({scrip_code})" if scrip_code else ""))
    if category_filter:
        print(f"  Category    : {category_filter}")
    print("=" * 70)

    session = requests.Session()
    session.headers.update(HEADERS)

    try:
        # Page 1
        items, total = fetch_page(session, scrip_code, date_str, page=1)

        if not items:
            print(f"\n  No announcements found for this date/scrip.")
            print(f"  (BSE may not have data for weekends or holidays)")
            return []

        total_pages = (total // len(items) + 1) if total and items else 1
        print(f"\n  Page 1 fetched  — {len(items)} items  |  Total: {total}  |  Pages: {total_pages}")

        all_items = list(items)

        # Fetch remaining pages if requested
        if fetch_all_pages and total_pages > 1:
            for page in range(2, total_pages + 1):
                page_items, _ = fetch_page(session, scrip_code, date_str, page)
                if not page_items:
                    break
                all_items.extend(page_items)
                print(f"  Page {page} fetched  — {len(page_items)} items  |  Running total: {len(all_items)}")

    except requests.exceptions.ConnectionError:
        print("ERROR: Could not connect to BSE API. Check internet connection.")
        return []
    except requests.exceptions.Timeout:
        print("ERROR: Request timed out.")
        return []
    except Exception as e:
        print(f"ERROR: {e}")
        return []

    # Apply category filter
    if category_filter:
        all_items = [i for i in all_items if category_filter.lower() in (i.get("CATEGORYNAME") or "").lower()]
        print(f"  After filter  — {len(all_items)} items match '{category_filter}'")

    print(f"\n  Showing {min(len(all_items), 50)} of {len(all_items)} announcements")
    print("-" * 70)

    for idx, item in enumerate(all_items[:50], 1):
        scrip   = str(item.get("SCRIP_CD") or "")
        name    = item.get("SLONGNAME")    or scrip or "Unknown"
        subject = item.get("NEWSSUB")      or item.get("HEADLINE") or "-"
        headline= item.get("HEADLINE")     or "-"
        cat     = item.get("CATEGORYNAME") or "General"
        subcat  = item.get("SUBCATNAME")   or ""
        dt      = item.get("NEWS_DT")      or item.get("DissemDT") or "-"
        news_id = item.get("NEWSID")       or "-"
        pdf     = item.get("ATTACHMENTNAME") or ""
        pdf_url = f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{pdf}" if pdf else None
        bse_url = item.get("NSURL") or f"https://www.bseindia.com/corporates/ann.html?scripcd={scrip}"
        critical= " [CRITICAL]" if item.get("CRITICALNEWS") == 1 else ""

        # Format date nicely
        try:
            dt_fmt = datetime.fromisoformat(dt).strftime("%d %b %Y  %H:%M")
        except Exception:
            dt_fmt = dt

        print(f"[{idx:>3}]  {name}  ({scrip}){critical}")
        print(f"       Date     : {dt_fmt}")
        print(f"       Category : {cat}" + (f"  /  {subcat}" if subcat and subcat != cat else ""))
        print(f"       Headline : {headline[:120]}")
        print(f"       News ID  : {news_id}")
        print(f"       BSE Page : {bse_url}")
        if pdf_url:
            print(f"       PDF      : {pdf_url}")
        print()

    if len(all_items) > 50:
        print(f"  ... {len(all_items) - 50} more. Set fetch_all_pages=True and increase slice to see all.")

    return all_items


def fetch_date_range(scrip_code="", days_back=7, category_filter=""):
    """Fetch announcements over a date range (one API call per day)."""
    today = datetime.now()
    all_results = []

    print(f"Fetching last {days_back} days for: {SCRIPTS.get(scrip_code, scrip_code or 'ALL')}")
    print()

    for d in range(days_back):
        date = today - timedelta(days=d)
        # Skip weekends
        if date.weekday() >= 5:
            continue
        items = fetch_bse(scrip_code=scrip_code, date=date,
                          fetch_all_pages=True, category_filter=category_filter)
        all_results.extend(items)

    print("=" * 70)
    print(f"  TOTAL across all dates: {len(all_results)} announcements")
    return all_results


if __name__ == "__main__":
    # ── Settings ──────────────────────────────────────────────────────────────
    MODE = "today"
    # Modes:
    #   "today"      — all companies, today only (fastest)
    #   "single"     — one scrip, today
    #   "date_range" — one scrip, last N days
    #   "all_pages"  — all companies, today, all pages

    SCRIP_CODE      = "532540"    # TCS — used for "single" and "date_range" modes
    DAYS_BACK       = 5           # used for "date_range" mode
    CATEGORY_FILTER = ""          # e.g. "Board Meeting", "Dividend", "Corp. Action"
    # ─────────────────────────────────────────────────────────────────────────

    if MODE == "today":
        fetch_bse(scrip_code="", fetch_all_pages=False, category_filter=CATEGORY_FILTER)

    elif MODE == "single":
        fetch_bse(scrip_code=SCRIP_CODE, fetch_all_pages=True, category_filter=CATEGORY_FILTER)

    elif MODE == "date_range":
        fetch_date_range(scrip_code=SCRIP_CODE, days_back=DAYS_BACK, category_filter=CATEGORY_FILTER)

    elif MODE == "all_pages":
        fetch_bse(scrip_code="", fetch_all_pages=True, category_filter=CATEGORY_FILTER)
