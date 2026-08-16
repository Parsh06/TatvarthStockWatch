'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { processNewAnnouncements } = require('../../lib/notificationEngine');
const { rebuildNotificationRegistry } = require('../../lib/notification/notificationRegistryRebuilder');
const redisNotifStore = require('../../lib/redis/redisNotificationStore');

async function runInvertedEngineTest() {
  console.log('=== Enterprise Inverted Notification Engine Verification Test ===\n');

  try {
    // Step 1: Rebuild registry
    console.log('1. Rebuilding Redis Notification Registry...');
    const rebuildRes = await rebuildNotificationRegistry();
    console.log('Registry Rebuild Status:', rebuildRes);

    // Step 2: Test Announcements
    const testAnnouncements = [
      {
        id: `INV_TEST_BLOCKED_${Date.now()}`,
        scriptName: 'NAVA',
        scriptCode: '513023',
        symbol: 'NAVA',
        exchange: 'BSE',
        category: 'Acquisition', // Blocked for korojitha@gmail.com
        subject: '[INVERTED TEST] Acquisition Announcement (SHOULD BE BLOCKED)',
        pdfUrl: 'https://tatvarthstockwatch.web.app',
        announcementDate: new Date().toISOString()
      },
      {
        id: `INV_TEST_UNBLOCKED_${Date.now()}`,
        scriptName: 'NAVA',
        scriptCode: '513023',
        symbol: 'NAVA',
        exchange: 'BSE',
        category: 'Board Meeting', // Unblocked for korojitha@gmail.com
        subject: '[INVERTED TEST] Board Meeting Announcement (SHOULD BE DISPATCHED)',
        pdfUrl: 'https://tatvarthstockwatch.web.app',
        announcementDate: new Date().toISOString()
      }
    ];

    process.env.NOTIFICATION_ENGINE_MODE = 'inverted';
    console.log('\n2. Running processNewAnnouncements in INVERTED mode...');
    const stats = await processNewAnnouncements(testAnnouncements, 'test-run-1', true);

    console.log('\n3. Execution Stats:');
    console.log(JSON.stringify(stats, null, 2));

    console.log('\n✅ Verification Complete!');
  } catch (err) {
    console.error('❌ Test Error:', err);
  } finally {
    process.exit(0);
  }
}

runInvertedEngineTest();
