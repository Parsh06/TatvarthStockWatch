'use strict';

require('dotenv').config({ path: '../backend/.env' });
const { getDb } = require('../backend/lib/mongoClient');

async function inspect() {
  const db = await getDb();
  const collection = db.collection('ipo_closing_today');
  
  const docs = await collection.find({}).toArray();
  docs.forEach(doc => {
    console.log(`IPO: ${doc.name} (${doc.id || doc._id})`);
    console.log(`Status: ${doc.status || doc.dispatchStatus}`);
    console.log(`Delivered Users:`, doc.deliveredUsers);
  });
  
  process.exit(0);
}

inspect().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
