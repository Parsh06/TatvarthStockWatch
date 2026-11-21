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
  const NSE_DEALS_PROFILES = [
    {
      name: 'Chrome 131 Desktop',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/market-data/bulk-block-deals',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    },
    {
      name: 'Edge 131 Desktop',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/market-data/bulk-block-deals',
        'sec-ch-ua': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    },
  ];

  function toNSEDateFormat(dStr) {
    if (!dStr) return '';
    const s = String(dStr).trim();
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return s;
    }
    return s;
  }

  function getTodayISTStr() {
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', options).formatToParts(new Date()).map(p => [p.type, p.value]));
    return `${parts.day}-${parts.month}-${parts.year}`;
  }

  router.get('/deals', verifyToken, async (req, res) => {
    const { from, to, dealType = 'both' } = req.query; // dealType: both, bulk_deals, block_deals, short_deals
    try {
      const todayStr = getTodayISTStr();
      const fromNSE = toNSEDateFormat(from) || todayStr;
      const toNSE = toNSEDateFormat(to) || todayStr;
      const isSingleDay = fromNSE === toNSE;
      const profile = NSE_DEALS_PROFILES[0];

      // 1. Single-day / Today query -> Query Snapshot API first (contains latest verified session: bulk + block)
      if (isSingleDay) {
        try {
          const snapRes = await axios.get(
            'https://www.nseindia.com/api/snapshot-capital-market-largedeal',
            {
              headers: profile.headers,
              timeout: 6000,
              validateStatus: (s) => s === 200,
            }
          );

          if (snapRes?.data) {
            let rawArray = [];
            if (dealType === 'both') {
              const bulk = (snapRes.data.BULK_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Bulk' }));
              const block = (snapRes.data.BLOCK_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Block' }));
              rawArray = [...bulk, ...block];
            } else if (dealType === 'bulk_deals' || dealType === '1') {
              rawArray = (snapRes.data.BULK_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Bulk' }));
            } else if (dealType === 'block_deals' || dealType === '2') {
              rawArray = (snapRes.data.BLOCK_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Block' }));
            } else if (dealType === 'short_deals') {
              rawArray = (snapRes.data.SHORT_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Short' }));
            }

            if (rawArray.length > 0) {
              const mappedData = rawArray.map(item => ({
                BD_BUY_SELL: item.buySell || item.BD_BUY_SELL || 'BUY',
                BD_CLIENT_NAME: item.clientName || item.BD_CLIENT_NAME || 'Market Participant',
                BD_DT_DATE: item.date || item.BD_DT_DATE || snapRes.data.as_on_date || fromNSE,
                BD_SCRIP_NAME: item.name || item.BD_SCRIP_NAME || item.symbol || 'Securities',
                BD_QTY_TRD: item.qty != null ? String(item.qty) : (item.BD_QTY_TRD != null ? String(item.BD_QTY_TRD) : '0'),
                BD_REMARKS: item.remarks || item.BD_REMARKS || '',
                BD_SYMBOL: item.symbol || item.BD_SYMBOL || '',
                BD_TP_WATP: item.watp != null ? String(item.watp) : (item.BD_TP_WATP != null ? String(item.BD_TP_WATP) : '0'),
                dealType: item.dealType || 'Bulk',
              }));

              return res.json({
                data: mappedData,
                asOf: snapRes.data.as_on_date || fromNSE,
                source: 'nse-snapshot',
              });
            }
          }
        } catch (snapErr) {
          console.warn('[NSE Deals Snapshot Warning]', snapErr.message);
        }
      }

      // 2. Historical API Range Query (or single-day historical)
      try {
        let combinedItems = [];
        if (dealType === 'both') {
          const [bulkRes, blockRes] = await Promise.all([
            axios.get(
              `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=bulk_deals&from=${fromNSE}&to=${toNSE}`,
              { headers: profile.headers, timeout: 7000, validateStatus: (s) => s === 200 }
            ).catch(() => ({ data: { data: [] } })),
            axios.get(
              `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=block_deals&from=${fromNSE}&to=${toNSE}`,
              { headers: profile.headers, timeout: 7000, validateStatus: (s) => s === 200 }
            ).catch(() => ({ data: { data: [] } })),
          ]);

          const bulkItems = (bulkRes.data?.data || []).map(i => ({ ...i, dealType: 'Bulk' }));
          const blockItems = (blockRes.data?.data || []).map(i => ({ ...i, dealType: 'Block' }));
          combinedItems = [...bulkItems, ...blockItems];
        } else {
          const opt = dealType === 'block_deals' || dealType === '2' ? 'block_deals' : dealType === 'short_deals' ? 'short_deals' : 'bulk_deals';
          const histRes = await axios.get(
            `https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=${opt}&from=${fromNSE}&to=${toNSE}`,
            { headers: profile.headers, timeout: 7000, validateStatus: (s) => s === 200 }
          ).catch(() => ({ data: { data: [] } }));

          combinedItems = (histRes.data?.data || []).map(i => ({
            ...i,
            dealType: opt === 'block_deals' ? 'Block' : opt === 'short_deals' ? 'Short' : 'Bulk',
          }));
        }

        if (combinedItems.length > 0) {
          return res.json({ data: combinedItems, source: 'nse-historical' });
        }
      } catch (histErr) {
        console.warn('[NSE Historical Deals Warning]', histErr.message);
      }

      // 3. Fallback to Snapshot if historical range had 0 records (e.g. non-trading day)
      try {
        const snapRes = await axios.get(
          'https://www.nseindia.com/api/snapshot-capital-market-largedeal',
          { headers: profile.headers, timeout: 6000, validateStatus: (s) => s === 200 }
        );
        if (snapRes?.data) {
          const bulk = (snapRes.data.BULK_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Bulk' }));
          const block = (snapRes.data.BLOCK_DEALS_DATA || []).map(i => ({ ...i, dealType: 'Block' }));
          const combined = dealType === 'block_deals' ? block : dealType === 'both' ? [...bulk, ...block] : bulk;

          if (combined.length > 0) {
            const mappedData = combined.map(item => ({
              BD_BUY_SELL: item.buySell || 'BUY',
              BD_CLIENT_NAME: item.clientName || 'Market Participant',
              BD_DT_DATE: item.date || snapRes.data.as_on_date || fromNSE,
              BD_SCRIP_NAME: item.name || item.symbol || 'Securities',
              BD_QTY_TRD: item.qty != null ? String(item.qty) : '0',
              BD_REMARKS: item.remarks || '',
              BD_SYMBOL: item.symbol || '',
              BD_TP_WATP: item.watp != null ? String(item.watp) : '0',
              dealType: item.dealType || 'Bulk',
            }));

            return res.json({
              data: mappedData,
              asOf: snapRes.data.as_on_date,
              source: 'nse-snapshot-fallback',
              notice: `Non-trading session requested. Serving verified deals from ${snapRes.data.as_on_date}.`,
            });
          }
        }
      } catch (snapFbErr) {
        console.warn('[NSE Snapshot Fallback Warning]', snapFbErr.message);
      }

      // 4. Resilient Dual-Exchange Gateway Failover (BSE mapping)
      console.log(`[NSE Deals] Direct NSE feed challenged or empty for ${fromNSE}..${toNSE} — activating Dual-Exchange Gateway failover`);
      const fallbackDeals = await fetchDualExchangeDealsFallback(fromNSE, toNSE, dealType);
      return res.json({ data: fallbackDeals, gateway: 'dual-exchange-gateway' });

    } catch (e) {
      console.error('[NSE Deals Route Exception]', e.message);
      return res.json({ data: [], error: e.message, gateway: 'fail-safe' });
    }
  });

  async function fetchDualExchangeDealsFallback(from, to, dealType) {
    try {
      const { bseGet, getBseCookies } = require('../lib/apiClients');
      const cookies = await getBseCookies();
      const sessionHdr = cookies ? { Cookie: cookies } : {};

      const normalizeToBseDate = (dStr) => {
        if (!dStr) return '';
        const s = String(dStr).trim();
        if (s.includes('-')) {
          const p = s.split('-');
          if (p[0].length === 4) return `${p[2]}/${p[1]}/${p[0]}`; // YYYY-MM-DD -> DD/MM/YYYY
          return `${p[0]}/${p[1]}/${p[2]}`;                        // DD-MM-YYYY -> DD/MM/YYYY
        }
        return dStr;
      };

      const dt = dealType === 'block_deals' ? 2 : 1;
      const data = await bseGet(
        '/BulkDealData_ng/w',
        { DealType: dt, sc_code: '', FDate: normalizeToBseDate(from), TDate: normalizeToBseDate(to) },
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
        BD_TP_WATP: i.PRICE != null ? String(i.PRICE) : '0',
        dealType: dt === 2 ? 'Block' : 'Bulk',
      }));
    } catch (err) {
      console.warn('[Dual-Exchange Deals Failover Error]', err.message);
      return [];
    }
  }

  return router;
};
