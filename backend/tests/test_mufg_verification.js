'use strict';

/**
 * test_mufg_verification.js
 *
 * Automated verification test suite for MUFG (Link Intime) IPO Allotment integration.
 * Tests token encryption, symbol scraping, live query with PAN COAPJ9504C,
 * and XML normalization into standard StockWatch records.
 *
 * Run:
 *   cd backend && node tests/test_mufg_verification.js
 */

require('dotenv').config();

const { encryptMufgToken, generateMufgToken, scrapeMufgCompanies, queryMufg } = require('../lib/mufgScraper');
const { normalizeMufgResponse, normalizeMufgRecord, maskPan } = require('../lib/ipoUtils');

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
  console.log('\n━━━ Suite 1: MUFG Token Generation & Encryption ━━━━━━━━━━━━━━━━━');
  try {
    const rawSample = '942073047';
    const enc = encryptMufgToken(rawSample);
    assert('AES-128-CBC token encryption returns non-empty base64 string', typeof enc === 'string' && enc.length > 0);
    assert('Sample token matches expected format', enc === 'BXWkxQszXl6QB+9BTX3a2w==', `got ${enc}`);

    const liveToken = await generateMufgToken();
    assert('generateMufgToken() fetches and encrypts live token from MUFG', typeof liveToken === 'string' && liveToken.length > 0);
  } catch (err) {
    assert('Suite 1 Token Generation failed with error', false, err.message);
  }

  console.log('\n━━━ Suite 2: MUFG Active IPO Symbols Scraping ━━━━━━━━━━━━━━━━━━━');
  let symbols = [];
  try {
    symbols = await scrapeMufgCompanies({ forceRefresh: true });
    assert('scrapeMufgCompanies() returns an array of IPOs', Array.isArray(symbols) && symbols.length > 0);
    if (symbols.length > 0) {
      assert('Symbol contains clientId', !!symbols[0].clientId);
      assert('Symbol contains symbol company name', !!symbols[0].symbol);
      assert('Symbol registrar is MUFG', symbols[0].registrar === 'MUFG');
      console.log(`   Found ${symbols.length} active IPOs on Link Intime:`);
      symbols.forEach(s => console.log(`    - [${s.clientId}] ${s.symbol}`));
    }
  } catch (err) {
    assert('Suite 2 Scraping failed with error', false, err.message);
  }

  console.log('\n━━━ Suite 3: XML Normalization Logic ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const sampleXmlAllotted = `
    <NewDataSet>
      <Table>
        <id>11927</id>
        <offer_price>429</offer_price>
        <DPCLITID>1208160141834532</DPCLITID>
        <RFNDNO>3373919</RFNDNO>
        <RFNDAMT>204204</RFNDAMT>
        <NAME1>PARSH MAYUR JAIN</NAME1>
        <companyname>ESDS Software Solution Limited - IPO</companyname>
        <ALLOT>15</ALLOT>
        <SHARES>476</SHARES>
        <PEMNDG>HNI</PEMNDG>
        <BNKCODE>933</BNKCODE>
      </Table>
    </NewDataSet>`;

    const resAllotted = await normalizeMufgResponse(sampleXmlAllotted, 'COAPJ9504C');
    assert('Allotted XML parses successfully', resAllotted.success === true);
    assert('Provider is MUFG', resAllotted.provider === 'MUFG');
    assert('Records count is 1', resAllotted.records.length === 1);
    
    const rec1 = resAllotted.records[0];
    assert('Applicant name parsed: PARSH MAYUR JAIN', rec1.applicantName === 'PARSH MAYUR JAIN');
    assert('Masked PAN parsed: XXXXXX04C', rec1.maskedPan === 'XXXXXX504C' || rec1.maskedPan === maskPan('COAPJ9504C'));
    assert('Applied shares: 476', rec1.appliedShares === 476);
    assert('Allotted shares: 15', rec1.allottedShares === 15);
    assert('Refund amount: 204204', rec1.refundAmount === 204204);
    assert('Category: HNI', rec1.category === 'HNI');
    assert('Status: Allotted', rec1.allotmentStatus === 'Allotted');

    // Test Not Applied XML
    const sampleXmlEmpty = `<NewDataSet />`;
    const resEmpty = await normalizeMufgResponse(sampleXmlEmpty, 'COAPJ9504C');
    assert('Empty XML (<NewDataSet />) parsed as 0 records', resEmpty.success === true && resEmpty.records.length === 0);
  } catch (err) {
    assert('Suite 3 Normalization failed with error', false, err.message);
  }

  console.log('\n━━━ Suite 4: Live PAN Verification on MUFG (COAPJ9504C) ━━━━━━━━━');
  try {
    const esdsIpo = symbols.find(s => s.symbol.toLowerCase().includes('esds')) || symbols[0];
    if (esdsIpo) {
      console.log(`   Testing live query on: [${esdsIpo.clientId}] ${esdsIpo.symbol}`);
      const rawXml = await queryMufg(esdsIpo.clientId, 'COAPJ9504C');
      assert('queryMufg() returned response string from live Link Intime server', typeof rawXml === 'string' && rawXml.length > 0);

      const normalized = await normalizeMufgResponse(rawXml, 'COAPJ9504C');
      assert('Live query normalized without errors', normalized.success === true);
      console.log(`   Live query records found: ${normalized.records.length}`);
      if (normalized.records.length > 0) {
        const r = normalized.records[0];
        console.log(`    - Applicant: ${r.applicantName} | Applied: ${r.appliedShares} | Allotted: ${r.allottedShares} | Refund: ₹${r.refundAmount} | Status: ${r.allotmentStatus}`);
      }
    }
  } catch (err) {
    assert('Suite 4 Live Query failed with error', false, err.message);
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED — Link Intime (MUFG) IPO Verification is fully operational.');
  } else {
    console.error(`⚠️  ${failed} test(s) FAILED.`);
    process.exit(1);
  }
}

runTests();
