'use strict';

/**
 * adminRoutes.js
 *
 * Admin-only API routes for StockWatch.
 *
 * All routes require:
 *   1. verifyToken (Firebase JWT)
 *   2. requireAdmin('read') or requireAdmin('write') based on operation
 *
 * Route Overview:
 *   GET  /api/admin/stats                    — Platform stats (read)
 *   GET  /api/admin/users                    — List all users (read)
 *   GET  /api/admin/users/:uid               — User profile detail (read)
 *   GET  /api/admin/users/:uid/watchlist     — User's watchlist (read)
 *   GET  /api/admin/users/:uid/alerts        — User's alert history (read)
 *   GET  /api/admin/users/:uid/devices       — User's push devices (read)
 *   PATCH /api/admin/users/:uid/disable      — Disable account (write)
 *   PATCH /api/admin/users/:uid/enable       — Enable account (write)
 *   PATCH /api/admin/users/:uid/role         — Change role/entitlements (write)
 *   DELETE /api/admin/users/:uid/watchlist/:docId  — Remove watchlist entry (write)
 *   DELETE /api/admin/users/:uid/devices/:deviceId — Remove push device (write)
 *   GET  /api/admin/audit-log                — Audit trail (read)
 */

const express = require('express');
const { db, admin } = require('../lib/firebaseAdmin');
const { getDb } = require('../lib/mongoClient');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const { strictRateLimiter } = require('../middleware/rateLimiter');
const { broadcastWebPushToAll, sendWebPushToUser } = require('../lib/webPushNotifier');

module.exports = function adminRoutes(verifyToken, requireAdmin) {
  const router = express.Router();
  const { invalidateEntitlementCache } = require('../middleware/requireAdmin');

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Write an immutable audit log entry to Firestore.
   */
  async function writeAuditLog({ actorUid, actorEmail, action, targetUid, payload = {} }) {
    try {
      await db.collection('admin_audit_log').add({
        actorUid,
        actorEmail: actorEmail || null,
        action,
        targetUid: targetUid || null,
        payload,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error('[Admin] Audit log write failed:', err.message);
    }
  }

  /**
   * Log administrative audit event with positional args (alias for writeAuditLog).
   */
  async function logAdminAudit(actorUid, action, targetUid, payload = {}, ip = null) {
    return writeAuditLog({
      actorUid,
      actorEmail: null,
      action,
      targetUid,
      payload: { ...payload, ip },
    });
  }


  /**
   * Enrich raw Firebase Auth user with Firestore profile data.
   */
  async function enrichUser(authUser) {
    let profileData = {};
    let watchlistCount = 0;

    try {
      const snap = await db.collection('users').doc(authUser.uid).get();
      if (snap.exists) profileData = snap.data() || {};
    } catch {
      // Non-critical
    }

    try {
      const mongoDb = await getDb();
      watchlistCount = await mongoDb.collection('watchlists').countDocuments({ userId: authUser.uid });
    } catch {
      // Non-critical
    }

    return {
      uid: authUser.uid,
      email: authUser.email || null,
      displayName: authUser.displayName || null,
      photoURL: authUser.photoURL || null,
      emailVerified: !!authUser.emailVerified,
      disabled: authUser.disabled || profileData.disabled === true,
      disabledReason: profileData.disabledReason || null,
      disabledBy: profileData.disabledBy || null,
      disabledAt: profileData.disabledAt || null,
      createdAt: authUser.metadata?.creationTime || null,
      lastSignInAt: authUser.metadata?.lastSignInTime || null,
      role: profileData.role || 'user',
      entitlements: profileData.entitlements || { read: false, write: false },
      approvalStatus: profileData.approvalStatus || (profileData.role === 'admin' ? 'approved' : 'approved'),
      approvalRequestedAt: profileData.approvalRequestedAt?.toDate?.()?.toISOString() || profileData.approvalRequestedAt || null,
      approvedAt: profileData.approvedAt?.toDate?.()?.toISOString() || profileData.approvedAt || null,
      rejectedAt: profileData.rejectedAt?.toDate?.()?.toISOString() || profileData.rejectedAt || null,
      prefs: profileData.prefs || {},
      plan: profileData.plan || 'basic',
      planStatus: profileData.planStatus || 'active',
      planStartedAt: profileData.planStartedAt?.toDate?.()?.toISOString() || profileData.planStartedAt || null,
      planExpiresAt: profileData.planExpiresAt?.toDate?.()?.toISOString() || profileData.planExpiresAt || null,
      planAssignedBy: profileData.planAssignedBy || null,
      planNotes: profileData.planNotes || null,
      planHistory: Array.isArray(profileData.planHistory) ? profileData.planHistory : [],
      dailyAiUsage: profileData.dailyAiUsage || { date: null, count: 0 },
      watchlistCount,
    };
  }

  // ── Middleware applied to all admin routes ────────────────────────────────────
  // All routes need verifyToken first; individual routes add requireAdmin('read'/'write')

  // ── GET /api/admin/stats ───────────────────────────────────────────────────
  router.get('/stats', verifyToken, requireAdmin('read'), strictRateLimiter, async (req, res) => {
    try {
      const mongoDb = await getDb();

      // Firebase user list
      let totalUsers = 0;
      let disabledUsers = 0;
      let adminUsers = 0;
      let pageToken;

      do {
        const result = await admin.auth().listUsers(1000, pageToken);
        totalUsers += result.users.length;
        disabledUsers += result.users.filter(u => u.disabled).length;
        pageToken = result.pageToken;
      } while (pageToken);

      // Firestore admin count
      const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
      adminUsers = adminSnap.size;

      // MongoDB stats
      const [watchlistCount, announcementCount] = await Promise.all([
        mongoDb.collection('watchlists').countDocuments({}),
        mongoDb.collection('announcements').countDocuments({}),
      ]);

      // Average watchlist size
      const avgResult = await mongoDb.collection('watchlists').aggregate([
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $group: { _id: null, avg: { $avg: '$count' } } },
      ]).toArray();
      const avgWatchlistSize = avgResult[0]?.avg ? parseFloat(avgResult[0].avg.toFixed(1)) : 0;

      // Top watchlisted scripts
      const topScripts = await mongoDb.collection('watchlists').aggregate([
        { $group: { _id: { scriptName: '$scriptName', ltdCode: '$ltdCode' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, scriptName: '$_id.scriptName', ltdCode: '$_id.ltdCode', count: 1 } },
      ]).toArray();

      // Audit log count today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const auditTodaySnap = await db.collection('admin_audit_log')
        .where('timestamp', '>=', todayStart)
        .count()
        .get();

      res.json({
        success: true,
        stats: {
          totalUsers,
          activeUsers: totalUsers - disabledUsers,
          disabledUsers,
          adminUsers,
          watchlistCount,
          avgWatchlistSize,
          announcementCount,
          topScripts,
          adminActionsToday: auditTodaySnap.data().count || 0,
        },
      });
    } catch (err) {
      console.error('[Admin] /stats error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch admin stats' });
    }
  });

  // ── GET /api/admin/users ──────────────────────────────────────────────────
  router.get('/users', verifyToken, requireAdmin('read'), strictRateLimiter, async (req, res) => {
    try {
      const { search = '', limit: rawLimit = '100', pageToken } = req.query;
      const maxResults = Math.min(parseInt(rawLimit, 10) || 100, 500);

      let listResult;
      try {
        listResult = await admin.auth().listUsers(maxResults, pageToken || undefined);
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to list users from Firebase Auth' });
      }

      // Enrich users in parallel (batched to avoid overloading Firestore)
      const BATCH = 10;
      const enriched = [];
      for (let i = 0; i < listResult.users.length; i += BATCH) {
        const batch = listResult.users.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(u => enrichUser(u).catch(() => ({
          uid: u.uid, email: u.email, displayName: u.displayName, disabled: u.disabled,
          role: 'user', entitlements: { read: false, write: false }, watchlistCount: 0,
          createdAt: u.metadata?.creationTime, lastSignInAt: u.metadata?.lastSignInTime,
        }))));
        enriched.push(...results);
      }

      // Apply search filter
      let filtered = enriched;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = enriched.filter(u =>
          (u.email || '').toLowerCase().includes(q) ||
          (u.displayName || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
        );
      }

      res.json({
        success: true,
        users: filtered,
        nextPageToken: listResult.pageToken || null,
        total: filtered.length,
      });
    } catch (err) {
      console.error('[Admin] /users error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  });

  // ── GET /api/admin/users/:uid ─────────────────────────────────────────────
  router.get('/users/:uid', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const { uid } = req.params;
      const authUser = await admin.auth().getUser(uid);
      const userDetail = await enrichUser(authUser);

      // Also include prefs from Firestore
      const snap = await db.collection('users').doc(uid).get();
      const profileData = snap.exists ? snap.data() : {};
      userDetail.prefs = profileData.prefs || {};
      userDetail.blockedCategories = profileData.prefs?.blockedCategories || [];
      userDetail.notificationScope = profileData.prefs?.notificationScope || 'WATCHLIST_ONLY';

      res.json({ success: true, user: userDetail });
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      console.error('[Admin] /users/:uid error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch user detail' });
    }
  });

  // ── GET /api/admin/users/:uid/watchlist ──────────────────────────────────
  router.get('/users/:uid/watchlist', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const { uid } = req.params;
      const mongoDb = await getDb();
      const docs = await mongoDb.collection('watchlists')
        .find({ userId: uid })
        .sort({ addedAt: -1 })
        .toArray();

      res.json({
        success: true,
        watchlist: docs.map(d => ({ ...d, id: String(d._id), _id: undefined })),
        count: docs.length,
      });
    } catch (err) {
      console.error('[Admin] /users/:uid/watchlist error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch watchlist' });
    }
  });

  // ── GET /api/admin/users/:uid/alerts ─────────────────────────────────────
  router.get('/users/:uid/alerts', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const { uid } = req.params;
      const { limit: rawLimit = '30' } = req.query;
      const maxItems = Math.min(parseInt(rawLimit, 10) || 30, 100);

      const snap = await db.collection('users').doc(uid)
        .collection('alerts')
        .orderBy('timestamp', 'desc')
        .limit(maxItems)
        .get();

      const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ success: true, alerts, count: alerts.length });
    } catch (err) {
      console.error('[Admin] /users/:uid/alerts error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
    }
  });

  // ── GET /api/admin/users/:uid/devices ────────────────────────────────────
  router.get('/users/:uid/devices', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const { uid } = req.params;
      const snap = await db.collection('users').doc(uid)
        .collection('pushDevices')
        .get();

      const devices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ success: true, devices, count: devices.length });
    } catch (err) {
      console.error('[Admin] /users/:uid/devices error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch devices' });
    }
  });

  // ── PATCH /api/admin/users/:uid/disable ──────────────────────────────────
  router.patch('/users/:uid/disable', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const { reason = '' } = req.body;
      const actorUid = req.uid;

      if (uid === actorUid) {
        return res.status(400).json({ success: false, error: 'You cannot disable your own account' });
      }

      // Disable in Firebase Auth (invalidates all sessions immediately)
      await admin.auth().updateUser(uid, { disabled: true });

      // Revoke all refresh tokens (force sign-out from all devices)
      await admin.auth().revokeRefreshTokens(uid);

      const effectiveReason = (reason && reason.trim()) || 'Your account access has been suspended by an administrator.';

      // Update Firestore profile
      await db.collection('users').doc(uid).set({
        disabled: true,
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        disabledBy: actorUid,
        disabledReason: effectiveReason,
      }, { merge: true });

      // Purge registered push devices so disabled user stops receiving push notifications
      try {
        const pushSnap = await db.collection('users').doc(uid).collection('pushDevices').get();
        if (!pushSnap.empty) {
          const batch = db.batch();
          pushSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));
          await batch.commit();
        }
      } catch (pushErr) {
        console.warn(`[Admin] Failed to clear push devices for disabled user ${uid}:`, pushErr.message);
      }

      // Remove from Redis notification sets if available
      try {
        const redisNotifStore = require('../lib/redis/redisNotificationStore');
        if (redisNotifStore && typeof redisNotifStore.removeScopeAllUser === 'function') {
          await redisNotifStore.removeScopeAllUser(uid).catch(() => {});
        }
      } catch (redisErr) {
        console.warn(`[Admin] Failed to clean Redis notification cache for ${uid}:`, redisErr.message);
      }

      // Invalidate entitlement cache for this user
      await invalidateEntitlementCache(uid);

      // Write audit log
      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'DISABLE_USER',
        targetUid: uid,
        payload: { reason: effectiveReason },
      });

      res.json({ success: true, message: 'Account disabled, sessions revoked, and notifications deactivated' });
    } catch (err) {
      console.error('[Admin] /disable error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to disable account' });
    }
  });

  // ── PATCH /api/admin/users/:uid/enable ───────────────────────────────────
  router.patch('/users/:uid/enable', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const actorUid = req.uid;

      await admin.auth().updateUser(uid, { disabled: false });

      await db.collection('users').doc(uid).set({
        disabled: false,
        disabledAt: null,
        disabledBy: null,
        disabledReason: null,
      }, { merge: true });

      await invalidateEntitlementCache(uid);

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'ENABLE_USER',
        targetUid: uid,
        payload: {},
      });

      res.json({ success: true, message: 'Account re-enabled' });
    } catch (err) {
      console.error('[Admin] /enable error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to enable account' });
    }
  });

  // ── PATCH /api/admin/users/:uid/approve ──────────────────────────────────
  router.patch('/users/:uid/approve', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const actorUid = req.uid;

      // Lookup user email to record in approved_emails
      let userEmail = '';
      try {
        const uDoc = await db.collection('users').doc(uid).get();
        if (uDoc.exists && uDoc.data()?.email) {
          userEmail = uDoc.data().email.toLowerCase().trim();
        } else {
          const authUser = await admin.auth().getUser(uid);
          userEmail = (authUser.email || '').toLowerCase().trim();
        }
      } catch {}

      await db.collection('users').doc(uid).set({
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: actorUid,
        rejectedReason: null,
      }, { merge: true });

      if (userEmail) {
        await db.collection('approved_emails').doc(userEmail).set({
          email: userEmail,
          uid,
          approvedAt: new Date(),
          approvedBy: actorUid,
        }, { merge: true }).catch(() => {});
      }

      await invalidateEntitlementCache(uid);

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'USER_ACCESS_APPROVED',
        targetUid: uid,
        payload: { email: userEmail },
      });

      // Notify the user on all their registered devices if any
      try {
        const { sendWebPushToUser } = require('../lib/webPushNotifier');
        await sendWebPushToUser(uid, {
          title: '🎉 Access Approved!',
          body: 'Your Tatvarth StockWatch account has been approved by administrator. Welcome aboard!',
          url: '/dashboard',
          tag: `user-approved-${uid}`,
          type: 'general',
          urgency: 'high',
          priority: 'high',
        });
      } catch (pushErr) {
        console.warn('[Admin] User approval push error:', pushErr.message);
      }

      res.json({ success: true, message: 'User access approved successfully', approvalStatus: 'approved' });
    } catch (err) {
      console.error('[Admin] /approve error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to approve account' });
    }
  });

  // ── PATCH /api/admin/users/:uid/reject ───────────────────────────────────
  router.patch('/users/:uid/reject', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const { reason } = req.body || {};
      const actorUid = req.uid;

      // Lookup user email to clean up approved_emails
      let userEmail = '';
      try {
        const uDoc = await db.collection('users').doc(uid).get();
        if (uDoc.exists && uDoc.data()?.email) {
          userEmail = uDoc.data().email.toLowerCase().trim();
        }
      } catch {}

      await db.collection('users').doc(uid).set({
        approvalStatus: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: actorUid,
        rejectedReason: reason || 'Access request declined by administrator',
      }, { merge: true });

      if (userEmail) {
        await db.collection('approved_emails').doc(userEmail).delete().catch(() => {});
      }

      // Notify the user of rejection
      try {
        const { sendWebPushToUser } = require('../lib/webPushNotifier');
        await sendWebPushToUser(uid, {
          title: 'StockWatch Access Update',
          body: reason ? `Access request declined: ${reason}` : 'Your access request was declined by the administrator.',
          url: '/access-rejected',
          tag: `user-rejected-${uid}`,
          type: 'general',
          urgency: 'high',
        });
      } catch {}

      // Revoke active sessions immediately
      await admin.auth().revokeRefreshTokens(uid).catch(() => {});
      await invalidateEntitlementCache(uid);

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'USER_ACCESS_REJECTED',
        targetUid: uid,
        payload: { reason: reason || 'Access request declined by administrator' },
      });

      res.json({ success: true, message: 'User access request rejected', approvalStatus: 'rejected' });
    } catch (err) {
      console.error('[Admin] /reject error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to reject account' });
    }
  });

  // ── PATCH /api/admin/users/:uid/re-allow ─────────────────────────────────
  router.patch('/users/:uid/re-allow', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const actorUid = req.uid;

      await db.collection('users').doc(uid).set({
        approvalStatus: 'approved',
        reAllowedAt: new Date(),
        reAllowedBy: actorUid,
        rejectedReason: null,
      }, { merge: true });

      await invalidateEntitlementCache(uid);

      // Notify the user of re-allowance
      try {
        const { sendWebPushToUser } = require('../lib/webPushNotifier');
        await sendWebPushToUser(uid, {
          title: '🎉 Access Restored!',
          body: 'Your account access has been restored and approved. Welcome back!',
          url: '/dashboard',
          tag: `user-reallowed-${uid}`,
          type: 'general',
          urgency: 'high',
        });
      } catch {}

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'USER_ACCESS_REALLOWED',
        targetUid: uid,
        payload: {},
      });

      res.json({ success: true, message: 'User account re-allowed and approved', approvalStatus: 'approved' });
    } catch (err) {
      console.error('[Admin] /re-allow error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to re-allow account' });
    }
  });

  // ── PATCH /api/admin/users/:uid/role ─────────────────────────────────────
  router.patch('/users/:uid/role', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const { role, entitlements } = req.body;
      const actorUid = req.uid;

      const validRoles = ['admin', 'user'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }

      if (uid === actorUid && role !== 'admin') {
        return res.status(400).json({ success: false, error: 'You cannot demote your own admin role' });
      }

      const sanitizedEntitlements = {
        read: role === 'admin' ? (entitlements?.read === true) : false,
        write: role === 'admin' ? (entitlements?.write === true) : false,
      };

      await db.collection('users').doc(uid).set({
        role,
        entitlements: sanitizedEntitlements,
      }, { merge: true });

      // Invalidate cache so next request picks up fresh entitlements
      await invalidateEntitlementCache(uid);

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'SET_ROLE',
        targetUid: uid,
        payload: { role, entitlements: sanitizedEntitlements },
      });

      res.json({
        success: true,
        message: `User role updated to '${role}'`,
        role,
        entitlements: sanitizedEntitlements,
      });
    } catch (err) {
      console.error('[Admin] /role error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to update role' });
    }
  });

  // ── PATCH /api/admin/users/:uid/plan ─────────────────────────────────────
  router.patch('/users/:uid/plan', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const { plan, notes = '' } = req.body || {};
      const actorUid = req.uid;

      const validPlans = ['basic', 'pro', 'premium'];
      const targetPlan = (plan || 'basic').toLowerCase();
      if (!validPlans.includes(targetPlan)) {
        return res.status(400).json({ success: false, error: `Invalid plan. Must be one of: ${validPlans.join(', ')}` });
      }

      let months = 1;
      const rawDuration = req.body?.duration !== undefined ? req.body?.duration : req.body?.durationMonths;
      if (rawDuration === 'lifetime' || rawDuration === '0' || rawDuration === 0 || rawDuration === null) {
        months = 0; // Lifetime
      } else if (rawDuration === '1y' || rawDuration === '12m') {
        months = 12;
      } else if (rawDuration === '6m') {
        months = 6;
      } else if (rawDuration === '3m') {
        months = 3;
      } else if (rawDuration === '1m') {
        months = 1;
      } else if (!isNaN(Number(rawDuration))) {
        months = Number(rawDuration);
      }

      let planExpiresAt = null;
      let planStatus = 'active';

      if (targetPlan !== 'basic') {
        if (months && months > 0) {
          const now = new Date();
          now.setMonth(now.getMonth() + months);
          planExpiresAt = now;
        } else {
          // 0 or null implies lifetime / ongoing
          planExpiresAt = null;
        }
      }

      const updateData = {
        plan: targetPlan,
        planStatus,
        planStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: planExpiresAt ? admin.firestore.Timestamp.fromDate(planExpiresAt) : null,
        planAssignedBy: actorUid,
        planNotes: (notes && notes.trim()) || null,
        planHistory: admin.firestore.FieldValue.arrayUnion({
          plan: targetPlan,
          action: targetPlan === 'basic' ? 'RESET_BASIC' : 'UPGRADE',
          durationMonths: months || null,
          timestamp: new Date().toISOString(),
          assignedBy: actorUid,
          notes: (notes && notes.trim()) || null,
        }),
      };

      await db.collection('users').doc(uid).set(updateData, { merge: true });

      await invalidateEntitlementCache(uid);

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: targetPlan === 'basic' ? 'DOWNGRADE_USER_PLAN' : 'UPGRADE_USER_PLAN',
        targetUid: uid,
        payload: { plan: targetPlan, durationMonths: months, notes },
      });

      // Send congratulatory push notification to user
      if (targetPlan !== 'basic') {
        const { sendWebPushToUser } = require('../lib/webPushNotifier');
        sendWebPushToUser(uid, {
          title: `🎉 ${targetPlan === 'premium' ? 'Premium HNI' : 'Pro'} Plan Activated!`,
          body: `Your account has been upgraded to ${targetPlan.toUpperCase()} with full intelligence unlocked.`,
          url: 'https://tatvarthstockwatch.web.app/plans',
        }).catch(() => {});
      }

      res.json({
        success: true,
        message: `User plan updated to '${targetPlan.toUpperCase()}' successfully`,
        plan: targetPlan,
        planStatus,
        planExpiresAt: planExpiresAt ? planExpiresAt.toISOString() : null,
        membership: {
          plan: targetPlan,
          planStatus,
          planExpiresAt: planExpiresAt ? planExpiresAt.toISOString() : null,
          planAssignedBy: actorUid,
          planNotes: (notes && notes.trim()) || null,
        },
      });
    } catch (err) {
      console.error('[Admin] /plan error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to update user plan' });
    }
  });

  // ── PATCH /api/admin/users/:uid/plan/revoke ──────────────────────────────
  router.patch('/users/:uid/plan/revoke', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid } = req.params;
      const { reason = '' } = req.body || {};
      const actorUid = req.uid;

      await db.collection('users').doc(uid).set({
        plan: 'basic',
        planStatus: 'expired',
        planExpiresAt: null,
        planRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
        planRevokedBy: actorUid,
        planHistory: admin.firestore.FieldValue.arrayUnion({
          plan: 'basic',
          action: 'REVOKE',
          timestamp: new Date().toISOString(),
          assignedBy: actorUid,
          notes: reason || 'Revoked by admin',
        }),
      }, { merge: true });

      await invalidateEntitlementCache(uid);

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'REVOKE_USER_PLAN',
        targetUid: uid,
        payload: { reason },
      });

      res.json({ success: true, message: 'User plan revoked and reverted to Basic', plan: 'basic' });
    } catch (err) {
      console.error('[Admin] /plan/revoke error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to revoke user plan' });
    }
  });

  // ── DELETE /api/admin/users/:uid/watchlist/:docId ────────────────────────
  router.delete('/users/:uid/watchlist/:docId', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid, docId } = req.params;
      const actorUid = req.uid;
      const mongoDb = await getDb();

      const query = { userId: uid };
      try { query._id = new ObjectId(docId); } catch { query._id = docId; }

      const result = await mongoDb.collection('watchlists').deleteOne(query);

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, error: 'Watchlist entry not found' });
      }

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'DELETE_WATCHLIST_ENTRY',
        targetUid: uid,
        payload: { docId },
      });

      res.json({ success: true, message: 'Watchlist entry deleted' });
    } catch (err) {
      console.error('[Admin] /watchlist/:docId delete error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to delete watchlist entry' });
    }
  });

  // ── DELETE /api/admin/users/:uid/devices/:deviceId ───────────────────────
  router.delete('/users/:uid/devices/:deviceId', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { uid, deviceId } = req.params;
      const actorUid = req.uid;

      await db.collection('users').doc(uid)
        .collection('pushDevices')
        .doc(deviceId)
        .delete();

      await writeAuditLog({
        actorUid,
        actorEmail: req.user?.email,
        action: 'DELETE_PUSH_DEVICE',
        targetUid: uid,
        payload: { deviceId },
      });

      res.json({ success: true, message: 'Push device removed' });
    } catch (err) {
      console.error('[Admin] /devices/:deviceId delete error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to delete push device' });
    }
  });

  // ── GET /api/admin/audit-log ──────────────────────────────────────────────
  router.get('/audit-log', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const { limit: rawLimit = '50', action, targetUid, actorUid } = req.query;
      const maxItems = Math.min(parseInt(rawLimit, 10) || 50, 200);

      let query = db.collection('admin_audit_log').orderBy('timestamp', 'desc');

      if (action) query = query.where('action', '==', action);
      if (targetUid) query = query.where('targetUid', '==', targetUid);
      if (actorUid) query = query.where('actorUid', '==', actorUid);

      query = query.limit(maxItems);

      const snap = await query.get();
      const logs = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toDate?.()?.toISOString() || null,
      }));

      res.json({ success: true, logs, count: logs.length });
    } catch (err) {
      console.error('[Admin] /audit-log error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
    }
  });

  // ── GET /api/admin/me ─────────────────────────────────────────────────────
  // Self-check endpoint to verify your own admin entitlements
  router.get('/me', verifyToken, requireAdmin('read'), async (req, res) => {
    res.json({
      success: true,
      uid: req.uid,
      adminProfile: req.adminProfile,
    });
  });

  // ── GET /api/admin/system/services-status ──────────────────────────────────
  // Deep multi-subsystem diagnostic for all external & internal services
  router.get('/system/services-status', verifyToken, requireAdmin('read'), async (req, res) => {
    const checks = {};

    // 1. MongoDB Atlas
    try {
      const start = Date.now();
      const mongoDb = await getDb();
      await mongoDb.command({ ping: 1 });
      const latencyMs = Date.now() - start;
      const [announcementsCount, watchlistsCount, ipoSymbolsCount, dedupCount] = await Promise.all([
        mongoDb.collection('announcements').countDocuments({}).catch(() => 0),
        mongoDb.collection('watchlists').countDocuments({}).catch(() => 0),
        mongoDb.collection('iposymbols').countDocuments({}).catch(() => 0),
        mongoDb.collection('alert_dedup_locks').countDocuments({}).catch(() => 0),
      ]);
      checks.mongodb = {
        name: 'MongoDB Atlas',
        status: latencyMs < 800 ? 'healthy' : 'degraded',
        latencyMs,
        details: {
          database: mongoDb.databaseName || 'stockwatch',
          announcements: announcementsCount,
          watchlists: watchlistsCount,
          iposymbols: ipoSymbolsCount,
          dedupLocks: dedupCount,
        },
      };
    } catch (err) {
      checks.mongodb = {
        name: 'MongoDB Atlas',
        status: 'down',
        error: err.message,
      };
    }

    // 2. Firebase / Firestore
    try {
      const start = Date.now();
      await db.collection('users').limit(1).get();
      const latencyMs = Date.now() - start;
      checks.firestore = {
        name: 'Google Cloud Firestore',
        status: 'healthy',
        latencyMs,
        details: {
          connected: true,
          projectId: process.env.FIREBASE_PROJECT_ID || 'tatvarthstockwatch',
        },
      };
    } catch (err) {
      checks.firestore = {
        name: 'Google Cloud Firestore',
        status: 'down',
        error: err.message,
      };
    }

    // 3. Upstash Redis
    try {
      const { UPSTASH_ENABLED, redis, getCircuitStatus, isCircuitOpen } = require('../lib/redis/redisClient');
      const circuit = typeof getCircuitStatus === 'function' ? getCircuitStatus() : {};

      if (typeof isCircuitOpen === 'function' && isCircuitOpen()) {
        checks.redis = {
          name: 'Upstash Redis',
          status: 'healthy',
          latencyMs: 0,
          details: {
            mode: 'in-memory-fallback',
            circuitOpen: true,
            reason: circuit.reason,
            cooldownRemainingSec: circuit.cooldownRemainingSec,
            note: 'Monthly command quota protected. Ultra-fast in-memory fallback active with zero user disruption.',
          },
        };
      } else if (UPSTASH_ENABLED && redis) {
        const start = Date.now();
        await redis.ping();
        const latencyMs = Date.now() - start;
        checks.redis = {
          name: 'Upstash Redis',
          status: 'healthy',
          latencyMs,
          details: { enabled: true, rateLimitingActive: true },
        };
      } else {
        checks.redis = {
          name: 'Upstash Redis',
          status: 'disabled',
          details: { enabled: false, fallback: 'in-memory rate limiter' },
        };
      }
    } catch (err) {
      checks.redis = {
        name: 'Upstash Redis',
        status: 'degraded',
        error: err.message,
      };
    }

    // 4. BSE Scraper API
    try {
      const start = Date.now();
      const bseResp = await axios.get('https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strType=C&strSearch=P', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': 'https://www.bseindia.com/',
          'Origin': 'https://www.bseindia.com',
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 5000,
        validateStatus: () => true,
      });
      const latencyMs = Date.now() - start;
      const ok = bseResp.status >= 200 && bseResp.status < 400;
      checks.bse = {
        name: 'BSE Corporate Scraper',
        status: ok ? (latencyMs < 1200 ? 'healthy' : 'degraded') : (bseResp.status === 403 ? 'blocked' : 'down'),
        statusCode: bseResp.status,
        latencyMs,
        details: {
          endpoint: 'api.bseindia.com',
          cookieStatus: 'active',
        },
      };
    } catch (err) {
      checks.bse = {
        name: 'BSE Corporate Scraper',
        status: 'down',
        error: err.message,
      };
    }

    // 5. NSE Scraper API
    try {
      const start = Date.now();
      const nseResp = await axios.get('https://www.nseindia.com/api/allIndices', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          'Referer': 'https://www.nseindia.com/',
          'Accept': '*/*',
        },
        timeout: 5000,
        validateStatus: () => true,
      });
      const latencyMs = Date.now() - start;
      const ok = nseResp.status >= 200 && nseResp.status < 400;
      checks.nse = {
        name: 'NSE Corporate Scraper',
        status: ok ? (latencyMs < 1500 ? 'healthy' : 'degraded') : (nseResp.status === 403 ? 'blocked' : 'down'),
        statusCode: nseResp.status,
        latencyMs,
        details: {
          endpoint: 'www.nseindia.com',
        },
      };
    } catch (err) {
      checks.nse = {
        name: 'NSE Corporate Scraper',
        status: 'down',
        error: err.message,
      };
    }

    // 6. AI Engine (Gemini & Groq)
    try {
      const { getRouterStatus } = require('../lib/providers/providerRouter');
      const aiStatus = getRouterStatus();
      const hasAny = aiStatus.hasGemini || aiStatus.hasGroq;
      checks.ai = {
        name: 'AI Summarizer Engine',
        status: !hasAny ? 'disabled' : (aiStatus.geminiCooldownActive ? 'degraded' : 'healthy'),
        details: {
          geminiConfigured: aiStatus.hasGemini,
          groqConfigured: aiStatus.hasGroq,
          geminiCooldownActive: aiStatus.geminiCooldownActive,
          geminiCooldownRemainingSec: Math.round(aiStatus.geminiCooldownRemainingMs / 1000),
          lastProviderUsed: aiStatus.lastProviderUsed || 'gemini',
        },
      };
    } catch (err) {
      checks.ai = {
        name: 'AI Summarizer Engine',
        status: 'down',
        error: err.message,
      };
    }

    // 7. Telegram Bot
    try {
      const { isConfigured } = require('../lib/telegramNotifier');
      const configured = isConfigured();
      checks.telegram = {
        name: 'Telegram Notifier Bot',
        status: configured ? 'healthy' : 'disabled',
        details: {
          configured,
          hasBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
          hasChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
        },
      };
    } catch (err) {
      checks.telegram = {
        name: 'Telegram Notifier Bot',
        status: 'down',
        error: err.message,
      };
    }

    // 8. IPO Registrars (KFintech, Link Intime MUFG, BigShare)
    try {
      const [linkCheck, kfinCheck, bigshareCheck] = await Promise.allSettled([
        axios.get('https://in.mpms.mufg.com/Initial_Public_Offer/IPO.aspx', { timeout: 3500, validateStatus: () => true }),
        axios.get('https://ipostatus.kfintech.com/', { timeout: 3500, validateStatus: () => true }),
        axios.get('https://ipo.bigshareonline.com/ipo_status.html', { timeout: 3500, validateStatus: () => true }),
      ]);
      const linkOk = linkCheck.status === 'fulfilled' && linkCheck.value.status < 500;
      const kfinOk = kfinCheck.status === 'fulfilled' && kfinCheck.value.status < 500;
      const bigOk = bigshareCheck.status === 'fulfilled' && bigshareCheck.value.status < 500;
      checks.registrars = {
        name: 'IPO Registrar Portals',
        status: linkOk && kfinOk && bigOk ? 'healthy' : (linkOk || kfinOk || bigOk ? 'degraded' : 'down'),
        details: {
          linkIntime: linkOk ? 'operational' : 'offline',
          kfintech: kfinOk ? 'operational' : 'offline',
          bigshare: bigOk ? 'operational' : 'offline',
        },
      };
    } catch (err) {
      checks.registrars = {
        name: 'IPO Registrar Portals',
        status: 'down',
        error: err.message,
      };
    }

    // 9. Cadence & Market Window
    try {
      const { getMarketCadence, getISTDateTime } = require('../lib/time/istTime');
      const cadence = getMarketCadence();
      const istNow = getISTDateTime();
      const metaSnap = await db.collection('system_meta').doc('cron_status').get().catch(() => null);
      const metaData = metaSnap?.exists ? metaSnap.data() : {};

      checks.cadence = {
        name: 'Market Cadence & Cron',
        status: 'healthy',
        details: {
          window: cadence.window,
          description: cadence.description,
          minIntervalMinutes: cadence.minIntervalMinutes,
          currentTimeIST: `${istNow.dateIST} ${String(istNow.istHour).padStart(2, '0')}:${String(istNow.istMinute).padStart(2, '0')} IST`,
          lastWipeDate: metaData.lastWipeDate || 'None',
          lastRunAt: metaData.lastRunAt || 'None',
        },
      };
    } catch (err) {
      checks.cadence = {
        name: 'Market Cadence & Cron',
        status: 'degraded',
        error: err.message,
      };
    }

    // 10. Server Runtime
    const mem = process.memoryUsage();
    checks.runtime = {
      name: 'Node.js Runtime & Memory',
      status: 'healthy',
      details: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        env: process.env.NODE_ENV || 'production',
      },
    };

    // 11. Hybrid Multi-Host Architecture Topology
    const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
    const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
    const workerActive = !isVercel && (process.env.ENABLE_BACKGROUND_WORKER === 'true' || process.env.RUN_CRON_WORKER === 'true');

    checks.hybridTopology = {
      name: 'Hybrid Architecture (Vercel + Render)',
      status: 'healthy',
      details: {
        currentHost: isVercel ? 'Vercel Serverless' : (isRender ? 'Render Cloud' : 'Standalone / Local'),
        statelessApiTarget: 'Vercel Edge Network (100 GB Bandwidth & Sub-second Response)',
        autonomousWorkerTarget: 'Render Background Worker (24/7 Scraping & Push Notification Engine)',
        workerActiveOnThisHost: workerActive,
        architecture: 'Hybrid High-Concurrency Serverless API + Dedicated 24/7 Worker',
      },
    };

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      services: checks,
    });
  });

  // ── POST /api/admin/system/test-service/:serviceName ───────────────────────
  // Run an isolated live ping test on a specific service
  router.post('/system/test-service/:serviceName', verifyToken, requireAdmin('read'), async (req, res) => {
    const { serviceName } = req.params;
    const start = Date.now();

    try {
      if (serviceName === 'bse') {
        const resp = await axios.get('https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strType=C&strSearch=P', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
            'Referer': 'https://www.bseindia.com/',
            'Origin': 'https://www.bseindia.com',
            'Accept': 'application/json, text/plain, */*',
          },
          timeout: 6000,
          validateStatus: () => true,
        });
        const latencyMs = Date.now() - start;
        return res.json({
          success: resp.status >= 200 && resp.status < 400,
          service: 'BSE API',
          statusCode: resp.status,
          latencyMs,
          sample: Array.isArray(resp.data) ? `Received ${resp.data.length} categories` : 'OK response',
        });
      }

      if (serviceName === 'nse') {
        const resp = await axios.get('https://www.nseindia.com/api/allIndices', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
            'Referer': 'https://www.nseindia.com/',
            'Accept': '*/*',
          },
          timeout: 6000,
          validateStatus: () => true,
        });
        const latencyMs = Date.now() - start;
        return res.json({
          success: resp.status >= 200 && resp.status < 400,
          service: 'NSE API',
          statusCode: resp.status,
          latencyMs,
          sample: resp.data?.data ? `Received ${resp.data.data.length} indices` : 'Connected',
        });
      }

      if (serviceName === 'mongo') {
        const mongoDb = await getDb();
        const r = await mongoDb.command({ ping: 1 });
        return res.json({
          success: true,
          service: 'MongoDB Atlas',
          latencyMs: Date.now() - start,
          result: r,
        });
      }

      if (serviceName === 'redis') {
        const { UPSTASH_ENABLED, redis, getCircuitStatus } = require('../lib/redis/redisClient');
        if (!UPSTASH_ENABLED || !redis) {
          return res.json({ success: false, service: 'Redis', message: 'Redis is not configured in environment' });
        }
        const pong = await redis.ping();
        const circuit = typeof getCircuitStatus === 'function' ? getCircuitStatus() : {};
        return res.json({
          success: true,
          service: 'Upstash Redis',
          latencyMs: Date.now() - start,
          result: pong,
          circuit,
        });
      }

      if (serviceName === 'ai') {
        const { routeRequest } = require('../lib/providers/providerRouter');
        const r = await routeRequest('Respond in JSON format with {"status": "ok", "message": "ping successful"}.', null, { maxTokens: 40 });
        return res.json({
          success: Boolean(r?.success),
          service: 'AI Provider Engine',
          provider: r?.provider || 'none',
          model: r?.model || 'none',
          latencyMs: Date.now() - start,
          response: r?.text || r?.error,
        });
      }

      if (serviceName === 'telegram') {
        const { sendTelegramTest, isConfigured } = require('../lib/telegramNotifier');
        if (!isConfigured()) {
          return res.status(400).json({ success: false, error: 'Telegram bot token or chat ID is not configured' });
        }
        const r = await sendTelegramTest();
        return res.json({
          success: Boolean(r?.sent),
          service: 'Telegram Bot',
          latencyMs: Date.now() - start,
          result: r,
        });
      }

      return res.status(400).json({ success: false, error: `Unknown service: ${serviceName}` });
    } catch (err) {
      res.status(500).json({
        success: false,
        service: serviceName,
        latencyMs: Date.now() - start,
        error: err.message,
      });
    }
  });

  // ── POST /api/admin/system/trigger-cron ────────────────────────────────────
  // Execute the full market announcement and notification pipeline
  router.post('/system/trigger-cron', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { runGlobalCronTick } = require('../services/cronService');
      const stats = await runGlobalCronTick();

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: 'TRIGGER_CRON_PIPELINE',
        targetUid: 'system',
        payload: stats || {},
      });

      res.json({ success: true, message: 'Global cron pipeline executed', stats });
    } catch (err) {
      console.error('[Admin] /system/trigger-cron error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/admin/system/trigger-wipe ────────────────────────────────────
  // Execute midnight wipe cleanup manually on demand
  router.post('/system/trigger-wipe', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const mongoDb = await getDb();
      const [annDel, locksDel] = await Promise.all([
        mongoDb.collection('announcements').deleteMany({}),
        mongoDb.collection('alert_dedup_locks').deleteMany({}),
      ]);

      const IST_OFFSET = 5.5 * 60 * 60 * 1000;
      const nowIST = new Date(Date.now() + IST_OFFSET);
      const todayDateStr = nowIST.toISOString().split('T')[0];

      await db.collection('system_meta').doc('cron_status').set({
        lastWipeDate: todayDateStr,
        lastManualWipeAt: admin.firestore.FieldValue.serverTimestamp(),
        wipedBy: req.uid,
      }, { merge: true });

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: 'MANUAL_MIDNIGHT_WIPE',
        targetUid: 'system',
        payload: {
          announcementsDeleted: annDel.deletedCount,
          locksDeleted: locksDel.deletedCount,
        },
      });

      res.json({
        success: true,
        message: 'Daily transient collections purged and reset',
        announcementsDeleted: annDel.deletedCount,
        locksDeleted: locksDel.deletedCount,
      });
    } catch (err) {
      console.error('[Admin] /system/trigger-wipe error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/admin/system/flush-cache ─────────────────────────────────────
  // Flush Redis rate-limit, live rates, and admin entitlement caches
  router.post('/system/flush-cache', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { UPSTASH_ENABLED, redis } = require('../lib/redis/redisClient');
      let flushedKeys = 0;

      if (UPSTASH_ENABLED && redis) {
        const patterns = ['ratelimit:*', 'rates:*', 'admin:entitlement:*'];
        for (const pattern of patterns) {
          try {
            const keys = await redis.keys(pattern);
            if (keys && keys.length) {
              await Promise.all(keys.map(k => redis.del(k)));
              flushedKeys += keys.length;
            }
          } catch (e) {
            console.warn(`[Admin] Cache flush pattern warning for ${pattern}:`, e.message);
          }
        }
      }

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: 'FLUSH_SYSTEM_CACHE',
        targetUid: 'system',
        payload: { flushedKeys },
      });

      res.json({
        success: true,
        message: `Cache flushed successfully (${flushedKeys} keys removed)`,
        flushedKeys,
      });
    } catch (err) {
      console.error('[Admin] /system/flush-cache error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/admin/system/broadcast ───────────────────────────────────────
  // Fetch current system announcement banner state
  router.get('/system/broadcast', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const docSnap = await db.collection('system_meta').doc('broadcast').get();
      res.json({ success: true, broadcast: docSnap.exists ? docSnap.data() : { active: false, message: '', severity: 'info' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/admin/system/broadcast ──────────────────────────────────────
  // Publish or deactivate a global banner broadcast across all client sessions
  // AND dispatch instant Web Push notifications to all registered devices!
  router.post('/system/broadcast', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { active = false, message = '', severity = 'info', title = '', dismissible = true, sendPush = true } = req.body;
      const broadcastData = {
        active: Boolean(active),
        message: String(message).trim(),
        title: String(title).trim(),
        severity: ['info', 'warning', 'urgent', 'success'].includes(severity) ? severity : 'info',
        dismissible: Boolean(dismissible),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.uid,
      };

      await db.collection('system_meta').doc('broadcast').set(broadcastData, { merge: true });

      let pushStats = null;
      if (broadcastData.active && sendPush !== false) {
        try {
          pushStats = await broadcastWebPushToAll({
            title: broadcastData.title ? `${broadcastData.title}` : 'StockWatch Global Announcement',
            body: broadcastData.message || 'New announcement published by administrator',
            url: 'https://tatvarthstockwatch.web.app',
            severity: broadcastData.severity,
            tag: `broadcast-${Date.now()}`,
          });
        } catch (pushErr) {
          console.error('[Admin] Broadcast push error:', pushErr.message);
          pushStats = { error: pushErr.message, sent: 0, totalDevices: 0 };
        }
      }

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: active ? 'PUBLISH_SYSTEM_BROADCAST' : 'CLEAR_SYSTEM_BROADCAST',
        targetUid: 'system',
        payload: { ...broadcastData, pushStats },
      });

      res.json({ success: true, broadcast: broadcastData, pushStats });
    } catch (err) {
      console.error('[Admin] /system/broadcast error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // ── GET /api/admin/watchlists/search ──────────────────────────────────────
  // Cross-user watchlist reverse search: find which users are tracking a stock
  router.get('/watchlists/search', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const { q = '' } = req.query;
      if (!q.trim()) {
        return res.json({ success: true, results: [], count: 0, distinctUsers: 0 });
      }

      const mongoDb = await getDb();
      const queryStr = q.trim();
      const regex = new RegExp(queryStr, 'i');

      const matches = await mongoDb.collection('watchlists')
        .find({
          $or: [
            { scriptName: regex },
            { ltdCode: queryStr },
            { bseCode: queryStr },
            { nseSymbol: regex },
          ]
        })
        .limit(100)
        .toArray();

      const userUids = [...new Set(matches.map(m => m.userId).filter(Boolean))];
      const userMap = {};

      await Promise.all(userUids.map(async (uid) => {
        try {
          const authUser = await admin.auth().getUser(uid);
          userMap[uid] = { email: authUser.email, displayName: authUser.displayName };
        } catch {}
      }));

      const results = matches.map(m => ({
        id: String(m._id),
        userId: m.userId,
        userEmail: userMap[m.userId]?.email || 'Unknown',
        userDisplayName: userMap[m.userId]?.displayName || 'User',
        scriptName: m.scriptName,
        ltdCode: m.ltdCode || m.bseCode,
        exchange: m.exchange || 'BSE',
        addedAt: m.addedAt,
      }));

      res.json({
        success: true,
        count: results.length,
        distinctUsers: userUids.length,
        results,
      });
    } catch (err) {
      console.error('[Admin] /watchlists/search error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/admin/system/test-push ─────────────────────────────────────
  // Dispatches a live test web push notification to all push devices of the requesting admin
  router.post('/system/test-push', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { sendWebPushToUser, initWebPush } = require('../lib/webPushNotifier');
      const vapidConfigured = initWebPush();
      if (!vapidConfigured) {
        return res.status(400).json({
          success: false,
          error: 'VAPID keys not configured in environment variables (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
        });
      }

      const result = await sendWebPushToUser(req.uid, {
        title: 'StockWatch Admin Diagnostic',
        body: `Live push notification verification dispatched at ${new Date().toLocaleTimeString('en-IN')}`,
        url: '/admin',
        tag: `admin-diagnostic-${Date.now()}`,
      });

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: 'SYSTEM_PUSH_TEST',
        targetUid: req.uid,
        payload: { result },
      });


      return res.json({
        success: true,
        message: `Dispatched test push to ${result.totalDevices || 0} device(s). Sent: ${result.sent || 0}, Expired: ${result.expired || 0}`,
        result,
      });
    } catch (err) {
      console.error('[Admin] /system/test-push error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/admin/system/export-backup ───────────────────────────────────
  // Creates a structured JSON snapshot backup of all users and their watchlists
  router.get('/system/export-backup', verifyToken, requireAdmin('read'), async (req, res) => {
    try {
      const usersSnap = await db.collection('users').get();
      const backupUsers = [];

      for (const doc of usersSnap.docs) {
        const data = doc.data();
        let watchlist = [];
        let deviceCount = 0;

        try {
          const wlSnap = await doc.ref.collection('watchlist').get();
          watchlist = wlSnap.docs.map(w => {
            const wData = w.data();
            let addedAtIso = null;
            if (wData.addedAt) {
              if (typeof wData.addedAt.toDate === 'function') {
                addedAtIso = wData.addedAt.toDate().toISOString();
              } else if (wData.addedAt instanceof Date) {
                addedAtIso = wData.addedAt.toISOString();
              } else {
                addedAtIso = String(wData.addedAt);
              }
            }
            return {
              id: w.id,
              scriptName: wData.scriptName || wData.companyName || '',
              ltdCode: wData.ltdCode || wData.bseCode || '',
              bseCode: wData.bseCode || '',
              nseSymbol: wData.nseSymbol || '',
              exchange: wData.exchange || 'BSE',
              addedAt: addedAtIso,
            };
          });
          const devSnap = await doc.ref.collection('pushDevices').get();
          deviceCount = devSnap.size;
        } catch (subErr) {
          console.warn(`[Admin] Backup subcollection read warning for ${doc.id}:`, subErr.message);
        }

        let createdAtIso = null;
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            createdAtIso = data.createdAt.toDate().toISOString();
          } else if (data.createdAt instanceof Date) {
            createdAtIso = data.createdAt.toISOString();
          } else {
            createdAtIso = String(data.createdAt);
          }
        }

        backupUsers.push({
          uid: doc.id,
          email: data.email || null,
          displayName: data.displayName || null,
          role: data.role || 'user',
          entitlements: data.entitlements || { read: false, write: false },
          disabled: Boolean(data.disabled),
          prefs: data.prefs || {},
          createdAt: createdAtIso,
          watchlistCount: watchlist.length,
          watchlist,
          deviceCount,
        });
      }

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: 'SYSTEM_BACKUP_EXPORT',
        targetUid: 'system',
        payload: { userCount: backupUsers.length },
      });


      res.json({
        success: true,
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: req.uid,
        totalUsers: backupUsers.length,
        users: backupUsers,
      });
    } catch (err) {
      console.error('[Admin] /system/export-backup error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── POST /api/admin/ipo/trigger-auto-check ─────────────────────────────────
  router.post('/ipo/trigger-auto-check', verifyToken, requireAdmin('write'), async (req, res) => {
    try {
      const { symbol, registrar, ipoName, force } = req.body || {};
      if (!symbol) {
        return res.status(400).json({ success: false, error: 'symbol is required' });
      }

      const { triggerAutoAllotmentCheck } = require('../lib/ipoAutoVerificationService');
      const result = await triggerAutoAllotmentCheck({
        symbol,
        registrar: registrar || 'KFINTECH',
        ipoName: ipoName || symbol,
        force: Boolean(force),
      });

      await writeAuditLog({
        actorUid: req.uid,
        actorEmail: req.user?.email,
        action: 'IPO_AUTO_CHECK_TRIGGERED',
        targetUid: 'system',
        payload: { symbol, registrar, ipoName, result },
      });

      res.json({ success: true, result });
    } catch (err) {
      console.error('[Admin] trigger-auto-check error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
