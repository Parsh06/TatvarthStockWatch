'use strict';

/**
 * check-announcements.js — Vercel Cron / cron-job.org endpoint
 *
 * DESIGNED FOR: 3-4 users × up to 4000 watched stocks each
 *
 * ARCHITECTURE (every 1 minute):
 *
 *  1. Read users collection (4 reads total)
 *     Each user doc has bseCodesIndex: [...] and nseCodesIndex: [...]
 *     → Build reverse map (code → [uid, ...]) in-memory from these arrays
 *     → O(4 × 4000) = instant, versus scanning 4000 Firestore docs
 *
 *  2. Exit immediately if nobody has a watchlist
 *
 *  3. Fetch ALL BSE announcements (paginated, strScrip='')
 *     → Typically 10-20 pages, ~500 items total for the day
 *     → ONE batch of HTTP calls instead of 4000 individual calls
 *     Fetch ALL NSE announcements (one call, ~100 items)
 *
 *  4. Filter in-memory: keep only announcements whose scriptCode is in
 *     the watched-codes Set → O(N_fetched) with O(1) Set lookup
 *
 *  5. Save filtered announcements to Firestore `announcements/{NEWSID}`
 *     → Skips any NEWSID already stored (idempotent by doc ID)
 *     → Fast exit if nothing new (most runs after the first pass)
 *
 *  6. Map new announcements → subscribers via in-memory reverse map
 *     → No further Firestore reads needed to know who to notify
 *
 *  7. For each matched subscriber:
 *     → Write notifications/{NEWSID} (doc ID = NEWSID, idempotent)
 *     → Read users/{uid} for email (already in memory from step 1)
 *     → Send one email per user per run
 *
 * Firestore reads per minute (typical — nothing new after first pass):
 *   4 (user docs) + N_fetched/30 (NEWSID existence checks) ≈ 4-20 reads
 */

require('dotenv').config();
const { fetchAllBSEAnnouncements } = require('../../lib/bseScraper');
const { fetchNSEAnnouncements }    = require('../../lib/nseScraper');
const { sendAnnouncementEmail }    = require('../../lib/mailer');
const { saveAnnouncements }        = require('../../lib/announcementStore');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// ─── User index helpers ───────────────────────────────────────────────────────

async function loadUsersAndBuildIndex(db) {
  const { getAllTrackedScripts } = require('../../lib/watchlistStore');
  const allWatched = await getAllTrackedScripts();
  
  const snap = await db.collection('users').get();
  const users = [];
  snap.forEach((d) => {
    users.push({ uid: d.id, data: d.data() });
  });

  const bseCodeToUids   = {};
  const nseSymbolToUids = {};
  const watchedBSECodes   = new Set();
  const watchedNSESymbols = new Set();

  for (const s of allWatched) {
    const bse = (s.bseCode || s.ltdCode || '').trim();
    if (bse) {
      watchedBSECodes.add(bse);
      if (!bseCodeToUids[bse]) bseCodeToUids[bse] = [];
      bseCodeToUids[bse].push(...s.uids);
    }
    
    const nse = (s.nseSymbol || s.symbol || '').trim();
    if (nse) {
      watchedNSESymbols.add(nse);
      if (!nseSymbolToUids[nse]) nseSymbolToUids[nse] = [];
      nseSymbolToUids[nse].push(...s.uids);
    }
  }

  return { users, bseCodeToUids, nseSymbolToUids, watchedBSECodes, watchedNSESymbols };
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function deduplicateById(items) {
  const seen = new Set();
  return items.filter((a) => {
    const id = String(a.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ─── Notification writers ─────────────────────────────────────────────────────

async function saveUserNotifications(db, admin, uid, announcements) {
  if (!announcements.length) return;

  const ts = admin.firestore.FieldValue.serverTimestamp();
  const BATCH_SIZE = 400;

  for (let i = 0; i < announcements.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = announcements.slice(i, i + BATCH_SIZE);
    
    for (const ann of chunk) {
      const ref = db.collection('users').doc(uid).collection('notifications').doc(String(ann.id));
      batch.set(ref, {
        id:               ann.id               || '',
        exchange:         ann.exchange         || '',
        scriptName:       ann.scriptName       || '',
        scriptCode:       ann.scriptCode       || '',
        category:         ann.category         || '',
        subCategory:      ann.subCategory      || '',
        subject:          ann.subject          || '',
        announcementDate: ann.announcementDate || '',
        date:             ann.date             || '',
        time:             ann.time             || '',
        datetimeIST:      ann.datetimeIST      || '',
        pdfUrl:           ann.pdfUrl           || null,
        critical:         ann.critical         || false,
        read:             false,
        createdAt:        ts,
      });
    }
    await batch.commit();
  }
}

async function updateWatchlistCounts(db, admin, uid, announcements) {
  const countByCode  = {};
  const latestByCode = {};

  for (const ann of announcements) {
    const code = (ann.scriptCode || '').toUpperCase();
    if (!code) continue;
    countByCode[code]  = (countByCode[code] || 0) + 1;
    if (!latestByCode[code] || ann.announcementDate > latestByCode[code]) {
      latestByCode[code] = ann.announcementDate;
    }
  }

  const codes = Object.keys(countByCode);
  if (!codes.length) return;

  const codeSet = new Set(codes);
  const wlSnap  = await db.collection('users').doc(uid).collection('watchlist').get();
  if (wlSnap.empty) return;

  const batch = db.batch();
  wlSnap.forEach((d) => {
    const code = (d.data().bseCode || d.data().ltdCode || '').toUpperCase();
    if (!codeSet.has(code)) return;
    batch.update(d.ref, {
      announcementCount:  admin.firestore.FieldValue.increment(countByCode[code]),
      lastAnnouncementAt: latestByCode[code],
      lastCheckedAt:      admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

async function getUserEmail(admin, uid, userData) {
  if (userData.email) return { email: userData.email, name: userData.displayName || 'Investor' };
  try {
    const record = await admin.auth().getUser(uid);
    return { email: record.email || null, name: record.displayName || 'Investor' };
  } catch {
    return { email: null, name: 'Investor' };
  }
}

// ─── Main cron logic ──────────────────────────────────────────────────────────

async function runCron() {
  const { db, admin } = require('../../lib/firebaseAdmin');

  const summary = {
    usersWithWatchlist:  0,
    watchedBSECodes:     0,
    watchedNSESymbols:   0,
    bseFetched:          0,
    nseFetched:          0,
    afterFilter:         0,
    newlySaved:          0,
    skippedExisting:     0,
    usersNotified:       0,
    notificationsCreated:0,
    emailsSent:          0,
    emailErrors:         0,
    errors:              [],
  };

  const { users, bseCodeToUids, nseSymbolToUids, watchedBSECodes, watchedNSESymbols }
    = await loadUsersAndBuildIndex(db);

  summary.usersWithWatchlist = users.length;
  summary.watchedBSECodes    = watchedBSECodes.size;
  summary.watchedNSESymbols  = watchedNSESymbols.size;
  console.log(
    `[Cron] ${users.length} user(s) | ${watchedBSECodes.size} BSE code(s) | ${watchedNSESymbols.size} NSE symbol(s)`
  );

  const [bseAll, nseAll] = await Promise.all([
    fetchAllBSEAnnouncements().catch((e) => {
      summary.errors.push({ step: 'bse-fetch', error: e.message });
      return [];
    }),
    fetchNSEAnnouncements(null).catch((e) => {
      summary.errors.push({ step: 'nse-fetch', error: e.message });
      return [];
    }),
  ]);

  summary.bseFetched = bseAll.length;
  summary.nseFetched = nseAll.length;
  console.log(`[Cron] Fetched: BSE=${bseAll.length} NSE=${nseAll.length}`);

  const allFetched = deduplicateById([...bseAll, ...nseAll]);

  summary.afterFilter = allFetched.length;
  console.log(`[Cron] Saving all ${allFetched.length} announcements...`);

  if (!allFetched.length) {
    console.log('[Cron] No announcements today. Done.');
    return summary;
  }

  // ── Step 4: Save ALL NEW announcements to global collection ──────────────
  const { saved, skipped, newAnnouncements } = await saveAnnouncements(allFetched);
  summary.newlySaved      = saved;
  summary.skippedExisting = skipped;
  console.log(`[Cron] DB: ${saved} new saved, ${skipped} already existed`);

  if (!newAnnouncements || !newAnnouncements.length) {
    console.log('[Cron] No new announcements this run. Done.');
    return summary;
  }

  // ── Step 5: Map new announcements → subscribers (pure in-memory) ──────────
  // notifsByUid: uid → deduped list of new announcements for that user
  const notifsByUid = {};
  const seenPerUser = {};

  for (const ann of newAnnouncements) {
    const code = (ann.scriptCode || '').toUpperCase();
    const subs = ann.exchange === 'NSE'
      ? (nseSymbolToUids[code]  || [])
      : (bseCodeToUids[code]    || []);

    for (const uid of subs) {
      if (!notifsByUid[uid]) { notifsByUid[uid] = []; seenPerUser[uid] = new Set(); }
      if (!seenPerUser[uid].has(String(ann.id))) {
        seenPerUser[uid].add(String(ann.id));
        notifsByUid[uid].push(ann);
      }
    }
  }

  const matchedUids = Object.keys(notifsByUid);
  console.log(`[Cron] ${newAnnouncements.length} new announcement(s) → ${matchedUids.length} user(s)`);

  // ── Step 6: Notify each matched user ──────────────────────────────────────
  // User data already in memory from step 1 — no extra reads needed
  const userDataMap = {};
  users.forEach((u) => { userDataMap[u.uid] = u.data; });

  for (const uid of matchedUids) {
    const anns = notifsByUid[uid];
    try {
      await saveUserNotifications(db, admin, uid, anns);
      summary.notificationsCreated += anns.length;

      await updateWatchlistCounts(db, admin, uid, anns);
      summary.usersNotified++;

      const { email, name } = await getUserEmail(admin, uid, userDataMap[uid] || {});

      if (email) {
        try {
          await sendAnnouncementEmail(email, name, anns);
          summary.emailsSent++;
          console.log(`[Cron] ✉ ${email} — ${anns.length} new: ${anns.map((a) => a.scriptName).join(', ')}`);
        } catch (e) {
          summary.emailErrors++;
          summary.errors.push({ uid, email, step: 'email', error: e.message });
          console.error(`[Cron] Email failed ${email}:`, e.message);
        }
      } else {
        console.log(`[Cron] uid=${uid} has no email address — skipping email`);
      }
    } catch (e) {
      summary.errors.push({ uid, step: 'user', error: e.message });
      console.error(`[Cron] Error processing uid=${uid}:`, e.message);
    }
  }

  return summary;
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = (req.headers['authorization'] || '').replace('Bearer ', '').trim()
      || (req.query && req.query.secret);
    if (provided !== cronSecret) {
      res.writeHead(401, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  const startTime = Date.now();
  console.log('[Cron] ─── Run started', new Date().toISOString());

  try {
    const summary = await runCron();
    const ms = Date.now() - startTime;
    console.log(`[Cron] ─── Done in ${ms}ms`, JSON.stringify(summary));
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, timestamp: new Date().toISOString(), durationMs: ms, summary }));
  } catch (err) {
    const ms = Date.now() - startTime;
    console.error('[Cron] Fatal:', err.message);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message, durationMs: ms }));
  }
};
