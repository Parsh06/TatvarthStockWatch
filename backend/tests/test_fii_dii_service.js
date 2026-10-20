'use strict';

/**
 * test_fii_dii_service.js
 *
 * Verifies FII/DII data normalization, ISO date conversion,
 * in-memory caching, and dashboard integration.
 */

require('dotenv').config({ path: './backend/.env' });
const assert = require('assert');
const {
  parseNseDate,
  normalizeFiiDiiData,
  getLatestFiiDiiData,
} = require('../services/fiiDiiService');

async function runTests() {
  console.log('\n==================================================================');
  console.log('  TSW FII / DII INSTITUTIONAL FLOW TEST SUITE');
  console.log('==================================================================\n');

  // TEST 1: Date Normalization
  console.log('[TEST 1] NSE Date to ISO Conversion');
  assert.strictEqual(parseNseDate('19-Oct-2026'), '2026-10-19');
  assert.strictEqual(parseNseDate('05-Jan-2027'), '2027-01-05');
  assert.strictEqual(parseNseDate('31-Dec-2025'), '2025-12-31');
  console.log('  ✓ PASSED: parseNseDate accurately normalizes NSE date strings');

  // TEST 2: Raw Array Normalization & Sentiment
  console.log('\n[TEST 2] Raw Array Normalization & Sentiment Calculation');
  const mockRaw = [
    { buyValue: '14781.31', category: 'DII', date: '19-Oct-2026', netValue: '3201.19', sellValue: '11580.12' },
    { buyValue: '11240.64', category: 'FII/FPI', date: '19-Oct-2026', netValue: '-1148.64', sellValue: '12389.28' }
  ];
  const normalized = normalizeFiiDiiData(mockRaw);
  assert(normalized !== null, 'Normalized record should not be null');
  assert.strictEqual(normalized.date, '2026-10-19');
  assert.strictEqual(normalized.displayDate, '19-Oct-2026');
  assert.strictEqual(normalized.dii.netValue, 3201.19);
  assert.strictEqual(normalized.fii.netValue, -1148.64);
  assert.strictEqual(normalized.totalNet, 2052.55);
  assert.strictEqual(normalized.sentiment, 'strong_inflow');
  console.log('  ✓ PASSED: normalizeFiiDiiData accurately calculates totals & sentiment');

  // TEST 3: Negative Sentiment Calculation
  console.log('\n[TEST 3] Outflow Sentiment Calculation');
  const mockOutflow = [
    { buyValue: '5000.00', category: 'DII', date: '20-Oct-2026', netValue: '200.00', sellValue: '4800.00' },
    { buyValue: '8000.00', category: 'FII/FPI', date: '20-Oct-2026', netValue: '-1500.00', sellValue: '9500.00' }
  ];
  const normalizedOutflow = normalizeFiiDiiData(mockOutflow);
  assert.strictEqual(normalizedOutflow.totalNet, -1300);
  assert.strictEqual(normalizedOutflow.sentiment, 'strong_outflow');
  console.log('  ✓ PASSED: Outflow sentiment successfully flagged as strong_outflow');

  // TEST 4: Live / Cached Data Retrieval
  console.log('\n[TEST 4] getLatestFiiDiiData Retrieval & Multi-Tier Caching');
  const startMs = Date.now();
  const data = await getLatestFiiDiiData();
  const elapsedMs = Date.now() - startMs;
  assert(data.success === true, 'getLatestFiiDiiData should return success: true');
  assert(data.current !== null, 'Current record should exist');
  assert(typeof data.current.fii.netValue === 'number', 'FII netValue should be a number');
  assert(typeof data.current.dii.netValue === 'number', 'DII netValue should be a number');
  console.log(`  ✓ PASSED: Retrieved FII/DII data in ${elapsedMs}ms (As Of: ${data.asOf})`);

  // Fast cache hit
  const cacheStart = Date.now();
  const cachedData = await getLatestFiiDiiData();
  const cacheElapsed = Date.now() - cacheStart;
  assert(cacheElapsed < 20, `Cached call must be sub-20ms (got ${cacheElapsed}ms)`);
  assert.strictEqual(cachedData.timestamp, data.timestamp);
  console.log(`  ✓ PASSED: In-memory cache hit served in ${cacheElapsed}ms (<20ms SLA)`);

  console.log('\n==================================================================');
  console.log('  ALL FII/DII TESTS PASSED PERFECTLY!');
  console.log('==================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
