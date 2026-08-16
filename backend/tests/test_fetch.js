const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { admin, db } = require('../lib/firebaseAdmin');

async function testFetch() {
  try {
    const email = 'korojitha@gmail.com';
    const user = await admin.auth().getUserByEmail(email);
    console.log('User ID:', user.uid);
    
    const prefsDoc = await db.collection('users').doc(user.uid).get();
    console.log('Prefs exists:', prefsDoc.exists);
    if (prefsDoc.exists) {
      console.log('Blocked Categories:', prefsDoc.data().prefs?.blockedCategories || []);
    }
    
    const pushDevicesSnap = await db.collection('users').doc(user.uid).collection('pushDevices').get();
    console.log(`Push devices count: ${pushDevicesSnap.size}`);
    pushDevicesSnap.forEach(doc => {
      const data = doc.data();
      console.log(`- Device ID: ${doc.id}`);
      console.log(`  Browser: ${data.browser}`);
      console.log(`  Platform: ${data.platform}`);
      console.log(`  CreatedAt: ${data.createdAt}`);
      console.log(`  LastSeenAt: ${data.lastSeenAt}`);
      console.log(`  Endpoint: ${data.subscription ? data.subscription.endpoint.substring(0, 50) + '...' : 'Missing'}`);
    });
    
  } catch (err) {
    console.error('Error fetching data:', err);
  } finally {
    process.exit(0);
  }
}

testFetch();
