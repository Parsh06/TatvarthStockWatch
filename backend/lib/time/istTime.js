'use strict';

/**
 * istTime.js
 *
 * Centralized, authoritative timezone utility for Asia/Kolkata (IST).
 * Guarantees identical date, hour, minute, and window calculation
 * across any operating system or cloud environment (UTC vs local).
 */

/**
 * Returns current IST date parts.
 * @param {Date} [date=new Date()]
 * @returns {{ year: string, month: string, day: string, dateIST: string, istHour: number, istMinute: number }}
 */
function getISTDateTime(date = new Date()) {
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const dateIST = `${year}-${month}-${day}`; // YYYY-MM-DD
  const istHour = parseInt(parts.hour, 10);
  const istMinute = parseInt(parts.minute, 10);
  const istDateObj = new Date(`${year}-${month}-${day}T12:00:00Z`);
  const istDay = istDateObj.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

  return { year, month, day, dateIST, istHour, istMinute, istDay };
}

/**
 * Returns YYYY-MM-DD in IST.
 */
function getISTDateString(date = new Date()) {
  return getISTDateTime(date).dateIST;
}

/**
 * Returns current hour in IST (0-23).
 */
function getISTHour(date = new Date()) {
  return getISTDateTime(date).istHour;
}

/**
 * Parses any date string/timestamp into ISO YYYY-MM-DD in Asia/Kolkata.
 * Handles "26 Aug 2026", "26-08-2026", "2026-08-26", etc.
 */
function parseToISTDateString(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    // Attempt manual regex parsing for DD MMM YYYY / DD-MMM-YYYY
    const str = String(dateInput).trim();
    const match = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{4})$/);
    if (match) {
      const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const mIdx = monthMap[match[2].toLowerCase()];
      if (mIdx !== undefined) {
        const parsedD = new Date(Date.UTC(parseInt(match[3], 10), mIdx, parseInt(match[1], 10)));
        return getISTDateString(parsedD);
      }
    }
    return null;
  }
  return getISTDateString(d);
}

/**
 * Checks if current time is within the IPO closing dispatch window (11:00 AM – 12:59 PM IST).
 */
function isWithinIpoDispatchWindow(date = new Date()) {
  const { istHour } = getISTDateTime(date);
  return istHour >= 11 && istHour < 13;
}

/**
 * Returns day of week in Asia/Kolkata (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 */
function getISTDayOfWeek(date = new Date()) {
  const options = { timeZone: 'Asia/Kolkata', weekday: 'short' };
  const dayStr = new Intl.DateTimeFormat('en-US', options).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] !== undefined ? map[dayStr] : 0;
}

/**
 * Evaluates whether current IST time is within the IPO allotment discovery window.
 * Indian IPO allotment results are announced strictly in the evening and night:
 * between 7:00 PM (19:00 IST) and 2:00 AM (02:00 IST) on weekdays.
 *
 * Rules:
 * - Active Mon-Fri evenings: 19:00 - 23:59 IST (Every 5 minutes)
 * - Active Tue-Sat early mornings: 00:00 - 02:00 IST (Continuation of Mon-Fri night drops)
 * - Completely dormant outside 19:00 - 02:00 IST (no checks needed during working daytime)
 * - Completely dormant on Saturday daytime/evening & Sunday all day (no allotments announced on weekends)
 *
 * @param {Date} [date=new Date()]
 * @returns {boolean}
 */
function isIpoAllotmentCheckWindow(date = new Date()) {
  const { istHour, istMinute } = getISTDateTime(date);
  const dayOfWeek = getISTDayOfWeek(date); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // Evening segment: 19:00 (7 PM) to 23:59 IST (Monday to Friday)
  const isEveningWindow = (istHour >= 19 && istHour <= 23) && (dayOfWeek >= 1 && dayOfWeek <= 5);

  // Early morning continuation segment: 00:00 to 02:00 (2 AM) IST (Tuesday to Saturday morning)
  const isPostMidnightWindow = (istHour >= 0 && (istHour < 2 || (istHour === 2 && istMinute === 0))) && (dayOfWeek >= 2 && dayOfWeek <= 6);

  return isEveningWindow || isPostMidnightWindow;
}

// ── Official Indian Stock Market Trading Holidays (NSE & BSE) ──────────────────
// Initial bootstrap seeds for 2026 and 2027 statutory calendar.
// Can be dynamically expanded, updated, or deleted by platform administrators.
const DEFAULT_MARKET_HOLIDAYS = [
  { date: '2026-01-26', name: 'Republic Day', description: 'National Holiday' },
  { date: '2026-03-03', name: 'Holi', description: 'Trading Holiday' },
  { date: '2026-03-20', name: 'Id-Ul-Fitr (Ramzan Id)', description: 'Trading Holiday' },
  { date: '2026-04-03', name: 'Good Friday', description: 'Trading Holiday' },
  { date: '2026-04-14', name: 'Dr. Baba Saheb Ambedkar Jayanti', description: 'Statutory Holiday' },
  { date: '2026-05-01', name: 'Maharashtra Day', description: 'State Holiday' },
  { date: '2026-05-27', name: 'Bakri Id (Id-Ul-Zuha)', description: 'Trading Holiday' },
  { date: '2026-06-26', name: 'Muharram', description: 'Trading Holiday' },
  { date: '2026-08-15', name: 'Independence Day', description: 'National Holiday' },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti', description: 'National Holiday' },
  { date: '2026-10-20', name: 'Dussehra', description: 'Trading Holiday' },
  { date: '2026-11-08', name: 'Diwali Laxmi Pujan', description: 'Muhurat Trading Evening' },
  { date: '2026-11-10', name: 'Diwali Balipratipada', description: 'Trading Holiday' },
  { date: '2026-11-24', name: 'Gurunanak Jayanti', description: 'Trading Holiday' },
  { date: '2026-12-25', name: 'Christmas', description: 'National Holiday' },
  { date: '2027-01-26', name: 'Republic Day', description: 'National Holiday' },
  { date: '2027-03-22', name: 'Holi', description: 'Trading Holiday' },
  { date: '2027-03-26', name: 'Good Friday', description: 'Trading Holiday' },
  { date: '2027-04-14', name: 'Dr. Ambedkar Jayanti', description: 'Statutory Holiday' },
  { date: '2027-05-01', name: 'Maharashtra Day', description: 'State Holiday' },
  { date: '2027-08-15', name: 'Independence Day', description: 'National Holiday' },
  { date: '2027-10-02', name: 'Mahatma Gandhi Jayanti', description: 'National Holiday' },
  { date: '2027-12-25', name: 'Christmas', description: 'National Holiday' },
];

const _holidaysMap = new Map();
DEFAULT_MARKET_HOLIDAYS.forEach(h => _holidaysMap.set(h.date, { ...h, isClosed: true }));

let _lastFirestoreHolidayFetch = 0;
const HOLIDAY_CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour in-memory cache to guarantee 0 Firestore read overages

/**
 * Syncs custom and persistent holidays from Firestore system_meta/market_holidays
 */
async function syncMarketHolidaysFromFirestore(force = false) {
  const now = Date.now();
  if (!force && now - _lastFirestoreHolidayFetch < HOLIDAY_CACHE_TTL_MS) {
    return Array.from(_holidaysMap.values());
  }

  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    const docSnap = await db.collection('system_meta').doc('market_holidays').get();

    if (docSnap.exists) {
      const data = docSnap.data();
      if (Array.isArray(data?.holidays)) {
        _holidaysMap.clear();
        // Populate default baseline first, then overlay Firestore
        DEFAULT_MARKET_HOLIDAYS.forEach(h => _holidaysMap.set(h.date, { ...h, isClosed: true }));
        data.holidays.forEach(h => {
          if (h.date) {
            _holidaysMap.set(h.date, {
              date: h.date,
              name: h.name || 'Market Holiday',
              description: h.description || '',
              isClosed: h.isClosed !== false,
            });
          }
        });
      }
    }
    _lastFirestoreHolidayFetch = now;
  } catch (err) {
    // Gracefully preserve default bootstrap map on Firestore error
  }
  return Array.from(_holidaysMap.values());
}

// Background initial sync
setTimeout(() => {
  syncMarketHolidaysFromFirestore().catch(() => {});
}, 3000);

/**
 * Checks if a given date is an official Indian Market Holiday (BSE/NSE)
 */
function isMarketHoliday(date = new Date()) {
  const dateStr = typeof date === 'string' ? date : getISTDateString(date);
  const holiday = _holidaysMap.get(dateStr);
  return Boolean(holiday && holiday.isClosed);
}

/**
 * Returns holiday details if date is a market holiday, or null
 */
function getHolidayInfo(date = new Date()) {
  const dateStr = typeof date === 'string' ? date : getISTDateString(date);
  return _holidaysMap.get(dateStr) || null;
}

/**
 * Returns all configured holidays sorted chronologically
 */
function getAllMarketHolidays() {
  return Array.from(_holidaysMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Registers a new holiday in memory and returns map
 */
function setMarketHolidayInMemory(holiday) {
  if (!holiday || !holiday.date) return;
  _holidaysMap.set(holiday.date, {
    date: holiday.date,
    name: holiday.name || 'Market Holiday',
    description: holiday.description || '',
    isClosed: holiday.isClosed !== false,
  });
}

/**
 * Deletes a holiday from memory
 */
function deleteMarketHolidayFromMemory(dateStr) {
  if (!dateStr) return false;
  return _holidaysMap.delete(dateStr);
}

/**
 * Evaluates Indian Market Cadence based on IST day and hour:
 * - Unrestricted Mode: if DISABLE_CADENCE_GUARD=true, always 0 min (runs every tick)
 * - Market Holiday (BSE/NSE Closed): 30 min idle cadence, skips high-frequency 30s scraper
 * - Active Weekday Filings (Mon-Fri 08:30 - 16:00 IST): 0 min (30-second polling)
 * - Evening Results (Mon-Fri 16:00 - 23:45 IST): 2 min cadence
 * - Saturday Board Outcomes (Sat 09:00 - 23:45 IST): 5 min cadence
 * - Deep Night (23:46 - 07:29 IST) & Sunday: 30 min minimum interval
 */
function getMarketCadence(date = new Date()) {
  if (process.env.DISABLE_CADENCE_GUARD === 'true') {
    return {
      window: 'UNRESTRICTED',
      isWeekend: false,
      minIntervalMinutes: 0,
      description: 'Cadence guard disabled via environment: 0-min (full speed)',
    };
  }

  const { istHour, istMinute, dateIST } = getISTDateTime(date);
  const dayOfWeek = getISTDayOfWeek(date); // 0 = Sun, 6 = Sat
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const isWeekday = !isSunday && !isSaturday;

  const currentMinutes = istHour * 60 + istMinute;
  const t0730 = 7 * 60 + 30;   // 07:30 IST
  const t0830 = 8 * 60 + 30;   // 08:30 IST
  const t1600 = 16 * 60;       // 16:00 IST (4:00 PM)
  const t2345 = 23 * 60 + 45;  // 23:45 IST (11:45 PM)
  const t0900 = 9 * 60;        // 09:00 IST

  // 0a. Deep Night (23:46 to 07:29 IST): 30-minute cadence across all calendar days
  if (currentMinutes < t0730 || currentMinutes > t2345) {
    return {
      window: 'DEEP_NIGHT',
      isWeekend: isSaturday || isSunday,
      minIntervalMinutes: 30,
      description: 'Deep Night (23:46 - 07:29 IST): 30-minute cadence',
    };
  }

  // 0b. Official Trading Holiday Check (NSE/BSE Closed during market hours)
  // If an official holiday falls on a weekday, treat as off-market: 30m idle cadence
  const holiday = getHolidayInfo(dateIST);
  if (holiday && holiday.isClosed && isWeekday) {
    return {
      window: 'MARKET_HOLIDAY',
      isWeekend: true,
      minIntervalMinutes: 30, // 30-min idle cadence, conserving 100% bandwidth & CPU
      holidayName: holiday.name,
      description: `Market Holiday (${holiday.name}): 30-minute off-market cadence`,
    };
  }

  // 1. Weekdays Core Trading (Mon-Fri 08:30 to 16:00 IST): 30-second ultra-high-frequency polling
  // Runs on dynamic 30-second worker loop for zero-delay live statutory filing ingestion
  if (isWeekday && currentMinutes >= t0830 && currentMinutes <= t1600) {
    return {
      window: 'CORE_TRADING_HOURS',
      isWeekend: false,
      minIntervalMinutes: 0, // 0-min delay: executes on every 30s worker tick
      description: 'Weekday Core Trading (08:30 - 16:00 IST): 30-second ultra-high-frequency polling',
    };
  }

  // 2. Weekdays Evening Post-Market Results & Board Outcomes (Mon-Fri 16:00 to 23:45 IST): 2-minute cadence
  if (isWeekday && currentMinutes > t1600 && currentMinutes <= t2345) {
    return {
      window: 'EVENING_RESULTS_HOURS',
      isWeekend: false,
      minIntervalMinutes: 2, // 2-minute cadence
      description: 'Weekday Evening Results (16:00 - 23:45 IST): 2-minute cadence',
    };
  }

  // 3. Weekdays Early Pre-Market Corporate Actions (Mon-Fri 07:30 to 08:30 IST): 2-minute cadence
  if (isWeekday && currentMinutes >= t0730 && currentMinutes < t0830) {
    return {
      window: 'PRE_MARKET_HOURS',
      isWeekend: false,
      minIntervalMinutes: 2, // 2-minute cadence
      description: 'Weekday Pre-Market (07:30 - 08:30 IST): 2-minute cadence',
    };
  }

  // 4. Saturday Corporate Filings, Earnings Calls & Disclosures (09:00 to 23:45 IST): Normal 5-minute cadence
  if (isSaturday && currentMinutes >= t0900 && currentMinutes <= t2345) {
    return {
      window: 'SATURDAY_BOARD_MEETINGS',
      isWeekend: true,
      minIntervalMinutes: 5, // Normal weekend 5-minute cadence
      description: 'Saturday Corporate Filings (09:00 - 23:45 IST): 5-minute normal cadence',
    };
  }

  // 5. Sunday Off-Market: Normal 30-minute cadence
  if (isSunday) {
    return {
      window: 'SUNDAY_OFF_MARKET',
      isWeekend: true,
      minIntervalMinutes: 30, // Normal Sunday 30-minute cadence
      description: 'Sunday Off-Market: 30-minute cadence',
    };
  }

  // 6. Deep Night (23:46 to 07:29 IST): 30-minute cadence
  return {
    window: 'DEEP_NIGHT',
    isWeekend: false,
    minIntervalMinutes: 30,
    description: 'Deep Night (23:46 - 07:29 IST): 30-minute cadence',
  };
}

module.exports = {
  getISTDateTime,
  getISTDateString,
  getISTHour,
  getISTDayOfWeek,
  getMarketCadence,
  parseToISTDateString,
  isWithinIpoDispatchWindow,
  isIpoAllotmentCheckWindow,
  isMarketHoliday,
  getHolidayInfo,
  getAllMarketHolidays,
  setMarketHolidayInMemory,
  deleteMarketHolidayFromMemory,
  syncMarketHolidaysFromFirestore,
  DEFAULT_MARKET_HOLIDAYS,
};
