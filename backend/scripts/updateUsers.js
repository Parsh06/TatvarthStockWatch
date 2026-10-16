'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const usersToUpdate = [
  {
    uid: '7Rz015pII2VTsRM5WB2bI8Ey39i1',
    email: 'tatvarthcapital@gmail.com',
    role: 'user',
    entitlements: { read: false, write: false },
    disabled: false,
  },
  {
    uid: 'TJDoOGyERQTi0mAHDnTCRYIWKdw1',
    email: 'cpjain1980@gmail.com',
    role: 'user',
    entitlements: { read: false, write: false },
    disabled: false,
  },
  {
    uid: 'nfiKRtg9klcxy3E7rjpP8DUz7bw1',
    email: 'korojitha@gmail.com',
    role: 'admin',
    entitlements: { read: true, write: true },
    disabled: false,
  },
];

async function updateAll() {
  const { db, admin } = require('../lib/firebaseAdmin');
  console.log('Connecting to Firestore to update users...\n');

  for (const u of usersToUpdate) {
    const userRef = db.collection('users').doc(u.uid);
    const existingSnap = await userRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() : {};

    const updatePayload = {
      email: u.email,
      role: u.role,
      entitlements: u.entitlements,
      disabled: u.disabled,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (u.disabled) {
      updatePayload.disabledAt = admin.firestore.FieldValue.serverTimestamp();
    } else {
      updatePayload.disabledAt = null;
      updatePayload.disabledBy = null;
      updatePayload.disabledReason = null;
    }

    await userRef.set(updatePayload, { merge: true });

    // Also verify or sync disabled status with Firebase Auth if exists
    try {
      await admin.auth().updateUser(u.uid, { disabled: u.disabled });
    } catch (authErr) {
      console.warn(`[Auth Warning for ${u.email}]: ${authErr.message}`);
    }

    console.log(`✅ Updated ${u.email} (${u.uid}):`);
    console.log(`   Role:         ${u.role}`);
    console.log(`   Entitlements: ${JSON.stringify(u.entitlements)}`);
    console.log(`   Disabled:     ${u.disabled}`);
    console.log('');
  }

  // Also write an audit log entry for this bootstrap operation
  try {
    await db.collection('admin_audit_log').add({
      actorUid: 'system_bootstrap',
      actorEmail: 'system@stockwatch.internal',
      action: 'BOOTSTRAP_ROLES',
      targetUid: 'multiple',
      payload: {
        updatedUsers: usersToUpdate.map(u => ({ uid: u.uid, email: u.email, role: u.role, entitlements: u.entitlements }))
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ Audit log record created.');
  } catch (auditErr) {
    console.warn(`Audit log note: ${auditErr.message}`);
  }

  console.log('\nAll users successfully updated in Firestore!');
  process.exit(0);
}

updateAll().catch(err => {
  console.error('❌ Failed to update users in Firestore:', err);
  process.exit(1);
});
