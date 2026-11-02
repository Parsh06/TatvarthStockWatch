'use strict';

/**
 * test_allotment_odds_and_probability_logic.js
 *
 * Exhaustive Test Suite for IPO Allotment Odds, SEBI Application Limits,
 * Family PAN Binomial Multiplier, and Strategic Advisor Logic.
 *
 * Suites:
 *  1. computeLotApplications: Standard Mainboard IPO (Bombay Coated)
 *  2. computeLotApplications: SME High-Ticket IPO (Antala Industries)
 *  3. computeLotApplications: Boundary & Corrupt Inputs (0, negative, strings, commas)
 *  4. computeAllotmentOdds: Heavily Oversubscribed Multipliers & Draw of Lots
 *  5. computeAllotmentOdds: Undersubscribed Multipliers (< 1.0x Guaranteed)
 *  6. computeAllotmentOdds: Exact 1.00x Parity Boundary
 *  7. computeAllotmentOdds: Mega-Frenzy Subscription (500x, 1000x, 2500x SME)
 *  8. computeAllotmentOdds: Corrupt, Null, Empty, and Unsegregated Data
 *  9. computeAllotmentOdds: Sub-Tier Segregation Fallbacks (NII & Total Pro-Rata)
 * 10. Family PAN Binomial Probability: Monotonicity, Bounds, and Boost Validation
 * 11. Strategic Advisor: Recommendation Engine & Dynamic Text Generation
 */

const assert = require('assert');
const {
  computeLotApplications,
  parseSubscriptionValue,
  computeAllotmentOdds
} = require('../lib/ipoAllotmentMath');

function runAllTests() {
  console.log('\n========================================================================');
  console.log('  IPO ALLOTMENT ODDS & PROBABILITY LOGIC — EXHAUSTIVE TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: computeLotApplications — Standard Mainboard IPO
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Standard Mainboard Lot Applications (Bombay Coated: Lot 182, Price ₹82) ---');

  test('Suite 1.1: Generates exactly 5 SEBI bidding tiers', () => {
    const apps = computeLotApplications(182, 82);
    assert.ok(Array.isArray(apps), 'Result must be an array');
    assert.strictEqual(apps.length, 5, 'Must return exactly 5 bidding tiers');
  });

  test('Suite 1.2: Retail Min tier validation (1 Lot, ₹14,924)', () => {
    const apps = computeLotApplications(182, 82);
    const rMin = apps.find(a => a.category === 'Retail (Min)');
    assert.ok(rMin, 'Retail (Min) must exist');
    assert.strictEqual(rMin.lots, 1);
    assert.strictEqual(rMin.shares, 182);
    assert.strictEqual(rMin.amount, 14924);
    assert.strictEqual(rMin.tag, '≤ ₹2 Lakhs');
  });

  test('Suite 1.3: Retail Max tier validation (13 Lots, ₹1,94,012 <= ₹2 Lakhs)', () => {
    const apps = computeLotApplications(182, 82);
    const rMax = apps.find(a => a.category === 'Retail (Max)');
    assert.ok(rMax, 'Retail (Max) must exist');
    assert.strictEqual(rMax.lots, 13);
    assert.strictEqual(rMax.shares, 2366);
    assert.strictEqual(rMax.amount, 194012);
    assert.ok(rMax.amount <= 200000, 'Retail Max amount must strictly be <= ₹2 Lakhs');
  });

  test('Suite 1.4: Small HNI Min tier validation (14 Lots, ₹2,08,936 > ₹2 Lakhs)', () => {
    const apps = computeLotApplications(182, 82);
    const sMin = apps.find(a => a.category === 'S-HNI (Min)');
    assert.ok(sMin, 'S-HNI (Min) must exist');
    assert.strictEqual(sMin.lots, 14);
    assert.strictEqual(sMin.shares, 2548);
    assert.strictEqual(sMin.amount, 208936);
    assert.ok(sMin.amount > 200000, 'S-HNI Min must strictly exceed ₹2 Lakhs');
  });

  test('Suite 1.5: Small HNI Max tier validation (67 Lots, ₹9,99,908 <= ₹10 Lakhs)', () => {
    const apps = computeLotApplications(182, 82);
    const sMax = apps.find(a => a.category === 'S-HNI (Max)');
    assert.ok(sMax, 'S-HNI (Max) must exist');
    assert.strictEqual(sMax.lots, 67);
    assert.strictEqual(sMax.shares, 12194);
    assert.strictEqual(sMax.amount, 999908);
    assert.ok(sMax.amount <= 1000000, 'S-HNI Max amount must strictly be <= ₹10 Lakhs');
  });

  test('Suite 1.6: Big HNI Min tier validation (68 Lots, ₹10,14,832 > ₹10 Lakhs)', () => {
    const apps = computeLotApplications(182, 82);
    const bMin = apps.find(a => a.category === 'B-HNI (Min)');
    assert.ok(bMin, 'B-HNI (Min) must exist');
    assert.strictEqual(bMin.lots, 68);
    assert.strictEqual(bMin.shares, 12376);
    assert.strictEqual(bMin.amount, 1014832);
    assert.ok(bMin.amount > 1000000, 'B-HNI Min must strictly exceed ₹10 Lakhs');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: computeLotApplications — SME High-Ticket IPO
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: SME High-Ticket Lot Applications (Antala Industries: Lot 2000, Price ₹67) ---');

  test('Suite 2.1: SME Cost per lot calculation (2000 * 67 = ₹1,34,000)', () => {
    const apps = computeLotApplications(2000, 67);
    assert.strictEqual(apps[0].amount, 134000);
  });

  test('Suite 2.2: Retail Max clamps to 1 lot when 2 lots would breach ₹2L limit (₹2,68,000)', () => {
    const apps = computeLotApplications(2000, 67);
    const rMax = apps.find(a => a.category === 'Retail (Max)');
    assert.strictEqual(rMax.lots, 1);
    assert.strictEqual(rMax.amount, 134000);
  });

  test('Suite 2.3: SME Small HNI Min is 2 lots (₹2,68,000)', () => {
    const apps = computeLotApplications(2000, 67);
    const sMin = apps.find(a => a.category === 'S-HNI (Min)');
    assert.strictEqual(sMin.lots, 2);
    assert.strictEqual(sMin.shares, 4000);
    assert.strictEqual(sMin.amount, 268000);
  });

  test('Suite 2.4: SME Small HNI Max is 7 lots (₹9,38,000 <= ₹10L)', () => {
    const apps = computeLotApplications(2000, 67);
    const sMax = apps.find(a => a.category === 'S-HNI (Max)');
    assert.strictEqual(sMax.lots, 7);
    assert.strictEqual(sMax.shares, 14000);
    assert.strictEqual(sMax.amount, 938000);
    assert.ok(sMax.amount <= 1000000);
  });

  test('Suite 2.5: SME Big HNI Min is 8 lots (₹10,72,000 > ₹10L)', () => {
    const apps = computeLotApplications(2000, 67);
    const bMin = apps.find(a => a.category === 'B-HNI (Min)');
    assert.strictEqual(bMin.lots, 8);
    assert.strictEqual(bMin.shares, 16000);
    assert.strictEqual(bMin.amount, 1072000);
    assert.ok(bMin.amount > 1000000);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: Boundary & Corrupt Inputs for computeLotApplications
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Boundary & Corrupt Inputs for computeLotApplications ---');

  test('Suite 3.1: Handles zero or negative lot size gracefully', () => {
    assert.strictEqual(computeLotApplications(0, 100), null);
    assert.strictEqual(computeLotApplications(-10, 100), null);
  });

  test('Suite 3.2: Handles zero or negative price gracefully', () => {
    assert.strictEqual(computeLotApplications(100, 0), null);
    assert.strictEqual(computeLotApplications(100, -50), null);
  });

  test('Suite 3.3: Handles null, undefined, and non-numeric inputs', () => {
    assert.strictEqual(computeLotApplications(null, 100), null);
    assert.strictEqual(computeLotApplications(100, undefined), null);
    assert.strictEqual(computeLotApplications('abc', 'xyz'), null);
    assert.strictEqual(computeLotApplications('', ''), null);
  });

  test('Suite 3.4: Formatted strings with commas and currency symbols (e.g. "1,500" and "₹ 82.50")', () => {
    const apps = computeLotApplications('1,500', '₹ 82.50');
    assert.ok(apps !== null, 'Must parse cleaned numeric strings');
    assert.strictEqual(apps[0].shares, 1500);
    assert.strictEqual(apps[0].amount, 1500 * 82.5); // 123,750
  });

  test('Suite 3.5: Single lot cost exceeding ₹2 Lakhs (e.g. ₹2,50,000 per lot)', () => {
    const apps = computeLotApplications(2500, 100); // 2,50,000
    const rMax = apps.find(a => a.category === 'Retail (Max)');
    assert.strictEqual(rMax.lots, 1, 'Retail Max must clamp to minimum 1 lot');
    const sMin = apps.find(a => a.category === 'S-HNI (Min)');
    assert.strictEqual(sMin.lots, 2, 'sHNI Min must be 2 lots');
  });

  test('Suite 3.6: Single lot cost exceeding ₹10 Lakhs (e.g. ₹12,00,000 per lot)', () => {
    const apps = computeLotApplications(12000, 100); // 12,00,000
    const sMin = apps.find(a => a.category === 'S-HNI (Min)');
    const sMax = apps.find(a => a.category === 'S-HNI (Max)');
    assert.ok(sMax.lots >= sMin.lots, 'sHNI Max must never be less than sHNI Min');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: Heavily Oversubscribed computeAllotmentOdds
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Heavily Oversubscribed computeAllotmentOdds (Bombay Coated) ---');

  const bombaySubs = {
    retail: '35.46x',
    shni: '113.44x',
    bhni: '192.94x',
    qib: '32.10x',
    total: '65.40x'
  };

  test('Suite 4.1: Retail Form-Basis Single-PAN odds (35.46x -> ~3.55%, 1 in 28 applicants)', () => {
    const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    assert.strictEqual(res.retail.status, 'OVERSUBSCRIBED');
    assert.strictEqual(res.retail.roundOdds, 28);
    assert.strictEqual(res.retail.oddsRatioText, '1 in 28 applicants');
    assert.strictEqual(res.retail.probabilitySingle.toFixed(2), '3.55');
    assert.strictEqual(res.retail.probabilityFamily.toFixed(2), '3.55');
    assert.strictEqual(res.retail.badge, 'Competitive Lottery');
  });

  test('Suite 4.2: Small HNI Form-Basis Single-PAN odds (113.44x -> ~0.92%, 1 in 109 applicants)', () => {
    const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    assert.strictEqual(res.shni.status, 'OVERSUBSCRIBED');
    assert.strictEqual(res.shni.roundOdds, 109);
    assert.strictEqual(res.shni.oddsRatioText, '1 in 109 applicants');
    assert.strictEqual(res.shni.probabilitySingle.toFixed(2), '0.92');
    assert.strictEqual(res.shni.badge, 'Competitive Lottery');
  });

  test('Suite 4.3: Big HNI Form-Basis with SEBI Min Lot Lottery Leverage (192.94x -> ~2.52%, 1 in 40 applicants)', () => {
    const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    assert.strictEqual(res.bhni.status, 'OVERSUBSCRIBED');
    assert.strictEqual(res.bhni.roundOdds, 40);
    assert.strictEqual(res.bhni.oddsRatioText, '1 in 40 applicants');
    assert.strictEqual(res.bhni.probabilitySingle.toFixed(2), '2.52');
    assert.strictEqual(res.bhni.leverage.toFixed(2), '4.86');
  });

  test('Suite 4.4: Flag hasLiveBids is true', () => {
    const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    assert.strictEqual(res.hasLiveBids, true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 5: Undersubscribed Multipliers (< 1.0x Guaranteed)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: Undersubscribed Multipliers (< 1.0x Guaranteed) ---');

  const underSubs = {
    retail: '0.85x',
    shni: '0.40x',
    bhni: '0.25x',
    total: '0.60x'
  };

  test('Suite 5.1: Retail 0.85x produces GUARANTEED status and 100% probability', () => {
    const res = computeAllotmentOdds(underSubs, 'MAINBOARD', 1);
    assert.strictEqual(res.retail.status, 'GUARANTEED');
    assert.strictEqual(res.retail.probabilitySingle, 100);
    assert.strictEqual(res.retail.probabilityFamily, 100);
    assert.strictEqual(res.retail.roundOdds, 1);
    assert.strictEqual(res.retail.oddsRatioText, '1 in 1 (100% Guaranteed)');
    assert.strictEqual(res.retail.badge, '100% Guaranteed');
  });

  test('Suite 5.2: Small HNI 0.40x produces GUARANTEED status and 100% probability', () => {
    const res = computeAllotmentOdds(underSubs, 'MAINBOARD', 1);
    assert.strictEqual(res.shni.status, 'GUARANTEED');
    assert.strictEqual(res.shni.probabilitySingle, 100);
    assert.strictEqual(res.shni.oddsRatioText, '1 in 1 (100% Guaranteed)');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 6: Exact 1.00x Parity Boundary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 6: Exact 1.00x Parity Boundary ---');

  test('Suite 6.1: Exactly 1.00x multiplier is 100% Guaranteed (No Lottery)', () => {
    const paritySubs = { retail: '1.00x', shni: '1.00', bhni: '1.0x' };
    const res = computeAllotmentOdds(paritySubs, 'MAINBOARD', 1);
    assert.strictEqual(res.retail.status, 'GUARANTEED');
    assert.strictEqual(res.retail.probabilitySingle, 100);
    assert.strictEqual(res.retail.oddsRatioText, '1 in 1 (100% Guaranteed)');
  });

  test('Suite 6.2: 1.01x transitions into OVERSUBSCRIBED lottery', () => {
    const edgeSubs = { retail: '1.01x' };
    const res = computeAllotmentOdds(edgeSubs, 'SME', 1);
    assert.strictEqual(res.retail.status, 'OVERSUBSCRIBED');
    assert.ok(res.retail.probabilitySingle < 100);
    assert.strictEqual(res.retail.probabilitySingle.toFixed(2), '99.01');
    assert.strictEqual(res.retail.roundOdds, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 7: Mega-Frenzy Oversubscription (500x, 1000x, 2500x SME)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 7: Mega-Frenzy Oversubscription (500x, 1000x, 2500x SME) ---');

  test('Suite 7.1: Multiplier 500x yields 0.20% odds (1 in 500)', () => {
    const frenzy = { retail: '500x', shni: '500x', bhni: '500x' };
    const res = computeAllotmentOdds(frenzy, 'SME', 1);
    assert.strictEqual(res.retail.probabilitySingle.toFixed(2), '0.20');
    assert.strictEqual(res.retail.roundOdds, 500);
    assert.strictEqual(res.retail.oddsRatioText, '1 in 500 applicants');
  });

  test('Suite 7.2: Multiplier 2500x yields 0.04% odds (1 in 2500)', () => {
    const extremeFrenzy = { retail: '2500x' };
    const res = computeAllotmentOdds(extremeFrenzy, 'SME', 1);
    assert.strictEqual(res.retail.probabilitySingle.toFixed(2), '0.04');
    assert.strictEqual(res.retail.roundOdds, 2500);
    assert.strictEqual(res.retail.oddsRatioText, '1 in 2500 applicants');
  });

  test('Suite 7.3: Probability is strictly clamped >= 0.01% under mega oversubscription', () => {
    const mega = { retail: '20000x' };
    const res = computeAllotmentOdds(mega, 'SME', 1);
    assert.ok(res.retail.probabilitySingle >= 0.01, 'Probability must never underflow below 0.01%');
    assert.strictEqual(res.retail.probabilitySingle, 0.01);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 8: Corrupt, Null, Empty, and Unsegregated Data
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 8: Corrupt, Null, Empty, and Unsegregated Data ---');

  test('Suite 8.1: parseSubscriptionValue helper edge cases', () => {
    assert.strictEqual(parseSubscriptionValue(null), 0);
    assert.strictEqual(parseSubscriptionValue(undefined), 0);
    assert.strictEqual(parseSubscriptionValue(''), 0);
    assert.strictEqual(parseSubscriptionValue('-'), 0);
    assert.strictEqual(parseSubscriptionValue('NA'), 0);
    assert.strictEqual(parseSubscriptionValue('N/A'), 0);
    assert.strictEqual(parseSubscriptionValue(' - '), 0);
    assert.strictEqual(parseSubscriptionValue(-5), 0);
    assert.strictEqual(parseSubscriptionValue('28.68x'), 28.68);
    assert.strictEqual(parseSubscriptionValue(' 15.50 times '), 15.5);
  });

  test('Suite 8.2: Empty / dash subscription object produces AWAITING status', () => {
    const emptySubs = { retail: '-', shni: 'NA', bhni: null, nii: undefined, total: '' };
    const res = computeAllotmentOdds(emptySubs, 'MAINBOARD', 1);
    assert.strictEqual(res.retail.status, 'AWAITING');
    assert.strictEqual(res.retail.probabilitySingle, 0);
    assert.strictEqual(res.retail.probabilityFamily, 0);
    assert.strictEqual(res.retail.oddsRatioText, 'Awaiting Live Bids');
    assert.strictEqual(res.retail.badge, 'Early / Upcoming');
    assert.strictEqual(res.hasLiveBids, false);
  });

  test('Suite 8.3: Null or undefined subObj does not throw error', () => {
    const resNull = computeAllotmentOdds(null);
    assert.strictEqual(resNull.hasLiveBids, false);
    assert.strictEqual(resNull.retail.status, 'AWAITING');

    const resUndef = computeAllotmentOdds(undefined);
    assert.strictEqual(resUndef.hasLiveBids, false);
    assert.strictEqual(resUndef.retail.status, 'AWAITING');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 9: Sub-Tier Segregation Fallbacks (NII & Total Pro-Rata)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 9: Sub-Tier Segregation Fallbacks (NII & Total Pro-Rata) ---');

  test('Suite 9.1: Total NII proxy when sHNI and bHNI are unsegregated', () => {
    const unsegregatedNii = {
      retail: '10x',
      nii: '40x' // sHNI ~ 40 * 0.85 = 34x; bHNI ~ 40 * 1.15 = 46x
    };
    const res = computeAllotmentOdds(unsegregatedNii, 'SME', 1);
    assert.strictEqual(res.shni.status, 'OVERSUBSCRIBED');
    assert.strictEqual(res.shni.multiplier, 34);
    assert.strictEqual(res.shni.roundOdds, 34);
    assert.strictEqual(res.bhni.multiplier, 46);
    assert.strictEqual(res.bhni.roundOdds, 46);
  });

  test('Suite 9.2: Overall Total proxy when only Total is available', () => {
    const onlyTotal = { total: '20x' };
    // Retail = 20 * 0.75 = 15x; sHNI = 20 * 1.5 = 30x; bHNI = 20 * 2.0 = 40x
    const res = computeAllotmentOdds(onlyTotal, 'SME', 1);
    assert.strictEqual(res.retail.multiplier, 15);
    assert.strictEqual(res.shni.multiplier, 30);
    assert.strictEqual(res.bhni.multiplier, 40);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 10: Family PAN Binomial Probability Validation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 10: Family PAN Binomial Probability Validation ---');

  test('Suite 10.1: N=1 Family probability exactly matches Single-PAN probability', () => {
    const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    assert.strictEqual(res.retail.probabilityFamily, res.retail.probabilitySingle);
    assert.strictEqual(res.retail.oddsBoost, '1.0');
  });

  test('Suite 10.2: Monotonic strictly increasing probability as family PANs grow (N = 1 to 25)', () => {
    let lastProb = 0;
    for (let n = 1; n <= 25; n++) {
      const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', n, 14924, 182, 82);
      assert.ok(
        res.retail.probabilityFamily > lastProb,
        `Family prob at N=${n} (${res.retail.probabilityFamily}%) must exceed N=${n-1} (${lastProb}%)`
      );
      assert.ok(
        res.retail.probabilityFamily <= 100,
        `Family prob at N=${n} must never exceed 100%`
      );
      lastProb = res.retail.probabilityFamily;
    }
  });

  test('Suite 10.3: Exact Binomial Calculation: 1 - (1 - p)^N for Bombay Coated (Form p ~ 3.55%)', () => {
    const res1 = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    const pSingle = res1.retail.probabilitySingle;
    const pDecimal = pSingle / 100;

    // N = 5
    const expected5 = (1 - Math.pow(1 - pDecimal, 5)) * 100;
    const res5 = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 5, 14924, 182, 82);
    assert.strictEqual(res5.retail.probabilityFamily.toFixed(2), expected5.toFixed(2));
    assert.strictEqual(res5.retail.oddsBoost, (res5.retail.probabilityFamily / res5.retail.probabilitySingle).toFixed(1));

    // N = 13 (Capital equivalent of 1 sHNI bid)
    const expected13 = (1 - Math.pow(1 - pDecimal, 13)) * 100;
    const res13 = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 13, 14924, 182, 82);
    assert.strictEqual(res13.retail.probabilityFamily.toFixed(2), expected13.toFixed(2));
    assert.ok(
      res13.retail.probabilityFamily > 35,
      '13 Family PANs should yield >35% allotment chance'
    );
  });

  test('Suite 10.4: Sanitizes invalid, negative, string, or zero family PAN inputs', () => {
    const resNeg = computeAllotmentOdds(bombaySubs, 'MAINBOARD', -5, 14924, 182, 82);
    assert.strictEqual(resNeg.retail.probabilityFamily, resNeg.retail.probabilitySingle);

    const resZero = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 0, 14924, 182, 82);
    assert.strictEqual(resZero.retail.probabilityFamily, resZero.retail.probabilitySingle);

    const resStr = computeAllotmentOdds(bombaySubs, 'MAINBOARD', '10', 14924, 182, 82);
    assert.ok(resStr.retail.probabilityFamily > resStr.retail.probabilitySingle);

    const resFloat = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 4.8, 14924, 182, 82);
    const resInt = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 4, 14924, 182, 82);
    assert.strictEqual(resFloat.retail.probabilityFamily, resInt.retail.probabilityFamily);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 11: Strategic Advisor Engine
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 11: Strategic Advisor Engine ---');

  test('Suite 11.1: Recommends Retail Family Strategy when sHNI is much more oversubscribed', () => {
    const res = computeAllotmentOdds(bombaySubs, 'MAINBOARD', 1, 14924, 182, 82);
    assert.ok(res.advisorTitle.includes('Retail Family Strategy is ~'));
    assert.ok(res.advisorTitle.includes('More Capital-Efficient'));
    assert.ok(res.advisorMessage.includes('Small HNI application'));
    assert.ok(res.advisorMessage.includes('Retail Family PANs surges your winning chance'));
  });

  test('Suite 11.2: Advises Guaranteed Retail Entry when Retail is undersubscribed', () => {
    const under = { retail: '0.80x', shni: '5.0x' };
    const res = computeAllotmentOdds(under, 'MAINBOARD', 1);
    assert.strictEqual(res.advisorTitle, 'Retail Category Undersubscribed (100% Guaranteed)');
    assert.ok(res.advisorMessage.includes('All valid Retail applicants will receive 1 full lot guaranteed'));
  });

  test('Suite 11.3: Balanced Demand message when demand is proportional', () => {
    const balanced = { retail: '15.0x', shni: '10.0x' };
    const res = computeAllotmentOdds(balanced, 'MAINBOARD', 1);
    assert.strictEqual(res.advisorTitle, 'Balanced Demand Across Categories');
    assert.ok(res.advisorMessage.includes('Both Retail and HNI are experiencing steady bidding'));
  });

  test('Suite 11.4: Bidding In Progress message when no live bids exist', () => {
    const res = computeAllotmentOdds({}, 'MAINBOARD', 1);
    assert.strictEqual(res.advisorTitle, 'Bidding In Progress');
    assert.ok(res.advisorMessage.includes('Subscription numbers will ramp up during market hours'));
  });

  console.log('\n========================================================================');
  console.log(`  ALL ${totalTests} TESTS PASSED PERFECTLY! (Passed: ${passed}/${totalTests})`);
  console.log('========================================================================\n');
}

runAllTests();

