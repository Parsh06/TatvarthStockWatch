'use strict';

/**
 * bseHolidayScraper.js
 *
 * Scrapes official Indian stock market trading holidays directly from BSE India's
 * official static publication:
 * Primary:  https://beta.bseindia.com/static/markets/marketinfo/listholi.aspx
 * Fallback: https://www.bseindia.com/static/markets/marketinfo/listholi.aspx
 *
 * Notes:
 * - Uses Axios with `insecureHTTPParser: true` to prevent Node.js HTTP parser errors
 *   caused by trailing whitespace in BSE's IIS server response headers.
 * - Extracts statutory Equity Segment trading holidays, normalizes dates to YYYY-MM-DD,
 *   and captures special sessions such as Muhurat Trading.
 */

const axios = require('axios');
const cheerio = require('cheerio');

const BSE_HOLIDAY_URLS = [
  'https://beta.bseindia.com/static/markets/marketinfo/listholi.aspx',
  'https://www.bseindia.com/static/markets/marketinfo/listholi.aspx',
];

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * Normalizes exchange date string to ISO YYYY-MM-DD
 * Handles "15-Jan-26", "26-Jan-2026", "03-Mar-26", "November 08, 2026", "08-Nov-2026"
 */
function normalizeDateToISO(rawDateStr, fallbackYear = null) {
  if (!rawDateStr || typeof rawDateStr !== 'string') return null;
  const cleaned = rawDateStr.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  // Pattern 1: DD-MMM-YY or DD-MMM-YYYY (e.g. "15-Jan-26", "03-Mar-2026")
  const dashMatch = cleaned.match(/^(\d{1,2})[-/]([A-Za-z]{3,9})[-/](\d{2,4})$/);
  if (dashMatch) {
    const day = dashMatch[1].padStart(2, '0');
    const monthKey = dashMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    let year = dashMatch[3];
    if (year.length === 2) {
      year = '20' + year;
    }
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Pattern 2: Month DD, YYYY or Month DD YYYY (e.g. "November 08 2026")
  const wordsMatch = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})$/);
  if (wordsMatch) {
    const monthKey = wordsMatch[1].toLowerCase();
    const month = MONTH_MAP[monthKey];
    const day = wordsMatch[2].padStart(2, '0');
    const year = wordsMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Pattern 3: DD Month YYYY (e.g. "08 November 2026")
  const dmyMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const monthKey = dmyMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    const year = dmyMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback to standard JS Date parsing
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return null;
}

/**
 * Fetches HTML from BSE with automatic fallback between beta and www
 */
async function fetchBseHolidayHtml() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  let lastError = null;

  for (const url of BSE_HOLIDAY_URLS) {
    try {
      const response = await axios.get(url, {
        headers,
        timeout: 12000,
        insecureHTTPParser: true, // Fix for BSE IIS server header whitespace
        maxRedirects: 5,
        validateStatus: (status) => status === 200,
      });

      if (response.data && typeof response.data === 'string' && response.data.length > 500) {
        return { html: response.data, sourceUrl: url };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[BSE Holiday Scraper] Failed to fetch from ${url}:`, err.message);
    }
  }

  throw new Error(`Failed to fetch BSE holidays from all endpoints: ${lastError ? lastError.message : 'Unknown network failure'}`);
}

/**
 * Parses Equity Segment holiday tables and notes from the HTML document.
 */
function parseBseHolidayHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const holidays = [];
  const seenDates = new Set();

  // 1. Locate the Equity Segment inner table
  // On BSE listholi.aspx, the table has headers: "SI.NO.", "Holidays", "Date", "Day"
  // It is the first inner table containing these headers (or preceded by "Equity Segment")
  let targetTable = null;

  $('table').each((idx, tbl) => {
    const $tbl = $(tbl);
    const headerRow = $tbl.find('tr').first();
    const headerText = headerRow.text().toLowerCase();

    // Check if table contains SI.NO, Holidays, Date, Day and is an inner table
    if (
      (headerText.includes('si.no') || headerText.includes('sno')) &&
      headerText.includes('holiday') &&
      headerText.includes('date') &&
      headerText.includes('day')
    ) {
      // Equity Segment is Table 1 (the first inner table) or has innertable_header
      if (!targetTable) {
        targetTable = $tbl;
      }
    }
  });

  if (targetTable) {
    targetTable.find('tr').each((rIdx, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 4) {
        const snoText = cells.eq(0).text().trim();
        const nameText = cells.eq(1).text().trim();
        const dateText = cells.eq(2).text().trim();
        const dayText = cells.eq(3).text().trim();

        // Must have a numeric serial number (skip header row)
        const sno = parseInt(snoText, 10);
        if (!isNaN(sno) && sno > 0 && nameText && dateText) {
          const isoDate = normalizeDateToISO(dateText);
          if (isoDate && !seenDates.has(isoDate)) {
            seenDates.add(isoDate);
            holidays.push({
              date: isoDate,
              name: nameText.replace(/\s+/g, ' '),
              day: dayText.replace(/\s+/g, ' '),
              isClosed: true,
              description: 'Official BSE Statutory Trading Holiday (Equity Segment)',
              rawDate: dateText,
              sno,
              source: 'BSE_OFFICIAL_EXCHANGE',
            });
          }
        }
      }
    });
  }

  // 2. Discover Muhurat Trading session from notes / bullet points
  // Typical text: "* Muhurat Trading will be conducted on Sunday, November 08, 2026."
  $('p, ul li, span, td').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.toLowerCase().includes('muhurat trading will be conducted on')) {
      const match = text.match(/conducted on\s+([A-Za-z]+),\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
      if (match) {
        const dayName = match[1].trim();
        const rawDate = match[2].trim();
        const isoDate = normalizeDateToISO(rawDate);

        if (isoDate && !seenDates.has(isoDate)) {
          seenDates.add(isoDate);
          holidays.push({
            date: isoDate,
            name: 'Diwali Laxmi Pujan (Muhurat Trading)',
            day: dayName,
            isClosed: false, // Muhurat trading session is open in evening
            isMuhurat: true,
            description: `Special 1-Hour Muhurat Trading Evening Session. ${text}`,
            rawDate,
            source: 'BSE_OFFICIAL_EXCHANGE',
          });
        }
      }
    }
  });

  // Sort chronologically by date
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  return {
    success: true,
    total: holidays.length,
    holidays,
    sourceUrl,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Public high-level orchestrator: fetches and parses official BSE holidays
 */
async function scrapeOfficialBseHolidays(targetYear = null) {
  const { html, sourceUrl } = await fetchBseHolidayHtml();
  const result = parseBseHolidayHtml(html, sourceUrl);

  if (targetYear) {
    const yrStr = String(targetYear).trim();
    result.holidays = result.holidays.filter(h => h.date.startsWith(yrStr));
    result.total = result.holidays.length;
  }

  return result;
}

module.exports = {
  fetchBseHolidayHtml,
  parseBseHolidayHtml,
  scrapeOfficialBseHolidays,
  normalizeDateToISO,
};

