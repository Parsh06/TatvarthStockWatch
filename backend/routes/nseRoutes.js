const express = require('express');
const axios = require('axios');

module.exports = function (verifyToken) {
  const router = express.Router();

  // ── PROTECTED: NSE Top Gainers/Losers ───────────────────────────────────────
  router.get('/gainers-losers', verifyToken, async (req, res) => {
    const { index } = req.query; // gainers or loosers
    try {
      const response = await axios.get(
        `https://www.nseindia.com/api/live-analysis-variations?index=${index}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
          },
          timeout: 10000
        }
      );
      res.json(response.data);
    } catch (e) {
      console.error('[NSE Gainers/Losers]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
