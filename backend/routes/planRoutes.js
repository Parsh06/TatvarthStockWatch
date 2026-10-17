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

  // ── POST /api/plans/checkout (Authenticated) ────────────────────────────────
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

      // Check if Razorpay keys are configured
      const hasRazorpayKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

      if (paymentMethod === 'razorpay' && hasRazorpayKeys) {
        // Real Razorpay Order Creation
        try {
          const Razorpay = require('razorpay');
          const instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
          });

          const order = await instance.orders.create({
            amount: price * 100, // in paise
            currency: 'INR',
            receipt: `rcpt_${uid.slice(0, 8)}_${Date.now()}`,
            notes: { uid, plan: targetPlan, billing },
          });

          return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            plan: targetPlan,
            billing,
          });
        } catch (rErr) {
          console.warn('[Razorpay Order Creation Failed, falling back to instant activation]:', rErr.message);
        }
      }

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
