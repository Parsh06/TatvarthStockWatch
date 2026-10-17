'use strict';

const assert = require('assert');
const { getMarketCadence } = require('../lib/time/istTime');

console.log('--- Testing Zero-Delay Announcement & Market Cadence Engine ---');

function makeISTDate(year, month, day, hourIST, minuteIST) {
  const totalMinutesIST = hourIST * 60 + minuteIST;
  const totalMinutesUTC = totalMinutesIST - 330;
  return new Date(Date.UTC(year, month - 1, day, 0, totalMinutesUTC, 0));
}

// 1. Weekday Core Trading Hours (Wednesday 2026-10-14 11:15 IST) - 1-minute polling
const marketDate = makeISTDate(2026, 10, 14, 11, 15);
const marketCadence = getMarketCadence(marketDate);
assert.strictEqual(marketCadence.window, 'CORE_TRADING_HOURS');
assert.strictEqual(marketCadence.minIntervalMinutes, 0, 'Weekday trading must have 0 min delay (runs every 60s)');
console.log('✅ Weekday Core Trading (11:15 IST): 0-min (1-minute polling!)');

// 1b. Weekday Core Trading Pre-Open (Friday 2026-10-16 08:35 IST) - 1-minute polling
const preOpenDate = makeISTDate(2026, 10, 16, 8, 35);
const preOpenCadence = getMarketCadence(preOpenDate);
assert.strictEqual(preOpenCadence.window, 'CORE_TRADING_HOURS');
assert.strictEqual(preOpenCadence.minIntervalMinutes, 0, '08:35 IST must be 1-minute polling');
console.log('✅ Weekday Market Pre-Open (08:35 IST): 0-min (1-minute polling!)');

// 2. Post-Market Evening Results Window (Thursday 2026-10-15 18:30 IST) - 2-minute cadence
const postMarketDate = makeISTDate(2026, 10, 15, 18, 30);
const postMarketCadence = getMarketCadence(postMarketDate);
assert.strictEqual(postMarketCadence.window, 'EVENING_RESULTS_HOURS');
assert.strictEqual(postMarketCadence.minIntervalMinutes, 2, 'Evening results must have 2 min cadence');
console.log('✅ Weekday Evening Results (18:30 IST): 2-min cadence');

// 3. Early Pre-Market Corporate Actions (Monday 2026-10-12 08:00 IST) - 2-minute cadence
const earlyDate = makeISTDate(2026, 10, 12, 8, 0);
const earlyCadence = getMarketCadence(earlyDate);
assert.strictEqual(earlyCadence.window, 'PRE_MARKET_HOURS');
assert.strictEqual(earlyCadence.minIntervalMinutes, 2, 'Early pre-market must have 2 min cadence');
console.log('✅ Weekday Early Pre-Market (08:00 IST): 2-min cadence');

// 4. Saturday Daytime Board Meetings & Corporate Filings (Saturday 2026-10-17 12:00 IST) - 5-min normal cadence
const satDay = makeISTDate(2026, 10, 17, 12, 0);
const satDayCadence = getMarketCadence(satDay);
assert.strictEqual(satDayCadence.window, 'SATURDAY_BOARD_MEETINGS');
assert.strictEqual(satDayCadence.minIntervalMinutes, 5, 'Saturday daytime must be 5-minute normal cadence');
console.log('✅ Saturday Board Meeting Window (12:00 IST): 5-min normal cadence');

// 4b. Saturday Late-Night Earnings Calls & Audio Disclosures (Saturday 2026-10-17 23:15 IST) - 5-min normal cadence
const satNight = makeISTDate(2026, 10, 17, 23, 15);
const satNightCadence = getMarketCadence(satNight);
assert.strictEqual(satNightCadence.window, 'SATURDAY_BOARD_MEETINGS');
assert.strictEqual(satNightCadence.minIntervalMinutes, 5, 'Saturday late night must be 5-minute normal cadence');
console.log('✅ Saturday Late Night Earnings Window (23:15 IST): 5-min normal cadence');

// 5. Sunday Off-Market (Sunday 2026-10-18 15:30 IST) - 30-min cadence
const sunDate = makeISTDate(2026, 10, 18, 15, 30);
const sunCadence = getMarketCadence(sunDate);
assert.strictEqual(sunCadence.window, 'SUNDAY_OFF_MARKET');
assert.strictEqual(sunCadence.minIntervalMinutes, 30);
console.log('✅ Sunday Off-Market: 30-min cadence');

// 6. Deep Night (Tuesday 2026-10-13 02:30 IST) - 30-min cadence
const nightDate = makeISTDate(2026, 10, 13, 2, 30);
const nightCadence = getMarketCadence(nightDate);
assert.strictEqual(nightCadence.window, 'DEEP_NIGHT');
assert.strictEqual(nightCadence.minIntervalMinutes, 30);
console.log('✅ Deep Night (02:30 IST): 30-min cadence');

// 7. DISABLE_CADENCE_GUARD override (Simulating Render Worker)
process.env.DISABLE_CADENCE_GUARD = 'true';
const overrideCadence = getMarketCadence(nightDate);
assert.strictEqual(overrideCadence.minIntervalMinutes, 0, 'Render worker with DISABLE_CADENCE_GUARD must have 0 min delay 24/7');
delete process.env.DISABLE_CADENCE_GUARD;
console.log('✅ Render 24/7 Mode (DISABLE_CADENCE_GUARD=true): 0-min (Zero delay 24/7!)');

console.log('\nAll 1-Minute Core Market & Weekend Cadence tests passed successfully! 🚀');
