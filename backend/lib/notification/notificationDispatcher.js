'use strict';

const { sendWebPushToUser } = require('../webPushNotifier');
const { getDb } = require('../mongoClient');

const MAX_CONCURRENCY = parseInt(process.env.PUSH_MAX_CONCURRENCY || '25', 10);

/**
 * Bounded parallel dispatch for push notifications.
 *
 * @param {Array<{ uid: string, announcement: object }>} items
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function dispatchPushBatch(items) {
  if (!items || items.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const auditRecords = [];

  // Process in chunks of MAX_CONCURRENCY
  for (let i = 0; i < items.length; i += MAX_CONCURRENCY) {
    const chunk = items.slice(i, i + MAX_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async ({ uid, announcement }) => {
        try {
          const pdfUrl = announcement.pdfUrl || announcement.attachment || announcement.attachmentUrl || null;
          const pushRes = await sendWebPushToUser(uid, {
            title: `${announcement.scriptName || announcement.scriptCode} (${announcement.exchange || 'BSE'})`,
            body:  `[${announcement.category || 'Announcement'}] ${announcement.subject || 'New update'}`,
            pdfUrl: pdfUrl,
            url:   pdfUrl || 'https://tatvarthstockwatch.web.app/',
            tag:   `ann-${String(announcement.id).slice(0, 20)}`,
            announcementId: String(announcement.id),
            companyCode: announcement.scriptCode || announcement.bseCode,
            companyName: announcement.scriptName || announcement.companyName,
            exchange: announcement.exchange || 'BSE',
            category: announcement.category || 'Announcement',
          });

          const isSent = (pushRes.sent || 0) > 0;
          auditRecords.push({
            announcementId: String(announcement.id),
            uid,
            channel: 'PUSH',
            decision: isSent ? 'SENT' : 'FAILED',
            dispatchedAt: new Date(),
          });

          return isSent;
        } catch (err) {
          auditRecords.push({
            announcementId: String(announcement.id),
            uid,
            channel: 'PUSH',
            decision: 'FAILED',
            providerError: err.message,
            dispatchedAt: new Date(),
          });
          return false;
        }
      })
    );

    results.forEach(res => {
      if (res) sent++;
      else failed++;
    });
  }

  // Asynchronously record audit log in MongoDB without blocking return path
  recordAuditLogsAsync(auditRecords).catch(() => {});

  return { sent, failed };
}

async function recordAuditLogsAsync(records) {
  if (!records || records.length === 0) return;
  try {
    const db = await getDb();
    await db.collection('notificationEvents').insertMany(records, { ordered: false });
  } catch (e) {
    // Non-critical audit log failure
  }
}

module.exports = {
  dispatchPushBatch,
  MAX_CONCURRENCY,
};
