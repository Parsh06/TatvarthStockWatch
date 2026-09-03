'use strict';

/**
 * ipoClosingNotificationService.js
 *
 * MongoDB-Backed IPO Closing Notification Pipeline with Live 11:00 AM GMP Refresh.
 * Sends ONE notification per IPO that closes today in IST.
 * Runs on 1-minute cron ticks between 11:00 AM – 12:59 PM IST (Grace window up to 13:15 PM IST).
 *
 * Architecture & Guarantees:
 *   • Live 11:00 AM GMP Refresh: Scrapes fresh live GMP & Gain % from websites right at 11:00 AM
 *     and syncs into MongoDB before dispatching, ensuring 100% up-to-date market premiums.
 *   • Single Source of Truth: MongoDB Atlas `ipo_closing_today` collection.
 *   • Atomic claim: `getNextPendingClosingIpo` claims highest live GMP% IPO (PENDING -> DISPATCHING).
 *   • Web Push to ALL Registered Devices: Queries Firestore `users/{uid}/pushDevices` and delivers
 *     to all desktop and mobile devices registered for each user.
 *   • Dual-Channel Delivery: Also dispatches to Telegram if configured.
 *   • Dedup: Per-user tracking in `deliveredUsers` array prevents duplicate notifications.
 *   • Sequential Delivery: 1 IPO per 1-minute cron tick ensures spacing and zero notification flooding.
 */

const { sendWebPushToUser } = require('./webPushNotifier');
const { sendTelegramIpoClosingAlert, isConfigured: isTelegramConfigured } = require('./telegramNotifier');
const ipoClosingStore       = require('./ipoClosingStore');
const prefsStore            = require('./prefsStore');
const { getISTDateTime, getISTDateString, isWithinIpoDispatchWindow } = require('./time/istTime');
const { getIposClosingToday } = require('../services/ipoService');

const BATCH_SIZE = 25; // batch size for concurrent user processing
const TELEGRAM_DELAY_MS = 200;

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build rich push notification payload for an IPO with the latest live GMP & Gain %.
 *
 * GMP Scenarios:
 *  • gmp > 0  → "GMP: ₹47 (+19.7% Gain) • Price: ₹239 • Bidding closes today!"
 *  • gmp === 0 → "GMP: At Par (₹0) • Price: ₹239 • Bidding closes today!"
 *  • no price  → "Price: NA"
 */
function buildSingleIpoPayload(ipo, dateIST) {
  const gmp     = ipo.gmp || 0;
  const gainPct = ipo.gmpPercentage || 0;
  const price   = ipo.issuePrice || 0;
  const exch    = ipo.exchange ? ` [${ipo.exchange}]` : '';

  // --- GMP line ---
  let gmpText;
  if (gmp > 0) {
    gmpText = `GMP: \u20b9${gmp} (+${gainPct}% Gain)`;
  } else {
    gmpText = `GMP: At Par (\u20b90)`;
  }

  // --- Price line ---
  const priceText = price > 0 ? `\u20b9${price}` : 'NA';

  return {
    title: `\u23f0 IPO Closing Today: ${ipo.name}${exch}`,
    body:  `${gmpText} \u2022 Price: ${priceText} \u2022 Bidding closes today! Tap to view.`,
    url:   '/ipo-gmp',
    tag:   `ipo-closing-${dateIST}-${ipo.id || ipo.slug}`,
    type:  'ipo',
    actions: [
      { action: 'check-ipo', title: 'View IPO GMP' },
      { action: 'dismiss',   title: 'Dismiss'       },
    ],
  };
}

/**
 * Resolve UIDs who have opted-in to IPO closing reminders.
 */
async function resolveOptedInUsers() {
  const admin = require('firebase-admin');
  const uids  = [];
  let pageToken;

  try {
    do {
      const result = await admin.auth().listUsers(1000, pageToken);
      for (const user of result.users) {
        try {
          const prefs = await prefsStore.getPrefs(user.uid);
          if (prefs && prefs.notifyIpoClosing !== false) {
            uids.push(user.uid);
          }
        } catch { /* skip user if prefs fetch fails */ }
      }
      pageToken = result.pageToken;
    } while (pageToken);
  } catch (err) {
    console.error('[IpoClosingNotif] Error scanning users:', err.message);
  }

  return uids;
}

/**
 * Dispatch one IPO notification to opted-in users across ALL registered devices (Web Push) & Telegram.
 */
async function dispatchSingleIpo(ipo, optedInUids, dateIST) {
  const payload = buildSingleIpoPayload(ipo, dateIST);
  const stats = {
    pushSent: 0,
    telegramSent: 0,
    failed: 0,
    dedupSkipped: 0,
    deliveredUsers: [],
  };

  const alreadyDelivered = new Set(ipo.deliveredUsers || []);

  for (let i = 0; i < optedInUids.length; i += BATCH_SIZE) {
    const batch = optedInUids.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (uid) => {
        if (alreadyDelivered.has(uid)) {
          stats.dedupSkipped++;
          return;
        }

        let userPrefs = null;
        try {
          userPrefs = await prefsStore.getPrefs(uid);
        } catch {
          // default prefs
        }

        let deliveredToUser = false;

        // 1. Web Push Channel: Dispatches to ALL devices registered for this user in Firestore
        if (!userPrefs || userPrefs.pushEnabled !== false) {
          try {
            const pushRes = await sendWebPushToUser(uid, payload);
            if ((pushRes.sent || 0) > 0) {
              stats.pushSent += pushRes.sent;
              deliveredToUser = true;
              console.log(`[IpoClosingNotif] Web Push sent to ${pushRes.sent}/${pushRes.total} device(s) for user ${uid}`);
            }
          } catch (pushErr) {
            console.error(`[IpoClosingNotif] Push error uid=${uid}:`, pushErr.message);
          }
        }

        // 2. Telegram Channel: Dispatches rich alert with live GMP & Gain %
        const targetChat = userPrefs?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
        if (isTelegramConfigured(targetChat) && userPrefs?.telegramEnabled !== false) {
          try {
            const tgRes = await sendTelegramIpoClosingAlert(ipo, targetChat);
            if (tgRes.sent) {
              stats.telegramSent++;
              deliveredToUser = true;
              console.log(`[IpoClosingNotif] Telegram sent for user ${uid}`);
              await _delay(TELEGRAM_DELAY_MS);
            }
          } catch (tgErr) {
            console.error(`[IpoClosingNotif] Telegram error uid=${uid}:`, tgErr.message);
          }
        }

        if (deliveredToUser) {
          stats.deliveredUsers.push(uid);
        } else {
          stats.failed++;
        }
      })
    );
  }

  return stats;
}

/**
 * processIpoClosingQueueTick
 *
 * Called on 1-minute main cron invocations.
 *
 * @param {boolean} [force=false] — bypass time-window check (for manual testing)
 * @returns {Promise<Object>}     — stats for this tick
 */
async function processIpoClosingQueueTick({ force = false } = {}) {
  const { dateIST, istHour, istMinute } = getISTDateTime();

  // Normal Window: 11:00 AM – 12:59 PM IST. Grace Window: 13:00 PM – 13:15 PM IST.
  const isNormalWindow = isWithinIpoDispatchWindow();
  const isGraceWindow  = istHour === 13 && istMinute <= 15;

  if (!force && !isNormalWindow && !isGraceWindow) {
    return { skipped: true, reason: 'OUTSIDE_DISPATCH_WINDOW', istHour, istMinute, dateIST };
  }

  try {
    // Step 1: Live GMP Refresh right before dispatch!
    // Scrapes latest live market premiums and updates MongoDB so notifications are 100% current
    try {
      const liveFetchResult = await getIposClosingToday();
      if (liveFetchResult.ok && Array.isArray(liveFetchResult.ipos) && liveFetchResult.ipos.length > 0) {
        await ipoClosingStore.syncTodayClosingIpos(liveFetchResult.ipos, dateIST);
        console.log(`[IpoClosingQueue] Live 11 AM GMP refresh: updated ${liveFetchResult.ipos.length} closing IPOs in MongoDB.`);
      }
    } catch (scrapeErr) {
      console.warn('[IpoClosingQueue] Live scraper refresh failed, falling back to pre-seeded MongoDB data:', scrapeErr.message);
    }

    let summary = await ipoClosingStore.getClosingIposSummary(dateIST);

    if (summary.total === 0) {
      return { skipped: true, reason: 'NO_IPOS_CLOSING_TODAY', dateIST };
    }

    if (summary.pending === 0 && summary.dispatching === 0) {
      return { skipped: true, reason: 'QUEUE_EMPTY_ALL_DISPATCHED', dateIST, completed: summary.completed };
    }

    // Step 2: Claim 1 highest live GMP% pending IPO from MongoDB
    const claimedIpo = await ipoClosingStore.getNextPendingClosingIpo(dateIST);
    if (!claimedIpo) {
      return { skipped: true, reason: 'NO_PENDING_IPO_TO_CLAIM', dateIST };
    }

    console.log(
      `[IpoClosingQueue] Claimed "${claimedIpo.name}" (Latest Live GMP: \u20b9${claimedIpo.gmp}, +${claimedIpo.gmpPercentage}%) for dispatch.`
    );

    // Step 3: Resolve opted-in users
    const optedInUids = await resolveOptedInUsers();

    // Step 4: Dispatch dual-channel (Push to ALL registered devices + Telegram)
    const dispatchStats = await dispatchSingleIpo(claimedIpo, optedInUids, dateIST);

    // Step 5: Mark completed in MongoDB
    const ipoId = claimedIpo.id || claimedIpo.slug || claimedIpo._id;
    await ipoClosingStore.markClosingIpoCompleted(ipoId, dateIST, dispatchStats.deliveredUsers);

    return {
      dispatched: true,
      ipoName: claimedIpo.name,
      latestLiveGmp: claimedIpo.gmp,
      gmpPercentage: claimedIpo.gmpPercentage,
      sentPush: dispatchStats.pushSent,
      sentTelegram: dispatchStats.telegramSent,
      deliveredUsers: dispatchStats.deliveredUsers.length,
      failed: dispatchStats.failed,
      dedupSkipped: dispatchStats.dedupSkipped,
      dateIST,
    };
  } catch (err) {
    console.error('[IpoClosingQueue] Tick execution failed:', err);
    return { error: err.message, dateIST };
  }
}

module.exports = { processIpoClosingQueueTick, getISTDateString, dispatchSingleIpo };
