'use strict';

const { db, admin } = require('./firebaseAdmin');

async function getAlerts(uid, limitN = 200) {
  if (!uid) return [];
  const snap = await db.collection('alerts').doc(uid)
    .collection('userAlerts')
    .orderBy('triggeredAt', 'desc')
    .limit(limitN)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function appendAlert(uid, alert) {
  if (!uid) return;
  await db.collection('alerts').doc(uid)
    .collection('userAlerts')
    .doc(String(alert.id))
    .set({
      ...alert,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function deleteAlert(uid, alertId) {
  if (!uid) return;
  await db.collection('alerts').doc(uid).collection('userAlerts').doc(alertId).delete();
}

async function clearAlerts(uid) {
  if (!uid) return;
  const snap = await db.collection('alerts').doc(uid).collection('userAlerts').get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function invalidateCache() {}

module.exports = {
  getAlerts,
  appendAlert,
  deleteAlert,
  clearAlerts,
  invalidateCache
};
