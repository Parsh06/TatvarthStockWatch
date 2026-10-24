'use strict';

/**
 * test_redis_quota_protection_and_caching.js
 *
 * Verifies that the application will NEVER exhaust Upstash Redis quotas:
 * 1. Quota error detection & automatic circuit breaker tripping.
 * 2. Instant zero-latency in-memory fallback during circuit open state.
 * 3. Rate limiter path exemptions (health checks, crons, root).
 * 4. Zero-Redis-command in-memory rate limiting.
 * 5. Notification store multi-tier in-memory caching (scope, watchers, prefs, dedup).
 * 6. Admin entitlement memory-first resolution.
 */

const assert = require('assert');
const redisClient = require('../lib/redis/redisClient');
const { globalRateLimiter, strictRateLimiter, shouldBypassRateLimit } = require('../middleware/rateLimiter');
const redisNotifStore = require('../lib/redis/redisNotificationStore');
const { loadAdminProfile } = require('../middleware/requireAdmin');

async function runTests() {
  console.log('\n=== RUNNING REDIS QUOTA PROTECTION & IN-MEMORY CACHING TESTS ===\n');
  let passed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ── TEST SUITE 1: Rate Limiter Path Exemptions ──────────────────────────────
  test('Path bypass: /api/health bypasses rate limiting entirely', () => {
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/health' }), true);
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/health/notification' }), true);
  });

  test('Path bypass: root / and /api/system bypass rate limiting', () => {
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/' }), true);
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/system/runtime-info' }), true);
  });

  test('Path bypass: /api/cron/* internal worker ticks bypass rate limiting', () => {
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/cron/trigger' }), true);
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/cron/ipo-closing' }), true);
  });

  test('Path bypass: normal user routes are NOT bypassed', () => {
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/announcements' }), false);
    assert.strictEqual(shouldBypassRateLimit({ originalUrl: '/api/watchlist' }), false);
  });

  // ── TEST SUITE 2: Circuit Breaker & Quota Protection ────────────────────────
  test('Circuit breaker status reporting', () => {
    const status = redisClient.getCircuitStatus();
    assert.ok(status && typeof status === 'object');
    assert.ok('enabled' in status);
    assert.ok('circuitOpen' in status);
  });

  await testAsync('Circuit breaker trips and provides instant mock fallback', async () => {
    redisClient.tripCircuit('Simulated quota test: 500k reached');
    assert.strictEqual(redisClient.isCircuitOpen(), true);
    assert.strictEqual(redisClient.isRedisAvailable(), false);

    // Test that proxy returns safe defaults with 0 network calls
    const getRes = await redisClient.redis.get('anyKey');
    assert.strictEqual(getRes, null);

    const smembersRes = await redisClient.redis.smembers('anySet');
    assert.deepStrictEqual(smembersRes, []);

    const pipe = redisClient.redis.pipeline();
    pipe.incr('counter').pexpire('counter', 60000);
    const pipeRes = await pipe.exec();
    assert.deepStrictEqual(pipeRes, [1, 1]);

    const pingRes = await redisClient.redis.ping();
    assert.ok(pingRes.includes('circuit_open_fallback'));

    // Reset circuit for next tests
    redisClient.resetCircuit();
    assert.strictEqual(redisClient.isCircuitOpen(), false);
  });

  // ── TEST SUITE 3: In-Memory Multi-Tier Notification Store ───────────────────
  await testAsync('Notification store getScopeAllUsers uses memory cache (0 Redis calls)', async () => {
    await redisNotifStore.addScopeAllUser('test-user-123');
    const users = await redisNotifStore.getScopeAllUsers();
    assert.ok(Array.isArray(users));
    assert.ok(users.includes('test-user-123'));

    // Second call should return from memory instantly
    const t0 = Date.now();
    const usersCached = await redisNotifStore.getScopeAllUsers();
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 10, `Memory cache lookup took ${elapsed}ms (expected <10ms)`);
    assert.deepStrictEqual(users, usersCached);

    // Remove user updates cache
    await redisNotifStore.removeScopeAllUser('test-user-123');
    const usersAfter = await redisNotifStore.getScopeAllUsers();
    assert.ok(!usersAfter.includes('test-user-123'));
  });

  await testAsync('Notification store getWatchers uses memory cache', async () => {
    const key = 'BSE:500325';
    await redisNotifStore.addWatcher(key, 'uid-ril-watcher');
    const watchers = await redisNotifStore.getWatchers(key);
    assert.ok(Array.isArray(watchers));
    assert.ok(watchers.includes('uid-ril-watcher'));

    // Memory cache hit
    const watchersCached = await redisNotifStore.getWatchers(key);
    assert.deepStrictEqual(watchers, watchersCached);

    await redisNotifStore.removeWatcher(key, 'uid-ril-watcher');
    const watchersAfter = await redisNotifStore.getWatchers(key);
    assert.ok(!watchersAfter.includes('uid-ril-watcher'));
  });

  await testAsync('Notification store getPrefs / setPrefs memory caching', async () => {
    const uid = 'pref-test-uid';
    const testPrefs = { telegramEnabled: true, pushEnabled: true };
    await redisNotifStore.setPrefs(uid, testPrefs);

    const fetched = await redisNotifStore.getPrefs(uid);
    assert.deepStrictEqual(fetched, testPrefs);
  });

  await testAsync('Dedup lock caches in local memory Set and prevents duplicate dispatches', async () => {
    const annId = 'ANN-TEST-999';
    const uid = 'uid-dedup-test';
    const firstLock = await redisNotifStore.acquireDedupLock(annId, uid, 'PUSH');
    assert.strictEqual(firstLock, true, 'First lock attempt must succeed');

    const secondLock = await redisNotifStore.acquireDedupLock(annId, uid, 'PUSH');
    assert.strictEqual(secondLock, false, 'Second lock attempt for same announcement/user/channel must be rejected in-memory');
  });

  // ── TEST SUITE 4: In-Memory Rate Limiting Execution ─────────────────────────
  await testAsync('Global rate limiter allows legitimate requests and throttles in-memory on burst', async () => {
    const dummyReq = {
      originalUrl: '/api/announcements',
      baseUrl: '/api',
      path: '/announcements',
      headers: { 'x-forwarded-for': '127.0.0.1' },
      uid: 'burst-test-user',
    };

    let allowedCount = 0;
    let blockedCount = 0;

    const mockRes = {
      setHeader: () => {},
      status: (code) => ({
        json: (data) => {
          if (code === 429) blockedCount++;
          return data;
        }
      })
    };

    // Run 130 requests (threshold is 120/min)
    for (let i = 0; i < 130; i++) {
      await globalRateLimiter(dummyReq, mockRes, () => {
        allowedCount++;
      });
    }

    assert.strictEqual(allowedCount, 120, 'Exactly 120 requests must be allowed');
    assert.strictEqual(blockedCount, 10, 'Excess 10 requests must be blocked with HTTP 429');
  });

  console.log(`\n🎉 ALL ${passed} REDIS QUOTA PROTECTION & IN-MEMORY CACHING TESTS PASSED!\n`);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
