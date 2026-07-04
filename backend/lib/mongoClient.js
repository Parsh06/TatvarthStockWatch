'use strict';

const { MongoClient } = require('mongodb');

// Ensure MongoDB URI is defined
if (!process.env.MONGODB_URI) {
  console.warn('[MongoDB] Warning: MONGODB_URI is missing in .env');
}

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const options = {};

let client;
let clientPromise;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * Returns the MongoDB connected database instance.
 * @returns {Promise<import('mongodb').Db>}
 */
async function getDb() {
  const connectedClient = await clientPromise;
  // Default to the database name inside the connection string, or a default 'stockwatch'
  return connectedClient.db('stockwatch');
}

module.exports = {
  getDb,
  clientPromise
};
