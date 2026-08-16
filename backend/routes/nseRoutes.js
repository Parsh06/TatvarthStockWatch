const express = require('express');
const axios = require('axios');
const { getNseGainersLosers } = require('../services/nseService');

module.exports = function (verifyToken) {
  const router = express.Router();

  // ── PROTECTED: NSE Top Gainers & Losers CSV Download (Cached & Fast) ──────
  router.get('/top-gainers-losers-download', verifyToken, async (req, res) => {
    try {
      const { type = 'gainer', index = 'allSec' } = req.query;

      // Validate inputs
      const validTypes = ['gainer', 'loser'];
      const validIndices = ['allSec', 'NIFTY', 'BANKNIFTY', 'NIFTYNEXT50', 'SecGtr20', 'SecLwr20', 'FOSec'];

      if (!validTypes.includes(type) || (index && !validIndices.includes(index))) {
        return res.status(400).json({ error: 'Invalid type or index parameter provided.' });
      }

      const result = await getNseGainersLosers(type, index);
      const isLoser = type === 'loser';
      const outFilename = `Tatvarth_NSE_TOP_${isLoser ? 'Losers' : 'Gainers'}_${index}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
      return res.send(result.csv);
    } catch (e) {
      console.error('[NSE CSV Download Route Error]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── PROTECTED: NSE Top Gainers/Losers JSON API (Normalized & Cached) ───────
  router.get('/gainers-losers', verifyToken, async (req, res) => {
    try {
      const { type, index, category } = req.query;

      let reqType = type || (index === 'loosers' ? 'loser' : 'gainer');
      let reqIndex = category || index || 'allSec';

      if (reqIndex === 'gainers' || reqIndex === 'loosers') {
        reqIndex = category || 'allSec';
      }

      const result = await getNseGainersLosers(reqType, reqIndex);
      return res.json(result);
    } catch (e) {
      console.error('[NSE Gainers/Losers Route Error]', e.message);
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
      if (from === to) {
        try {
          // Fetch cookies from homepage first to avoid 401/403/timeout
          const baseRes = await axios.get('https://www.nseindia.com', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive'
            },
            timeout: 15000
          });
          const cookies = baseRes.headers['set-cookie'] ? baseRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';

          // Fetch live snapshot
          const snapRes = await axios.get(
            `https://www.nseindia.com/api/snapshot-capital-market-largedeal`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cookie': cookies
              },
              timeout: 30000
            }
          );
          
          const snapDate = snapRes.data.as_on_date; // e.g., "31-Jul-2026"
          const monthMap = { 'Jan':'01', 'Feb':'02', 'Mar':'03', 'Apr':'04', 'May':'05', 'Jun':'06', 'Jul':'07', 'Aug':'08', 'Sep':'09', 'Oct':'10', 'Nov':'11', 'Dec':'12' };
          const parts = snapDate.split('-');
          const snapDateFormatted = parts.length === 3 ? `${parts[0].padStart(2, '0')}-${monthMap[parts[1]]}-${parts[2]}` : '';

          // Use snapshot if it matches the requested date or if user requested literally today
          if (snapDateFormatted === from || from === todayStr) {
            let rawArray = [];
            if (dealType === 'bulk_deals') rawArray = snapRes.data.BULK_DEALS_DATA || [];
            else if (dealType === 'block_deals') rawArray = snapRes.data.BLOCK_DEALS_DATA || [];
            else if (dealType === 'short_deals') rawArray = snapRes.data.SHORT_DEALS_DATA || [];
            
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
        } catch (err) {
          console.error('[NSE Snapshot fallback failed]', err.message);
          // Ignore snapshot failure, fallback to historical
        }
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
