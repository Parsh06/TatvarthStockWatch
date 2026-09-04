'use strict';

const { getDb } = require('../lib/mongoClient');
const { cleanupHistoricalIpos } = require('../lib/ipoStore');
const { wipeTodayClosingIpos, syncTodayClosingIpos } = require('../lib/ipoClosingStore');
const { getIposClosingToday } = require('./ipoService');
const { fetchAllBSEAnnouncements } = require('../lib/bseScraper');
const { fetchAllNSEAnnouncements } = require('../lib/nseScraper');
const { saveAnnouncements } = require('../lib/announcementStore');
const { processNewAnnouncements, processNewIpos } = require('../lib/notificationEngine');
const { scrapeKfinCompanies } = require('../lib/ipoScraper');
const { saveIpoSymbols, reconcileMissingIpos } = require('../lib/ipoStore');
const { processIpoClosingQueueTick } = require('../lib/ipoClosingNotificationService');
const { checkAndNotifyNewMufgIpos } = require('../lib/mufgNotificationService');
const { checkAndNotifyNewBigshareIpos } = require('../lib/bigshareNotificationService');

// In-memory cache for announcements (for fast preview/stats)
const _cache = { announcements: [] };

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
 * Full execution cycle of the global scheduled cron tick.
 */
async function runGlobalCronTick() {
  // 1. Midnight Wipe (IST) check
  await performMidnightWipeIfNeeded();

  // 2. Fetch all announcements from BSE & NSE
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

  // 4. IPO Allotment Symbol Discovery & Alert Pipeline (KFintech)
  let ipoStats = { newIpos: 0 };
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

  // 8. Write meta status to Firestore for real-time frontend status updates
  try {
    const admin = require('firebase-admin');
    const db = admin.firestore();
    await db.collection('system_meta').doc('cron_status').set({
      lastRun: new Date().toISOString(),
      fetchedBSE: bseAll.length,
      fetchedNSE: nseAll.length,
      newAnnouncements: newAnnouncements.length,
      notificationUsers: engineStats.usersProcessed || 0,
      notificationQueued: engineStats.queued || 0,
      notificationSent: (engineStats.pushSent || 0) + (engineStats.telegramSent || 0),
      durationMs: engineStats.durationMs || 0,
    }, { merge: true });
  } catch (metaErr) {
    console.error('[Global Cron] Meta update failed:', metaErr.message);
  }

  return {
    started: true,
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
async function runManualIpoClosingTick(force = true) {
  return await processIpoClosingQueueTick({ force });
}

module.exports = {
  performMidnightWipeIfNeeded,
  runGlobalCronTick,
  runUserManualTrigger,
  runManualIpoClosingTick,
  getAnnouncementsMemoryCache,
  setAnnouncementsMemoryCache,
};
