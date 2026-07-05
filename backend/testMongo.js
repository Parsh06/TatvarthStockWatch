require('dotenv').config();
const { getDb, clientPromise } = require('./lib/mongoClient');
const { saveAnnouncements, getAnnouncements } = require('./lib/announcementStore');
const { addScript, getWatchlist } = require('./lib/watchlistStore');

async function runTest() {
  console.log('Testing MongoDB connection...');
  try {
    const db = await getDb();
    console.log('✅ Connected to MongoDB:', db.databaseName);

    console.log('\n--- Testing Announcements ---');
    const dummyAnnouncement = {
      id: `TEST-${Date.now()}`,
      exchange: 'BSE',
      scriptCode: '999999',
      scriptName: 'TEST SCRIPT',
      subject: 'This is a test announcement',
      announcementDate: new Date().toISOString()
    };
    
    console.log('1. Saving dummy announcement...');
    const saveResult = await saveAnnouncements([dummyAnnouncement]);
    console.log('Save result:', saveResult);

    console.log('2. Fetching announcement...');
    const fetchedAnns = await getAnnouncements({ scriptCode: '999999' });
    console.log('Fetched announcements:', fetchedAnns.length);
    if (fetchedAnns.length > 0 && fetchedAnns[0].subject === 'This is a test announcement') {
      console.log('✅ Announcements test PASSED!');
    } else {
      console.log('❌ Announcements test FAILED.');
    }

    // Clean up announcement
    await db.collection('announcements').deleteMany({ scriptCode: '999999' });

    console.log('\n--- Testing Watchlists ---');
    const dummyUid = 'test-uid-123';
    const dummyScript = {
      ltdCode: '888888',
      symbol: 'TESTSYM',
      scriptName: 'TEST WATCHLIST SCRIPT',
      exchange: 'BOTH'
    };

    console.log('1. Adding script to watchlist...');
    const addResult = await addScript(dummyUid, dummyScript);
    console.log('Add result:', addResult);

    console.log('2. Fetching watchlist for user...');
    const wl = await getWatchlist(dummyUid);
    console.log('Watchlist length:', wl.length);
    if (wl.length > 0 && wl[0].ltdCode === '888888') {
      console.log('✅ Watchlist test PASSED!');
    } else {
      console.log('❌ Watchlist test FAILED.');
    }

    // Clean up watchlist
    await db.collection('watchlists').deleteMany({ userId: dummyUid });

    console.log('\nAll tests completed successfully!');
    
  } catch (err) {
    console.error('❌ Error during test:', err);
  } finally {
    const client = await clientPromise;
    await client.close();
  }
}

runTest();
