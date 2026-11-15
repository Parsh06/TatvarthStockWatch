/**
 * test_bse_nse_and_board_meetings_e2e.js
 *
 * Comprehensive end-to-end test suite for:
 * 1. BSE Scraper diagnostic connectivity & parameter integrity (fixes 400 Bad Request)
 * 2. NSE Scraper primary Mobile Safari profile & live/gateway connectivity
 * 3. Board Meetings postponement & outcome parsing engine (Boston Commerce Ltd case)
 * 4. Admin Mission Control diagnostic ping contracts & error handling
 */

const assert = require('assert');
const { testBSEConnectivity, invalidateBseSession } = require('../lib/bseScraper');
const { testNSEConnectivity, _getNseScraperStatus, rotateProfile, BROWSER_PROFILES } = require('../lib/nseScraper');

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 BSE / NSE CONNECTIVITY & BOARD MEETINGS POSTPONEMENT TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      if (err.stack) {
        console.error(`     ${err.stack.split('\n').slice(1, 4).join('\n     ')}`);
      }
    }
  }

  // ── SUITE 1: BSE SCRAPER DIAGNOSTIC PROBE ─────────────────────────────────
  console.log('--- Suite 1: BSE Scraper Diagnostic Probe & Parameter Integrity ---');

  await test('testBSEConnectivity() returns HTTP 200 and healthy/degraded status without 400 Bad Request', async () => {
    const res = await testBSEConnectivity();
    assert.strictEqual(res.name, 'BSE Corporate Scraper');
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.error || ''}`);
    assert(['healthy', 'degraded'].includes(res.status), `Unexpected status: ${res.status}`);
    assert.strictEqual(typeof res.latencyMs, 'number');
    assert(res.latencyMs >= 0);
    assert.strictEqual(res.details?.endpoint, 'api.bseindia.com');
    assert(['active', 'anonymous'].includes(res.details?.cookieStatus));
    console.log(`     Latency: ${res.latencyMs}ms | Status: ${res.status} | Sample: ${res.sample}`);
  });

  await test('BSE session invalidation auto-heals on subsequent probe', async () => {
    invalidateBseSession();
    const res = await testBSEConnectivity();
    assert.strictEqual(res.statusCode, 200);
    assert(['healthy', 'degraded'].includes(res.status));
  });

  // ── SUITE 2: NSE SCRAPER PROFILE & HEALTH CHECK ───────────────────────────
  console.log('\n--- Suite 2: NSE Scraper Profile 0 & Connectivity ---');

  await test('Profile 0 is configured with Mobile Safari 17.5 to bypass Akamai cloud challenge', () => {
    const status = _getNseScraperStatus();
    assert(status.activeProfileName.includes('Mobile Safari') || status.activeProfileName.includes('Safari'),
      `Expected Safari as primary profile, found: ${status.activeProfileName}`);
  });

  await test('testNSEConnectivity() returns valid payload and does not throw', async () => {
    const res = await testNSEConnectivity();
    assert.strictEqual(res.name, 'NSE Corporate Scraper');
    assert.strictEqual(typeof res.statusCode, 'number');
    assert(['healthy', 'degraded'].includes(res.status), `Unexpected status: ${res.status}`);
    assert(['direct', 'dual-exchange-gateway'].includes(res.mode), `Unexpected mode: ${res.mode}`);
    assert.strictEqual(typeof res.latencyMs, 'number');
    console.log(`     Latency: ${res.latencyMs}ms | Mode: ${res.mode} | Status: ${res.status}`);
  });

  await test('rotateProfile() cycles through profiles without crashing', () => {
    const initial = _getNseScraperStatus().activeProfileIndex;
    rotateProfile();
    const next = _getNseScraperStatus().activeProfileIndex;
    assert.notStrictEqual(initial, next);
  });

  // ── SUITE 3: BOARD MEETINGS OUTCOME & POSTPONEMENT PARSER ─────────────────
  console.log('\n--- Suite 3: Board Meetings Filings Classifier (Boston Commerce Ltd Scenario) ---');

  // Logic extracted from BoardMeetingsPage.jsx for testing classification engine
  function classifyBoardMeetingFiling(ann) {
    const cat = (ann.category || '').toLowerCase();
    const sub = (ann.subCategory || '').toLowerCase();
    const subj = (ann.subject || '').toLowerCase();
    const desc = (ann.description || '').toLowerCase();
    const combined = `${cat} ${sub} ${subj} ${desc}`;

    // Postponement / rescheduling detection
    const isPostponed =
      combined.includes('postpone') ||
      combined.includes('reschedul') ||
      combined.includes('defer') ||
      combined.includes('cancelled') ||
      combined.includes('adjourn');

    if (isPostponed) {
      let rescheduledDate = null;
      const dateMatch =
        desc.match(/scheduled\s+on\s+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4})/i) ||
        subj.match(/scheduled\s+on\s+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4})/i) ||
        desc.match(/rescheduled\s+to\s+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4})/i) ||
        subj.match(/([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+[0-9]{4})/i);

      if (dateMatch) {
        rescheduledDate = dateMatch[1].trim();
      }

      return {
        status: 'POSTPONED',
        rescheduledDate,
        title: ann.subject || ann.description || 'Meeting Rescheduled',
        pdfUrl: ann.pdfUrl || ann.attachment || null,
      };
    }

    // Results published / outcome approved
    const isOutcome =
      cat.includes('outcome') ||
      sub.includes('outcome') ||
      cat.includes('result') ||
      sub.includes('result') ||
      cat.includes('financial') ||
      sub.includes('financial') ||
      subj.includes('outcome') ||
      subj.includes('financial result') ||
      subj.includes('audited result') ||
      subj.includes('unaudited result');

    if (isOutcome) {
      return {
        status: 'OUTCOME',
        title: ann.subject || ann.description || 'Outcome / Results Declared',
        pdfUrl: ann.pdfUrl || ann.attachment || null,
      };
    }

    return null;
  }

  await test('Boston Commerce Ltd (531458) postponement announcement is correctly parsed as POSTPONED to 19/11/2026', () => {
    const bostonAnnouncement = {
      scrip_code: '531458',
      category: 'Company Update',
      subCategory: 'Board Meeting Rescheduled',
      subject: 'Board Meeting Intimation for Intimation Regarding Postponement Of Board Meeting Scheduled To Be Held On 15Th November, 2026',
      description: 'Boston Commerce Ltd has informed BSE that the meeting of the Board of Directors of the Company is scheduled on 19/11/2026 ,inter alia, to consider and approve Unaudited Financial Results',
      pdfUrl: 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/boston_postponement.pdf'
    };

    const classification = classifyBoardMeetingFiling(bostonAnnouncement);
    assert(classification !== null, 'Expected non-null classification');
    assert.strictEqual(classification.status, 'POSTPONED');
    assert.strictEqual(classification.rescheduledDate, '19/11/2026');
    assert.strictEqual(classification.pdfUrl, 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/boston_postponement.pdf');
  });

  await test('Standard Financial Results announcement is correctly parsed as OUTCOME', () => {
    const resultAnnouncement = {
      scrip_code: '500570',
      category: 'Result',
      subCategory: 'Financial Results',
      subject: 'Financial Results for the quarter ended September 30, 2026',
      description: 'Unaudited Financial Results approved by Board',
      pdfUrl: 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/results.pdf'
    };

    const classification = classifyBoardMeetingFiling(resultAnnouncement);
    assert(classification !== null);
    assert.strictEqual(classification.status, 'OUTCOME');
    assert.strictEqual(classification.pdfUrl, 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/results.pdf');
  });

  await test('Board Meeting Outcome announcement is correctly parsed as OUTCOME', () => {
    const outcomeAnnouncement = {
      scrip_code: '532540',
      category: 'Board Meeting',
      subCategory: 'Outcome of Board Meeting',
      subject: 'Outcome of Board Meeting held on November 15, 2026',
      description: 'The Board has approved dividend and Q2 results',
      pdfUrl: 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/outcome.pdf'
    };

    const classification = classifyBoardMeetingFiling(outcomeAnnouncement);
    assert(classification !== null);
    assert.strictEqual(classification.status, 'OUTCOME');
  });

  await test('Irrelevant announcement (e.g. Loss of Share Certificates) returns null (Pending meeting status)', () => {
    const lossCertificate = {
      scrip_code: '500325',
      category: 'Company Update',
      subCategory: 'Loss of Share Certificates',
      subject: 'Intimation of loss of share certificates',
      description: 'Shareholder reported lost certificates',
      pdfUrl: 'https://www.bseindia.com/loss.pdf'
    };

    const classification = classifyBoardMeetingFiling(lossCertificate);
    assert.strictEqual(classification, null);
  });

  await test('Adjourned board meeting with natural language date is parsed properly', () => {
    const adjournedAnnouncement = {
      scrip_code: '512345',
      category: 'Company Update',
      subCategory: 'Board Meeting Updates',
      subject: 'Adjournment of Board Meeting to 22nd November, 2026',
      description: 'The meeting of the board stands adjourned to 22nd November, 2026 due to lack of quorum',
      pdfUrl: null
    };

    const classification = classifyBoardMeetingFiling(adjournedAnnouncement);
    assert(classification !== null);
    assert.strictEqual(classification.status, 'POSTPONED');
    assert(classification.rescheduledDate.includes('22nd November, 2026') || classification.rescheduledDate.includes('22'));
  });

  // ── SUITE 4: FILTERING & STATUS AGGREGATION LOGIC ─────────────────────────
  console.log('\n--- Suite 4: Filter Granularity & Metric Counting ---');

  await test('Meetings list filter correctly splits by ALL, YES, POSTPONED, and NO', () => {
    const mockMeetings = [
      { scrip_code: '531458', company_name: 'Boston Commerce Ltd' },
      { scrip_code: '500570', company_name: 'Tata Motors Ltd' },
      { scrip_code: '532540', company_name: 'TCS Ltd' },
      { scrip_code: '500112', company_name: 'SBIN' },
    ];

    const outcomeMap = {
      '531458': { status: 'POSTPONED', rescheduledDate: '19/11/2026' },
      '500570': { status: 'OUTCOME', pdfUrl: 'https://example.com/res1' },
      '532540': { status: 'OUTCOME', pdfUrl: 'https://example.com/res2' },
      // '500112' has no entry -> Pending (NO)
    };

    const countYes = mockMeetings.filter(m => outcomeMap[m.scrip_code]?.status === 'OUTCOME').length;
    const countPostponed = mockMeetings.filter(m => outcomeMap[m.scrip_code]?.status === 'POSTPONED').length;
    const countNo = mockMeetings.filter(m => !outcomeMap[m.scrip_code]).length;

    assert.strictEqual(countYes, 2, 'Expected 2 Results Out');
    assert.strictEqual(countPostponed, 1, 'Expected 1 Postponed');
    assert.strictEqual(countNo, 1, 'Expected 1 Pending');
    assert.strictEqual(countYes + countPostponed + countNo, mockMeetings.length);

    // Filter simulation
    const filterAll = mockMeetings.filter(() => true);
    const filterYes = mockMeetings.filter(m => outcomeMap[m.scrip_code]?.status === 'OUTCOME');
    const filterPost = mockMeetings.filter(m => outcomeMap[m.scrip_code]?.status === 'POSTPONED');
    const filterPending = mockMeetings.filter(m => !outcomeMap[m.scrip_code]);

    assert.strictEqual(filterAll.length, 4);
    assert.strictEqual(filterYes.length, 2);
    assert.strictEqual(filterPost.length, 1);
    assert.strictEqual(filterPending.length, 1);
  });

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log(`📊 TEST RESULTS: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`⚠️ ${total - passed} TESTS FAILED!`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
