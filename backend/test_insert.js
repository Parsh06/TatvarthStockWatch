require('dotenv').config();
const admin = require('firebase-admin');
require('./lib/firebaseAdmin');
const prefsStore = require('./lib/prefsStore');
const { shouldNotify } = require('./lib/notificationFilter');
const { sendWebPushToUser } = require('./lib/webPushNotifier');

async function run() {
  const user = await admin.auth().getUserByEmail('korojitha@gmail.com');
  const uid = user.uid;
  console.log('User UID:', uid);

  // Set up preferences
  await prefsStore.savePrefs(uid, {
    blockedCategories: ['Board Meeting']
  });
  console.log('Blocked category: Board Meeting');

  const prefs = await prefsStore.getPrefs(uid);

  const annBlocked = {
    id: 'TEST-BLOCKED-' + Date.now(),
    scriptName: 'TEST SCRIPT',
    scriptCode: '999999',
    exchange: 'BSE',
    category: 'Board Meeting',
    subCategory: 'Board Meeting',
    subject: 'TEST BLOCKED ANNOUNCEMENT',
    pdfUrl: 'https://example.com/b.pdf'
  };

  const annUnblocked = {
    id: 'TEST-UNBLOCKED-' + Date.now(),
    scriptName: 'TEST SCRIPT',
    scriptCode: '999999',
    exchange: 'BSE',
    category: 'Company Update',
    subCategory: 'Acquisition',
    subject: 'TEST UNBLOCKED ANNOUNCEMENT',
    pdfUrl: 'https://example.com/u.pdf'
  };

  console.log('\n--- Processing Blocked Announcement ---');
  let decision = shouldNotify({ prefs, announcement: annBlocked, uid, notificationChannel: 'push+telegram' });
  if (decision.shouldNotify) {
     await sendWebPushToUser(uid, {
        title: `${annBlocked.scriptName || annBlocked.scriptCode} (${annBlocked.exchange || 'BSE'})`,
        body: `[${annBlocked.category || 'Announcement'}] ${annBlocked.subject || 'New update'}`,
        url: annBlocked.pdfUrl || `https://tatvarthstockwatch.web.app/`,
        tag: `ann-${String(annBlocked.id).slice(0, 20)}`,
     });
  } else {
     console.log('Successfully blocked by filter');
  }

  console.log('\n--- Processing Unblocked Announcement ---');
  decision = shouldNotify({ prefs, announcement: annUnblocked, uid, notificationChannel: 'push+telegram' });
  if (decision.shouldNotify) {
     await sendWebPushToUser(uid, {
        title: `${annUnblocked.scriptName || annUnblocked.scriptCode} (${annUnblocked.exchange || 'BSE'})`,
        body: `[${annUnblocked.category || 'Announcement'}] ${annUnblocked.subject || 'New update'}`,
        url: annUnblocked.pdfUrl || `https://tatvarthstockwatch.web.app/`,
        tag: `ann-${String(annUnblocked.id).slice(0, 20)}`,
     });
  } else {
     console.log('Incorrectly blocked by filter');
  }

  process.exit(0);
}

run().catch(console.error);
