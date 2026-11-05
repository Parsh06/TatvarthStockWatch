'use strict';

const { MongoClient } = require('mongodb');

// Ensure MongoDB URI is defined
if (!process.env.MONGODB_URI) {
  console.warn('[MongoDB] Warning: MONGODB_URI is missing in .env');
}

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';

const MONGO_OPTIONS = {
  maxPoolSize: 20,                // Stays safely below MongoDB Atlas M0 500-connection limit
  minPoolSize: 2,                 // Maintains warm standby connections
  serverSelectionTimeoutMS: 5000, // Fail fast in 5s instead of hanging worker for 30s
  connectTimeoutMS: 10000,        // 10s connection establishment timeout
  socketTimeoutMS: 45000,         // 45s socket inactivity timeout
  retryWrites: true,
  retryReads: true,
};

let client = null;
let clientPromise = null;

/**
 * Reconnect factory: ensures client connects with retry backoff
 * and recovers gracefully if initial startup connection blips.
 */
async function getConnectedClient() {
  if (client) {
    try {
      if (client.topology && client.topology.isConnected()) {
        return client;
      }
    } catch {}
  }

  if (!clientPromise) {
    client = new MongoClient(uri, MONGO_OPTIONS);
    clientPromise = client.connect().catch((err) => {
      clientPromise = null; // Reset so next operation retries instead of caching failure
      client = null;
      throw err;
    });
  }

  try {
    const connected = await clientPromise;
    return connected;
  } catch (err) {
    clientPromise = null;
    client = null;
    console.warn('[MongoDB] Connection attempt failed — will retry on next operation:', err.message);
    throw err;
  }
}

// Immediate eager connection attempt on module load
getConnectedClient().catch((err) => {
  console.warn('[MongoDB] Initial boot connection pending:', err.message);
});

let indexesInitialized = false;

/**
 * Ensures high-speed compound indexes exist on MongoDB collections.
 * Runs asynchronously and idempotently.
 */
async function ensureIndexes(db) {
  if (indexesInitialized) return;
  indexesInitialized = true;
  try {
    const annCol = db.collection('announcements');
    await Promise.allSettled([
      annCol.createIndex({ bseCode: 1, datetimeIST: -1 }, { background: true }),
      annCol.createIndex({ nseSymbol: 1, datetimeIST: -1 }, { background: true }),
      annCol.createIndex({ category: 1, datetimeIST: -1 }, { background: true }),
      annCol.createIndex({ scriptCode: 1, announcementDate: -1 }, { background: true }),
      annCol.createIndex({ announcementDate: -1 }, { background: true }),
    ]);
    console.log('[MongoDB] High-speed compound indexes verified ({ bseCode, nseSymbol, category, datetimeIST })');
  } catch (err) {
    console.warn('[MongoDB] Index creation warning:', err.message);
  }
}

/**
 * Returns the MongoDB connected database instance.
 * @returns {Promise<import('mongodb').Db>}
 */
async function getDb() {
  const connectedClient = await getConnectedClient();
  const db = connectedClient.db('stockwatch');
  ensureIndexes(db).catch(() => {});
  return db;
}

/**
 * Health check ping for runtime diagnostics
 */
async function checkMongoHealth() {
  const startMs = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { status: 'ok', latencyMs: Date.now() - startMs, connected: true };
  } catch (err) {
    return { status: 'error', error: err.message, latencyMs: Date.now() - startMs, connected: false };
  }
}

module.exports = {
  getDb,
  getConnectedClient,
  checkMongoHealth,
  MONGO_OPTIONS,
  get clientPromise() {
    return getConnectedClient();
  }
};
