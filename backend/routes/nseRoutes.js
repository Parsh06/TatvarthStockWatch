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

  // ── PROTECTED: NSE Bulk/Block/Short Deals ─────────────────────────────────
  router.get('/deals', verifyToken, async (req, res) => {
    const { from, to, dealType } = req.query; // dealType: bulk_deals, block_deals, short_deals
    try {
      const d = new Date();
      const todayStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      
      let response;
      if (from === todayStr && to === todayStr) {
        // Fetch from live snapshot for today's data
        response = await axios.get(
          `https://www.nseindia.com/api/snapshot-capital-market-largedeal`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
            },
            timeout: 30000
          }
        );
        
        let rawArray = [];
        if (dealType === 'bulk_deals') rawArray = response.data.BULK_DEALS_DATA || [];
        else if (dealType === 'block_deals') rawArray = response.data.BLOCK_DEALS_DATA || [];
        else if (dealType === 'short_deals') rawArray = response.data.SHORT_DEALS_DATA || [];
        
        const mappedData = rawArray.map(item => ({
          BD_BUY_SELL: item.buySell,
          BD_CLIENT_NAME: item.clientName,
          BD_DT_DATE: item.date,
          BD_SCRIP_NAME: item.name,
          BD_QTY_TRD: item.qty,
          BD_REMARKS: item.remarks,
          BD_SYMBOL: item.symbol,
          BD_TP_WATP: item.watp
        }));
        
        return res.json({ data: mappedData });
      }

      // Historical data fallback
      response = await axios.get(
        `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=${dealType}&from=${from}&to=${to}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
          },
          timeout: 30000
        }
      );
      // The API returns a 'data' array with deals
      res.json(response.data);
    } catch (e) {
      console.error('[NSE Deals]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
