'use strict';

/**
 * analyzeRoute.js
 *
 * POST /api/announcements/:id/analyze
 *
 * Lazy, on-demand AI analysis for a single announcement.
 *
 * Flow:
 *   1. Verify auth token (verifyToken middleware applied by caller)
 *   2. Find announcement by _id in MongoDB
 *   3. If aiAnalysis.generated === true AND ?force !== 'true' → return cached
 *   4. Download PDF → generateAIAnalysis(ann)
 *   5. On success → $set aiAnalysis → return analysis
 *   6. On error → return structured error without storing anything
 *
 * MongoDB shape written:
 *   {
 *     aiAnalysis: {
 *       generated: true,
 *       generatedAt: ISO string,
 *       model: 'gemini-2.0-flash-lite',
 *       version: '2',
 *       analysis: { ...prompt JSON fields... }
 *     }
 *   }
 */

const express = require('express');

module.exports = function createAnalyzeRouter(verifyToken) {
  const router = express.Router();

  /**
   * POST /api/announcements/:id/analyze
   *
   * Query params:
   *   force=true  — force regeneration even if analysis already exists
   */
  router.post('/:id/analyze', verifyToken, async (req, res) => {
    const announcementId = String(req.params.id || '').trim();
    const force = req.query.force === 'true';

    if (!announcementId) {
      return res.status(400).json({ error: 'Missing announcement ID' });
    }

    try {
      const { getDb } = require('../lib/mongoClient');
      const db = await getDb();
      const col = db.collection('announcements');

      // ── 1. Find the announcement ─────────────────────────────────────────────
      let ann = await col.findOne({ $or: [{ _id: announcementId }, { id: announcementId }] });
      if (!ann && req.body && (req.body.pdfUrl || req.body.subject || req.body.headline || req.body.scriptName)) {
        ann = {
          _id: announcementId,
          id: announcementId,
          ...req.body,
        };
      }

      if (!ann) {
        return res.status(404).json({ error: 'Announcement not found', id: announcementId });
      }

      // ── 2. Return cache if already generated and not forced ──────────────────
      if (ann.aiAnalysis?.generated === true && !force) {
        console.log(`[Analyze] Cache hit for ${announcementId} (${ann.scriptName || ann.scriptCode || ''})`);
        return res.json({
          cached: true,
          generatedAt: ann.aiAnalysis.generatedAt,
          model: ann.aiAnalysis.model,
          analysis: ann.aiAnalysis.analysis,
        });
      }

      // ── 3. Generate analysis ─────────────────────────────────────────────────
      console.log(`[Analyze] Generating AI analysis for ${announcementId} (${ann.scriptName || ann.scriptCode || ''}) force=${force}`);

      const { generateAIAnalysis } = require('../lib/aiSummarizer');
      const result = await generateAIAnalysis(ann);

      if (!result) {
        console.error(`[Analyze] AI generation returned null for ${announcementId}`);
        return res.status(500).json({
          error: 'Analysis generation failed',
          retryable: true,
          message: 'The AI model could not process this filing. Please try again.',
        });
      }

      // ── 4. Persist to MongoDB ────────────────────────────────────────────────
      const aiAnalysis = {
        generated: true,
        generatedAt: new Date().toISOString(),
        model: result._model || 'gemini-2.0-flash',
        version: '2',
        analysis: result.analysis,
      };

      const updateData = { ...ann };
      delete updateData._id;
      updateData.aiAnalysis = aiAnalysis;
      updateData.updatedAt = new Date();

      await col.updateOne(
        { $or: [{ _id: announcementId }, { id: announcementId }] },
        { 
          $set: updateData,
          $setOnInsert: { _id: announcementId, id: announcementId }
        },
        { upsert: true }
      );

      console.log(`[Analyze] ✅ Stored AI analysis for ${announcementId}`);

      // ── 6. Return fresh result ───────────────────────────────────────────────
      return res.json({
        cached: false,
        generatedAt: aiAnalysis.generatedAt,
        model: aiAnalysis.model,
        analysis: aiAnalysis.analysis,
      });

    } catch (err) {
      console.error(`[Analyze] Unexpected error for ${announcementId}:`, err.message);
      return res.status(500).json({
        error: 'Internal server error',
        retryable: true,
        message: err.message,
      });
    }
  });

  return router;
};
