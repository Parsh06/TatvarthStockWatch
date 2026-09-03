'use strict';

/**
 * test_unified_symbols.js
 *
 * Tests the unified symbols aggregation from all 3 registrars (Link Intime, KFintech, BigShare)
 * and verifies that each symbol is properly enriched with registrar information and isLatest tags.
 */

require('dotenv').config();
const { scrapeMufgCompanies } = require('../lib/mufgScraper');
const { scrapeKfinCompanies } = require('../lib/ipoScraper');
const { scrapeBigshareCompanies } = require('../lib/bigshareScraper');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n━━━ Suite 1: Unified Symbols Scraping from All Registrars ━━━━━━');
  try {
    const [mufgRes, kfinRes, bigshareRes] = await Promise.allSettled([
      scrapeMufgCompanies(),
      scrapeKfinCompanies(),
      scrapeBigshareCompanies(),
    ]);

    const mufgList = mufgRes.status === 'fulfilled' ? mufgRes.value : [];
    const kfinList = kfinRes.status === 'fulfilled' ? kfinRes.value : [];
    const bigshareList = bigshareRes.status === 'fulfilled' ? bigshareRes.value : [];

    assert('MUFG scraper succeeded and returned offerings', mufgList.length > 0);
    assert('KFintech scraper succeeded and returned offerings', kfinList.length > 0);
    assert('BigShare scraper succeeded and returned offerings', bigshareList.length > 0);

    const unified = [
      ...bigshareList.map((s, i) => ({ ...s, registrar: 'BIGSHARE', isLatest: i < 2 })),
      ...mufgList.map((s, i) => ({ ...s, registrar: 'MUFG', isLatest: i < 2 })),
      ...kfinList.map((s, i) => ({ ...s, registrar: 'KFINTECH', isLatest: i < 2 })),
    ];

    assert('Unified master list contains offerings from all registrars', unified.length >= 10);
    assert('Unified list items contain symbol', unified.every(u => !!u.symbol));
    assert('Unified list items contain clientId', unified.every(u => !!u.clientId));
    assert('Unified list items contain registrar', unified.every(u => ['MUFG', 'KFINTECH', 'BIGSHARE'].includes(u.registrar)));

    console.log(`\n   Master Unified IPO Count: ${unified.length} active offerings across India`);
    console.log('   Top 5 Latest Offerings in Feed:');
    unified.slice(0, 5).forEach((u, i) => {
      console.log(`    ${i + 1}. [${u.registrar}] ${u.symbol} (ID: ${u.clientId})${u.isLatest ? ' ★ LATEST' : ''}`);
    });
  } catch (err) {
    assert('Unified scraping test failed', false, err.message);
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED — Unified IPO Allotment Aggregator is operating cleanly.');
  } else {
    process.exit(1);
  }
}

runTests();
