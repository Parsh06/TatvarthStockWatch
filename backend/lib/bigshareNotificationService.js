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
    const symbols = await scrapeBigshareCompanies({ forceRefresh: true });
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return { checked: 0, newIpos: 0 };
    }

    const db = getDb();
    const metaRef = db.collection('system_meta').doc('bigshare_known_ipos');
    const doc = await metaRef.get();

    const knownIds = new Set(doc.exists ? (doc.data()?.knownIds || []) : []);
    const newlyDiscovered = symbols.filter(s => !knownIds.has(s.clientId));

    if (newlyDiscovered.length === 0) {
      return { checked: symbols.length, newIpos: 0 };
    }

    console.log(`[BigShare Notification] Discovered ${newlyDiscovered.length} NEW IPO allotment(s) on BigShare:`, newlyDiscovered.map(s => s.symbol).join(', '));

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

    // Dispatch notification for each new IPO
    for (const newIpo of newlyDiscovered) {
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
            const tgMsg = `🔔 *BigShare IPO Allotment Live*\n\n*${newIpo.symbol}* allotment is now live on BigShare!\n\n👉 [Check Allotment Status](https://tatvarthstockwatch.web.app/ipo-check)`;
            await sendTelegram(userPrefs.telegramChatId, tgMsg);
          }
        } catch {
          // ignore telegram failure
        }
      }

      // Add to knownIds
      knownIds.add(newIpo.clientId);
    }

    // Save updated knownIds
    await metaRef.set({
      knownIds: Array.from(knownIds),
      lastUpdated: new Date().toISOString(),
      lastDiscoveredCount: newlyDiscovered.length,
    }, { merge: true });

    return {
      checked: symbols.length,
      newIpos: newlyDiscovered.length,
      discovered: newlyDiscovered.map(s => s.symbol),
    };
  } catch (err) {
    console.error('[BigShare Notification Service Error]', err.message);
    return { error: err.message };
  }
}

module.exports = {
  checkAndNotifyNewBigshareIpos,
  buildBigshareAllotmentPayload,
};
