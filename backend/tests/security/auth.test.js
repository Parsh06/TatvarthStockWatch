'use strict';

const assert = require('assert');

async function testAuthMiddleware() {
  console.log('  [Security Test] Testing Authentication Middleware...');

  const { verifyToken, SECURE_MODE } = require('../../middleware/authenticateFirebase');

  // Mock Request & Response objects
  function createMockReqRes(headers = {}) {
    const req = { headers };
    const res = {
      statusCode: 200,
      jsonPayload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonPayload = data;
        return this;
      }
    };
    return { req, res };
  }

  if (SECURE_MODE) {
    // 1. Missing Authorization header (secure mode)
    {
      const { req, res } = createMockReqRes({});
      let nextCalled = false;
      await verifyToken(req, res, () => { nextCalled = true; });

      assert.strictEqual(res.statusCode, 401, 'Missing token must return 401 in secure mode');
      assert.strictEqual(nextCalled, false, 'Next should not be called when unauthenticated');
      assert.strictEqual(res.jsonPayload.code, 'UNAUTHORIZED', 'Error code must be UNAUTHORIZED');
    }

    // 2. Invalid Bearer Token format
    {
      const { req, res } = createMockReqRes({ authorization: 'Bearer invalid.jwt.token' });
      let nextCalled = false;
      await verifyToken(req, res, () => { nextCalled = true; });

      assert.strictEqual(res.statusCode, 401, 'Invalid token must return 401');
      assert.strictEqual(nextCalled, false, 'Next should not be called for invalid token');
      assert.strictEqual(res.jsonPayload.code, 'INVALID_TOKEN', 'Error code must be INVALID_TOKEN');
    }
  } else {
    // Local mode test
    const { req, res } = createMockReqRes({});
    let nextCalled = false;
    await verifyToken(req, res, () => { nextCalled = true; });

    assert.strictEqual(req.uid, 'local');
    assert.strictEqual(nextCalled, true);
  }

  // 3. Test Parameter Stripping & Ownership Helper
  const { stripClientUserParams, checkOwnership } = require('../../middleware/authorization');
  {
    const userA = 'uid_user_A';
    const userB = 'uid_user_B';

    assert.strictEqual(checkOwnership({ user: { uid: userA } }, userA), true);
    assert.strictEqual(checkOwnership({ user: { uid: userA } }, userB), false);

    const req = {
      user: { uid: userA },
      body: { userId: userB, scriptName: 'MBEL' },
      query: { userId: userB }
    };
    let nextCalled = false;
    stripClientUserParams(req, {}, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.body.userId, undefined, 'Spoofed body.userId must be deleted');
    assert.strictEqual(req.query.userId, undefined, 'Spoofed query.userId must be deleted');
  }

  console.log('  [Security Test] ✅ Authentication Middleware Tests Passed!');
}

if (require.main === module) {
  testAuthMiddleware().catch(err => {
    console.error('❌ Auth Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { testAuthMiddleware };
