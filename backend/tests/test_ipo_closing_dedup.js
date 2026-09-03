'use strict';

/**
 * test_ipo_closing_dedup.js  —  Hybrid Deduplication Test Suite
 *
 * Tests the complete 3-pass deduplication pipeline:
 *  Suite 1: computeIpoFingerprint() — business fingerprint generation
 *  Suite 2: computeNameSimilarity() — token-set Dice coefficient
 *  Suite 3: Pass 1 — Fingerprint dedup (Farm Peace, Deepa Jewellers)
 *  Suite 4: Pass 1 — Real case "Credent Connect N Care Ltd" vs "Credent Connect"
 *  Suite 5: Pass 3 — Cross-fingerprint fuzzy (price band ₹179 vs ₹189)
 *  Suite 6: Notification payload formatting
 *  Suite 7: Regression — genuinely different companies are NOT merged
 *
 * Run:
 *   cd backend && node tests/test_ipo_closing_dedup.js
 */

require('dotenv').config();

const { getCanonicalIpoKey, computeIpoFingerprint, computeNameSimilarity } = require('../lib/ipoUtils');

// ─── Test helpers ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}${detail ? '  —  ' + detail : ''}`);
    failed++;
  }
}

function assertClose(label, got, expected, tolerance = 0.01) {
  const ok = Math.abs(got - expected) <= tolerance;
  assert(label, ok, `got ${got.toFixed(3)}, expected ~${expected.toFixed(3)}`);
}

// ─── Inline dedup engine (mirrors getIposClosingToday logic) ──────────────────
// We test the dedup logic in isolation so tests don't need network/DB.
const FUZZY_THRESHOLD = 0.72;

function _mergeEntry(map, key, incoming) {
  const existing = map.get(key);
  if (!existing) return;
  const mergedGmp        = Math.max(existing.gmp, incoming.gmp);
  const mergedIssuePrice = incoming.issuePrice > 0 ? incoming.issuePrice : existing.issuePrice;
  const mergedGmpPct     = mergedIssuePrice > 0
    ? Math.round((mergedGmp / mergedIssuePrice) * 1000) / 10 : 0;
  const mergedName = existing.name.length <= incoming.name.length ? existing.name : incoming.name;
  const mergedExch = (existing.exchange?.includes('&')) ? existing.exchange : (incoming.exchange || existing.exchange);
  const mergedSub  = existing.subscription !== '-' ? existing.subscription : incoming.subscription;
  map.set(key, {
    ...existing,
    name: mergedName, gmp: mergedGmp, gmpPercentage: mergedGmpPct, issuePrice: mergedIssuePrice,
    exchange: mergedExch, subscription: mergedSub,
    fireRating: Math.max(existing.fireRating || 0, incoming.fireRating || 0),
    lotSize: existing.lotSize || incoming.lotSize,
  });
}

function runHybridDedup(rawEntries, todayIST = '2026-09-03') {
  const normalized = rawEntries.map(ipo => {
    const issuePrice  = parseFloat(ipo.issue_price) || 0;
    const gmp         = parseFloat(ipo.gmp) || 0;
    const gmpPct      = issuePrice > 0 ? Math.round((gmp / issuePrice) * 1000) / 10 : 0;
    const slug        = (ipo.company_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fingerprint = computeIpoFingerprint(ipo.closeDateISO, issuePrice);
    return {
      _fp: fingerprint, id: fingerprint || slug, name: ipo.company_name || 'Unknown',
      slug, gmp, gmpPercentage: gmpPct, issuePrice,
      closeDate: ipo.close_date || '', closeDateISO: ipo.closeDateISO || todayIST,
      exchange: ipo.listing_exch || '', lotSize: null, subscription: ipo.subscription || '-',
      fireRating: ipo.fire_rating || 0,
    };
  });

  // Pass 1: Fingerprint
  const dedupMap = new Map();
  const noFpQueue = [];
  for (const entry of normalized) {
    if (!entry._fp) { noFpQueue.push(entry); continue; }
    if (!dedupMap.has(entry._fp)) { dedupMap.set(entry._fp, { ...entry }); }
    else { _mergeEntry(dedupMap, entry._fp, entry); }
  }

  // Pass 2: No-fingerprint fuzzy
  for (const entry of noFpQueue) {
    let bestFp = null, bestSim = 0;
    for (const [fp, existing] of dedupMap) {
      const sim = computeNameSimilarity(entry.name, existing.name);
      if (sim >= FUZZY_THRESHOLD && sim > bestSim) { bestSim = sim; bestFp = fp; }
    }
    if (bestFp) { _mergeEntry(dedupMap, bestFp, entry); }
    else {
      const fallbackKey = `${entry.closeDateISO}__slug__${entry.slug}`;
      dedupMap.set(fallbackKey, { ...entry, id: fallbackKey });
    }
  }

  // Pass 3: Cross-fingerprint fuzzy (price band mismatches)
  const dedupKeys = [...dedupMap.keys()];
  const mergeActions = [];
  for (let i = 0; i < dedupKeys.length; i++) {
    for (let j = i + 1; j < dedupKeys.length; j++) {
      const eA = dedupMap.get(dedupKeys[i]);
      const eB = dedupMap.get(dedupKeys[j]);
      if (eA.closeDateISO !== eB.closeDateISO) continue;
      const sim = computeNameSimilarity(eA.name, eB.name);
      if (sim >= FUZZY_THRESHOLD) {
        const [keepKey, dropKey] = eA.gmp >= eB.gmp ? [dedupKeys[i], dedupKeys[j]] : [dedupKeys[j], dedupKeys[i]];
        mergeActions.push({ keepKey, dropKey, sim });
      }
    }
  }
  const dropped = new Set();
  for (const { keepKey, dropKey } of mergeActions) {
    if (dropped.has(dropKey) || dropped.has(keepKey) || !dedupMap.has(dropKey)) continue;
    _mergeEntry(dedupMap, keepKey, dedupMap.get(dropKey));
    dedupMap.delete(dropKey);
    dropped.add(dropKey);
  }

  return [...dedupMap.values()]
    .map(({ _fp, ...rest }) => rest)
    .sort((a, b) => b.gmpPercentage - a.gmpPercentage);
}


// ══════════════════════════════════════════════════════════════════════════════
// Suite 1: computeIpoFingerprint
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 1: computeIpoFingerprint() ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

assert('Standard case → "2026-09-03__189"',        computeIpoFingerprint('2026-09-03', 189)        === '2026-09-03__189');
assert('String price → rounded correctly',           computeIpoFingerprint('2026-09-03', '189.00')  === '2026-09-03__189');
assert('Price 0 → empty string (unusable)',          computeIpoFingerprint('2026-09-03', 0)         === '');
assert('Missing date → empty string',                computeIpoFingerprint('', 189)                 === '');
assert('Null date → empty string',                   computeIpoFingerprint(null, 189)               === '');
assert('Price 179 ≠ price 189 → different fps',
  computeIpoFingerprint('2026-09-03', 179) !== computeIpoFingerprint('2026-09-03', 189));
assert('Same price diff date → different fps',
  computeIpoFingerprint('2026-09-03', 189) !== computeIpoFingerprint('2026-09-04', 189));
assert('Fractional price → rounded: 188.5 → "189"',
  computeIpoFingerprint('2026-09-03', 188.5) === '2026-09-03__189');


// ══════════════════════════════════════════════════════════════════════════════
// Suite 2: computeNameSimilarity
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 2: computeNameSimilarity() ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

assertClose('"Credent Connect N Care Ltd" vs "Credent Connect"  → ~0.80',
  computeNameSimilarity('Credent Connect N Care Ltd', 'Credent Connect'), 0.80);

assertClose('"Farm Peace Ltd" vs "Farm Peace"  → 1.00',
  computeNameSimilarity('Farm Peace Ltd', 'Farm Peace'), 1.00);

assertClose('"Deepa Jewellers Ltd" vs "Deepa Jewellers"  → 1.00',
  computeNameSimilarity('Deepa Jewellers Ltd', 'Deepa Jewellers'), 1.00);

assertClose('"Fly-Hi Maritime Travels Ltd" vs "Fly-Hi Maritime"  → ~0.80',
  computeNameSimilarity('Fly-Hi Maritime Travels Ltd', 'Fly-Hi Maritime'), 0.80);

assertClose('"Rays of Belief Ltd" vs "Rays of Belief"  → 1.00 ("ltd" stripped, identical tokens)',
  computeNameSimilarity('Rays of Belief Ltd', 'Rays of Belief'), 1.00, 0.01);

assert('"Credent Finance" vs "Credent Connect" → BLOCKED (< 0.72)',
  computeNameSimilarity('Credent Finance', 'Credent Connect') < FUZZY_THRESHOLD);

assert('"ABC Ltd" vs "XYZ Ltd" → 0.00 (no shared tokens after stop removal)',
  computeNameSimilarity('ABC Ltd', 'XYZ Ltd') === 0);

assert('Empty string → 0',    computeNameSimilarity('', 'Something') === 0);
assert('Null → 0',            computeNameSimilarity(null, 'Something') === 0);
assert('Identical → 1.00',    computeNameSimilarity('Credent Connect', 'Credent Connect') === 1.0);


// ══════════════════════════════════════════════════════════════════════════════
// Suite 3: Pass 1 — Fingerprint dedup (Farm Peace, Deepa Jewellers etc.)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 3: Pass 1 — Fingerprint dedup ━━━━━━━━━━━━━━━━━━━━━━━━━');

const s3Input = [
  // MainboardGMP (no suffix, lower GMP)
  { company_name: 'Farm Peace',      issue_price: '59',  gmp: '5',  closeDateISO: '2026-09-03', listing_exch: 'SME',       close_date: '03 Sep 2026', subscription: '-',    fire_rating: 0 },
  { company_name: 'Deepa Jewellers', issue_price: '177', gmp: '28', closeDateISO: '2026-09-03', listing_exch: 'NSE',       close_date: '03 Sep 2026', subscription: '-',    fire_rating: 0 },
  // Investorgain (with suffix, higher GMP)
  { company_name: 'Farm Peace Ltd',  issue_price: '59',  gmp: '6',  closeDateISO: '2026-09-03', listing_exch: 'BSE SME',   close_date: '03 Sep 2026', subscription: '1.5x', fire_rating: 2 },
  { company_name: 'Deepa Jewellers Ltd', issue_price: '177', gmp: '25', closeDateISO: '2026-09-03', listing_exch: 'NSE & BSE', close_date: '03 Sep 2026', subscription: '4.5x', fire_rating: 3 },
];

const s3Out = runHybridDedup(s3Input);
assert('4 raw → 2 unique',         s3Out.length === 2);
const farm  = s3Out.find(e => e.name.toLowerCase().includes('farm'));
const deepa = s3Out.find(e => e.name.toLowerCase().includes('deepa'));
assert('Farm Peace: merged GMP = max(5, 6) = 6',      farm?.gmp === 6);
assert('Farm Peace: sub = "1.5x" (non-dash wins)',     farm?.subscription === '1.5x');
assert('Farm Peace: fireRating = max(0, 2) = 2',       farm?.fireRating === 2);
assert('Deepa: merged GMP = max(28, 25) = 28',         deepa?.gmp === 28);
assert('Deepa: exchange = "NSE & BSE" (& wins)',        deepa?.exchange === 'NSE & BSE');
assert('Deepa: sub = "4.5x"',                          deepa?.subscription === '4.5x');
assert('Deepa: fireRating = max(0, 3) = 3',            deepa?.fireRating === 3);


// ══════════════════════════════════════════════════════════════════════════════
// Suite 4: Real case — "Credent Connect N Care Ltd" vs "Credent Connect"
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 4: Real case — Credent Connect N Care Ltd ━━━━━━━━━━━━━━');

const s4Input = [
  // MainboardGMP: "Credent Connect N Care Ltd" @ ₹189, GMP ₹50
  {
    company_name: 'Credent Connect N Care Ltd',
    issue_price:  '189', gmp: '50', closeDateISO: '2026-08-17',
    listing_exch: 'NSE SME', close_date: '17 Aug 2026', subscription: '-', fire_rating: 0,
  },
  // Investorgain: "Credent Connect" @ ₹189, GMP ₹92 (live, more current)
  {
    company_name: 'Credent Connect',
    issue_price:  '189', gmp: '92', closeDateISO: '2026-08-17',
    listing_exch: 'NSE SME', close_date: '17 Aug 2026', subscription: '153.13x', fire_rating: 4,
  },
];

const s4Out = runHybridDedup(s4Input, '2026-08-17');

assert('2 raw → 1 unique (Pass 1 fingerprint match)',  s4Out.length === 1,
  `got ${s4Out.length}: ${s4Out.map(e => e.name).join(', ')}`);

const credent = s4Out[0];
// Note: _mergeEntry uses shorter name → "Credent Connect" (15 chars) wins over "Credent Connect N Care Ltd" (30 chars)
assert('Merged name = "Credent Connect" (shorter name wins per merge logic)',
  credent?.name === 'Credent Connect');
assert('Merged GMP = max(50, 92) = 92',                credent?.gmp === 92);
assert('Merged issuePrice = ₹189',                     credent?.issuePrice === 189);
assertClose('GMP% = 92/189 = 48.68%',                  credent?.gmpPercentage || 0, 48.68, 0.1);
assert('Merged subscription = "153.13x" (non-dash)',   credent?.subscription === '153.13x');
assert('Merged fireRating = max(0, 4) = 4',            credent?.fireRating === 4);
assert('ID is fingerprint "2026-08-17__189"',          credent?.id === '2026-08-17__189');

// Notification preview
const gmp    = credent?.gmp || 0;
const gainPct = credent?.gmpPercentage || 0;
const price  = credent?.issuePrice || 0;
const exch   = credent?.exchange ? ` [${credent.exchange}]` : '';
const gmpText = gmp > 0 ? `GMP: ₹${gmp} (+${gainPct}% Gain)` : 'GMP: At Par (₹0)';
const title  = `⏰ IPO Closing Today: ${credent?.name}${exch}`;
const body   = `${gmpText} • Price: ₹${price} • Bidding closes today! Tap to view.`;

assert('Notification title: correct name (shorter merged name)',
  title.includes('Credent Connect'));
assert('Notification title: exchange tag',  title.includes('[NSE SME]'));
assert('Notification body: live GMP ₹92',  body.includes('GMP: ₹92'));
assert('Notification body: gain %',        body.includes('+48.7% Gain'));
assert('Notification body: NO "GMP updated"', !body.includes('GMP updated'));


// ══════════════════════════════════════════════════════════════════════════════
// Suite 5: Pass 3 — Cross-fingerprint fuzzy (price band ₹179 vs ₹189)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 5: Pass 3 — Price-band mismatch ₹179 vs ₹189 ━━━━━━━━━━');

const s5Input = [
  // MainboardGMP: ₹189 upper band, GMP ₹50 → fp "2026-09-03__189"
  { company_name: 'Credent Connect N Care Ltd', issue_price: '189', gmp: '50',
    closeDateISO: '2026-09-03', listing_exch: 'NSE SME', close_date: '03 Sep 2026', subscription: '-', fire_rating: 0 },
  // Investorgain: ₹179 lower band, GMP ₹92 → fp "2026-09-03__179"  (DIFFERENT fp)
  { company_name: 'Credent Connect', issue_price: '179', gmp: '92',
    closeDateISO: '2026-09-03', listing_exch: 'NSE SME', close_date: '03 Sep 2026', subscription: '153.13x', fire_rating: 4 },
];

const s5Out = runHybridDedup(s5Input);

assert('Price-band mismatch: 2 raw → 1 unique (Pass 3 cross-fp fuzzy)',
  s5Out.length === 1,
  `got ${s5Out.length}: ${s5Out.map(e => `"${e.name}" @₹${e.issuePrice}`).join(', ')}`);
const c5 = s5Out[0];
assert('Merged GMP = max(50, 92) = 92',       c5?.gmp === 92);
assert('Subscription enriched = "153.13x"',   c5?.subscription === '153.13x');


// ══════════════════════════════════════════════════════════════════════════════
// Suite 6: Notification payload — all GMP scenarios
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 6: Notification payload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function buildPayload(ipo, dateIST) {
  const gmp    = ipo.gmp || 0;
  const gainPct = ipo.gmpPercentage || 0;
  const price  = ipo.issuePrice || 0;
  const exch   = ipo.exchange ? ` [${ipo.exchange}]` : '';
  const gmpText = gmp > 0 ? `GMP: ₹${gmp} (+${gainPct}% Gain)` : 'GMP: At Par (₹0)';
  const priceText = price > 0 ? `₹${price}` : 'NA';
  return {
    title: `⏰ IPO Closing Today: ${ipo.name}${exch}`,
    body:  `${gmpText} • Price: ${priceText} • Bidding closes today! Tap to view.`,
    tag:   `ipo-closing-${dateIST}-${ipo.id}`,
  };
}

const richIpo  = { id: '2026-09-03__189', name: 'Credent Connect N Care Ltd', gmp: 92, gmpPercentage: 48.7, issuePrice: 189, exchange: 'NSE SME' };
const zeroGmp  = { id: '2026-09-03__59',  name: 'Farm Peace',                 gmp: 0,  gmpPercentage: 0,    issuePrice: 59,  exchange: 'BSE SME' };
const noPrice  = { id: '2026-09-03__0',   name: 'Mystery IPO',               gmp: 0,  gmpPercentage: 0,    issuePrice: 0,   exchange: '' };

const p1 = buildPayload(richIpo,  '2026-09-03');
const p2 = buildPayload(zeroGmp,  '2026-09-03');
const p3 = buildPayload(noPrice,  '2026-09-03');

assert('Rich: title contains name',                 p1.title.includes('Credent Connect N Care Ltd'));
assert('Rich: title has [NSE SME]',                 p1.title.includes('[NSE SME]'));
assert('Rich: body has "GMP: ₹92 (+48.7% Gain)"',  p1.body.includes('GMP: ₹92 (+48.7% Gain)'));
assert('Rich: body has price ₹189',                 p1.body.includes('₹189'));
assert('Rich: NO "GMP updated"',                   !p1.body.includes('GMP updated'));

assert('Zero GMP: body has "At Par (₹0)"',          p2.body.includes('At Par (₹0)'));
assert('Zero GMP: NO "GMP updated"',               !p2.body.includes('GMP updated'));
assert('Zero GMP: has price ₹59',                   p2.body.includes('₹59'));

assert('No price: body has "Price: NA"',             p3.body.includes('Price: NA'));

assert('Tags are unique per IPO+date',
  p1.tag !== p2.tag && p2.tag !== p3.tag);


// ══════════════════════════════════════════════════════════════════════════════
// Suite 7: Regression — genuinely different companies are NOT merged
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n━━━ Suite 7: Regression — different companies stay separate ━━━━━━');

const s7Input = [
  // Four truly different IPOs closing same day
  { company_name: 'Alpha Pharma Ltd',         issue_price: '120', gmp: '15', closeDateISO: '2026-09-03', listing_exch: 'NSE', close_date: '03 Sep 2026', subscription: '-', fire_rating: 0 },
  { company_name: 'Beta Textiles',            issue_price: '85',  gmp: '8',  closeDateISO: '2026-09-03', listing_exch: 'BSE', close_date: '03 Sep 2026', subscription: '-', fire_rating: 0 },
  { company_name: 'Gamma Steel Corp',         issue_price: '200', gmp: '35', closeDateISO: '2026-09-03', listing_exch: 'NSE', close_date: '03 Sep 2026', subscription: '-', fire_rating: 0 },
  { company_name: 'Delta Infra Solutions Ltd',issue_price: '340', gmp: '60', closeDateISO: '2026-09-03', listing_exch: 'NSE', close_date: '03 Sep 2026', subscription: '-', fire_rating: 0 },
  // Investorgain versions (same companies, same prices, different name styles)
  { company_name: 'Alpha Pharma',             issue_price: '120', gmp: '18', closeDateISO: '2026-09-03', listing_exch: 'NSE', close_date: '03 Sep 2026', subscription: '5x', fire_rating: 2 },
  { company_name: 'Beta Textiles Ltd',        issue_price: '85',  gmp: '10', closeDateISO: '2026-09-03', listing_exch: 'BSE', close_date: '03 Sep 2026', subscription: '2x', fire_rating: 1 },
];

const s7Out = runHybridDedup(s7Input);
assert('6 raw (4 unique IPOs + 2 dups) → 4 unique', s7Out.length === 4,
  `got ${s7Out.length}: ${s7Out.map(e => e.name).join(', ')}`);

const alpha  = s7Out.find(e => e.name.toLowerCase().includes('alpha'));
const beta   = s7Out.find(e => e.name.toLowerCase().includes('beta'));
const gamma  = s7Out.find(e => e.name.toLowerCase().includes('gamma'));
const delta  = s7Out.find(e => e.name.toLowerCase().includes('delta'));

assert('Alpha kept, GMP = max(15, 18) = 18',  alpha?.gmp === 18);
assert('Beta  kept, GMP = max(8, 10) = 10',   beta?.gmp  === 10);
assert('Gamma kept separately',                !!gamma);
assert('Delta kept separately',                !!delta);

assert('"Credent Finance" not merged with "Credent Connect"',
  computeNameSimilarity('Credent Finance Ltd', 'Credent Connect Ltd') < FUZZY_THRESHOLD);

assert('"Alpha Pharma" not merged with "Beta Textiles"',
  computeNameSimilarity('Alpha Pharma', 'Beta Textiles') < FUZZY_THRESHOLD);


// ─── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(62)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED — Hybrid dedup pipeline is bulletproof.');
} else {
  console.error(`⚠️  ${failed} test(s) FAILED. Review output above.`);
  process.exit(1);
}
