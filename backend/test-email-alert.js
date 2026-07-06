'use strict';

require('dotenv').config();
const { getDb } = require('./lib/mongoClient');
const { sendBoardMeetingAlertEmail } = require('./lib/mailer');
const { admin } = require('./lib/firebaseAdmin');

async function runTest() {
  console.log('--- Starting Board Meeting Email Notification Test ---');
  
  // Create a mock announcement
  const mockAnnouncement = {
    id: `TEST_ANN_${Date.now()}`,
    scriptCode: '500101', // Arvind Ltd (had a board meeting on Friday)
    scriptName: 'ARVIND LTD',
    category: 'Outcome of Board Meeting',
    subCategory: 'Financial Results',
    critical: true,
    date: new Date().toLocaleDateString('en-GB'),
    time: new Date().toLocaleTimeString('en-GB'),
    exchange: 'BSE',
    subject: 'Approval of Audited Financial Results for Q4.',
    description: 'Arvind Ltd - Announcement under Regulation 30 (LODR) - Financial Results for the quarter and year ended March 31.',
    pdfUrl: 'https://example.com/test-pdf'
  };

  try {
    // 1. Fetch subscribed users
    console.log('Fetching subscribed users from Firestore...');
    const dbFirebase = admin.firestore();
    const snapshot = await dbFirebase.collection('users')
      .where('prefs.emailEnabled', '==', true)
      .get();
      
    if (snapshot.empty) {
      console.log('❌ Nobody is subscribed to Board Meeting Updates. Go to the UI and toggle it on first!');
      process.exit(1);
    }
    
    const users = [];
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
    
    console.log(`Found ${users.length} subscribed users.`);

    // 2. Send Emails and Log to MongoDB
    const mongoDb = await getDb();
    const logsCol = mongoDb.collection('board_meeting_email_logs');

    for (const user of users) {
      console.log(`Sending test email to ${user.email}...`);
      await sendBoardMeetingAlertEmail(user.email, user.name, mockAnnouncement);
      
      const logId = `${mockAnnouncement.id}_${user.uid}`;
      await logsCol.insertOne({
        _id: logId,
        announcementId: mockAnnouncement.id,
        companyId: mockAnnouncement.scriptCode,
        userId: user.uid,
        userEmail: user.email,
        status: 'Sent',
        failureReason: '',
        sentAt: new Date()
      });
      console.log(`✅ Log inserted for ${user.email} with companyId: ${mockAnnouncement.scriptCode}`);
    }
    
    console.log('✅ Test complete! Check your email inbox and the frontend table.');
    process.exit(0);

  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

runTest();
