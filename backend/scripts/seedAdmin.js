/**
 * seedAdmin.js
 *
 * One-time bootstrap script to grant admin role to a user.
 *
 * Usage:
 *   node backend/scripts/seedAdmin.js <uid> [read=true] [write=true]
 *
 * Examples:
 *   # Grant read + write (full admin)
 *   node backend/scripts/seedAdmin.js abc123uid true true
 *
 *   # Grant read-only admin
 *   node backend/scripts/seedAdmin.js abc123uid true false
 *
 *   # Demote back to user
 *   node backend/scripts/seedAdmin.js abc123uid false false
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const [, , uid, rawRead = 'true', rawWrite = 'true'] = process.argv;

if (!uid) {
  console.error('Usage: node seedAdmin.js <uid> [read=true] [write=true]');
  process.exit(1);
}

const grantRead  = rawRead  !== 'false';
const grantWrite = rawWrite !== 'false';

async function run() {
  const { db } = require('../lib/firebaseAdmin');

  await db.collection('users').doc(uid).set(
    {
      role: 'admin',
      entitlements: {
        read: grantRead,
        write: grantWrite,
      },
      disabled: false,
    },
    { merge: true }
  );

  console.log('');
  console.log('✅ Admin role seeded successfully!');
  console.log(`   UID:         ${uid}`);
  console.log(`   Role:        admin`);
  console.log(`   Read:        ${grantRead}`);
  console.log(`   Write:       ${grantWrite}`);
  console.log('');
  console.log('The user must sign out and sign back in for the new role to take effect.');
  console.log('');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
