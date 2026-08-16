'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Redis } = require('@upstash/redis');

const UPSTASH_ENABLED = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

let redis = null;

if (UPSTASH_ENABLED) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (err) {
    console.error('[RedisClient] Failed to initialize Upstash Redis:', err.message);
    redis = null;
  }
}

module.exports = {
  get redis() {
    return redis;
  },
  UPSTASH_ENABLED,
};
