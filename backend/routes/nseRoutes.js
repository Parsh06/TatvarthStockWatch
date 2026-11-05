const express = require('express');
const axios = require('axios');
const { getNseGainersLosers } = require('../services/nseService');
const { getNSECookies, getNSEHeaders } = require('../lib/nseScraper');

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
    const { from, to, dealType = 'bulk_deals' } = req.query; // dealType: bulk_deals, block_deals, short_deals
    try {
      const d = new Date();
      const todayStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      
      // 1. Snapshot Attempt (Fastest for single-day/today queries)
      if (from === to || from === todayStr) {
        try {
          const cookies = await getNSECookies();
          const dynamicHeaders = typeof getNSEHeaders === 'function' ? getNSEHeaders('api') : {};

          const snapRes = await axios.get(
            `https://www.nseindia.com/api/snapshot-capital-market-largedeal`,
            {
              headers: {
                ...dynamicHeaders,
                'Referer': 'https://www.nseindia.com/market-data/bulk-block-deals',
                'Cookie': cookies || ''
              },
              timeout: 15000,
              validateStatus: (s) => s === 200
            }
          );
          
          if (snapRes?.data) {
            let rawArray = [];
            if (dealType === 'bulk_deals') rawArray = snapRes.data.BULK_DEALS_DATA || [];
            else if (dealType === 'block_deals') rawArray = snapRes.data.BLOCK_DEALS_DATA || [];
            else if (dealType === 'short_deals') rawArray = snapRes.data.SHORT_DEALS_DATA || [];
            
            if (rawArray.length > 0) {
              const mappedData = rawArray.map(item => ({
                BD_BUY_SELL: item.buySell || 'BUY',
                BD_CLIENT_NAME: item.clientName || 'Market Participant',
                BD_DT_DATE: item.date || snapRes.data.as_on_date || todayStr,
                BD_SCRIP_NAME: item.name || item.symbol || 'Securities',
                BD_QTY_TRD: item.qty || '0',
                BD_REMARKS: item.remarks || '',
                BD_SYMBOL: item.symbol || '',
                BD_TP_WATP: item.watp || '0'
              }));
              
              return res.json({ data: mappedData });
            }
          }
        } catch (err) {
          console.warn('[NSE Snapshot warning]', err.message);
        }
      }

      // 2. Historical API Attempt (Authenticated with active browser cookies & headers)
      try {
        const cookies = await getNSECookies();
        const dynamicHeaders = typeof getNSEHeaders === 'function' ? getNSEHeaders('api') : {};

        const histRes = await axios.get(
          `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=${dealType}&from=${from}&to=${to}`,
          {
            headers: {
              ...dynamicHeaders,
              'Referer': 'https://www.nseindia.com/market-data/bulk-block-deals',
              'Cookie': cookies || '',
            },
            timeout: 15000,
            validateStatus: (s) => s === 200
          }
        );

        if (histRes.data && Array.isArray(histRes.data.data) && histRes.data.data.length > 0) {
          return res.json(histRes.data);
        }
      } catch (histErr) {
        console.warn('[NSE Historical Deals warning]', histErr.message);
      }

      // 3. Resilient Dual-Exchange Gateway Failover (Seamlessly maps BSE deals on cloud WAF challenge)
      console.log(`[NSE Deals] Direct NSE feed challenged or empty for ${from}..${to} — activating Dual-Exchange Gateway failover`);
      const fallbackDeals = await fetchDualExchangeDealsFallback(from, to, dealType);
      return res.json({ data: fallbackDeals, gateway: 'dual-exchange-gateway' });

    } catch (e) {
      console.error('[NSE Deals Route Exception]', e.message);
      // Fail-safe HTTP 200 return — never surface 500/403 errors to client
      return res.json({ data: [], error: e.message, gateway: 'fail-safe' });
    }
  });

  async function fetchDualExchangeDealsFallback(from, to, dealType) {
    try {
      const { bseGet, getBseCookies } = require('../lib/apiClients');
      const cookies = await getBseCookies();
      const sessionHdr = cookies ? { Cookie: cookies } : {};

      const fmt = (dStr) => {
        if (!dStr) return '';
        const p = dStr.split('-');
        return p.length === 3 ? `${p[0]}/${p[1]}/${p[2]}` : dStr;
      };

      const dt = dealType === 'block_deals' ? 2 : 1;
      const data = await bseGet(
        '/BulkDealData_ng/w',
        { DealType: dt, sc_code: '', FDate: fmt(from), TDate: fmt(to) },
        12000,
        sessionHdr
      ).catch(() => null);

      const items = (data && Array.isArray(data.Table)) ? data.Table : [];
      return items.map(i => ({
        BD_BUY_SELL: i.TRANSACTION_TYPE === 'P' || i.TRANSACTION_TYPE === 'B' ? 'BUY' : 'SELL',
        BD_CLIENT_NAME: (i.CLIENT_NAME || '').trim(),
        BD_DT_DATE: (i.DEAL_DATE || '').slice(0, 10),
        BD_SCRIP_NAME: (i.scripname || i.SCRIP_NAME || '').trim(),
        BD_QTY_TRD: i.QUANTITY != null ? String(i.QUANTITY) : '0',
        BD_REMARKS: dt === 2 ? 'Block Deal (Dual-Exchange Failover)' : 'Bulk Deal (Dual-Exchange Failover)',
        BD_SYMBOL: String(i.scripname || i.SCRIP_CODE || '').trim(),
        BD_TP_WATP: i.PRICE != null ? String(i.PRICE) : '0'
      }));
    } catch (err) {
      console.warn('[Dual-Exchange Deals Failover Error]', err.message);
      return [];
    }
  }

  return router;
};
