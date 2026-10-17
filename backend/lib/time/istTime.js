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

  return { year, month, day, dateIST, istHour, istMinute };
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
 * Evaluates Indian Market Cadence based on IST day and hour:
 * - Unrestricted Mode: if DISABLE_CADENCE_GUARD=true, always 0 min (runs every tick)
 * - Active Weekday Filings (Mon-Fri 08:00 - 22:00 IST): 0 min (runs on every tick, zero delay)
 * - Saturday Board Outcomes (Sat 09:00 - 20:00 IST): 0 min (runs on every tick, zero delay)
 * - Late Evening (Mon-Fri 22:00 - 23:00 IST): 5 min minimum interval
 * - Deep Night (23:00 - 08:00 IST) & Sunday: 30 min minimum interval
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

  const { istHour, istMinute } = getISTDateTime(date);
  const dayOfWeek = getISTDayOfWeek(date); // 0 = Sun, 6 = Sat
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  // Saturday active corporate filing window: 08:30 to 23:45 IST
  // Earnings calls, board meeting outcomes, investor audio recordings, and SEBI disclosures
  const isSatActiveWindow = isSaturday && (
    (istHour === 8 && istMinute >= 30) ||
    (istHour >= 9 && istHour < 23) ||
    (istHour === 23 && istMinute <= 45)
  );

  if (isSatActiveWindow) {
    return {
      window: 'SATURDAY_BOARD_MEETINGS',
      isWeekend: true,
      minIntervalMinutes: 0, // Zero delay for weekend corporate announcements
      description: 'Saturday Corporate Filings & Earnings Calls (08:30 - 23:45 IST): Full speed (Zero delay)',
    };
  }

  // Weekdays (Mon-Fri) active announcement window: 07:30 to 23:45 IST
  // Pre-market, trading hours, post-market results & late-night regulatory filings
  const isWeekdayActiveWindow = !isSunday && !isSaturday && (
    (istHour === 7 && istMinute >= 30) ||
    (istHour >= 8 && istHour < 23) ||
    (istHour === 23 && istMinute <= 45)
  );

  if (isWeekdayActiveWindow) {
    return {
      window: 'ACTIVE_ANNOUNCEMENT_HOURS',
      isWeekend: false,
      minIntervalMinutes: 0, // Unrestricted, run on every tick for zero delay!
      description: 'Active Corporate Announcement Window (07:30 - 23:45 IST): Full speed (Zero delay)',
    };
  }

  if (isSunday) {
    return {
      window: 'WEEKEND',
      isWeekend: true,
      minIntervalMinutes: 30,
      description: 'Sunday Off-Market: 30-min cadence',
    };
  }

  // Deep Night: 23:46 to 07:29 IST (zero market/corporate disclosures occur during this window)
  return {
    window: 'DEEP_NIGHT',
    isWeekend: false,
    minIntervalMinutes: 30,
    description: 'Deep Night (23:46 - 07:29 IST): 30-min cadence',
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
};
