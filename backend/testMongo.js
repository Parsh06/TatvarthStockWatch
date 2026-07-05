require('dotenv').config();
const { getDb } = require('./lib/mongoClient');

async function run() {
  const db = await getDb();
  const annCol = db.collection('announcements');
  const ann = await annCol.findOne({ pdfUrl: { $ne: null } }, { sort: { savedAt: -1 } });
  
  if(ann) {
    await annCol.updateOne({_id: ann._id}, {$unset: {aiSummary: "", aiSummaryStatus: ""}});
    console.log('Reset:', ann.scriptName, ann._id);
  }
  process.exit(0);
}
run();
