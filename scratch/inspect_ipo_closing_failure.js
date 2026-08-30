'use strict';

require('dotenv').config({ path: '../backend/.env' });
const { admin } = require('../backend/lib/firebaseAdmin');
const { getDb } = require('../backend/lib/mongoClient');
const prefsStore = require('../backend/lib/prefsStore');
const pushStore = require('../backend/lib/pushStore');
const ipoClosingStore = require('../backend/lib/ipoClosingStore');
const { getISTDateString } = require('../backend/lib/time/istTime');

async function inspect() {
  console.log("=== IPO CLOSING INVESTIGATION ===");
  const todayIST = getISTDateString();
  console.log(`Today IST: ${todayIST}`);

  // 1. Check MongoDB for IPOs closing today
  const summary = await ipoClosingStore.getClosingIposSummary(todayIST);
  console.log("\n1. MongoDB `ipo_closing_today` Summary for today:");
  console.log(JSON.stringify(summary, null, 2));

  // 2. Look up user by email
  const email = 'cpjain1980@gmail.com';
  let uid = null;
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    uid = userRecord.uid;
    console.log(`\n2. User Found: ${email} -> UID: ${uid}`);
  } catch (err) {
    console.error(`\n2. User lookup failed for ${email}:`, err.message);
    process.exit(1);
  }

  // 3. Check user preferences
  if (uid) {
    const prefs = await prefsStore.getPrefs(uid);
    console.log(`\n3. User Preferences for ${uid}:`);
    console.log(JSON.stringify(prefs, null, 2));
  }

  // 4. Check user's registered push devices
  if (uid) {
    const devices = await pushStore.getAllDevices(uid);
    console.log(`\n4. User Push Devices (${devices.length}):`);
    devices.forEach((d, i) => {
      console.log(`  Device ${i+1}:`);
      console.log(`    deviceId: ${d.deviceId}`);
      console.log(`    platform: ${d.platform || 'N/A'}, browser: ${d.browser || 'N/A'}`);
      console.log(`    createdAt: ${d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt}`);
      console.log(`    lastSeenAt: ${d.lastSeenAt?.toDate ? d.lastSeenAt.toDate().toISOString() : d.lastSeenAt}`);
      console.log(`    endpoint: ${d.subscription?.endpoint?.substring(0, 50)}...`);
    });
  }

  process.exit(0);
}

inspect().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
