require('dotenv').config({ path: '.env' });
const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('test');
  
  const pipeline = [
    {
      $group: {
        _id: { category: "$category", subCategory: "$subCategory" },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.category": 1, count: -1 }
    }
  ];
  
  const results = await db.collection('announcements').aggregate(pipeline).toArray();
  
  const map = {};
  for (const r of results) {
    const c = r._id.category || 'General';
    const s = r._id.subCategory || 'Other';
    if (!map[c]) map[c] = [];
    if (!map[c].includes(s)) map[c].push(s);
  }
  
  console.log(JSON.stringify(map, null, 2));
  await client.close();
}
run();
