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
      const ann = await col.findOne({ _id: announcementId });
      if (!ann) {
        return res.status(404).json({ error: 'Announcement not found', id: announcementId });
      }

      // ── 2. Return cache if already generated and not forced ──────────────────
      if (ann.aiAnalysis?.generated === true && !force) {
        console.log(`[Analyze] Cache hit for ${announcementId} (${ann.scriptName})`);
        return res.json({
          cached: true,
          generatedAt: ann.aiAnalysis.generatedAt,
          model: ann.aiAnalysis.model,
          analysis: ann.aiAnalysis.analysis,
        });
      }

      // ── 3. Validate PDF presence ─────────────────────────────────────────────
      if (!ann.pdfUrl) {
        console.warn(`[Analyze] No PDF URL for ${announcementId}`);
        return res.status(422).json({
          error: 'PDF unavailable',
          code: 'NO_PDF',
          message: 'This announcement does not have a downloadable PDF.',
        });
      }

      // ── 4. Generate analysis ─────────────────────────────────────────────────
      console.log(`[Analyze] Generating AI analysis for ${announcementId} (${ann.scriptName}) force=${force}`);

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

      // ── 5. Persist to MongoDB ────────────────────────────────────────────────
      const aiAnalysis = {
        generated: true,
        generatedAt: new Date().toISOString(),
        model: result._model || 'gemini-3.1-flash-lite',
        version: '2',
        analysis: result.analysis,
      };

      await col.updateOne(
        { _id: announcementId },
        { $set: { aiAnalysis } }
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
