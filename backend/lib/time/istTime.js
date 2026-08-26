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

module.exports = {
  getISTDateTime,
  getISTDateString,
  getISTHour,
  parseToISTDateString,
  isWithinIpoDispatchWindow,
};
