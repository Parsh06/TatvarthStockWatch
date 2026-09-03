'use strict';

/**
 * test_bigshare_verification.js
 *
 * Automated verification test suite for BigShare Online IPO Allotment integration.
 * Tests active company scraping, Captcha challenge retrieval, Gemini AI Vision OCR solving,
 * live query with real PAN COAPJ9504C, and normalization into standard StockWatch records.
 *
 * Run:
 *   cd backend && node tests/test_bigshare_verification.js
 */

require('dotenv').config();

const { scrapeBigshareCompanies, getBigshareCaptcha, solveBigshareCaptcha, queryBigshare } = require('../lib/bigshareScraper');
const { normalizeBigshareResponse, normalizeBigshareRecord, maskPan } = require('../lib/ipoUtils');

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
  console.log('\n━━━ Suite 1: BigShare Active IPO Symbols Scraping ━━━━━━━━━━━━━');
  let companies = [];
  try {
    companies = await scrapeBigshareCompanies({ forceRefresh: true });
    assert('scrapeBigshareCompanies() returns an array', Array.isArray(companies) && companies.length > 0);
    if (companies.length > 0) {
      assert('Company contains clientId', !!companies[0].clientId);
      assert('Company contains symbol text', !!companies[0].symbol);
      assert('Registrar is BIGSHARE', companies[0].registrar === 'BIGSHARE');
      console.log(`   Found ${companies.length} active IPOs on BigShare Online:`);
      companies.forEach(c => console.log(`    - [${c.clientId}] ${c.symbol}`));
    }
  } catch (err) {
    assert('Suite 1 Scraping failed with error', false, err.message);
  }

  console.log('\n━━━ Suite 2: BigShare Captcha & Gemini AI OCR Solver ━━━━━━━━━━');
  let sampleCaptcha;
  try {
    sampleCaptcha = await getBigshareCaptcha();
    assert('getBigshareCaptcha() returns token and base64 image', !!sampleCaptcha.token && !!sampleCaptcha.image);
    assert('Captcha image has valid data URI header', sampleCaptcha.image.startsWith('data:image/'));

    const solved = await solveBigshareCaptcha(sampleCaptcha.image);
    assert('Gemini AI Vision solves captcha to 6-digit numeric string', typeof solved === 'string' && solved.length === 6 && /^[0-9]{6}$/.test(solved));
    console.log(`   Solved Captcha: ${solved} (Token: ${sampleCaptcha.token.substring(0, 25)}...)`);
  } catch (err) {
    assert('Suite 2 Captcha Solver failed with error', false, err.message);
  }

  console.log('\n━━━ Suite 3: BigShare Response Normalization Logic ━━━━━━━━━━━━━');
  try {
    const sampleRecordAllotted = {
      __type: 'Data+Company',
      APPLICATION_NO: 'CNRB00002051',
      DPID: '1208160141834532',
      Name: 'PARSH MAYUR JAIN',
      APPLIED: '3200',
      ALLOTED: '1600',
      Status: 'OK',
      MatchCount: 1,
      Records: [
        {
          APPLICATION_NO: 'CNRB00002051',
          DPID: '1208160141834532',
          Name: 'PARSH MAYUR JAIN',
          APPLIED: '3200',
          ALLOTED: '1600',
        },
      ],
    };

    const resAllotted = normalizeBigshareResponse(sampleRecordAllotted, 'COAPJ9504C');
    assert('Allotted response parses successfully', resAllotted.success === true);
    assert('Provider is BIGSHARE', resAllotted.provider === 'BIGSHARE');
    assert('Records count is 1', resAllotted.records.length === 1);
    
    const rec1 = resAllotted.records[0];
    assert('Applicant name parsed: PARSH MAYUR JAIN', rec1.applicantName === 'PARSH MAYUR JAIN');
    assert('Masked PAN parsed: XXXXXX504C', rec1.maskedPan === 'XXXXXX504C' || rec1.maskedPan === maskPan('COAPJ9504C'));
    assert('Applied shares: 3200', rec1.appliedShares === 3200);
    assert('Allotted shares: 1600', rec1.allottedShares === 1600);
    assert('Status: Allotted', rec1.allotmentStatus === 'Allotted');

    // Non-Allotted test
    const sampleRecordNonAllotted = {
      ...sampleRecordAllotted,
      ALLOTED: 'NON-ALLOTTE',
      Records: [{ ...sampleRecordAllotted.Records[0], ALLOTED: 'NON-ALLOTTE' }],
    };
    const resNon = normalizeBigshareResponse(sampleRecordNonAllotted, 'COAPJ9504C');
    assert('Non-allotted shares parsed as 0', resNon.records[0].allottedShares === 0);
    assert('Status: Not Allotted', resNon.records[0].allotmentStatus === 'Not Allotted');

    // Not Applied (NOTFOUND) test
    const sampleRecordNotFound = {
      Status: 'NOTFOUND',
      Message: 'No data found',
      DPID: 'No data found',
      MatchCount: 0,
      Records: [],
    };
    const resNotFound = normalizeBigshareResponse(sampleRecordNotFound, 'COAPJ9504C');
    assert('NOTFOUND parsed as 0 records (Not Applied)', resNotFound.success === true && resNotFound.records.length === 0);
  } catch (err) {
    assert('Suite 3 Normalization failed with error', false, err.message);
  }

  console.log('\n━━━ Suite 4: Live PAN Verification on BigShare (COAPJ9504C) ━━━━━');
  try {
    const kwickIpo = companies.find(c => c.clientId === '591' || c.symbol.toLowerCase().includes('kwick')) || companies[0];
    if (kwickIpo) {
      console.log(`   Testing live query on: [${kwickIpo.clientId}] ${kwickIpo.symbol}`);
      const rawData = await queryBigshare(kwickIpo.clientId, 'COAPJ9504C');
      assert('queryBigshare() returned data object from live BigShare server', !!rawData && typeof rawData === 'object');

      const normalized = normalizeBigshareResponse(rawData, 'COAPJ9504C');
      assert('Live query normalized without errors', normalized.success === true);
      console.log(`   Live query records found: ${normalized.records.length}`);
      if (normalized.records.length > 0) {
        const r = normalized.records[0];
        console.log(`    - Applicant: ${r.applicantName} | Applied: ${r.appliedShares} | Allotted: ${r.allottedShares} | Status: ${r.allotmentStatus}`);
      }
    }
  } catch (err) {
    assert('Suite 4 Live Query failed with error', false, err.message);
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED — BigShare Online IPO Verification is fully operational.');
  } else {
    console.error(`⚠️  ${failed} test(s) FAILED.`);
    process.exit(1);
  }
}

runTests();
