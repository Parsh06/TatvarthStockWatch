const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { admin, db } = require('../lib/firebaseAdmin');
const { classifyAnnouncementBatch } = require('../lib/categoryClassifier');
const { compileBlockedFilter, shouldNotify } = require('../lib/notificationFilter');
const { matchesNotificationScope, SCOPE } = require('../lib/notificationScope');
const prefsStore = require('../lib/prefsStore');
const watchlistStore = require('../lib/watchlistStore');
const { sendWebPushToUser } = require('../lib/webPushNotifier');

async function testCategoryBlocking() {
  const email = 'korojitha@gmail.com';
  console.log(`Starting test for ${email}`);

  try {
    const user = await admin.auth().getUserByEmail(email);
    const uid = user.uid;

    const fakeAnnouncements = [
      {
        id: `TEST_BLOCKED_${Date.now()}`,
        scriptName: 'NAVA',
        scriptCode: '513023',
        exchange: 'BSE',
        category: 'Acquisition', // Blocked
        subject: '[TEST] This is an Acquisition announcement (SHOULD BE BLOCKED)',
        pdfUrl: 'https://tatvarthstockwatch.web.app',
        announcementDate: new Date().toISOString()
      },
      {
        id: `TEST_UNBLOCKED_${Date.now()}`,
        scriptName: 'NAVA',
        scriptCode: '513023',
        exchange: 'BSE',
        category: 'Board Meeting', // Unblocked
        subject: '[TEST] This is a Board Meeting announcement (SHOULD NOT BE BLOCKED)',
        pdfUrl: 'https://tatvarthstockwatch.web.app',
        announcementDate: new Date().toISOString()
      }
    ];

    const classified = classifyAnnouncementBatch(fakeAnnouncements);
    console.log('\n--- Classification Results ---');
    classified.forEach(c => {
      console.log(`- ${c.announcement.id}: ${c.classification.primaryCategory}`);
    });

    const prefs = await prefsStore.getPrefs(uid);
    console.log(`\nUser Blocked Categories:`, prefs.blockedCategories);

    let scope = prefs.notificationScope || SCOPE.WATCHLIST_ONLY;
    let bseSet = new Set();
    let nseSet = new Set();
    if (scope === SCOPE.WATCHLIST_ONLY) {
      const w = await watchlistStore.getWatchlist(uid);
      w.forEach(s => {
        if (s.bseCode || s.ltdCode) bseSet.add((s.bseCode || s.ltdCode).toString().trim());
        if (s.nseSymbol || s.symbol) nseSet.add((s.nseSymbol || s.symbol).trim().toUpperCase());
      });
    }

    const compiledFilter = compileBlockedFilter(prefs.blockedCategories);

    for (const { announcement, classification } of classified) {
      console.log(`\nProcessing ${announcement.id}...`);

      const scopeMatch = matchesNotificationScope({ announcement, scope, bseSet, nseSet });
      if (!scopeMatch.inScope) {
        console.log(`❌ Skipped: Not in scope (Watchlist match failed)`);
        continue;
      }

      const decision = shouldNotify({
        compiledFilter,
        classification,
        announcement,
        notificationChannel: 'push'
      });

      if (!decision.shouldNotify) {
        console.log(`🚫 BLOCKED: ${decision.reason} -> Category: ${classification.primaryCategory}`);
      } else {
        console.log(`✅ ALLOWED: -> Category: ${classification.primaryCategory}`);
        console.log(`Sending Web Push...`);
        const pushResult = await sendWebPushToUser(uid, {
          title: `[TEST] ${announcement.scriptName || announcement.scriptCode} (${announcement.exchange || 'BSE'})`,
          body:  `[${announcement.category || 'Announcement'}] ${announcement.subject || 'New update'}`,
          url:   announcement.pdfUrl,
          tag:   `test-ann-${Date.now()}`,
        });
        console.log(`Push Result:`, pushResult);
      }
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

testCategoryBlocking();
