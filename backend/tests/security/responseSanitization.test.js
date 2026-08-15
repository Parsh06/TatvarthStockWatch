'use strict';

const assert = require('assert');
const {
  sanitizeWatchlistScript,
  sanitizeApplicant,
  sanitizeDashboardOverview,
} = require('../../utils/sanitizeResponse');

async function testResponseSanitization() {
  console.log('  [Security Test] Testing Response Sanitization DTOs...');

  // 1. Sanitize Watchlist script
  const rawScript = {
    _id: '507f1f77bcf86cd799439011',
    ltdCode: '544470',
    symbol: 'mbel',
    scriptName: 'M B Engineering Ltd',
    userId: 'secret_user_uid_789',
    unneededInternalMetadata: 'should_be_stripped',
  };
  const cleanScript = sanitizeWatchlistScript(rawScript);

  assert.strictEqual(cleanScript.id, '507f1f77bcf86cd799439011', 'ID should be normalized');
  assert.strictEqual(cleanScript.symbol, 'MBEL', 'Symbol should be uppercase');
  assert.strictEqual(cleanScript.userId, undefined, 'userId must be stripped from response');
  assert.strictEqual(cleanScript.unneededInternalMetadata, undefined, 'Internal metadata must be stripped');

  // 2. Sanitize Family Applicant (PAN Protection)
  const rawApplicant = {
    _id: 'app_123',
    name: 'Parsh Jain',
    pan: 'ABCDE1234F',
    panIv: 'iv_secret',
    panEncrypted: 'enc_secret',
    panAuthTag: 'auth_tag_secret',
  };
  const cleanApplicant = sanitizeApplicant(rawApplicant);

  assert.strictEqual(cleanApplicant.maskedPan, 'XXXXXX234F', 'PAN must be properly masked');
  assert.strictEqual(cleanApplicant.pan, undefined, 'Plain text PAN must not exist on output object');
  assert.strictEqual(cleanApplicant.panEncrypted, undefined, 'Encrypted PAN details must not be returned');
  assert.strictEqual(cleanApplicant.panIv, undefined, 'IV must not be returned');

  // 3. Sanitize Dashboard Overview
  const rawDashboard = {
    success: true,
    userId: 'secret_uid_123',
    watchlist: {
      userId: 'secret_uid_123',
      scriptCount: 5,
      topCompanies: [{ name: 'Nava Ltd', bseCode: '513023', symbol: 'NAVA', total: 2 }]
    }
  };
  const cleanDashboard = sanitizeDashboardOverview(rawDashboard);

  assert.strictEqual(cleanDashboard.userId, undefined, 'Top-level userId must be removed from dashboard response');
  assert.strictEqual(cleanDashboard.watchlist.userId, undefined, 'Nested watchlist userId must be removed from dashboard response');

  console.log('  [Security Test] ✅ Response Sanitization Tests Passed!');
}

if (require.main === module) {
  testResponseSanitization().catch(err => {
    console.error('❌ Response Sanitization Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { testResponseSanitization };
