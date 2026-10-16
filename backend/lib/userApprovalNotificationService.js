'use strict';

/**
 * userApprovalNotificationService.js
 *
 * Dispatches instant Web Push and Telegram notifications to Admin staff
 * when a new user signs up or requests access to StockWatch.
 */

const { db } = require('./firebaseAdmin');
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
  const userEmail = email || 'No email provided';
  const userName = displayName || userEmail.split('@')[0] || 'New Investor';

  console.log(`[ApprovalNotifier] Alerting admins of new access request from: ${userEmail} (${uid})`);

  // 1. Discover all Admin users in Firestore
  let adminUids = [];
  try {
    const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
    adminUids = adminSnap.docs.map(d => d.id);
  } catch (err) {
    console.warn('[ApprovalNotifier] Error discovering admin UIDs:', err.message);
  }

  const pushTitle = `🛡️ New Access Request: ${userName}`;
  const pushBody = `${userEmail} has registered and is waiting for your access approval.`;
  const pushUrl = `/admin?tab=users&filter=pending`;

  // 2. Dispatch Web Push to Admin Devices
  let pushSentCount = 0;
  for (const adminUid of adminUids) {
    try {
      const res = await sendWebPushToUser(adminUid, {
        title: pushTitle,
        body: pushBody,
        url: pushUrl,
        tag: `admin-approval-${uid}`,
        type: 'admin-approval',
        actions: [
          { action: 'review-user', title: 'Review & Approve' },
          { action: 'dismiss', title: 'Later' }
        ]
      });
      if (res && res.sent) pushSentCount += res.sent;
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

  console.log(`[ApprovalNotifier] Finished: adminsNotified=${adminUids.length}, pushSent=${pushSentCount}, telegramSent=${telegramSent}`);

  return {
    adminsCount: adminUids.length,
    pushSentCount,
    telegramSent,
  };
}

module.exports = {
  notifyAdminsOfNewAccessRequest,
};
