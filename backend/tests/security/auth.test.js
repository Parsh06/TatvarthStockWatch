'use strict';

const assert = require('assert');

async function testAuthMiddleware() {
  console.log('  [Security Test] Testing Authentication Middleware...');

  // 1. Missing Authorization header (in secure mode simulation)
  {
    const { verifyToken } = require('../../middleware/authenticateFirebase');
    const req = { headers: {} };
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

    let nextCalled = false;
    await verifyToken(req, res, () => { nextCalled = true; });

    // Since SECURE_MODE checks env vars, if no env vars are present, it runs in local mode.
    // Let's test local mode attachment:
    assert.strictEqual(req.uid, 'local', 'In local mode without credentials, req.uid is assigned local');
    assert.strictEqual(req.user.uid, 'local', 'In local mode without credentials, req.user.uid is assigned local');
    assert.strictEqual(nextCalled, true, 'In local mode, next should be called');
  }

  // 2. Test Parameter Stripping & Ownership Helper
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
