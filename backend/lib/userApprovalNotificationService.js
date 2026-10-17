'use strict';

/**
 * userApprovalNotificationService.js
 *
 * Dispatches instant Web Push and Telegram notifications to Admin staff
 * when a new user signs up or requests access to StockWatch.
 */

const { db, admin } = require('./firebaseAdmin');
const { sendWebPushToUser } = require('./webPushNotifier');
const { sendMessage, isConfigured } = require('./telegramNotifier');

/**
 * Notify all admins of a new access request waiting for approval.
 *
 * @param {Object} params
 * @param {string} params.uid - User UID
 * @param {string} params.email - User email
 * @param {string} [params.displayName] - User display name
 */
async function notifyAdminsOfNewAccessRequest({ uid, email, displayName }) {
  if (!uid) return { error: 'UID is required' };
  const userEmail = (email || 'No email provided').toLowerCase().trim();
  const userName = displayName || userEmail.split('@')[0] || 'New Investor';

  console.log(`[ApprovalNotifier] Alerting admins of new access request from: ${userEmail} (${uid})`);

  // 1. Discover all Admin users in Firestore (Role query + Known admin emails fallback)
  const adminUidSet = new Set();
  try {
    const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
    adminSnap.docs.forEach(d => adminUidSet.add(d.id));
  } catch (err) {
    console.warn('[ApprovalNotifier] Error discovering admin UIDs by role query:', err.message);
  }

  // Fallback: Also check known founding admin emails / env vars
  const knownAdminEmails = [
    'korojitha@gmail.com',
    ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL.toLowerCase().trim()] : []),
    ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [])
  ].filter(Boolean);

  for (const aEmail of knownAdminEmails) {
    try {
      const emailSnap = await db.collection('users').where('email', '==', aEmail).limit(1).get();
      if (!emailSnap.empty) {
        adminUidSet.add(emailSnap.docs[0].id);
      }
    } catch {}
  }

  const adminUids = Array.from(adminUidSet);
  console.log(`[ApprovalNotifier] Discovered ${adminUids.length} admin(s) to notify:`, adminUids);

  const pushTitle = `🛡️ New Access Request: ${userName}`;
  const pushBody = `${userEmail} has registered and is waiting for your access approval.`;
  const pushUrl = `/admin?tab=users&filter=pending`;

  // 2. Dispatch Web Push to All Admin Devices
  let pushSentCount = 0;
  let pushDevicesAttempted = 0;
  const pushStore = require('./pushStore');

  for (const adminUid of adminUids) {
    try {
      const devices = await pushStore.getAllDevices(adminUid);
      pushDevicesAttempted += devices.length;

      console.log(`[ApprovalNotifier] Admin ${adminUid} has ${devices.length} registered push device(s):`, 
        devices.map(d => `${d.platform || 'unknown'}/${d.browser || 'unknown'}`).join(', ') || 'No devices'
      );

      if (devices.length > 0) {
        const res = await sendWebPushToUser(adminUid, {
          title: pushTitle,
          body: pushBody,
          url: pushUrl,
          tag: `admin-approval-${uid}`,
          type: 'admin-approval',
          urgency: 'high',
          priority: 'high',
          timestamp: Date.now(),
          data: {
            uid,
            email: userEmail,
            displayName: userName,
            requestedAt: new Date().toISOString(),
          },
          actions: [
            { action: 'review-user', title: 'Review & Approve' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        });

        if (res && res.sent) pushSentCount += res.sent;
      }
    } catch (pushErr) {
      console.warn(`[ApprovalNotifier] Push warning for admin ${adminUid}:`, pushErr.message);
    }
  }

  // 3. Dispatch Telegram Notification to Admin Channel
  const timeIST = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const tgMessage = `🛡️ <b>NEW ACCESS REQUEST WAITING FOR APPROVAL</b>\n\n` +
    `👤 <b>Name:</b> ${userName}\n` +
    `📧 <b>Email:</b> <code>${userEmail}</code>\n` +
    `🆔 <b>UID:</b> <code>${uid}</code>\n` +
    `⏰ <b>Requested At:</b> ${timeIST} IST\n\n` +
    `👉 <a href="https://tatvarthstockwatch.web.app/admin?tab=users&filter=pending">Review & Approve in Admin Control</a>`;

  let telegramSent = false;
  if (isConfigured()) {
    try {
      await sendMessage(tgMessage);
      telegramSent = true;
    } catch (tgErr) {
      console.warn('[ApprovalNotifier] Telegram alert warning:', tgErr.message);
    }
  }

  // 4. Record Audit Log entry in Firestore
  try {
    await db.collection('admin_audit_logs').add({
      actorUid: uid,
      actorEmail: userEmail,
      action: 'USER_ACCESS_REQUESTED',
      targetUid: uid,
      payload: {
        email: userEmail,
        displayName: userName,
        adminsNotified: adminUids.length,
        pushDevicesAttempted,
        pushSentCount,
        telegramSent,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (auditErr) {
    console.warn('[ApprovalNotifier] Audit log error:', auditErr.message);
  }

  console.log(`[ApprovalNotifier] Complete: adminsNotified=${adminUids.length}, devicesAttempted=${pushDevicesAttempted}, pushSent=${pushSentCount}, telegramSent=${telegramSent}`);

  return {
    success: true,
    adminsCount: adminUids.length,
    adminUids,
    pushDevicesAttempted,
    pushSentCount,
    telegramSent,
  };
}

module.exports = {
  notifyAdminsOfNewAccessRequest,
};
