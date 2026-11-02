'use strict';

const { getCanonicalIpoKey } = require('../lib/ipoUtils');
const { isValidListingDate } = require('../lib/ipoAllotmentMath');

console.log('=== TEST 1: Canonical Key Normalization (& vs and vs Ltd) ===');
const k1 = getCanonicalIpoKey('Bombay Coated and Special Steels');
const k2 = getCanonicalIpoKey('Bombay Coated & Special Steels Ltd');
console.log('k1:', k1);
console.log('k2:', k2);
console.assert(k1 === k2, 'k1 and k2 must match');
console.log('  ✅ [PASS] Bombay Coated canonical match: ' + (k1 === k2));

const k3 = getCanonicalIpoKey('Antala Industries Ltd');
const k4 = getCanonicalIpoKey('Antala Industries');
console.assert(k3 === k4, 'k3 and k4 must match');
console.log('  ✅ [PASS] Antala canonical match: ' + (k3 === k4));

const k5 = getCanonicalIpoKey('Maxwell Engineering Solutions Ltd');
const k6 = getCanonicalIpoKey('Maxwell Engineering Solutions');
console.assert(k5 === k6, 'k5 and k6 must match');
console.log('  ✅ [PASS] Maxwell canonical match: ' + (k5 === k6));

console.log('\n=== TEST 2: isValidListingDate Validation ===');
console.assert(isValidListingDate('05 Nov 2026', '02 Nov 2026') === true, 'Listing after close must be valid');
console.log('  ✅ [PASS] Listing after close is valid');

console.assert(isValidListingDate('02 Nov 2026', '02 Nov 2026') === false, 'Listing on same day as close must be INVALID');
console.log('  ✅ [PASS] Listing on same day as close is INVALID');

console.assert(isValidListingDate('01 Nov 2026', '02 Nov 2026') === false, 'Listing before close must be INVALID');
console.log('  ✅ [PASS] Listing before close is INVALID');

console.assert(isValidListingDate('-', '02 Nov 2026') === false, 'Dash listing date is invalid');
console.log('  ✅ [PASS] Dash listing date is invalid');

console.assert(isValidListingDate(null, '02 Nov 2026') === false, 'Null listing date is invalid');
console.log('  ✅ [PASS] Null listing date is invalid');

console.assert(isValidListingDate('06 Nov 2026', '03 Nov 2026') === true, 'T+3 listing date is valid');
console.log('  ✅ [PASS] T+3 listing date is valid');

console.log('\n🎉 ALL DATE VALIDATION & CANONICAL MATCH TESTS PASSED!');

