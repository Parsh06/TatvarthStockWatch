'use strict';

const { getDb } = require('./mongoClient');
const { bseGet } = require('./apiClients');
const { admin } = require('./firebaseAdmin');
const { sendBoardMeetingAlertEmail } = require('./mailer');

const CACHE_TTL = 30 * 60 * 1000; // 30 mins
let _todayBoardMeetingsCache = null;
let _todayBoardMeetingsExp = 0;

/**
 * Fetch today's board meeting companies from BSE.
 * Returns a Set of BSE codes (strings) that have board meetings today.
 */
async function getTodayBoardMeetingsSet() {
  if (_todayBoardMeetingsCache && Date.now() < _todayBoardMeetingsExp) {
    return _todayBoardMeetingsCache;
  }
  
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}/${mm}/${yyyy}`;
  
  try {
    const data = await bseGet(
      '/Corp_Fetch_BoardMeeting_With_Filter_ng/w',
      {
        SCRIPCODE: '',
        fromDT: dateStr,
        ToDt: dateStr,
        purposeCode: '',
        IsCanRev: '0',
        FLAGDUR: '0',
        ISUBGROUP_CODE: ' ',
        LnFlag: 'en'
      },
      15000
    );
    
    const set = new Set();
    const table = (data && Array.isArray(data.Corp_fetch_BoardMeeting_Table1)) ? data.Corp_fetch_BoardMeeting_Table1 : [];
    for (const item of table) {
      if (item.scripcode) {
        set.add(String(item.scripcode).trim());
      }
    }
    
    _todayBoardMeetingsCache = set;
    _todayBoardMeetingsExp = Date.now() + CACHE_TTL;
    return set;
  } catch (err) {
    console.error('[BoardMeetingNotifier] Failed to fetch board meetings for today:', err.message);
    return new Set();
  }
}

/**
 * Fetches all users from Firestore who have opted in to Board Meeting emails.
 * @returns {Promise<Array<{uid: string, email: string, name: string}>>}
 */
async function getSubscribedUsers() {
  const users = [];
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('user_prefs')
      .where('boardMeetingUpdatesEnabled', '==', true)
      .get();
      
    if (snapshot.empty) return users;
    
    const uids = [];
    snapshot.forEach(doc => uids.push(doc.id));
    
    for (let i = 0; i < uids.length; i += 100) {
      const batch = uids.slice(i, i + 100).map(uid => ({ uid }));
      const result = await admin.auth().getUsers(batch);
      for (const record of result.users) {
        if (record.email) {
          users.push({
            uid: record.uid,
            email: record.email,
            name: record.displayName || 'Investor'
          });
        }
      }
    }
    return users;
  } catch (err) {
    console.error('[BoardMeetingNotifier] Failed to fetch subscribed users:', err.message);
    return [];
  }
}

/**
 * Process new announcements and send board meeting alerts.
 * @param {Array} newAnnouncements - newly inserted announcements
 */
async function processBoardMeetingAnnouncements(newAnnouncements) {
  if (!newAnnouncements || newAnnouncements.length === 0) return;
  
  const todayBMSet = await getTodayBoardMeetingsSet();
  if (todayBMSet.size === 0) return;
  
  const qualifying = newAnnouncements.filter(a => {
    const code = String(a.scriptCode || a.bseCode || '').trim();
    return todayBMSet.has(code);
  });
  
  if (qualifying.length === 0) return;
  
  console.log(`[BoardMeetingNotifier] Found ${qualifying.length} qualifying announcements for today's Board Meetings.`);
  
  const mongoDb = await getDb();
  const processingCol = mongoDb.collection('board_meeting_processing');
  const logsCol = mongoDb.collection('board_meeting_email_logs');
  
  let subscribers = null;
  
  for (const ann of qualifying) {
    const annId = String(ann.id);
    const companyId = String(ann.scriptCode || ann.bseCode || '').trim();
    
    try {
      const procDoc = await processingCol.findOneAndUpdate(
        { _id: annId },
        { 
          $setOnInsert: { 
            _id: annId,
            announcementId: annId,
            companyId,
            status: 'Processing',
            startedAt: new Date(),
            totalEligibleUsers: 0,
            totalSent: 0,
            totalFailed: 0
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      
      if (procDoc.lastErrorObject && procDoc.lastErrorObject.updatedExisting) {
        continue;
      }
      
      if (!subscribers) {
        subscribers = await getSubscribedUsers();
      }
      
      if (subscribers.length === 0) {
        await processingCol.updateOne(
          { _id: annId },
          { $set: { status: 'Completed', completedAt: new Date() } }
        );
        continue;
      }
      
      let sentCount = 0;
      let failCount = 0;
      
      const CHUNK_SIZE = 50;
      for (let i = 0; i < subscribers.length; i += CHUNK_SIZE) {
        const chunk = subscribers.slice(i, i + CHUNK_SIZE);
        const promises = chunk.map(async (user) => {
          const logId = `${annId}_${user.uid}`;
          const existingLog = await logsCol.findOne({ _id: logId });
          if (existingLog) return;
          
          let status = 'Sent';
          let reason = '';
          try {
            await sendBoardMeetingAlertEmail(user.email, user.name, ann);
            sentCount++;
          } catch (e) {
            status = 'Failed';
            reason = e.message;
            failCount++;
          }
          
          await logsCol.insertOne({
            _id: logId,
            announcementId: annId,
            companyId,
            userId: user.uid,
            userEmail: user.email,
            status,
            failureReason: reason,
            sentAt: new Date()
          });
        });
        
        await Promise.all(promises);
      }
      
      await processingCol.updateOne(
        { _id: annId },
        { 
          $set: { 
            status: 'Completed', 
            totalEligibleUsers: subscribers.length,
            totalSent: sentCount,
            totalFailed: failCount,
            completedAt: new Date()
          } 
        }
      );
      
      console.log(`[BoardMeetingNotifier] Sent ${sentCount} emails for announcement ${annId} (${companyId}).`);
      
    } catch (err) {
      console.error(`[BoardMeetingNotifier] Error processing announcement ${annId}:`, err.message);
    }
  }
}

module.exports = {
  processBoardMeetingAnnouncements
};
