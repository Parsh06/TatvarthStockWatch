'use strict';

/**
 * notificationFilter.test.js
 *
 * Unit + Integration tests for lib/notificationFilter.js
 *
 * Run with:  node backend/tests/notificationFilter.test.js
 */

const { shouldNotify, BLOCK_REASONS } = require('../lib/notificationFilter');

let passed = 0;
let failed = 0;

function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label} ${extra}`);
    failed++;
  }
}

function makeAnn(category, subCategory) {
  return { scriptName: 'Test Corp', scriptCode: '500001', exchange: 'BSE', category, subCategory: subCategory || '' };
}

function makePrefs(blockedCategories = []) {
  return { blockedCategories };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========== UNIT TESTS ==========\n');

// Test 1: Nothing blocked → notify
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeAnn('Company Update', 'Acquisition') });
  assert('Test 1 — Nothing blocked → notify', r.shouldNotify === true && r.reason === BLOCK_REASONS.ALLOWED);
}

// Test 2: Parent blocked → block
{
  const r = shouldNotify({ prefs: makePrefs(['Company Update']), announcement: makeAnn('Company Update', 'Acquisition') });
  assert('Test 2 — Parent blocked → block', r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_PARENT);
}

// Test 3: Child blocked → block
{
  const r = shouldNotify({ prefs: makePrefs(['Acquisition']), announcement: makeAnn('Company Update', 'Acquisition') });
  assert('Test 3 — Child (subCategory) blocked → block', r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_SUBCATEGORY);
}

// Test 4: Parent + child both blocked → block
{
  const r = shouldNotify({ prefs: makePrefs(['Company Update', 'Acquisition']), announcement: makeAnn('Company Update', 'Acquisition') });
  assert('Test 4 — Parent + Child both blocked → block', r.shouldNotify === false);
}

// Test 5: Different child blocked, this announcement's child is enabled → notify
{
  const r = shouldNotify({ prefs: makePrefs(['Cessation']), announcement: makeAnn('Company Update', 'Acquisition') });
  assert('Test 5 — Different child blocked, this child enabled → notify', r.shouldNotify === true && r.reason === BLOCK_REASONS.ALLOWED);
}

// Test 6: Different parent blocked, this parent enabled → notify
{
  const r = shouldNotify({ prefs: makePrefs(['Result']), announcement: makeAnn('Company Update', 'Acquisition') });
  assert('Test 6 — Different parent blocked, this parent enabled → notify', r.shouldNotify === true && r.reason === BLOCK_REASONS.ALLOWED);
}

// Test 7: Unknown category (not in mapping) → safe behavior (notify, no crash)
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeAnn('AI Partnership', '') });
  assert('Test 7 — Unknown category → notify (no crash)', r.shouldNotify === true);
}

// Test 8: Null category → no crash
{
  const r = shouldNotify({ prefs: makePrefs(['Company Update']), announcement: makeAnn(null, 'Acquisition') });
  assert('Test 8 — Null category → no crash', typeof r.shouldNotify === 'boolean');
}

// Test 9: Null subCategory → no crash
{
  const r = shouldNotify({ prefs: makePrefs(['Acquisition']), announcement: makeAnn('Company Update', null) });
  assert('Test 9 — Null subCategory → no crash', typeof r.shouldNotify === 'boolean');
}

// Test 10: Only category exists (no subCategory) → correct behavior
{
  const r = shouldNotify({ prefs: makePrefs(['Result']), announcement: makeAnn('Financial Results', '') });
  // "Financial Results" resolves to parent "Result" → blocked
  assert('Test 10 — Only category, parent matches → block', r.shouldNotify === false);
}

// Test 11: Only subCategory meaningful (category is same as parent) → correct behavior
{
  const r = shouldNotify({ prefs: makePrefs(['Acquisition']), announcement: makeAnn('', 'Acquisition') });
  assert('Test 11 — Only subCategory blocked → block', r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_SUBCATEGORY);
}

// Test 12: Duplicate category = subcategory values → no double evaluation crash
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeAnn('Board Meeting', 'Board Meeting') });
  assert('Test 12 — Duplicate cat=subCat → notify, no crash', r.shouldNotify === true);
}

// Test 13: Empty prefs (no blockedCategories field at all) → notify
{
  const r = shouldNotify({ prefs: {}, announcement: makeAnn('Company Update', 'Cessation') });
  assert('Test 13 — Empty prefs → notify', r.shouldNotify === true);
}

// Test 14: Null prefs → no crash
{
  const r = shouldNotify({ prefs: null, announcement: makeAnn('Company Update', 'Cessation') });
  assert('Test 14 — Null prefs → no crash', typeof r.shouldNotify === 'boolean');
}

// Test 15: blockedCategories is not an array (corrupt data) → no crash
{
  const r = shouldNotify({ prefs: { blockedCategories: 'bad_string' }, announcement: makeAnn('Company Update', 'Cessation') });
  assert('Test 15 — Corrupt blockedCategories (string) → no crash', typeof r.shouldNotify === 'boolean');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========== INTEGRATION TESTS (Real Production Scenarios) ==========\n');

// SCENARIO A (The actual production bug)
// User blocks "Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018"
// Announcement has:
//   category = "Company Update"   (NOT blocked)
//   subCategory = "Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018" (BLOCKED)
// Expected: BLOCK
{
  const ann = makeAnn(
    'Company Update',
    'Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018'
  );
  const prefs = makePrefs(['Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018']);
  const r = shouldNotify({ prefs, announcement: ann, uid: 'scenario_A' });
  assert(
    'SCENARIO A — Production Bug: Specific subcategory blocked → must block',
    r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_SUBCATEGORY,
    `Got: shouldNotify=${r.shouldNotify} reason=${r.reason}`
  );
}

// SCENARIO B: User blocks parent "Company Update" → all children blocked
{
  const ann = makeAnn('Company Update', 'Acquisition');
  const prefs = makePrefs(['Company Update']);
  const r = shouldNotify({ prefs, announcement: ann, uid: 'scenario_B' });
  assert(
    'SCENARIO B — Parent "Company Update" blocked → all children blocked',
    r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_PARENT
  );
}

// SCENARIO C: User blocks unrelated category → this announcement goes through
{
  const ann = makeAnn('Company Update', 'Acquisition');
  const prefs = makePrefs(['Result']);
  const r = shouldNotify({ prefs, announcement: ann, uid: 'scenario_C' });
  assert(
    'SCENARIO C — Unrelated category blocked → notification still delivered',
    r.shouldNotify === true && r.reason === BLOCK_REASONS.ALLOWED
  );
}

// SCENARIO D: User blocks "Cessation", announcement is "Board Meeting" → goes through
{
  const ann = makeAnn('Board Meeting', 'Outcome of Board Meeting');
  const prefs = makePrefs(['Cessation']);
  const r = shouldNotify({ prefs, announcement: ann, uid: 'scenario_D' });
  assert(
    'SCENARIO D — "Cessation" blocked, unrelated announcement → delivers',
    r.shouldNotify === true
  );
}

// SCENARIO E: User blocks parent "Result" → "Financial Results" (child) should be blocked
{
  const ann = makeAnn('Financial Results', '');
  const prefs = makePrefs(['Result']);
  const r = shouldNotify({ prefs, announcement: ann, uid: 'scenario_E' });
  assert(
    'SCENARIO E — Parent "Result" blocked, "Financial Results" (child via resolveCategoryGroup) → block',
    r.shouldNotify === false
  );
}

// SCENARIO F: category IS the raw subcategory string that user blocked
{
  const ann = makeAnn('Cessation', '');
  const prefs = makePrefs(['Cessation']);
  const r = shouldNotify({ prefs, announcement: ann, uid: 'scenario_F' });
  assert(
    'SCENARIO F — Raw category string exactly matches blocked entry → block',
    r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_CATEGORY
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========== RESULTS ==========');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
if (failed === 0) {
  console.log('\n  🎉 All tests passed!\n');
} else {
  console.log('\n  ⚠️  Some tests FAILED. Check above.\n');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Return Shape Tests (engineering spec requirements)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========== RETURN SHAPE TESTS ==========\n');

// Shape 1: ALLOWED decision has all required fields
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeAnn('Company Update', 'Acquisition'), uid: 'user1', notificationChannel: 'push' });
  assert('Shape 1 — ALLOWED has shouldNotify=true',     r.shouldNotify === true);
  assert('Shape 1 — ALLOWED has matchedCategory',       r.matchedCategory === 'Company Update');
  assert('Shape 1 — ALLOWED has matchedSubCategory',    r.matchedSubCategory === 'Acquisition');
  assert('Shape 1 — ALLOWED has blockedBy=null',        r.blockedBy === null);
  assert('Shape 1 — ALLOWED has notificationChannel',   r.notificationChannel === 'push');
  assert('Shape 1 — ALLOWED reason is ALLOWED',         r.reason === BLOCK_REASONS.ALLOWED);
}

// Shape 2: BLOCKED decision has all required fields
{
  const r = shouldNotify({ prefs: makePrefs(['Acquisition']), announcement: makeAnn('Company Update', 'Acquisition'), uid: 'user2', notificationChannel: 'telegram' });
  assert('Shape 2 — BLOCKED has shouldNotify=false',    r.shouldNotify === false);
  assert('Shape 2 — BLOCKED has matchedCategory',       r.matchedCategory === 'Company Update');
  assert('Shape 2 — BLOCKED has matchedSubCategory',    r.matchedSubCategory === 'Acquisition');
  assert('Shape 2 — BLOCKED has blockedBy=Acquisition', r.blockedBy === 'Acquisition');
  assert('Shape 2 — BLOCKED has notificationChannel',   r.notificationChannel === 'telegram');
  assert('Shape 2 — BLOCKED reason is BLOCKED_SUBCATEGORY', r.reason === BLOCK_REASONS.BLOCKED_SUBCATEGORY);
}

// Shape 3: Parent block sets blockedBy to parent name
{
  const r = shouldNotify({ prefs: makePrefs(['Company Update']), announcement: makeAnn('Company Update', 'Acquisition'), uid: 'user3' });
  assert('Shape 3 — Parent block sets blockedBy to parent group', typeof r.blockedBy === 'string' && r.blockedBy.length > 0);
}

// Shape 4: notificationChannel defaults to 'unknown' when not passed
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeAnn('Company Update', '') });
  assert('Shape 4 — notificationChannel defaults to unknown', r.notificationChannel === 'unknown');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — BSE vs NSE Exchange Parity Tests
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========== EXCHANGE PARITY TESTS ==========\n');

function makeNSEAnn(category, subCategory) {
  return { scriptName: 'NSE Corp', scriptCode: 'NSECORP', exchange: 'NSE', category, subCategory: subCategory || '' };
}

// Exchange 1: BSE — subCategory blocked
{
  const r = shouldNotify({ prefs: makePrefs(['Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018']), announcement: makeAnn('Company Update', 'Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018') });
  assert('Exchange 1 — BSE: exact subCategory blocked', r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_SUBCATEGORY);
}

// Exchange 2: NSE — same subCategory blocked — identical behavior
{
  const r = shouldNotify({ prefs: makePrefs(['Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018']), announcement: makeNSEAnn('Company Update', 'Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018') });
  assert('Exchange 2 — NSE: exact subCategory blocked (same as BSE)', r.shouldNotify === false && r.reason === BLOCK_REASONS.BLOCKED_SUBCATEGORY);
}

// Exchange 3: BSE — nothing blocked → notify
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeAnn('Board Meeting', 'Outcome of Board Meeting') });
  assert('Exchange 3 — BSE: nothing blocked → notify', r.shouldNotify === true);
}

// Exchange 4: NSE — nothing blocked → notify
{
  const r = shouldNotify({ prefs: makePrefs([]), announcement: makeNSEAnn('Board Meeting', 'Outcome of Board Meeting') });
  assert('Exchange 4 — NSE: nothing blocked → notify', r.shouldNotify === true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========== FINAL RESULTS ==========');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
if (failed === 0) {
  console.log('\n  🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.log('\n  ⚠️  Some tests FAILED. Check above.\n');
  process.exit(1);
}
