'use strict';

const { getDb } = require('../lib/mongoClient');
const { cleanupHistoricalIpos } = require('../lib/ipoStore');
const { wipeTodayClosingIpos, syncTodayClosingIpos } = require('../lib/ipoClosingStore');
const { getIposClosingToday } = require('./ipoService');
const { fetchAllBSEAnnouncements, clearKnownBseAnnouncementIds } = require('../lib/bseScraper');
const { fetchAllNSEAnnouncements } = require('../lib/nseScraper');
const { saveAnnouncements } = require('../lib/announcementStore');
const { processNewAnnouncements, processNewIpos } = require('../lib/notificationEngine');
const { scrapeKfinCompanies } = require('../lib/ipoScraper');
const { saveIpoSymbols, reconcileMissingIpos } = require('../lib/ipoStore');
const { processIpoClosingQueueTick } = require('../lib/ipoClosingNotificationService');
const { checkAndNotifyNewMufgIpos } = require('../lib/mufgNotificationService');
const { checkAndNotifyNewBigshareIpos } = require('../lib/bigshareNotificationService');
const { getMarketCadence, getISTDateTime, isIpoAllotmentCheckWindow } = require('../lib/time/istTime');

// In-memory cache for announcements (for fast preview/stats)
const _cache = { announcements: [] };
let _lastHeavyScrapeTime = 0;
let _lastRegistrarCheckTime = 0;
const REGISTRAR_CADENCE_MS = 5 * 60 * 1000; // 5 minutes during the 7 PM - 2 AM allotment window
let _lastFirestoreMetaUpdateTime = 0;
const FIRESTORE_META_IDLE_THROTTLE_MS = 15 * 60 * 1000; // 15-minute heartbeat when idle (saves ~1300 redundant writes/day)
let _lastFiiDiiSyncedDate = '';

function getAnnouncementsMemoryCache() {
  return _cache.announcements;
}

function setAnnouncementsMemoryCache(announcements) {
  _cache.announcements = announcements;
}

/**
 * Checks if the day rolled over in IST (UTC+5:30) and wipes transient daily collections.
 */
async function performMidnightWipeIfNeeded() {
  try {
    const admin = require('firebase-admin');
    const dbAdmin = admin.firestore();
    const metaRef = dbAdmin.collection('system_meta').doc('cron_status');
    const metaSnap = await metaRef.get();

    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST_OFFSET);
    const todayDateStr = nowIST.toISOString().split('T')[0];

    let lastWipeDate = '';
    if (metaSnap.exists) {
      lastWipeDate = metaSnap.data().lastWipeDate || '';
    }

    if (lastWipeDate !== todayDateStr) {
      console.log(`[Midnight Wipe] New day in IST (${todayDateStr})! Wiping announcements & dedup locks...`);
      const mongoDb = await getDb();

      await Promise.all([
        mongoDb.collection('announcements').deleteMany({}),
        mongoDb.collection('alert_dedup_locks').deleteMany({}),
        cleanupHistoricalIpos().catch(() => {}),
        wipeTodayClosingIpos().catch((err) => console.error('[Midnight Wipe] IPO closing wipe failed:', err.message)),
      ]);

      // Pre-seed today's closing IPOs into MongoDB for the new day
      try {
        const ipoResult = await getIposClosingToday();
        if (ipoResult?.ok && Array.isArray(ipoResult.ipos) && ipoResult.ipos.length > 0) {
          await syncTodayClosingIpos(ipoResult.ipos, todayDateStr);
          console.log(`[Midnight Wipe] Pre-seeded ${ipoResult.ipos.length} closing IPOs into MongoDB for ${todayDateStr}`);
        }
      } catch (ipoPreseedErr) {
        console.error('[Midnight Wipe] Error pre-seeding closing IPOs:', ipoPreseedErr.message);
      }

      setAnnouncementsMemoryCache([]);
      clearKnownBseAnnouncementIds();
      _lastRegistrarCheckTime = 0;

      await metaRef.set({
        lastWipeDate: todayDateStr,
        lastWipedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`[Midnight Wipe] Successfully cleared MongoDB for ${todayDateStr}`);
      return { wiped: true, date: todayDateStr };
    }

    return { wiped: false, date: todayDateStr };
  } catch (err) {
    console.error('[Midnight Wipe] Error executing midnight wipe:', err.message);
    return { wiped: false, error: err.message };
  }
}

/**
 * Automated Plan Lifecycle Engine:
 * 1. Pre-expiry alerts: Warns users 3 days prior to expiration via Web Push.
 * 2. Graceful Downgrade: Reverts expired Pro/Premium accounts to Basic without deleting data.
 */
async function processPlanExpirationsAndReminders() {
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    // Fetch all active paid tier users (pro / premium) with zero composite index requirement
    const paidSnap = await db.collection('users')
      .where('plan', 'in', ['pro', 'premium'])
      .get();

    if (paidSnap.empty) return;

    let sendWebPushToUser = null;
    try {
      sendWebPushToUser = require('../lib/webPushNotifier').sendWebPushToUser;
    } catch {}

    const nowMs = now.getTime();
    const threeDaysMs = threeDaysFromNow.getTime();

    for (const userDoc of paidSnap.docs) {
      const d = userDoc.data();
      if (!d.planExpiresAt) continue; // Lifetime plan — never expires

      const expiresDate = d.planExpiresAt.toDate ? d.planExpiresAt.toDate() : new Date(d.planExpiresAt);
      const expiresMs = expiresDate.getTime();
      const uid = userDoc.id;

      // 1. Process Expired Plan
      if (expiresMs < nowMs) {
        const prevPlan = d.plan || 'pro';
        await userDoc.ref.set({
          plan: 'basic',
          planStatus: 'expired',
          downgradedAt: admin.firestore.FieldValue.serverTimestamp(),
          planHistory: admin.firestore.FieldValue.arrayUnion({
            plan: 'basic',
            action: 'EXPIRED_DOWNGRADE',
            timestamp: now.toISOString(),
            previousPlan: prevPlan,
            notes: 'Subscription concluded. Reverted to Basic tier without data loss.',
          }),
        }, { merge: true });

        if (sendWebPushToUser) {
          sendWebPushToUser(uid, {
            title: 'Subscription Ended — Returned to Basic Plan',
            body: 'Your Pro subscription has concluded. Your saved stocks and applicants remain safe. Renew anytime to re-enable Pro features.',
            url: 'https://tatvarthstockwatch.web.app/plans',
          }).catch(() => {});
        }
        continue;
      }

      // 2. Process Expiry Reminders (T-3 Days)
      if (expiresMs <= threeDaysMs && expiresMs > nowMs) {
        const lastReminder = d.lastReminderSentAt?.toDate ? d.lastReminderSentAt.toDate() : (d.lastReminderSentAt ? new Date(d.lastReminderSentAt) : null);

        // Only send if no reminder was sent in the past 2.5 days
        if (!lastReminder || (nowMs - lastReminder.getTime()) > (2.5 * 24 * 60 * 60 * 1000)) {
          const expiresDateStr = expiresDate.toLocaleDateString('en-IN');

          await userDoc.ref.set({
            planStatus: 'expiring_soon',
            lastReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          if (sendWebPushToUser) {
            sendWebPushToUser(uid, {
              title: `⏳ Your ${d.plan?.toUpperCase()} Plan Expires in 3 Days`,
              body: `Your subscription expires on ${expiresDateStr}. Renew now to keep 50+ watchlists and unlimited AI analysis uninterrupted.`,
              url: 'https://tatvarthstockwatch.web.app/plans',
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error('[PlanLifecycle] Error processing expirations:', err.message);
  }
}

/**
 * Full execution cycle of the global scheduled cron tick.
 * @param {{ force?: boolean }} [options={}]
 */
async function runGlobalCronTick(options = {}) {
  const force = Boolean(options.force);

  // 1. Midnight Wipe (IST) check - ALWAYS runs first regardless of cadence
  const wipeResult = await performMidnightWipeIfNeeded();

  // 2. Market Hours Guard: evaluate trading cadence in IST
  const now = new Date();
  const cadence = getMarketCadence(now);

  if (!force && cadence.minIntervalMinutes > 0) {
    let lastScrape = _lastHeavyScrapeTime;
    if (!lastScrape) {
      try {
        const admin = require('firebase-admin');
        const dbAdmin = admin.firestore();
        const metaSnap = await dbAdmin.collection('system_meta').doc('cron_status').get();
        if (metaSnap.exists && metaSnap.data().lastHeavyScrapeAt) {
          lastScrape = new Date(metaSnap.data().lastHeavyScrapeAt).getTime();
          _lastHeavyScrapeTime = lastScrape;
        }
      } catch (e) {
        // Silently proceed if Firestore check fails
      }
    }

    if (lastScrape > 0) {
      const elapsedSeconds = (Date.now() - lastScrape) / 1000;
      const minIntervalSeconds = (cadence.minIntervalMinutes * 60) - 5; // 5-second timer jitter tolerance
      if (elapsedSeconds < minIntervalSeconds) {
        const elapsedMinutes = elapsedSeconds / 60;
        const waitRemaining = Math.max(1, Math.ceil(cadence.minIntervalMinutes - elapsedMinutes));
        console.log(`[Market Guard] ${cadence.description}. Throttled (${Math.floor(elapsedMinutes)}m elapsed < ${cadence.minIntervalMinutes}m). Skipping heavy scrape.`);
        return {
          started: false,
          throttled: true,
          window: cadence.window,
          description: cadence.description,
          waitRemainingMinutes: waitRemaining,
          cadenceMinutes: cadence.minIntervalMinutes,
          lastHeavyScrapeAt: new Date(lastScrape).toISOString(),
          wipeResult,
        };
      }
    }
  }

  // Update last heavy scrape timestamp
  _lastHeavyScrapeTime = Date.now();
  const heavyScrapeIso = new Date(_lastHeavyScrapeTime).toISOString();

  // 3. Fetch all announcements from BSE & NSE
  const [bseAll, nseAll] = await Promise.all([
    fetchAllBSEAnnouncements(),
    fetchAllNSEAnnouncements(new Map()),
  ]);

  // Global dedup — unique by announcement ID
  const seenIds = new Set();
  const allFetched = [];
  for (const a of [...bseAll, ...nseAll]) {
    const id = String(a.id);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      allFetched.push(a);
    }
  }

  console.log(`[Global Cron] BSE=${bseAll.length} NSE=${nseAll.length} unique=${allFetched.length}`);

  let newAnnouncements = [];
  let savedCount = 0;
  if (allFetched.length > 0) {
    const saveResult = await saveAnnouncements(allFetched);
    newAnnouncements = saveResult.newAnnouncements || [];
    savedCount = saveResult.saved || 0;
    console.log(`[Global Cron] Saved ${savedCount} new announcements`);
  }

  // Update in-memory cache
  setAnnouncementsMemoryCache(allFetched.slice(0, 1000));

  // 3. Process new announcements through notification engine
  const engineStats = newAnnouncements.length > 0
    ? await processNewAnnouncements(newAnnouncements)
    : { newAnnouncements: 0 };

  // 4 & 6. IPO Allotment Symbol Discovery & Alert Pipeline
  let ipoStats = { newIpos: 0 };
  const DAYTIME_REGISTRAR_CADENCE_MS = 20 * 60 * 1000;
  const inIpoWindow = isIpoAllotmentCheckWindow(new Date());
  const elapsedRegistrar = Date.now() - _lastRegistrarCheckTime;
  const effectiveCadence = inIpoWindow ? REGISTRAR_CADENCE_MS : DAYTIME_REGISTRAR_CADENCE_MS;
  const shouldCheckRegistrars = Boolean(
    options.force ||
    options.forceRegistrars ||
    (elapsedRegistrar >= effectiveCadence)
  );

  if (shouldCheckRegistrars) {
    _lastRegistrarCheckTime = Date.now();
    const windowDesc = inIpoWindow ? 'Prime Allotment Window (19:00 - 02:00 IST | 5m)' : 'Daytime/Weekend Cadence (20m)';
    console.log(`[Global Cron] Running Registrar Discovery [${windowDesc}]...`);

    // 4. IPO Allotment Symbol Discovery & Alert Pipeline (KFintech)
    try {
      const scrapedIpos = await scrapeKfinCompanies();
      const newIpos = await saveIpoSymbols(scrapedIpos);
      await reconcileMissingIpos(scrapedIpos).catch(() => {});

      if (newIpos && newIpos.length > 0) {
        ipoStats = await processNewIpos(newIpos);
      }
    } catch (ipoErr) {
      console.error('[Global Cron] IPO Discovery Error:', ipoErr.message);
    }

    // 6. Check & Notify for New Allotments on Registrars (MUFG & BigShare)
    try {
      await checkAndNotifyNewMufgIpos().catch(e => console.error('[Global Cron] MUFG Allotment Check Error:', e.message));
    } catch (mufgErr) {
      console.error('[Global Cron] MUFG notifier error:', mufgErr.message);
    }

    try {
      await checkAndNotifyNewBigshareIpos().catch(e => console.error('[Global Cron] BigShare Allotment Check Error:', e.message));
    } catch (bigshareErr) {
      console.error('[Global Cron] BigShare notifier error:', bigshareErr.message);
    }

    // 7. Multi-Registrar Reconciliation & Historical Cleanup
    try {
      await cleanupHistoricalIpos().catch(() => {});
    } catch (cleanErr) {
      console.error('[Global Cron] IPO cleanup error:', cleanErr.message);
    }
  } else {
    const nextCheckMins = Math.max(1, Math.ceil((effectiveCadence - elapsedRegistrar) / 60000));
    console.log(`[Global Cron] IPO registrars cached (${Math.floor(elapsedRegistrar / 60000)}m elapsed < ${Math.round(effectiveCadence / 60000)}m). Next check in ~${nextCheckMins}m.`);
  }

  // 4b. Execute Any Mature 5-Minute Delayed Family PAN Auto-Verification Jobs
  try {
    const { processPendingScheduledChecks } = require('../lib/ipoAutoVerificationService');
    const scheduledRes = await processPendingScheduledChecks();
    if (scheduledRes && scheduledRes.processed > 0) {
      console.log(`[Global Cron] Processed ${scheduledRes.processed} mature 5-minute scheduled family PAN check(s).`);
    }
  } catch (schedErr) {
    console.warn('[Global Cron] Scheduled checks processor warning:', schedErr.message);
  }

  // 5. IPO Closing Day Dispatch (11:00 AM – 12:59 PM IST, one IPO per tick)
  let ipoClosingTickStats = { skipped: true, reason: 'NOT_RUN' };
  try {
    ipoClosingTickStats = await processIpoClosingQueueTick();
    if (ipoClosingTickStats.dispatched) {
      console.log(
        `[Global Cron] IPO closing dispatched: "${ipoClosingTickStats.ipoName}" → ` +
        `sent=${ipoClosingTickStats.sent}`
      );
    }
  } catch (ipoCloseErr) {
    console.error('[Global Cron] IPO closing tick error:', ipoCloseErr.message);
  }

  // 7b. Membership Plan Expiry & 3-Day Renewal Reminder Engine
  try {
    await processPlanExpirationsAndReminders();
  } catch (planErr) {
    console.error('[Global Cron] Plan lifecycle error:', planErr.message);
  }

  // 7c. Daily FII / DII Institutional Flow Sync (Mon-Fri between 17:30 and 23:45 IST)
  const istTimeNow = getISTDateTime();
  const dayOfWeek = new Date().getDay(); // 0 is Sun, 6 is Sat
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isEvening = (istTimeNow.istHour > 17 || (istTimeNow.istHour === 17 && istTimeNow.istMinute >= 30)) && istTimeNow.istHour < 24;

  if (isWeekday && isEvening && _lastFiiDiiSyncedDate !== istTimeNow.dateIST) {
    try {
      const { syncDailyFiiDii } = require('./fiiDiiService');
      const fiiResult = await syncDailyFiiDii();
      if (fiiResult && fiiResult.synced) {
        _lastFiiDiiSyncedDate = istTimeNow.dateIST;
      }
    } catch (fiiErr) {
      console.warn('[Global Cron] FII/DII sync warning:', fiiErr.message);
    }
  }

  // 8. Write meta status to Firestore for real-time frontend status updates
  // High-Efficiency Event-Driven Sync:
  // Write immediately if new announcements/IPOs/wipes occurred OR force requested.
  // When idle (0 new items), throttle writes to once every 15 minutes to save ~1,300 redundant Cloud roundtrips per day.
  const hasNewData = Boolean(
    newAnnouncements.length > 0 ||
    (ipoStats && ipoStats.newIpos > 0) ||
    (ipoClosingTickStats && ipoClosingTickStats.dispatched) ||
    (wipeResult && wipeResult.wiped) ||
    options.force
  );
  const timeSinceLastMeta = Date.now() - _lastFirestoreMetaUpdateTime;
  const shouldUpdateFirestore = hasNewData || timeSinceLastMeta >= FIRESTORE_META_IDLE_THROTTLE_MS;

  if (shouldUpdateFirestore) {
    try {
      const admin = require('firebase-admin');
      const db = admin.firestore();
      await db.collection('system_meta').doc('cron_status').set({
        lastRun: heavyScrapeIso,
        lastHeavyScrapeAt: heavyScrapeIso,
        marketCadence: cadence.window,
        fetchedBSE: bseAll.length,
        fetchedNSE: nseAll.length,
        newAnnouncements: newAnnouncements.length,
        notificationUsers: engineStats.usersProcessed || 0,
        notificationQueued: engineStats.queued || 0,
        notificationSent: (engineStats.pushSent || 0) + (engineStats.telegramSent || 0),
        durationMs: engineStats.durationMs || 0,
      }, { merge: true });
      _lastFirestoreMetaUpdateTime = Date.now();
      if (hasNewData) {
        console.log(`[Global Cron] Firestore meta updated immediately (${newAnnouncements.length} new filings, ${ipoStats?.newIpos || 0} IPOs).`);
      } else {
        console.log('[Global Cron] Firestore meta heartbeat updated (15m interval).');
      }
    } catch (metaErr) {
      console.error('[Global Cron] Meta update failed:', metaErr.message);
    }
  } else {
    const minsSince = Math.floor(timeSinceLastMeta / 60000);
    console.log(`[Global Cron] Idle tick (0 new items). Firestore write skipped (${minsSince}m/15m).`);
  }

  return {
    started: true,
    throttled: false,
    window: cadence.window,
    bseFetched: bseAll.length,
    nseFetched: nseAll.length,
    totalFetched: allFetched.length,
    newAnnouncements: newAnnouncements.length,
    saved: savedCount,
    engine: engineStats,
    ipoStats,
    ipoClosingTick: ipoClosingTickStats,
  };
}

/**
 * Manual trigger for user-initiated live data refresh from frontend.
 */
async function runUserManualTrigger() {
  await performMidnightWipeIfNeeded();

  const [bseAll, nseAll] = await Promise.all([
    fetchAllBSEAnnouncements(),
    fetchAllNSEAnnouncements(new Map()),
  ]);

  const seenIds = new Set();
  const allFetched = [];
  for (const a of [...bseAll, ...nseAll]) {
    const id = String(a.id);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      allFetched.push(a);
    }
  }

  const { saved, newAnnouncements } = await saveAnnouncements(allFetched);
  console.log(`[Trigger] BSE=${bseAll.length} NSE=${nseAll.length} total=${allFetched.length} new=${saved}`);

  setAnnouncementsMemoryCache(allFetched.slice(0, 1000));

  let engineStats = {};
  if ((newAnnouncements || []).length > 0) {
    engineStats = await processNewAnnouncements(newAnnouncements);
  }

  return {
    bseFetched: bseAll.length,
    nseFetched: nseAll.length,
    totalFetched: allFetched.length,
    newSaved: saved,
    engine: engineStats,
  };
}

/**
 * Manual trigger for IPO closing queue tick (bypasses time window check if forced).
 */
function getRegistrarCadenceStatus(date = new Date()) {
  const inWindow = isIpoAllotmentCheckWindow(date);
  const requiredCadence = REGISTRAR_CADENCE_MS;
  const elapsed = Date.now() - _lastRegistrarCheckTime;
  return {
    lastCheckedAt: _lastRegistrarCheckTime ? new Date(_lastRegistrarCheckTime).toISOString() : null,
    elapsedMinutes: Math.floor(elapsed / 60000),
    cadenceMinutes: Math.round(requiredCadence / 60000),
    inIpoWindow: inWindow,
    dueNow: elapsed >= requiredCadence,
    activeNow: inWindow && (elapsed >= requiredCadence),
  };
}

function resetRegistrarCadence() {
  _lastRegistrarCheckTime = 0;
}

/**
 * Manual trigger for IPO closing queue tick (bypasses time window check if forced).
 */
async function runManualIpoClosingTick(force = true) {
  return await processIpoClosingQueueTick({ force });
}

module.exports = {
  performMidnightWipeIfNeeded,
  runGlobalCronTick,
  runUserManualTrigger,
  runManualIpoClosingTick,
  processPlanExpirationsAndReminders,
  getAnnouncementsMemoryCache,
  setAnnouncementsMemoryCache,
  getRegistrarCadenceStatus,
  resetRegistrarCadence,
};
