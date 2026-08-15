'use strict';

const assert = require('assert');
const { stripClientUserParams, checkOwnership } = require('../../middleware/authorization');

async function testWatchlistAuthorization() {
  console.log('  [Security Test] Testing Watchlist Authorization & IDOR Protection...');

  // 1. Check ownership helper
  const userA = 'uid_user_A_123';
  const userB = 'uid_user_B_456';

  const reqUserA = { user: { uid: userA } };
  assert.strictEqual(checkOwnership(reqUserA, userA), true, 'User A should own User A resource');
  assert.strictEqual(checkOwnership(reqUserA, userB), false, 'User A must NOT own User B resource');

  // 2. Test parameter stripping (preventing user parameter injection / spoofing)
  const reqSpoofed = {
    user: { uid: userA },
    body: { userId: userB, scriptName: 'Test Script' },
    query: { userId: userB, filter: 'all' }
  };
  const res = {};
  let nextCalled = false;

  stripClientUserParams(reqSpoofed, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true, 'Middleware next should be called');
  assert.strictEqual(reqSpoofed.body.userId, undefined, 'req.body.userId spoof parameter must be stripped');
  assert.strictEqual(reqSpoofed.query.userId, undefined, 'req.query.userId spoof parameter must be stripped');

  console.log('  [Security Test] ✅ Watchlist Authorization & IDOR Tests Passed!');
}

if (require.main === module) {
  testWatchlistAuthorization().catch(err => {
    console.error('❌ Watchlist Authorization Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { testWatchlistAuthorization };
