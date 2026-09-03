'use strict';

const { scrapeBigshareCompanies } = require('./bigshareScraper');
const { sendWebPushToUser } = require('./webPushNotifier');
const { sendTelegram } = require('./telegramNotifier');
const prefsStore = require('./prefsStore');
const { getISTDateString } = require('./time/istTime');

function getDb() {
  const { db } = require('./firebaseAdmin');
  return db;
}

/**
 * Build rich push notification payload when a new IPO allotment goes live on BigShare Online
 */
function buildBigshareAllotmentPayload(company) {
  const dateIST = getISTDateString();
  return {
    title: `📢 IPO Allotment Live: ${company.symbol}`,
    body: `Allotment status for ${company.symbol} is now active. Check your family allotment records now on StockWatch.`,
    url: '/ipo-check',
    tag: `ipo-allotment-bigshare-${company.clientId}-${dateIST}`,
    type: 'ipo-allotment',
    actions: [
      { action: 'check-allotment', title: 'Check Allotment' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
}

/**
 * Scan for newly listed IPO allotment symbols on BigShare Online.
 * If new symbols are detected, dispatches a Web Push / Telegram notification.
 */
async function checkAndNotifyNewBigshareIpos() {
  try {
    const { saveIpoSymbols, markNotificationsSent } = require('./ipoStore');
    const symbols = await scrapeBigshareCompanies({ forceRefresh: true });
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return { checked: 0, newIpos: 0 };
    }

    // Save to MongoDB iposymbols - returns only truly new IPOs inserted
    const newIpos = await saveIpoSymbols(symbols, 'BIGSHARE');
    if (!Array.isArray(newIpos) || newIpos.length === 0) {
      return { checked: symbols.length, newIpos: 0 };
    }

    console.log(`[BigShare Notification] Discovered ${newIpos.length} NEW IPO allotment(s) in MongoDB:`, newIpos.map(s => s.symbol).join(', '));

    // Resolve opted-in users
    const admin = require('firebase-admin');
    const uids = [];
    let pageToken;

    try {
      do {
        const result = await admin.auth().listUsers(1000, pageToken);
        for (const user of result.users) {
          try {
            const prefs = await prefsStore.getPrefs(user.uid);
            if (prefs && prefs.pushEnabled !== false) {
              uids.push(user.uid);
            }
          } catch {
            uids.push(user.uid);
          }
        }
        pageToken = result.pageToken;
      } while (pageToken);
    } catch (scanErr) {
      console.error('[BigShare Notification] Error scanning users:', scanErr.message);
    }

    // Dispatch notification for each truly new IPO
    for (const newIpo of newIpos) {
      if (newIpo.notificationSent) continue;

      const payload = buildBigshareAllotmentPayload(newIpo);

      for (const uid of uids) {
        try {
          await sendWebPushToUser(uid, payload);
        } catch {
          // ignore individual push errors
        }

        try {
          const userPrefs = await prefsStore.getPrefs(uid);
          if (userPrefs?.telegramChatId) {
            const tgMsg = `🔔 *IPO Allotment Live*\n\n*${newIpo.symbol}* allotment is now live!\n\n👉 [Check Family Allotment Status](https://tatvarthstockwatch.web.app/ipo-check)`;
            await sendTelegram(userPrefs.telegramChatId, tgMsg);
          }
        } catch {
          // ignore telegram failure
        }
      }

      // Mark notification as permanently sent in MongoDB
      await markNotificationsSent([newIpo], 'BIGSHARE');
    }

    return { checked: symbols.length, newIpos: newIpos.length };
  } catch (err) {
    console.error('[BigShare Notification Service] Error:', err.message);
    return { checked: 0, newIpos: 0, error: err.message };
  }
}

module.exports = {
  checkAndNotifyNewBigshareIpos,
  buildBigshareAllotmentPayload,
};
