'use strict';

const assert = require('assert');
const { getMarketCadence } = require('../lib/time/istTime');

console.log('--- Testing Zero-Delay Announcement & Market Cadence Engine ---');

function makeISTDate(year, month, day, hourIST, minuteIST) {
  const totalMinutesIST = hourIST * 60 + minuteIST;
  const totalMinutesUTC = totalMinutesIST - 330;
  return new Date(Date.UTC(year, month - 1, day, 0, totalMinutesUTC, 0));
}

// 1. Saturday Daytime Filings & Board Meetings (Saturday 2026-10-17 12:00 IST)
const satDay = makeISTDate(2026, 10, 17, 12, 0);
const satDayCadence = getMarketCadence(satDay);
assert.strictEqual(satDayCadence.window, 'SATURDAY_BOARD_MEETINGS', 'Saturday daytime must be SATURDAY_BOARD_MEETINGS');
assert.strictEqual(satDayCadence.minIntervalMinutes, 0, 'Saturday daytime cadence must be 0 min (zero delay for board meetings)');
console.log('✅ Saturday Board Meeting Window: 0-min (Zero delay!)');

// 2. Active Weekday Market Hours (Wednesday 2026-10-14 11:15 IST)
const marketDate = makeISTDate(2026, 10, 14, 11, 15);
const marketCadence = getMarketCadence(marketDate);
assert.strictEqual(marketCadence.window, 'ACTIVE_ANNOUNCEMENT_HOURS');
assert.strictEqual(marketCadence.minIntervalMinutes, 0, 'Weekday trading must have 0 min delay');
console.log('✅ Active Trading Hours (11:15 IST): 0-min (Zero delay!)');

// 3. Post-Market Evening Results Window (Thursday 2026-10-15 18:30 IST)
const postMarketDate = makeISTDate(2026, 10, 15, 18, 30);
const postMarketCadence = getMarketCadence(postMarketDate);
assert.strictEqual(postMarketCadence.window, 'ACTIVE_ANNOUNCEMENT_HOURS');
assert.strictEqual(postMarketCadence.minIntervalMinutes, 0, 'Evening results must have 0 min delay');
console.log('✅ Post-Market Results Window (18:30 IST): 0-min (Zero delay!)');

// 4. Sunday Off-Market (Sunday 2026-10-18 15:30 IST)
const sunDate = makeISTDate(2026, 10, 18, 15, 30);
const sunCadence = getMarketCadence(sunDate);
assert.strictEqual(sunCadence.window, 'WEEKEND');
assert.strictEqual(sunCadence.minIntervalMinutes, 30);
console.log('✅ Sunday Off-Market: 30-min cadence');

// 5. Deep Night (Tuesday 2026-10-13 02:30 IST)
const nightDate = makeISTDate(2026, 10, 13, 2, 30);
const nightCadence = getMarketCadence(nightDate);
assert.strictEqual(nightCadence.window, 'DEEP_NIGHT');
assert.strictEqual(nightCadence.minIntervalMinutes, 30);
console.log('✅ Deep Night (02:30 IST): 30-min cadence');

// 6. DISABLE_CADENCE_GUARD override (Simulating Render Worker)
process.env.DISABLE_CADENCE_GUARD = 'true';
const overrideCadence = getMarketCadence(nightDate);
assert.strictEqual(overrideCadence.minIntervalMinutes, 0, 'Render worker with DISABLE_CADENCE_GUARD must have 0 min delay 24/7');
delete process.env.DISABLE_CADENCE_GUARD;
console.log('✅ Render 24/7 Mode (DISABLE_CADENCE_GUARD=true): 0-min (Zero delay 24/7!)');

console.log('\nAll Zero-Delay & Market Cadence tests passed successfully! 🚀');
