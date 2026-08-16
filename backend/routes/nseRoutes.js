const express = require('express');
const axios = require('axios');

module.exports = function (verifyToken) {
  const router = express.Router();

  // ── PROTECTED: NSE Top Gainers & Losers CSV Download (All Securities) ──────
  router.get('/top-gainers-losers-download', verifyToken, async (req, res) => {
    try {
      const { type, index } = req.query;
      
      // Determine index: GAINERS or LOSERS or ALL
      let targetIndex = 'GAINERS';
      if (index) {
        targetIndex = index.toUpperCase();
      } else if (type === 'loser') {
        targetIndex = 'LOSERS';
      }

      const outFilename = targetIndex === 'LOSERS' ? 'Tatvarth_NSE_TOPloosers.csv' : 'Tatvarth_NSE_TOPgainers.csv';

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        'Accept': 'text/csv,application/json,text/plain,*/*',
        'Referer': 'https://www.nseindia.com/',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      };

      // 1. Establish cookie session by visiting homepage
      let cookies = '';
      try {
        const baseRes = await axios.get('https://www.nseindia.com', {
          headers: {
            'User-Agent': headers['User-Agent'],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 15000
        });
        if (baseRes.headers['set-cookie']) {
          cookies = baseRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }
      } catch (cookieErr) {
        console.warn('[NSE CSV Download] Cookie fetch warning:', cookieErr.message);
      }

      const reqHeaders = { ...headers };
      if (cookies) reqHeaders['Cookie'] = cookies;

      // 2. Fetch CSV directly from NSE API for target index (GAINERS / LOSERS)
      try {
        const nseUrl = `https://www.nseindia.com/api/top-gainers-losers-download?index=${targetIndex}`;
        const response = await axios.get(
          nseUrl,
          {
            headers: reqHeaders,
            responseType: 'arraybuffer',
            timeout: 30000
          }
        );

        const contentType = response.headers['content-type'] || '';
        const dataLength = response.data?.length || 0;

        if (dataLength > 50 && (contentType.includes('csv') || contentType.includes('text') || contentType.includes('octet-stream') || response.status === 200)) {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
          return res.send(response.data);
        }
      } catch (directErr) {
        console.warn(`[NSE Direct CSV Download (${targetIndex}) Failed, trying JSON Fallback]`, directErr.message);
      }

      // 3. Fallback: Fetch Live Variations JSON & format into CSV
      const isLoser = targetIndex === 'LOSERS';
      const endpoints = isLoser
        ? ['https://www.nseindia.com/api/live-analysis-variations?index=loosers']
        : ['https://www.nseindia.com/api/live-analysis-variations?index=gainers'];

      const resList = await Promise.allSettled(
        endpoints.map(url => axios.get(url, { headers: reqHeaders, timeout: 15000 }))
      );

      const items = [];
      for (const res of resList) {
        if (res.status === 'fulfilled' && res.value?.data) {
          const d = res.value.data;
          const list = d.allSec?.data || d.NIFTY?.data || [];
          items.push(...list.map(i => ({ ...i, category: isLoser ? 'LOSER' : 'GAINER' })));
        }
      }

      if (items.length === 0) {
        return res.status(502).json({ error: `Could not fetch ${targetIndex} data from NSE` });
      }

      // Format clean CSV
      const csvHeaders = ['Type', 'Symbol', 'Series', 'Open Price', 'High Price', 'Low Price', 'LTP', 'Prev Close', 'Price Change', '% Change', 'Volume', 'Turnover (Lakhs)'];
      const csvRows = items.map(item => [
        item.category || '',
        `"${(item.symbol || '').replace(/"/g, '""')}"`,
        `"${(item.series || 'EQ').replace(/"/g, '""')}"`,
        item.open_price || item.openPrice || 0,
        item.high_price || item.highPrice || 0,
        item.low_price || item.lowPrice || 0,
        item.ltp || 0,
        item.prev_price || item.prevPrice || 0,
        item.net_price || item.netPrice || 0,
        item.perChange || item.perChangeRaw || 0,
        item.trade_quantity || item.tradeQuantity || 0,
        item.turnover_lakhs || item.turnoverInLakhs || 0
      ].join(','));

      const finalCsv = [csvHeaders.join(','), ...csvRows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
      return res.send(finalCsv);

    } catch (e) {
      console.error('[NSE CSV Download Error]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

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
