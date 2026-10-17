'use strict';

/**
 * migrateClients.js
 *
 * One-time database migration script to configure the 3 founding clients:
 * 1. korojitha@gmail.com       -> Role: Admin (read: true, write: true), Approval: Approved, Unlimited access to everything without requiring any plan
 * 2. tatvarthcapital@gmail.com -> Role: User, Approval: Approved, Plan: Premium HNI Lifetime (Active, No Expiry)
 * 3. cpjain1980@gmail.com      -> Role: User, Approval: Approved, Plan: Premium HNI Lifetime (Active, No Expiry)
 * Also seeds both emails in approved_emails collection (including cpjain@gmail.com alias) for repeat login retention.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { db, admin } = require('../lib/firebaseAdmin');

const CLIENTS = [
  {
    uid: 'nfiKRtg9klcxy3E7rjpP8DUz7bw1',
    email: 'korojitha@gmail.com',
    role: 'admin',
    entitlements: { read: true, write: true },
    approvalStatus: 'approved',
    disabled: false,
    plan: 'admin',
    planStatus: 'active',
    planExpiresAt: null,
    planNotes: 'Master Super Admin — Unlimited Platform Access',
  },
  {
    uid: '7Rz015pII2VTsRM5WB2bI8Ey39i1',
    email: 'tatvarthcapital@gmail.com',
    role: 'user',
    entitlements: { read: false, write: false },
    approvalStatus: 'approved',
    disabled: false,
    plan: 'premium',
    planStatus: 'active',
    planExpiresAt: null, // Lifetime
    planNotes: 'Founding Client — Premium HNI Lifetime Allotment',
  },
  {
    uid: 'TJDoOGyERQTi0mAHDnTCRYIWKdw1',
    email: 'cpjain1980@gmail.com',
    role: 'user',
    entitlements: { read: false, write: false },
    approvalStatus: 'approved',
    disabled: false,
    plan: 'premium',
    planStatus: 'active',
    planExpiresAt: null, // Lifetime
    planNotes: 'Founding Client — Premium HNI Lifetime Allotment',
  },
];

// List of all approved emails to register in approved_emails
const APPROVED_EMAILS_REGISTRY = [
  { email: 'korojitha@gmail.com', uid: 'nfiKRtg9klcxy3E7rjpP8DUz7bw1', note: 'Admin Master' },
  { email: 'tatvarthcapital@gmail.com', uid: '7Rz015pII2VTsRM5WB2bI8Ey39i1', note: 'Premium Client' },
  { email: 'cpjain1980@gmail.com', uid: 'TJDoOGyERQTi0mAHDnTCRYIWKdw1', note: 'Premium Client' },
  { email: 'cpjain@gmail.com', uid: 'TJDoOGyERQTi0mAHDnTCRYIWKdw1', note: 'Premium Client (Alias)' },
];

async function runMigration() {
  console.log('\n===============================================================');
  console.log('  MIGRATING 3 FOUNDING CLIENTS & REGISTERING APPROVED EMAILS');
  console.log('===============================================================\n');

  const now = admin.firestore.FieldValue.serverTimestamp();

  // 1. Update user documents in Firestore
  for (const client of CLIENTS) {
    const userRef = db.collection('users').doc(client.uid);
    const snap = await userRef.get();
    const existing = snap.exists ? snap.data() : {};

    const payload = {
      email: client.email,
      role: client.role,
      entitlements: client.entitlements,
      approvalStatus: client.approvalStatus,
      approvedAt: existing.approvedAt || now,
      approvedBy: existing.approvedBy || 'system_migration',
      disabled: client.disabled,
      disabledReason: null,
      disabledAt: null,
      disabledBy: null,
      plan: client.plan,
      planStatus: client.planStatus,
      planExpiresAt: client.planExpiresAt,
      planStartedAt: existing.planStartedAt || now,
      planNotes: client.planNotes,
      updatedAt: now,
    };

    // If client is user with premium, record in planHistory
    if (client.plan === 'premium') {
      payload.planHistory = admin.firestore.FieldValue.arrayUnion({
        plan: 'premium',
        action: 'FOUNDING_ALLOTMENT',
        durationMonths: null, // Lifetime
        timestamp: new Date().toISOString(),
        assignedBy: 'system_migration',
        notes: client.planNotes,
      });
    }

    await userRef.set(payload, { merge: true });

    // Ensure Firebase Auth disabled status is synced
    try {
      await admin.auth().updateUser(client.uid, { disabled: false });
    } catch (e) {
      console.warn(`[Auth update note for ${client.email}]: ${e.message}`);
    }

    console.log(`✅ Updated User: ${client.email} (${client.uid})`);
    console.log(`   Role:           ${client.role}`);
    console.log(`   Entitlements:   ${JSON.stringify(client.entitlements)}`);
    console.log(`   ApprovalStatus: ${client.approvalStatus}`);
    console.log(`   Plan:           ${client.plan}`);
    console.log(`   PlanStatus:     ${client.planStatus}`);
    console.log(`   PlanExpiresAt:  ${client.planExpiresAt || 'Never (Lifetime)'}`);
    console.log('');
  }

  // 2. Register all in approved_emails collection
  console.log('Registering emails in approved_emails collection...');
  for (const item of APPROVED_EMAILS_REGISTRY) {
    const cleanEmail = item.email.toLowerCase().trim();
    await db.collection('approved_emails').doc(cleanEmail).set({
      email: cleanEmail,
      uid: item.uid,
      note: item.note,
      approvedAt: now,
      approvedBy: 'system_migration',
    }, { merge: true });
    console.log(`  ✓ Registered approved email: ${cleanEmail}`);
  }

  // 3. Write immutable audit log
  try {
    await db.collection('admin_audit_log').add({
      actorUid: 'system_migration',
      actorEmail: 'system@stockwatch.internal',
      action: 'MIGRATE_FOUNDING_CLIENTS',
      targetUid: 'multiple',
      payload: {
        updatedUsers: CLIENTS.map(c => ({ uid: c.uid, email: c.email, role: c.role, plan: c.plan })),
        registeredEmails: APPROVED_EMAILS_REGISTRY.map(i => i.email),
      },
      timestamp: now,
    });
    console.log('\n✅ Audit log written successfully.');
  } catch (auditErr) {
    console.warn(`Audit log note: ${auditErr.message}`);
  }

  console.log('\n===============================================================');
  console.log('  FOUNDING CLIENTS MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('===============================================================\n');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('\n❌ MIGRATION FAILED:', err);
  process.exit(1);
});
