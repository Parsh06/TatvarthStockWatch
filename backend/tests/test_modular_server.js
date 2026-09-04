'use strict';

process.env.NODE_ENV = 'test';
const http = require('http');
const app = require('../server');

async function testEndpoint(server, port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json || data });
      });
    });

    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

async function runModularServerTests() {
  console.log('Testing Modular Server Routes...');
  let passed = 0;
  let failed = 0;

  function assert(desc, cond) {
    if (cond) {
      console.log(`  ✅ ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ ${desc}`);
      failed++;
    }
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 1. Health check
    const healthRes = await testEndpoint(server, port, '/api/health');
    assert('GET /api/health returns status 200 with status ok', healthRes.statusCode === 200 && healthRes.body.status === 'ok');

    // 2. Health notifications
    const notifHealthRes = await testEndpoint(server, port, '/api/health/notification');
    assert('GET /api/health/notification returns 200', notifHealthRes.statusCode === 200 && notifHealthRes.body.redis);

    // 3. Push public key
    const pushKeyRes = await testEndpoint(server, port, '/api/push/public-key');
    assert('GET /api/push/public-key returns 200 with publicKey field', pushKeyRes.statusCode === 200 && typeof pushKeyRes.body.publicKey === 'string');

    // 4. Cron unauthorized check
    const cronNoSecret = await testEndpoint(server, port, '/api/cron/trigger');
    assert('GET /api/cron/trigger without secret returns 401 Unauthorized', cronNoSecret.statusCode === 401);

    // 5. Protected route without auth check (e.g. watchlist)
    const watchlistNoAuth = await testEndpoint(server, port, '/api/watchlist');
    assert('GET /api/watchlist routes through auth middleware', [200, 401].includes(watchlistNoAuth.statusCode));

    // 6. Search redirect
    const searchRes = await testEndpoint(server, port, '/api/search/scripts?q=TCS');
    assert('GET /api/search/scripts redirects to /api/bse/search', [302, 301].includes(searchRes.statusCode) && (searchRes.headers.location || '').includes('/api/bse/search'));

    console.log(`\nModular server tests completed: ${passed} passed, ${failed} failed.`);
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    server.close();
    process.exit(1);
  }
}

runModularServerTests();
