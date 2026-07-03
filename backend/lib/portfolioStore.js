'use strict';

const { db } = require('./firebaseAdmin');

async function getPortfolio(uid) {
  if (!uid) return { holdings: [] };
  const snap = await db.collection('portfolios').doc(uid).get();
  if (!snap.exists) return { holdings: [] };
  return snap.data();
}

async function savePortfolio(uid, portfolio) {
  if (!uid) return;
  await db.collection('portfolios').doc(uid).set(portfolio, { merge: true });
}

module.exports = {
  getPortfolio,
  savePortfolio
};
