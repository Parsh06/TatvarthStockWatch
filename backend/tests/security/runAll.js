'use strict';

const { testAuthMiddleware } = require('./auth.test');
const { testWatchlistAuthorization } = require('./watchlistAuthorization.test');
const { testResponseSanitization } = require('./responseSanitization.test');

async function runAllSecurityTests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  StockWatch — Security & Privacy Test Suite');
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    await testAuthMiddleware();
    await testWatchlistAuthorization();
    await testResponseSanitization();

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  ✅ ALL SECURITY TESTS PASSED SUCCESSFULLY!');
    console.log('════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n❌ Security Test Suite Failed:', err.message);
    process.exit(1);
  }
}

runAllSecurityTests();
