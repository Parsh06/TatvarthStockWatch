'use strict';

/**
 * planRoutes.js
 *
 * Monetization & Subscription Endpoints:
 * 1. GET /api/plans - Public plan tiers, features & pricing catalog
 * 2. POST /api/plans/checkout - Process subscription purchase (Razorpay order / mock / UPI)
 * 3. POST /api/plans/verify-payment - Validate payment signature and activate plan
 */

const express = require('express');
const { db, admin } = require('../lib/firebaseAdmin');
const { PLAN_LIMITS } = require('../lib/planLimits');

module.exports = function (verifyToken) {
  const router = express.Router();

  // ── GET /api/plans (Public) ─────────────────────────────────────────────────
  router.get('/', (req, res) => {
    res.json({
      success: true,
      plans: [
        {
          id: 'basic',
          name: 'Basic (Free)',
          tagline: 'Essential monitoring for active retail investors',
          priceMonthly: 0,
          priceAnnual: 0,
          limits: PLAN_LIMITS.basic,
          features: [
            'Up to 5 Watchlist Scrips',
            '3 Daily Gemini AI PDF Analyses',
            '1 Family PAN Allotment Tracking',
            'Real-Time BSE & NSE Filings',
            'Standard Web Push Notifications',
            'Community Support',
          ],
          popular: false,
        },
        {
          id: 'pro',
          name: 'Pro Trader',
          tagline: 'High-speed institutional research & automated alerts',
          priceMonthly: 999,
          priceAnnual: 8999,
          limits: PLAN_LIMITS.pro,
          features: [
            'Up to 50 Watchlist Scrips',
            'Unlimited Gemini AI PDF Vision Analysis',
            '10 Family PANs with Automated Allotment Radar',
            'CSV & Excel Spreadsheet Data Export',
            'Up to 5 Curated Shareable Baskets',
            'High-Priority Instant Push Notifications',
            'Priority Email & Telegram Support',
          ],
          popular: true,
        },
        {
          id: 'premium',
          name: 'Premium HNI',
          tagline: 'Maximum power for Family Offices & institutional investors',
          priceMonthly: 1999,
          priceAnnual: 17999,
          limits: PLAN_LIMITS.premium,
          features: [
            'Unlimited Watchlist Scrips (Zero Caps)',
            'Unlimited Priority Gemini AI Vision & Research Briefs',
            'Unlimited Family PANs (Multi-Registrar)',
            'Instant Automated Allotment Radar Across All IPOs',
            'Unlimited Curated Shareable Baskets',
            'CSV & Excel Data Export',
            '1-on-1 VIP WhatsApp Concierge Support',
          ],
          popular: false,
        },
      ],
      razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    });
  });

  // ── POST /api/plans/create-order (Razorpay Order Generation) ───────────────
  router.post('/create-order', verifyToken, async (req, res) => {
    try {
      const { plan: targetPlan, billing = 'monthly' } = req.body;
      if (!['pro', 'premium'].includes(targetPlan)) {
        return res.status(400).json({ success: false, error: 'Invalid plan selected' });
      }

      const hasRazorpayKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
      if (!hasRazorpayKeys) {
        return res.status(503).json({
          success: false,
          gatewayDown: true,
          error: 'Razorpay is down for now',
          message: 'Razorpay payment gateway is currently unavailable. Please use UPI direct transfer or try again later.',
        });
      }

      const axios = require('axios');
      const price = billing === 'annual'
        ? PLAN_LIMITS[targetPlan].priceAnnual
        : PLAN_LIMITS[targetPlan].priceMonthly;

      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const orderRes = await axios.post('https://api.razorpay.com/v1/orders', {
        amount: Math.round(price * 100),
        currency: 'INR',
        receipt: `rcpt_${req.uid.slice(0, 8)}_${Date.now()}`,
        notes: { uid: req.uid, plan: targetPlan, billing },
      }, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return res.json({
        success: true,
        orderId: orderRes.data.id,
        amount: orderRes.data.amount,
        currency: orderRes.data.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        plan: targetPlan,
        billing,
      });
    } catch (err) {
      console.warn('[Razorpay Create Order Failed]:', err.response?.data || err.message);
      return res.status(502).json({
        success: false,
        gatewayDown: true,
        error: 'Razorpay is down for now',
        message: 'Could not connect to Razorpay. Gateway appears down or unconfigured. Please use UPI transfer.',
      });
    }
  });

  // ── POST /api/plans/verify-payment (Razorpay Signature Validation) ───────────
  router.post('/verify-payment', verifyToken, async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        plan: targetPlan,
        billing = 'monthly',
      } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, error: 'Missing payment signature parameters' });
      }
      if (!['pro', 'premium'].includes(targetPlan)) {
        return res.status(400).json({ success: false, error: 'Invalid plan selected' });
      }

      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!secret) {
        return res.status(500).json({ success: false, error: 'Payment gateway configuration missing' });
      }

      const crypto = require('crypto');
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, error: 'Payment signature verification failed' });
      }

      const uid = req.uid;
      const durationMonths = billing === 'annual' ? 12 : 1;
      const price = billing === 'annual'
        ? PLAN_LIMITS[targetPlan].priceAnnual
        : PLAN_LIMITS[targetPlan].priceMonthly;

      const now = new Date();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

      const userRef = db.collection('users').doc(uid);
      const updateData = {
        plan: targetPlan,
        planStatus: 'active',
        planStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        planBilling: billing,
        planAmountPaid: price,
        planPaymentMethod: 'razorpay',
        planPaymentRef: razorpay_payment_id,
        planHistory: admin.firestore.FieldValue.arrayUnion({
          plan: targetPlan,
          action: 'RAZORPAY_ACTIVATION',
          billing,
          amount: price,
          paymentMethod: 'razorpay',
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          timestamp: now.toISOString(),
          durationMonths,
        }),
      };

      await userRef.set(updateData, { merge: true });

      try {
        const { invalidateEntitlementCache } = require('../middleware/requireAdmin');
        if (invalidateEntitlementCache) await invalidateEntitlementCache(uid);
      } catch {}

      return res.json({
        success: true,
        activated: true,
        plan: targetPlan,
        planStatus: 'active',
        planExpiresAt: expiresAt.toISOString(),
        message: `Congratulations! Your ${targetPlan.toUpperCase()} membership is active.`,
      });
    } catch (err) {
      console.error('[Razorpay Verify Error]', err);
      return res.status(500).json({ success: false, error: err.message || 'Payment verification failed' });
    }
  });

  // ── POST /api/plans/checkout (UPI & Fallback Direct Activation) ─────────────
  router.post('/checkout', verifyToken, async (req, res) => {
    try {
      const { validatePlanCheckout } = require('../utils/validators');
      const validation = validatePlanCheckout(req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.errors[0] || 'Invalid checkout payload',
          errors: validation.errors,
        });
      }

      const { plan: targetPlan, billing, paymentMethod, paymentRef } = validation.data;

      const uid = req.uid;
      const durationMonths = billing === 'annual' ? 12 : 1;
      const price = billing === 'annual'
        ? PLAN_LIMITS[targetPlan].priceAnnual
        : PLAN_LIMITS[targetPlan].priceMonthly;

      // Instant Activation (Sandbox / Mock / UPI Gateway hook)
      const now = new Date();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

      const userRef = db.collection('users').doc(uid);
      const updateData = {
        plan: targetPlan,
        planStatus: 'active',
        planStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        planExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        planBilling: billing,
        planAmountPaid: price,
        planPaymentMethod: paymentMethod,
        planPaymentRef: paymentRef || `TSW-${Date.now().toString().slice(-6)}`,
        planHistory: admin.firestore.FieldValue.arrayUnion({
          plan: targetPlan,
          action: 'CHECKOUT_ACTIVATION',
          billing,
          amount: price,
          paymentMethod,
          paymentRef: paymentRef || `TSW-${Date.now().toString().slice(-6)}`,
          timestamp: now.toISOString(),
          durationMonths,
        }),
      };

      await userRef.set(updateData, { merge: true });

      // Invalidate Redis entitlement cache if available
      try {
        const { invalidateEntitlementCache } = require('../middleware/requireAdmin');
        if (invalidateEntitlementCache) await invalidateEntitlementCache(uid);
      } catch {}

      return res.json({
        success: true,
        activated: true,
        plan: targetPlan,
        planStatus: 'active',
        planExpiresAt: expiresAt.toISOString(),
        message: `Congratulations! Your ${targetPlan.toUpperCase()} plan is now active. All features have been unlocked.`,
      });
    } catch (err) {
      console.error('[Plan Checkout Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Checkout failed' });
    }
  });

  return router;
};
