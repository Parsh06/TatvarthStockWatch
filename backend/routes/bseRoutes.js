const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const { bseGet, getBseCookies, getYahooFundamentals, getYahooHistory, getYahooIndices, sanitizeCode } = require('../lib/apiClients');
const { getNseGainersLosers } = require('../services/nseService');

// ── In-memory caches for calendar and movers ─────────────────────────────────
const _calCache   = new Map(); // key: `${from}|${to}|${cat}`, val: { data, exp }
const CAL_TTL     = 30 * 60 * 1000; // 30 min
const _qCache     = new Map();
const QUOTE_TTL   = 5 * 60 * 1000;
let   _moversCache    = null;
let   _moversCacheExp = 0;
const MOVERS_TTL  = 5 * 60 * 1000;  // 5 min
let   _insiderCache    = null;
let   _insiderCacheExp = 0;
const INSIDER_TTL = 10 * 60 * 1000; // 10 min

async function searchMoneyControl(q) {
  try {
    const res = await axios.get(`https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?query=${encodeURIComponent(q)}&type=1&format=json`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      },
      timeout: 6000
    });
    
    return (res.data || []).map(item => {
      const rawSpan = (item.pdt_dis_nm || '').match(/<span>(.*?)<\/span>/i);
      const spanParts = rawSpan ? rawSpan[1].split(',').map(s => s.trim()) : [];
      let isin = '';
      let symbol = '';
      let bseCode = '';
      for (const part of spanParts) {
        if (/^INE[A-Z0-9]{9}$/i.test(part)) {
          isin = part;
        } else if (/^\d{6}$/.test(part)) {
          bseCode = part;
        } else if (part && part !== '0') {
          symbol = part;
        }
      }
      return {
        bseCode: bseCode || item.sc_id || '',
        symbol: symbol || item.stock_name || item.name || '',
        scripName: item.name || item.stock_name || '',
        isin: isin || '',
        type: item.sc_sector || 'Equity',
        url: item.link_src || ''
      };
    }).filter(i => i.scripName);
  } catch (err) {
    console.warn('[MoneyControl AutoSuggest Fallback Error]', err.message);
    return [];
  }
}

async function scrapeBseBoardMeetingsAspx() {
  try {
    const res = await axios.get('https://beta.bseindia.com/corporates/board_meeting.aspx?expandable=0', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.bseindia.com/'
      },
      timeout: 12000
    });
    const $ = cheerio.load(res.data);
    const rows = [];
    $('#ContentPlaceHolder1_gvData tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 5) {
        const href = $(tds[1]).find('a').attr('href') || '';
        rows.push({
          scrip_code: $(tds[0]).text().trim(),
          SHORT_NAME: $(tds[1]).text().trim(),
          Long_Name: $(tds[1]).text().trim(),
          Industry_name: $(tds[2]).text().trim(),
          PURPOSE_NAME: $(tds[3]).text().trim(),
          MEETING_DATE: $(tds[4]).text().trim(),
          MEETING_BOARD_DATE: $(tds[4]).text().trim(),
          URL: href ? (href.startsWith('http') ? href : 'https://www.bseindia.com/corporates/' + href) : ''
        });
      }
    });
    return rows;
  } catch (e) {
    console.warn('[Scrape Board Meetings ASPX Fallback Error]', e.message);
    return [];
  }
}

async function scrapeBseBulkDealsAspx() {
  try {
    const res = await axios.get('https://beta.bseindia.com/markets/equity/EQReports/bulk_deals.aspx?expandable=3', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.bseindia.com/'
      },
      timeout: 12000
    });
    const $ = cheerio.load(res.data);
    const rows = [];
    $('#ContentPlaceHolder1_gvbulk_deals tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 7) {
        const qty = parseFloat($(tds[5]).text().replace(/,/g, '')) || null;
        const price = parseFloat($(tds[6]).text().replace(/,/g, '')) || null;
        const txCode = $(tds[4]).text().trim();
        rows.push({
          dealType: 'Bulk',
          dealDate: $(tds[0]).text().trim(),
          bseCode: $(tds[1]).text().trim(),
          scripname: $(tds[2]).text().trim(),
          clientName: $(tds[3]).text().trim(),
          transactionType: txCode === 'P' || txCode === 'B' ? 'Buy' : 'Sell',
          transactionCode: txCode,
          quantity: qty,
          price: price,
          valueCr: qty && price ? Math.round(qty * price / 1e5) / 100 : null
        });
      }
    });
    return rows;
  } catch (e) {
    console.warn('[Scrape Bulk Deals ASPX Fallback Error]', e.message);
    return [];
  }
}

module.exports = function(verifyToken) {

// ── OPEN: BSE top gainers / losers (market-wide, 5-min cache) ────────────────
router.get('/movers', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

  if (_moversCache && Date.now() < _moversCacheExp) {
    return res.json({
      gainers:   _moversCache.gainers.slice(0, limit),
      losers:    _moversCache.losers.slice(0, limit),
      fetchedAt: _moversCache.fetchedAt,
      cached: true,
    });
  }

  const _f = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? null : n; };

  function parseMovers(r) {
    if (r.status !== 'fulfilled' || !r.value) return [];
    const rows = r.value?.Table || r.value?.Table1 || r.value?.Data || (Array.isArray(r.value) ? r.value : []);
    return rows.map((i) => ({
      bseCode:   String(i.scrip_cd || i.SCRIP_CODE || i.scripcode || i.ScripCode || '').trim(),
      company:   (i.LONG_NAME || i.scripname || i.SCRIP_NAME || i.ScripName || i.CompanyName || '').trim(),
      symbol:    (i.scripname || i.NSE_SYMBOL || i.nseSymbol || i.Symbol || '').trim(),
      ltp:       _f(i.ltradert || i.LTP || i.ltp || i.CURRENT_VALUE),
      change:    _f(i.change_val || i.NET_CHANGE || i.NetChange || i.change || i.NETCHANGE),
      pctChange: _f(i.change_percent || i.PERCENT_CHG || i.PercentChg || i.PctChg || i.PERCHANGE || i.perChange),
      volume:    parseInt(String(i.trd_vol || i.VOLUME || i.volume || i.TotalTradedQuantity || '0').replace(/,/g,''), 10) || null,
      rawUrl:    i.URL || i.NSUrl || '',
    })).filter((m) => m.bseCode && m.ltp != null);
  }

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    const [grR, lrR] = await Promise.allSettled([
      bseGet('/MktRGainerLoserDataeqto/w',
        { GLtype: 'gainer', IndxGrp: 'AllMkt', IndxGrpval: 'AllMkt', orderby: 'all' }, 12000, sessionHdr),
      bseGet('/MktRGainerLoserDataeqto/w',
        { GLtype: 'loser', IndxGrp: 'AllMkt', IndxGrpval: 'AllMkt', orderby: 'all' }, 12000, sessionHdr),
    ]);
    let gainers = parseMovers(grR);
    let losers  = parseMovers(lrR);

    // Fallback: If BSE returns empty or 403, fallback to NSE movers
    if (gainers.length === 0 || losers.length === 0) {
      try {
        const [nseG, nseL] = await Promise.allSettled([
          getNseGainersLosers('gainer', 'allSec'),
          getNseGainersLosers('loser', 'allSec')
        ]);
        if (gainers.length === 0 && nseG.status === 'fulfilled' && Array.isArray(nseG.value?.data)) {
          gainers = nseG.value.data.map(i => ({
            bseCode: i.symbol,
            company: i.symbol,
            symbol: i.symbol,
            ltp: i.ltp,
            change: i.percentChange ? +((i.ltp * i.percentChange / 100).toFixed(2)) : 0,
            pctChange: i.percentChange,
            volume: i.volume,
            rawUrl: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(i.symbol)}`
          }));
        }
        if (losers.length === 0 && nseL.status === 'fulfilled' && Array.isArray(nseL.value?.data)) {
          losers = nseL.value.data.map(i => ({
            bseCode: i.symbol,
            company: i.symbol,
            symbol: i.symbol,
            ltp: i.ltp,
            change: i.percentChange ? +((i.ltp * i.percentChange / 100).toFixed(2)) : 0,
            pctChange: i.percentChange,
            volume: i.volume,
            rawUrl: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(i.symbol)}`
          }));
        }
      } catch (err) {
        console.warn('[BSE Movers Fallback to NSE Error]', err.message);
      }
    }

    _moversCache    = { gainers, losers, fetchedAt: new Date().toISOString() };
    _moversCacheExp = Date.now() + MOVERS_TTL;
    res.json({ gainers: gainers.slice(0, limit), losers: losers.slice(0, limit), fetchedAt: _moversCache.fetchedAt, cached: false });
  } catch (e) {
    console.error('[BSE Movers]', e.message);
    // Return cached or empty array instead of 500
    res.json({
      gainers: _moversCache?.gainers?.slice(0, limit) || [],
      losers: _moversCache?.losers?.slice(0, limit) || [],
      fetchedAt: _moversCache?.fetchedAt || new Date().toISOString(),
      cached: true
    });
  }
});

// ── OPEN: BSE script search ───────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    let items = null;
    try {
      items = await bseGet(
        '/GetQuoteAllSearchDatabeta/w',
        { searchString: q }, 6000
      );
    } catch {
      items = null;
    }

    if (!Array.isArray(items) || items.length === 0) {
      try {
        items = await bseGet(
          'https://api.bseindia.com/MSource/1D/GetQuoteAllSearchDatabeta.aspx',
          { searchString: q }, 6000
        );
      } catch {
        items = [];
      }
    }

    if (Array.isArray(items) && items.length > 0) {
      return res.json(items.map((i) => ({
        bseCode:   (i.strSricpCode || '').trim(),
        symbol:    (i.shortName    || '').trim(),
        scripName: (i.scripName    || '').trim(),
        isin:      (i.Isin         || '').trim(),
        type:      (i.Type         || '').trim(),
        url:       (i.SEOUrl       || '').trim(),
      })));
    }

    // Fallback: Use MoneyControl autosuggest API (robust, instant, no 403 blocks)
    const mcResults = await searchMoneyControl(q);
    if (mcResults.length > 0) {
      return res.json(mcResults);
    }

    res.json([]);
  } catch (e) {
    console.error('[BSE Search]', e.message);
    // Even on error, fallback to MoneyControl search before failing
    try {
      const mcResults = await searchMoneyControl(q);
      return res.json(mcResults);
    } catch {
      res.json([]);
    }
  }
});

// ── OPEN: BSE intraday chart ──────────────────────────────────────────────────
router.get('/intradaychart', async (req, res) => {
  const code = sanitizeCode(req.query.code);
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    let raw = null;
    try {
      raw = await bseGet(
        '/StockReachGraphCas/w',
        { scripcode: code, flag: '0', fromdate: '', todate: '', seriesid: '' },
        12000
      );
    } catch {
      raw = await bseGet(
        '/StockReachGraph/w',
        { scripcode: code, flag: '0', fromdate: '', todate: '', seriesid: '' },
        12000
      );
    }
    if (!raw) return res.status(502).json({ error: 'no data' });
    let points = [];
    if (typeof raw.Data === 'string') {
      try { points = JSON.parse(raw.Data); } catch {}
    } else if (Array.isArray(raw.Data)) {
      points = raw.Data;
    }
    res.json({
      prevClose: parseFloat(raw.PrevClose) || null,
      low:       parseFloat(raw.LowVal)    || null,
      high:      parseFloat(raw.HighVal)   || null,
      current:   parseFloat(raw.CurrVal)   || null,
      points: points.map((p) => ({
        t: p.dttm,
        p: parseFloat(p.vale1 || p.vale0) || null,
        v: parseInt(p.vole, 10) || 0,
      })),
    });
  } catch (e) {
    console.error(`[BSE Chart ${code}]`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: BSE historical OHLC (getScripAllData/w) ────────────────────────────
router.get('/history', async (req, res) => {
  const code  = sanitizeCode(req.query.code);
  const symbol = sanitizeCode(req.query.symbol);
  const range = (req.query.range || '1M').toUpperCase().replace(/[^0-9YMW]/g, '');
  if (!code && !symbol) return res.status(400).json({ error: 'code or symbol required' });

  const today = new Date();
  const from  = new Date(today);
  if      (range === '1W') from.setDate(today.getDate() - 7);
  else if (range === '3M') from.setMonth(today.getMonth() - 3);
  else if (range === '6M') from.setMonth(today.getMonth() - 6);
  else if (range === '1Y') from.setFullYear(today.getFullYear() - 1);
  else if (range === '5Y') from.setFullYear(today.getFullYear() - 5);
  else                     from.setMonth(today.getMonth() - 1);

  const fmtD = (d) =>
    `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  try {
    let points = null;
    
    // Attempt BSE First
    if (code) {
      try {
        const raw = await bseGet(
          '/getScripAllData/w',
          { scripcode: code, seriesid: 'EQ', fromdate: fmtD(from), todate: fmtD(today) },
          10000
        );
        const rows = raw?.Data || raw?.Table || raw?.data || (Array.isArray(raw) ? raw : []);
        if (!Array.isArray(rows) || rows.length === 0 || (typeof raw === 'string' && raw.includes('<html'))) {
          throw new Error('BSE Historical data blocked or empty');
        }
        points = rows.map((r) => ({
          date:   (r.DateTime || r.Date || r.dt  || '').slice(0, 10),
          open:   parseFloat(r.Open  || r.open  || 0) || null,
          high:   parseFloat(r.High  || r.high  || 0) || null,
          low:    parseFloat(r.Low   || r.low   || 0) || null,
          close:  parseFloat(r.Close || r.close || r.LTP || 0) || null,
          volume: parseInt(r.No_Of_Shares || r.Volume || r.vol || 0, 10) || 0,
        })).filter((p) => p.date && p.close).reverse(); // BSE data comes newest first, we want oldest first for chart
      } catch (e) {
        // BSE history endpoint is currently blocked (returns error_Bse.html).
        // Silently catch the error and allow the fallback to Yahoo Finance to proceed.
      }
    }

    // Fallback to Yahoo Finance
    if (!points || points.length === 0) {
      const yahooPoints = await getYahooHistory(symbol, code, range);
      if (yahooPoints && yahooPoints.length > 0) {
        points = yahooPoints;
      }
    }

    if (!points) points = [];
    
    // Sort oldest first just in case
    points.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ code, symbol, range, points, total: points.length });
  } catch (e) {
    console.error(`[History Error ${code}]`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: BSE historical table (StockpricesearchData/w) ────────────────────
router.get('/historical-table', async (req, res) => {
  const code = sanitizeCode(req.query.code);
  const from = req.query.from; // DD/MM/YYYY
  const to = req.query.to; // DD/MM/YYYY
  if (!code || !from || !to) return res.status(400).json({ error: 'code, from, to required' });

  try {
    const raw = await bseGet(
      '/StockpricesearchData/w',
      { MonthDate: from, YearDate: to, pageType: 0, Scode: code, Seg: 'C', rbType: 'D', SortOrder: true },
      15000
    );
    res.json(raw);
  } catch (e) {
    console.error(`[Historical Table Error ${code}]`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: BSE Indices (GetSensexDatanew/w with Yahoo fallback) ─────────────
router.get('/indices', async (req, res) => {
  try {
    let raw = null;
    try {
      raw = await bseGet('https://api.bseindia.com/RealTimeBseIndiaAPI/api/GetSensexDatanew/w', {}, 5000);
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
    } catch { raw = []; }

    let list = Array.isArray(raw) ? raw : (Array.isArray(raw?.Table) ? raw.Table : []);
    if (!list.length) {
      list = await getYahooIndices();
    }
    res.json(list);
  } catch (e) {
    console.error('[Indices Error]', e.message);
    const fallback = await getYahooIndices().catch(() => []);
    res.json(fallback);
  }
});

// ── OPEN: BSE company data (quote + details + financials + shareholding + bulk deals) ──
router.get('/company', async (req, res) => {
  const code   = sanitizeCode(req.query.code);
  const symbol = (req.query.symbol || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    // Fetch BSE session cookies and Yahoo Finance fundamentals in parallel
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};
    const [quoteR, infoR, peerR, finR, bulkR, shpR, holdR, corpR, corpAltR, targetR, quoteDataR, perfR, newsR, depthR] = await Promise.allSettled([
      bseGet(`/getScripHeaderData/w`, { Debtflag: '', scripcode: code, seriesid: '' }, 12000),
      bseGet(`/getScripDetails2/w`,     { scripcode: code }, 12000, sessionHdr),
      bseGet(`/EQPeerGp/w`,           { scripcomare: '', scripcode: code }, 12000),
      bseGet(`/TabResults_PAR/w`,     { scripcode: code, tabtype: 'RESULTS' }, 15000),
      bseGet(`/TabResults_PAR/w`,     { scripcode: code, tabtype: 'BULK'    }, 15000),
      bseGet(`/TabResults_PAR/w`,     { scripcode: code, tabtype: 'SHP'     }, 15000),
      bseGet(`/getScripHolding/w`,    { scripcode: code }, 12000),
      bseGet(`/TabResults_PAR/w`,     { scripcode: code, tabtype: 'CA'      }, 15000),
      bseGet(`/DefaultData/w`,        { scripcode: code, Fdate: '', Purposecode: '', TDate: '', ddlcategorys: 'E', ddlindustrys: '', segment: 0, strSearch: 'D' }, 12000),
      bseGet(`/getScripTarget/w`,     { scripcode: code }, 12000),
      bseGet(`/getQuoteData/w`,       { scripcode: code, seriesid: 'EQ' }, 12000),
      bseGet(`/PriceGainLoss_New/w`,  { scripcode: code }, 12000),
      bseGet(`/TabResults_PAR/w`,     { scripcode: code, tabtype: 'NEWS'    }, 15000),
      bseGet(`/MarketDepth/w`,        { flag: '', quotetype: 'EQ', scripcode: code }, 10000),
    ]);

    const _f = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) || n === 0 ? null : n; };

    // ── Live quote from getScripHeaderData ──────────────────────────────────
    const d = (quoteR.status === 'fulfilled') ? quoteR.value : {};
    const h = (d && typeof d === 'object')
      ? (d.Header
        || (Array.isArray(d.ScripHeaderData) && d.ScripHeaderData[0])
        || (Array.isArray(d.Table) && d.Table[0])
        || (Array.isArray(d) && d[0])
        || d)
      : {};
    const curr = (d && typeof d === 'object') ? (d.CurrRate || {}) : {};
    const cmp = (d && typeof d === 'object') ? (d.Cmpname || {}) : {};

    let quote = {
      ltp:        _f(curr.LTP || h.LTP || h.CurrRate || h.CURRENT_VALUE),
      prevClose:  _f(h.PrevClose || h.Prevclose || h.PREV_CLOSE),
      open:       _f(h.Open || h.OPEN),
      high:       _f(h.High || h.HIGH),
      low:        _f(h.Low || h.LOW),
      volume:     _f(h.TotalTradedQuantity || h.Volume || h.VOLUME),
      week52High: _f(h.Wk52High || h['52WH'] || h['52WeekHigh'] || h.WEEK52HIGH
                  || h.High52 || h.YearHigh || h.wkhi52 || h['52H']
                  || h.FiftyTwoWeekHigh || h['52WHigh'] || h['52high'] || h.Hi52wk),
      week52Low:  _f(h.Wk52Low || h['52WL'] || h['52WeekLow'] || h.WEEK52LOW
                  || h.Low52 || h.YearLow || h.wklo52 || h['52L']
                  || h.FiftyTwoWeekLow || h['52WLow'] || h['52low'] || h.Lo52wk),
      pe:         _f(h.PE || h.PeRatio || h.PERATIO || h.TTM_PE || h.pe),
      eps:        _f(h.EPS || h.Eps || h.EPS_TTM || h.eps),
      faceValue:  _f(h.FaceValue || h.FV || h.FACE_VALUE || h.Facevalue || h.facevalue),
      bookValue:  _f(h.BookValue || h.BV || h.BOOK_VALUE || h.bv),
      dividend:   _f(h.DividendYield || h.DivYield || h.DIV_YIELD || h.divYield),
      marketCap:  String(h.Mktcap || h.MktCap || h.MKTCAP || h.MarketCap || h.mktcap || '').replace(/,/g, '') || null,
      sector:     h.Industry || h.INDUSTRY || h.Sector || h.sector || null,
      companyName: cmp.FullN || cmp.SeriesN || h.CompanyName || h.LongName || h.scripname || h.COMPANY || null,
    };

    if (infoR.status === 'fulfilled') {
      const id = infoR.value;
      let row = {};
      if (Array.isArray(id) && id.length) row = id[0];
      else if (id && Array.isArray(id.Table) && id.Table.length) row = id.Table[0];
      else if (id && Array.isArray(id.Data) && id.Data.length) row = id.Data[0];
      else if (id && typeof id === 'object' && !Array.isArray(id) && id.status !== 'fail') row = id;
      if (typeof row === 'string') { try { row = JSON.parse(row); } catch { row = {}; } }
      const rowKeys = Object.keys(row || {});
      if (rowKeys.length > 1) {
        const ficel = {
          pe:         _f(row.PE || row.PeRatio || row.PERATIO || row.PE_TTM || row.pe),
          eps:        _f(row.EPS || row.Eps || row.EPS_TTM || row.eps),
          faceValue:  _f(row.FaceValue || row.FACE_VALUE || row.Facevalue || row.FV || row.facevalue),
          week52High: _f(row['52WH'] || row['52WeekHigh'] || row.WEEK52HIGH || row.High52 || row.YearHigh || row['52wkH'] || row.wkhi52 || row.Wk52High),
          week52Low:  _f(row['52WL'] || row['52WeekLow'] || row.WEEK52LOW || row.Low52 || row.YearLow || row['52wkL'] || row.wklo52 || row.Wk52Low),
          marketCap:  String(row.Mktcap || row.MktCap || row.MKTCAP || row.MarketCap || '').replace(/,/g, '') || null,
          sector:     row.Industry || row.INDUSTRY || row.Sector || row.sector || null,
          companyName: row.CompanyName || row.COMPANY || row.scripname || row.LongName || null,
          bookValue:  _f(row.BookValue || row.BOOK_VALUE || row.BV || row.bv),
          dividend:   _f(row.DividendYield || row.DIVYIELD || row.DIV_YIELD || row.divYield),
        };
        Object.entries(ficel).forEach(([k, v]) => { if (v != null && v !== '') quote[k] = v; });
      }
    }

    let selfEquity = null;
    let selfFaceValue = null;
    if (peerR.status === 'fulfilled') {
      const pd = peerR.value;
      const rows = pd?.Table || (Array.isArray(pd) ? pd : []);
      const self = rows.find((r) => String(r.scrip_cd) === String(code)) || rows[0];
      if (self) {
        selfEquity = _f(self.Equity);
        selfFaceValue = _f(self.FACE_VALUE);
        const peerFund = {
          pe:        _f(self.PE),
          eps:       _f(self.EPS),
          faceValue: _f(self.FACE_VALUE),
          week52High: _f(self.w52hi),
          week52Low:  _f(self.w52lo),
          cashEps:   _f(self.Cash_EPS),
          opm:       _f(self.OPM),
          npm:       _f(self.NPM),
          ronw:      _f(self.RONW),
          revenue:   _f(self.Revenue),
          pat:       _f(self.PAT),
        };
        const peers = rows.filter((r) => String(r.scrip_cd) !== String(code)).map((r) => ({
          bseCode: String(r.scrip_cd),
          name:    r.Name,
          ltp:     _f(r.LTP),
          change:  _f(r.Change),
          pe:      _f(r.PE),
          eps:     _f(r.EPS),
          w52hi:   _f(r.w52hi),
          w52lo:   _f(r.w52lo),
          revenue: _f(r.Revenue),
          pat:     _f(r.PAT),
          faceValue: _f(r.FACE_VALUE),
        }));
        Object.entries(peerFund).forEach(([k, v]) => { if (v != null) quote[k] = v; });
        quote.peers = peers;
      }
    }

    try {
      const yData = await getYahooFundamentals(symbol, code);
      if (yData) {
        Object.entries(yData).forEach(([k, v]) => {
          if (v != null && (quote[k] == null || quote[k] === '')) {
            quote[k] = v;
          }
        });
      }
    } catch (e) {
      console.error(`[Yahoo ${symbol || code}] error:`, e.message);
    }

    // Auto calculate Market Cap if not provided
    if (!quote.marketCap && quote.ltp && selfEquity && selfFaceValue) {
      const mCapCr = (selfEquity / selfFaceValue) * quote.ltp;
      quote.marketCap = `₹${Math.round(mCapCr).toLocaleString('en-IN')} Cr`;
    }

    let financials = [];
    if (finR.status === 'fulfilled') {
      try {
        let raw = finR.value;
        if (typeof raw === 'string') raw = JSON.parse(raw);
        
        if (raw?.resultinCr && Array.isArray(raw.resultinCr)) {
          const revRow = raw.resultinCr.find(r => /revenue|sales/i.test(r.title));
          const patRow = raw.resultinCr.find(r => /net profit|pat/i.test(r.title));
          const epsRow = raw.resultinCr.find(r => /^eps/i.test(r.title));
          const cashEpsRow = raw.resultinCr.find(r => /cash eps/i.test(r.title));
          const opmRow = raw.resultinCr.find(r => /opm/i.test(r.title));
          const npmRow = raw.resultinCr.find(r => /npm/i.test(r.title));
          const quarters = [raw.col2, raw.col3, raw.col4].filter(Boolean);
          const links = raw.resultinS?.[0] || {};
          
          quarters.forEach((q, idx) => {
            const vKey = `v${idx + 1}`;
            const linkKey = idx === 0 ? 'LLQ' : idx === 1 ? 'LSQ' : 'LFY';
            financials.push({
              quarter: q,
              revenue: revRow ? _f(revRow[vKey]) : null,
              profit:  patRow ? _f(patRow[vKey]) : null,
              eps:     epsRow ? _f(epsRow[vKey]) : null,
              cashEps: cashEpsRow ? _f(cashEpsRow[vKey]) : null,
              opm:     opmRow ? _f(opmRow[vKey]) : null,
              npm:     npmRow ? _f(npmRow[vKey]) : null,
              reportUrl: links[linkKey] || null,
            });
          });
        } else {
          const tab = raw?.TabResults_PAR || raw?.Table || [];
          financials = (Array.isArray(tab) ? tab : []).map((r) => ({
            quarter: r.PERIOD_TEXT || r.QUARTER || r.quarter || '',
            revenue: _f(r.SALES    || r.REVENUE || r.revenue),
            profit:  _f(r.NP       || r.PROFIT  || r.profit),
            eps:     _f(r.EPS      || r.eps),
          })).filter((r) => r.quarter);
        }
      } catch (e) { console.error(`[BSE Financials ${code}]`, e.message); }
    }

    let bulkDeals = [];
    if (bulkR.status === 'fulfilled') {
      try {
        let raw = bulkR.value;
        if (typeof raw === 'string') raw = JSON.parse(raw);
        const tab = raw?.TabResults_PAR || raw?.Table || [];
        bulkDeals = (Array.isArray(tab) ? tab : []).map((r) => ({
          dealDate:        (r.DT_TM        || r.DEAL_DATE       || '').slice(0, 10),
          clientName:      (r.CLIENT_NAME  || r.CLNT_NAME       || '').trim(),
          transactionType: (r.TRANSACTION_TYPE || r.TX_TYPE     || '').trim(),
          qty:   _f(r.QUANTITY || r.qty),
          price: _f(r.PRICE    || r.price),
        }));
      } catch (e) { console.error(`[BSE BulkDeals ${code}]`, e.message); }
    }

    let shareholding = { quarters: [], rows: [], unit: '' };
    if (shpR.status === 'fulfilled') {
      try {
        const raw = shpR.value;
        let html = '';
        if (typeof raw === 'string') html = raw;
        else if (raw && typeof raw === 'object') html = raw.TabResults_PAR || raw.Table || '';
        if (html && html.includes('<')) {
          const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
          const allThMatches = html.match(/<th[^>]*>[\s\S]*?<\/th>/g) || [];
          let unitHeader = '(in %)';
          const quarters = allThMatches
            .map((m) => stripTags(m))
            .filter((txt) => {
              if (txt.includes('%') || txt.toLowerCase().includes('in %')) {
                unitHeader = txt;
                return false;
              }
              return Boolean(txt);
            });

          const rows = [];
          const trParts = html.split(/<tr[^>]*>/i).slice(1);
          for (const part of trParts) {
            const tdContent = part.split(/<\/tr>/i)[0];
            const cells = (tdContent.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [])
              .map((c) => stripTags(c));
            if (cells.length > 1) rows.push(cells);
          }

          shareholding = { quarters, rows, unit: unitHeader };
        }
      } catch (e) { console.error(`[BSE Shareholding ${code}]`, e.message); }
    }

    let holding = null;
    if (holdR.status === 'fulfilled') {
      try {
        const raw  = holdR.value;
        const rows = raw?.Table || raw?.Table1 || raw?.holdingData || (Array.isArray(raw) ? raw : []);
        if (rows.length > 0) {
          const r = rows[0];
          const qProm  = _f(r.PROMOTERHOLDING || r.Promoter    || r.PROMOTER    || r.promoterHolding   || r.promoter_holding);
          const qFii   = _f(r.FIIHOLDING      || r.FII         || r.fii         || r.ForeignInst       || r.fii_holding);
          const qDii   = _f(r.DIIHOLDING      || r.DII         || r.dii         || r.DomesticInst      || r.dii_holding);
          const qPub   = _f(r.PUBLICHOLDING   || r.Public      || r.public      || r.PublicHolding     || r.public_holding);
          const qMut   = _f(r.MUTUALFUNDHOLDING|| r.MutualFund  || r.mutualFund  || r.MF               || r.mf_holding);
          const qNii   = _f(r.NIIHOLDING      || r.NII         || r.nii         || r.nii_holding);
          if (qProm != null || qFii != null || qDii != null || qPub != null) {
            holding = {
              quarter:  r.QUARTER || r.Quarter || r.quarter || r.QTREND || '',
              promoter: qProm,
              fii:      qFii,
              dii:      qDii,
              public:   qPub,
              nii:      qNii,
              mutual:   qMut,
              history:  rows.slice(0, 8).map((h) => ({
                quarter:  h.QUARTER || h.Quarter || h.QTREND || '',
                promoter: _f(h.PROMOTERHOLDING || h.Promoter    || h.PROMOTER    || h.promoter_holding),
                fii:      _f(h.FIIHOLDING      || h.FII         || h.fii         || h.fii_holding),
                dii:      _f(h.DIIHOLDING      || h.DII         || h.dii         || h.dii_holding),
                public:   _f(h.PUBLICHOLDING   || h.Public      || h.public      || h.public_holding),
              })),
            };
          }
        }
      } catch (e) { console.error(`[BSE Holding ${code}]`, e.message); }
    }

    if (!holding && shareholding?.rows?.length > 0) {
      const promoterRow = shareholding.rows.find(r => r[0]?.toLowerCase().includes('promoter'));
      const publicRow = shareholding.rows.find(r => r[0]?.toLowerCase().includes('public'));
      
      let latestProm = null, latestPub = null, latestQ = '';
      if (promoterRow && publicRow) {
        for (let i = 1; i <= shareholding.quarters.length; i++) {
          const valProm = _f(promoterRow[i]);
          const valPub = _f(publicRow[i]);
          if (valProm != null || valPub != null) {
            latestProm = valProm;
            latestPub = valPub;
            latestQ = shareholding.quarters[i - 1] || '';
            break;
          }
        }
      }
      
      if (latestProm != null || latestPub != null) {
        holding = {
          quarter: latestQ,
          promoter: latestProm,
          public: latestPub,
          history: []
        };
      }
    }

    let corporateActions = [];
    if (corpR.status === 'fulfilled') {
      try {
        let raw = corpR.value;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch {} }
        const tab = Array.isArray(raw) ? raw : (raw?.TabResults_PAR || raw?.Table || []);
        if (Array.isArray(tab) && tab.length > 0) {
          corporateActions = tab.map((r) => ({
            exDate:  (r.Exdate || r.Ex_date || r.ExDate || r.EX_DATE || r.ex_date || '').slice(0, 10),
            recDate: (r.RD_Date || r.RecordDate || r.REC_DATE || r.record_date || '').slice(0, 10),
            purpose: (r.Purpose || r.PURPOSE || r.action || r.Action || r.SubjectHeading || '').trim(),
            remarks: (r.Remarks || r.REMARKS || r.Purpose || '').trim(),
          })).filter((r) => r.purpose || r.remarks);
        }
      } catch (e) { console.error(`[BSE CorpActions Tab CA ${code}]`, e.message); }
    }

    if (corporateActions.length === 0 && corpAltR.status === 'fulfilled') {
      try {
        const raw  = corpAltR.value;
        const rows = raw?.Table || raw?.Table1 || raw?.Corp_AnnGetData || (Array.isArray(raw) ? raw : []);
        corporateActions = rows.map((r) => ({
          exDate:  (r.Ex_date || r.ExDate || r.EX_DATE || r.ex_date || r.EXDATE || '').slice(0, 10),
          recDate: (r.RD_Date || r.RecordDate || r.REC_DATE || r.record_date || r.RECDATE || '').slice(0, 10),
          purpose: (r.Purpose || r.PURPOSE || r.action || r.Action || r.SubjectHeading || r.SUBJECT || '').trim(),
          remarks: (r.Purpose || r.Remarks || r.REMARKS || r.remark || r.Remark || '').trim(),
          bcStart: (r.ND_START_DATE || r.BCStartDate || r.BC_START || r.BCSTART || '').slice(0, 10),
          bcEnd:   (r.ND_END_DATE || r.BCEndDate || r.BC_END || r.BCEND || '').slice(0, 10),
        })).filter((r) => r.purpose || r.remarks);
      } catch (e) { console.error(`[BSE CorpActions Alt ${code}]`, e.message); }
    }

    let analystTargets = [];
    if (targetR.status === 'fulfilled') {
      try {
        const raw  = targetR.value;
        const rows = raw?.Table || raw?.Table1 || raw?.getScripTarget || (Array.isArray(raw) ? raw : []);
        analystTargets = rows.map((r) => ({
          broker: (r.BROKER    || r.Broker    || r.broker    || r.ANALYST  || r.Analyst  || r.analyst || r.BROKERNAME || '').trim(),
          reco:   (r.RECO      || r.Reco      || r.reco      || r.RECOMMENDATION || r.Recommendation || r.RATING || r.Rating || '').trim().toUpperCase(),
          target: _f(r.TARGET  || r.Target    || r.target    || r.PRICE_TARGET   || r.PriceTarget    || r.TP    || r.tp),
          upside: _f(r.UPSIDE  || r.Upside    || r.upside    || r.UPSIDE_PCT     || r.UpsidePct      || r.POTENTIAL),
          date:   (r.DATE      || r.Date      || r.date      || r.REPORT_DATE    || r.ReportDate     || r.RESEARCHDATE || '').slice(0, 10),
        })).filter((r) => r.broker || r.reco || r.target);
      } catch (e) { console.error(`[BSE Targets ${code}]`, e.message); }
    }

    let quoteData = null;
    if (quoteDataR.status === 'fulfilled') {
      try {
        const raw = quoteDataR.value;
        const r = (Array.isArray(raw) ? raw[0] : null)
               || raw?.Table?.[0] || raw?.Table1?.[0] || raw?.Data?.[0] || raw?.getQuoteData?.[0]
               || (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null);
        if (r) {
          const dPct = _f(r.Delivery_Pct || r.DeliveryPct   || r.DELIVERY_PCT   || r.deliveryPct
                       || r.delPct       || r.DelPct         || r.DELPCT         || r.PctDelivery);
          const vwap = _f(r.VWAP         || r.vwap           || r.WtAvg          || r.WT_AVG
                       || r.VWap         || r.Vwap            || r.WgtAvgRate);
          const bb   = _f(r.Beta         || r.BETA            || r.beta           || r.BetaValue || r.BETA_VALUE);
          const pb   = _f(r.PBRatio      || r.PB_RATIO        || r.pb             || r.PriceBook
                       || r.Price2Book   || r.P_B             || r.PriceToBook    || r.PTB);
          if (dPct != null || vwap != null || bb != null || pb != null) {
            quoteData = {
              deliveryPct:   dPct,
              deliveryQty:   _f(r.Delivery_Qty || r.DeliveryQty  || r.DELIVERY_QTY  || r.DelQty),
              vwap,
              totalTrades:   _f(r.TotalTrades  || r.TOTAL_TRADES || r.trades         || r.TradeCount || r.NO_OF_TRADES),
              turnover:      _f(r.Turnover     || r.TURNOVER     || r.turnover       || r.TotalTurnover),
              beta:          bb,
              pbRatio:       pb,
              dividendYield: _f(r.DivYield     || r.DIV_YIELD    || r.dividendYield  || r.DividendYield),
            };
          }
        }
      } catch (e) { console.error(`[BSE QuoteData ${code}]`, e.message); }
    }

    let performance = null;
    if (perfR.status === 'fulfilled') {
      try {
        const raw = perfR.value;
        const data = raw?.Data || (Array.isArray(raw) ? raw : []);
        const headers = raw?.Headers?.[0] || {};
        const benchmarkName = headers.Index_name_1 || 'Sensex';
        if (Array.isArray(data) && data.length > 0) {
          performance = {
            benchmark: benchmarkName,
            rows: data.map(r => ({
              duration: r.Duration,
              stockChange: _f(r.AbsoluteChg),
              stockPct: _f(r.change_percent),
              sensexChange: _f(r.SensexChg),
              sensexPct: _f(r.SensexPerc),
              indexPct: _f(r.IndexPerc || r.Index_name_1),
              indexCode: r.IndexCode || ''
            }))
          };
        }
      } catch (e) { console.error(`[BSE Perf ${code}]`, e.message); }
    }

    let companyNews = [];
    if (newsR.status === 'fulfilled') {
      try {
        let raw = newsR.value;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch {} }
        const rows = Array.isArray(raw) ? raw : (raw?.TabResults_PAR || raw?.Table || []);
        if (Array.isArray(rows)) {
          companyNews = rows.map(r => ({
            id: r.Newsid || r.NEWSID || '',
            subject: r.NewsSubj || r.NEWSSUB || r.Subject || r.HEADLINE || '',
            date: r.Newsdt || r.NEWSDT || r.DT_TM || '',
          })).filter(r => r.subject);
        }
      } catch (e) { console.error(`[BSE News ${code}]`, e.message); }
    }

    let marketDepth = null;
    if (depthR.status === 'fulfilled') {
      try {
        const raw = depthR.value;
        if (raw && typeof raw === 'object') {
          const bids = [];
          const asks = [];
          for (let i = 1; i <= 5; i++) {
            const bp = _f(raw[`BPrice${i}`]);
            const bq = _f(raw[`BQty${i}`]);
            const sp = _f(raw[`SPrice${i}`]);
            const sq = _f(raw[`SQty${i}`]);
            if (bp != null || bq != null) bids.push({ price: bp, qty: bq });
            if (sp != null || sq != null) asks.push({ price: sp, qty: sq });
          }
          marketDepth = {
            bids,
            asks,
            totalBuyQty: _f(raw.TotalBQty),
            totalSellQty: _f(raw.TotalSQty),
            date: raw.dttm || '',
          };
        }
      } catch (e) { console.error(`[BSE MarketDepth ${code}]`, e.message); }
    }

    res.json({
      code,
      quote,
      financials,
      bulkDeals,
      shareholding,
      holding,
      corporateActions,
      analystTargets,
      quoteData,
      performance,
      companyNews,
      marketDepth
    });
  } catch (e) {
    console.error('[BSE Company]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: BSE market overview (Sensex, advances/declines, turnover) ───────────
router.get('/market', async (req, res) => {
  try {
    const [turnoverR, sensexR, indexR] = await Promise.allSettled([
      bseGet(`/MktTurnoverData/w`, {}, 10000),
      bseGet(`/getScripHeaderData/w`, { Debtflag: '', scripcode: '1', seriesid: 'EQ' }, 8000),
      bseGet(`/getIndexData/w`, { Indicescode: '16', seriesid: '' }, 8000),
    ]);

    const _f = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) || n === 0 ? null : n; };
    const _i = (v) => { const n = parseInt(String(v ?? '').replace(/,/g, ''), 10); return isNaN(n) || n === 0 ? null : n; };

    let market = { sensex: null, sensexChg: null, sensexPct: null, advances: null, declines: null, unchanged: null, turnover: null, fetchedAt: new Date().toISOString() };

    if (turnoverR.status === 'fulfilled') {
      const raw = turnoverR.value;
      const rows = Array.isArray(raw) ? raw : (raw?.Table || raw?.Table1 || raw?.table || []);
      if (rows.length > 0) {
        const r = rows[0];
        market.advances  = _i(r.Advances   || r.ADVANCES   || r.advances   || r.Adv  || r.ADV);
        market.declines  = _i(r.Declines   || r.DECLINES   || r.declines   || r.Dec  || r.DEC);
        market.unchanged = _i(r.Unchanged  || r.UNCHANGED  || r.unchanged  || r.Unch || r.UNCH);
        market.turnover  = _f(r.Turnover   || r.TURNOVER   || r.turnover   || r.TotalTurnover);
        if (!market.sensex) {
          market.sensex    = _f(r.Sensex    || r.SENSEX     || r.IndexValue || r.CurrVal || r.LTP);
          market.sensexChg = _f(r.SensexChg || r.SENSEX_CHG || r.Change    || r.NetChg);
          market.sensexPct = _f(r.SensexPct || r.SENSEX_PCT || r.PctChange || r.PerChange);
        }
      }
    }

    if (sensexR.status === 'fulfilled' && !market.sensex) {
      const d = sensexR.value;
      const h = (d?.Header || (Array.isArray(d?.ScripHeaderData) && d.ScripHeaderData[0])
               || (Array.isArray(d?.Table) && d.Table[0]) || (Array.isArray(d) && d[0]) || d) || {};
      market.sensex    = _f(h.LTP || h.CurrRate || h.CURRENT_VALUE || h.Close);
      market.sensexChg = _f(h.Change || h.NetChange || h.change);
      market.sensexPct = _f(h.PerChange || h.PctChange || h.perChange);
    }

    if (indexR.status === 'fulfilled' && !market.sensex) {
      const d = indexR.value;
      const r = (Array.isArray(d) ? d[0] : null) || d?.Table?.[0] || d;
      if (r) {
        market.sensex    = _f(r.CurrVal   || r.LTP       || r.close     || r.Close);
        market.sensexChg = _f(r.NetChg    || r.Change    || r.change);
        market.sensexPct = _f(r.PerChange || r.PctChange || r.perChange);
      }
    }

    res.json(market);
  } catch (e) {
    console.error('[BSE Market]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OPEN: BSE bulk/block deals ────────────────────────────────────────────────
router.get('/deals', async (req, res) => {
  const { from, to, dealType = 'both' } = req.query;
  if (!from) return res.status(400).json({ error: 'from date required (YYYYMMDD)' });
  const toDate = to || from;
  const fmtDate = (s) => `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)}`;

  try {
    const types     = dealType === 'both' ? [1, 2] : [Number(dealType)];
    const typeLabel = { 1: 'Bulk', 2: 'Block' };
    const allDeals  = [];
    const cookies   = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    for (const dt of types) {
      let items = [];
      try {
        const data = await bseGet(
          '/BulkDealData_ng/w',
          { DealType: dt, sc_code: '', FDate: fmtDate(from), TDate: fmtDate(toDate) },
          15000,
          sessionHdr
        );
        items = (data && Array.isArray(data.Table)) ? data.Table : [];
      } catch (err) {
        console.warn(`[BSE Deals API dt=${dt}]`, err.message);
        items = [];
      }

      for (const i of items) {
        const qty   = i.QUANTITY != null ? Number(i.QUANTITY) : null;
        const price = i.PRICE    != null ? Number(i.PRICE)    : null;
        allDeals.push({
          dealType:        typeLabel[dt],
          dealDate:        (i.DEAL_DATE || '').slice(0, 10),
          bseCode:         String(i.SCRIP_CODE || '').trim(),
          scripname:       (i.scripname    || i.SCRIP_NAME || '').trim(),
          clientName:      (i.CLIENT_NAME  || '').trim(),
          transactionType: i.TRANSACTION_TYPE === 'P' || i.TRANSACTION_TYPE === 'B' ? 'Buy' : i.TRANSACTION_TYPE === 'S' ? 'Sell' : (i.TRANSACTION_TYPE || ''),
          transactionCode: (i.TRANSACTION_TYPE || '').trim(),
          quantity:        qty,
          price:           price,
          valueCr:         qty && price ? Math.round(qty * price / 1e5) / 100 : null,
        });
      }
    }

    // If API returned 0 deals, try scraping ASPX page as fallback
    if (allDeals.length === 0) {
      try {
        const aspxDeals = await scrapeBseBulkDealsAspx();
        if (aspxDeals.length > 0) {
          allDeals.push(...aspxDeals);
        }
      } catch (err) {
        console.warn('[BSE Deals ASPX Fallback Error]', err.message);
      }
    }

    res.json({ from, to: toDate, deals: allDeals, total: allDeals.length });
  } catch (e) {
    console.error('[BSE Deals]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PROTECTED: All BSE announcements for a date range ─────────────────────────
router.get('/announcements', verifyToken, async (req, res) => {
  const { from, to, cat, subcat } = req.query;
  if (!from) return res.status(400).json({ error: 'from date required (YYYYMMDD)' });
  const toDate = to || from;

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    function tradingDays(fromStr, toStr) {
      const days = [];
      const cur = new Date(`${fromStr.slice(0,4)}-${fromStr.slice(4,6)}-${fromStr.slice(6,8)}`);
      const end = new Date(`${toStr.slice(0,4)}-${toStr.slice(4,6)}-${toStr.slice(6,8)}`);
      while (cur <= end) {
        // Announcements can happen on weekends (e.g. Board meetings on Saturday)
        days.push(`${cur.getFullYear()}${String(cur.getMonth()+1).padStart(2,'0')}${String(cur.getDate()).padStart(2,'0')}`);
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    }

    async function fetchPage(dateStr, pageNo) {
      const data = await bseGet(
        '/AnnSubCategoryGetData/w',
        { pageno: pageNo, strCat: -1, strPrevDate: dateStr, strScrip: '', strSearch: 'P', strToDate: dateStr, strType: 'C', subcategory: -1 },
        15000,
        sessionHdr
      );
      const items = (data && Array.isArray(data.Table))  ? data.Table  : [];
      const cnt   = (data && Array.isArray(data.Table1)) ? (data.Table1[0]?.ROWCNT || 0) : 0;
      return { items, total: Number(cnt) };
    }

    const days = tradingDays(from, toDate);
    const allItems = [];

    for (const day of days) {
      const { items: p1, total } = await fetchPage(day, 1);
      if (!p1.length) continue;
      allItems.push(...p1);
      const pages = Math.ceil(total / (p1.length || 1));
      if (pages > 1) {
        const rest = Array.from({ length: pages - 1 }, (_, i) => fetchPage(day, i + 2));
        const settled = await Promise.allSettled(rest);
        for (const r of settled) {
          if (r.status === 'fulfilled') allItems.push(...r.value.items);
        }
      }
    }

    const normalised = allItems.map((i) => {
      const dtRaw   = (i.NEWS_DT || i.DT_TM || '');
      const m       = dtRaw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
      const isoDate = m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : dtRaw;
      const category    = (i.CATEGORYNAME    || '').trim();
      const subCategory = (i.SUBCATEGORYNAME || '').trim();
      return {
        id:          String(i.NEWSID    || ''),
        exchange:    'BSE',
        bseCode:     String(i.SCRIP_CD  || '').trim(),
        scriptName:  (i.SLONGNAME       || '').trim(),
        nseSymbol:   (i.NSE_SYMBOL      || '').trim(),
        category:    subCategory ? `${category} / ${subCategory}` : category,
        subCategory,
        subject:     (i.NEWSSUB         || '').trim(),
        announcementDate: isoDate,
        datetimeIST: dtRaw,
        pdfUrl:      i.ATTACHMENTNAME
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${i.ATTACHMENTNAME}`
          : null,
        sourceUrl:   `https://www.bseindia.com/corporates/ann.html?scripcd=${i.SCRIP_CD || ''}`,
        critical:    !!(i.CRITICALNEWS),
      };
    });

    let filtered = normalised;
    if (cat && cat !== 'all') filtered = filtered.filter((a) => a.category.toLowerCase().includes(cat.toLowerCase()));
    if (subcat && subcat !== 'all') filtered = filtered.filter((a) => a.subCategory.toLowerCase().includes(subcat.toLowerCase()));

    res.json({ from, to: toDate, total: filtered.length, rawTotal: normalised.length, announcements: filtered });
  } catch (e) {
    console.error('[BSE Announcements]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/companynews', async (req, res) => {
  const code = sanitizeCode(req.query.code);
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const raw = await bseGet(
      '/TabResults_PAR/w',
      { scripcode: code, tabtype: 'NEWS' },
      12000
    );
    let items = [];
    if (Array.isArray(raw)) items = raw;
    else if (typeof raw === 'string') { try { items = JSON.parse(raw); } catch {} }
    if (!Array.isArray(items)) items = [];

    const normalized = items.map((n) => ({
      id:      n.Newsid || n.newsid || n.NewsId,
      subject: (n.NewsSubj || n.newssubj || n.Subject || '').trim(),
      date:    n.Newsdt  || n.newsdt  || n.Date || '',
      pdfUrl:  n.Newsid ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${n.Newsid}.pdf` : null,
      bseUrl:  n.Newsid ? `https://www.bseindia.com/corporates/ann.html?Newsid=${n.Newsid}` : null,
    })).filter((n) => n.id && n.subject);

    res.json({ items: normalized, total: normalized.length, bseCode: code });
  } catch (e) {
    console.error(`[BSE CompanyNews ${code}]`, e.message);
    res.status(500).json({ error: e.message });
  }
});


router.get('/agm-updates', verifyToken, async (req, res) => {
  const { fromDT, ToDt } = req.query;
  
  // Format dates: API expects YYYYMMDD
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  
  const getYYYYMMDD = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  let defaultFrom = getYYYYMMDD(today);
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  let defaultTo = getYYYYMMDD(nextMonth);

  const fromVal = fromDT || defaultFrom;
  const toVal = ToDt || defaultTo;

  const params = {
    SCRIPCODE: '',
    fromDT: fromVal,
    ToDt: toVal,
    purposeCode: '',
    IsCanRev: '',
    IsSubCode: ''
  };

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    let data = null;
    try {
      data = await bseGet(
        '/GetForthBoardMeeting/w',
        params,
        15000,
        sessionHdr
      );
    } catch (err) {
      console.warn('[BSE AGMUpdates GetForthBoardMeeting error]', err.message);
    }
    
    let table = data?.Table || (Array.isArray(data) ? data : []);

    // Fallback 1 if empty: Try Corp_Fetch_BoardMeeting_With_Filter_ng/w
    if (table.length === 0) {
      try {
        const toDDMMYYYY = (dStr) => {
          if (!dStr || dStr.length !== 8) return '';
          return `${dStr.slice(6,8)}/${dStr.slice(4,6)}/${dStr.slice(0,4)}`;
        };
        const altData = await bseGet(
          '/Corp_Fetch_BoardMeeting_With_Filter_ng/w',
          {
            SCRIPCODE: '',
            fromDT: toDDMMYYYY(fromVal),
            ToDt: toDDMMYYYY(toVal),
            purposeCode: '',
            IsCanRev: '0',
            FLAGDUR: '0',
            ISUBGROUP_CODE: ' ',
            LnFlag: 'en'
          },
          15000,
          sessionHdr
        );
        const altRows = altData?.Corp_fetch_BoardMeeting_Table1 || [];
        if (altRows.length > 0) {
          table = altRows.map(r => ({
            scrip_code: r.scrip_code || '',
            Short_name: r.SHORT_NAME || r.scripname || '',
            Long_Name: r.Long_Name || r.SHORT_NAME || '',
            Industry_name: r.Industry_name || '',
            PURPOSE_NAME: r.PURPOSE_NAME || '',
            MEETING_DATE: r.MEETING_DATE || '',
            URL: r.URL || '',
            DT_TM: r.DT_TM || ''
          }));
        }
      } catch (err) {
        console.warn('[BSE AGMUpdates Fallback error]', err.message);
      }
    }

    // Fallback 2: Direct ASPX Scraper
    if (table.length === 0) {
      try {
        const aspxRows = await scrapeBseBoardMeetingsAspx();
        if (aspxRows.length > 0) {
          table = aspxRows.map(r => ({
            scrip_code: r.scrip_code || '',
            Short_name: r.SHORT_NAME || '',
            Long_Name: r.Long_Name || r.SHORT_NAME || '',
            Industry_name: r.Industry_name || '',
            PURPOSE_NAME: r.PURPOSE_NAME || '',
            MEETING_DATE: r.MEETING_DATE || '',
            URL: r.URL || '',
            DT_TM: ''
          }));
        }
      } catch (err) {
        console.warn('[BSE AGMUpdates ASPX Fallback error]', err.message);
      }
    }

    res.json({ Table: table });
  } catch (e) {
    console.error(`[BSE AGMUpdates]`, e.message);
    res.json({ Table: [] });
  }
});


router.get('/board-meetings', verifyToken, async (req, res) => {
  const { fromDT, ToDt } = req.query;
  
  // Format dates: API expects DD/MM/YYYY
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const defaultDate = `${dd}/${mm}/${yyyy}`;

  const fromVal = fromDT || defaultDate;
  const toVal = ToDt || defaultDate;

  const params = {
    SCRIPCODE: '',
    fromDT: fromVal,
    ToDt: toVal,
    purposeCode: '',
    IsCanRev: '0',
    FLAGDUR: '0',
    ISUBGROUP_CODE: ' ',
    LnFlag: 'en'
  };

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    let data = null;
    try {
      data = await bseGet(
        '/Corp_Fetch_BoardMeeting_With_Filter_ng/w',
        params,
        15000,
        sessionHdr
      );
    } catch (err) {
      console.warn('[BSE Board Meetings API error]', err.message);
    }
    
    let list = (data && Array.isArray(data.Corp_fetch_BoardMeeting_Table1)) ? data.Corp_fetch_BoardMeeting_Table1 : [];

    // Fallback 1: Try GetForthBoardMeeting/w with YYYYMMDD dates
    if (list.length === 0) {
      try {
        const toYYYYMMDD = (dStr) => {
          if (!dStr) return '';
          const parts = dStr.split('/');
          if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
          return dStr.replace(/[^0-9]/g, '');
        };
        const altData = await bseGet(
          '/GetForthBoardMeeting/w',
          { SCRIPCODE: '', fromDT: toYYYYMMDD(fromVal), ToDt: toYYYYMMDD(toVal), purposeCode: '', IsCanRev: '', IsSubCode: '' },
          15000,
          sessionHdr
        );
        const altRows = altData?.Table || (Array.isArray(altData) ? altData : []);
        if (altRows.length > 0) {
          list = altRows.map(r => ({
            scrip_code: String(r.scrip_code || r.ScripCode || ''),
            SHORT_NAME: r.Short_name || r.SHORT_NAME || r.scripname || '',
            Long_Name: r.Long_Name || r.LongName || r.SHORT_NAME || '',
            Industry_name: r.Industry_name || r.Industry || '',
            PURPOSE_NAME: r.PURPOSE_NAME || r.Purpose || '',
            MEETING_DATE: r.MEETING_DATE || r.MeetingDate || '',
            MEETING_BOARD_DATE: r.MEETING_BOARD_DATE || r.MEETING_DATE || '',
            URL: r.URL || (r.scrip_code ? `https://www.bseindia.com/stock-share-price/${r.scrip_code}/` : ''),
            DT_TM: r.DT_TM || ''
          }));
        }
      } catch (err) {
        console.warn('[BSE Board Meetings Fallback 1 error]', err.message);
      }
    }

    // Fallback 2: Try ASPX scraping
    if (list.length === 0) {
      try {
        const aspxRows = await scrapeBseBoardMeetingsAspx();
        if (aspxRows.length > 0) {
          list = aspxRows;
        }
      } catch (err) {
        console.warn('[BSE Board Meetings ASPX fallback error]', err.message);
      }
    }

    res.json({ Corp_fetch_BoardMeeting_Table1: list });
  } catch (e) {
    console.error('[BSE Board Meetings]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PROTECTED: BSE Top Gainers/Losers ─────────────────────────────────────────
router.get('/gainers-losers', verifyToken, async (req, res) => {
  const { GLtype = 'gainer', IndxGrp = 'AllMkt', IndxGrpval = 'AllMkt', orderby = 'all' } = req.query;
  
  const params = {
    GLtype,
    IndxGrp,
    IndxGrpval,
    orderby
  };

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};

    let data = null;
    try {
      data = await bseGet(
        '/MktRGainerLoserDataeqto/w',
        params,
        15000,
        sessionHdr
      );
    } catch (err) {
      console.warn('[BSE Gainers/Losers primary error]', err.message);
    }
    
    let table = data?.Table || (Array.isArray(data) ? data : []);
    
    // Fallback: If BSE API returns 403 or empty, fetch from NSE and map to BSE Table format
    if (table.length === 0) {
      try {
        const nseType = GLtype === 'loser' ? 'loser' : 'gainer';
        const nseResult = await getNseGainersLosers(nseType, 'allSec');
        const nseRows = nseResult?.data || [];
        if (nseRows.length > 0) {
          table = nseRows.map(r => ({
            scrip_cd: r.symbol,
            LONG_NAME: r.symbol,
            scripname: r.symbol,
            scrip_grp: 'A',
            ltradert: r.ltp,
            change_val: r.percentChange ? +((r.ltp * r.percentChange / 100).toFixed(2)) : 0,
            change_percent: r.percentChange,
            trd_vol: r.volume,
            URL: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(r.symbol)}`
          }));
        }
      } catch (nseErr) {
        console.warn('[BSE Gainers/Losers NSE fallback error]', nseErr.message);
      }
    }

    res.json({ Table: table });
  } catch (e) {
    console.error('[BSE Gainers/Losers]', e.message);
    res.json({ Table: [] });
  }
});

router.get('/quote', async (req, res) => {
  const codes = (req.query.codes || '').split(',')
    .map(c => sanitizeCode(c)).filter(Boolean).slice(0, 50);
  if (!codes.length) return res.status(400).json({ error: 'codes required' });

  const _f = (v) => {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return isNaN(n) || n === 0 ? null : n;
  };

  const now     = Date.now();
  const quotes  = {};
  const toFetch = [];

  for (const code of codes) {
    const hit = _qCache.get(code);
    if (hit && now < hit.exp) { quotes[code] = hit.data; }
    else                      { toFetch.push(code); }
  }

  if (toFetch.length > 0) {
    const results = await Promise.allSettled(
      toFetch.map(code =>
        bseGet('/getScripHeaderData/w',
          { Debtflag: '', scripcode: code, seriesid: '' }, 10000)
      )
    );
    results.forEach((r, i) => {
      const code = toFetch[i];
      if (r.status === 'fulfilled') {
        const d = r.value;
        const h = (d && typeof d === 'object')
          ? (d.Header
            || (Array.isArray(d.ScripHeaderData) && d.ScripHeaderData[0])
            || (Array.isArray(d.Table) && d.Table[0])
            || (Array.isArray(d) && d[0])
            || d)
          : {};
        const ltp  = _f(h.LTP       || h.CurrRate  || h.CURRENT_VALUE);
        const prev = _f(h.PrevClose || h.Prevclose || h.PREV_CLOSE);
        const q = {
          ltp,
          prevClose:  prev,
          open:       _f(h.Open  || h.OPEN),
          high:       _f(h.High  || h.HIGH),
          low:        _f(h.Low   || h.LOW),
          volume:     _f(h.TotalTradedQuantity || h.Volume || h.VOLUME),
          turnover:   _f(h.TotalTradedValue || h.Turnover || h.TURNOVER),
          change:     ltp && prev ? +((ltp - prev).toFixed(2))              : null,
          pctChange:  ltp && prev ? +(((ltp - prev) / prev * 100).toFixed(2)) : null,
        };
        quotes[code] = q;
        _qCache.set(code, { data: q, exp: now + QUOTE_TTL });
      } else {
        quotes[code] = null;
      }
    });
  }

  res.json({ quotes, fetched: codes.length, cached: codes.length - toFetch.length });
});

router.get('/calendar', async (req, res) => {
  const now2  = new Date();
  const yy    = now2.getFullYear();
  const mm    = String(now2.getMonth() + 1).padStart(2, '0');
  const lastD = new Date(yy, now2.getMonth() + 1, 0).getDate();
  const fromDate = req.query.from || `${yy}${mm}01`;
  const toDate   = req.query.to   || `${yy}${mm}${String(lastD).padStart(2, '0')}`;

  const cacheKey = `${fromDate}|${toDate}`;
  if (!req.query.bust) {
    const cached = _calCache.get(cacheKey);
    if (cached && Date.now() < cached.exp) return res.json(cached.data);
  }

  const toDDMMYYYY = (s) => `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)}`;

  const MN = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
               Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
  function parseDate(s) {
    if (!s) return '';
    s = String(s).trim();
    const m1 = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
    if (m1) return `${m1[3]}-${MN[m1[2]] || '00'}-${m1[1].padStart(2,'0')}`;
    const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return '';
  }

  function getCategory(purpose) {
    if (!purpose) return 'Board Meeting';
    const p = purpose.toLowerCase();
    if (p.includes('dividend'))                         return 'Dividend';
    if (p.includes('bonus'))                            return 'Bonus';
    if (p.includes('split') || p.includes('sub-divis')) return 'Stock Split';
    if (p.includes('rights') || p.includes('right issue')) return 'Rights Issue';
    if (p.includes('buyback') || p.includes('buy back'))  return 'Buyback';
    if (p.includes('agm') || p.includes('annual general')) return 'AGM';
    return 'Board Meeting';
  }

  try {
    const fromDD = toDDMMYYYY(fromDate);
    const toDD   = toDDMMYYYY(toDate);

    const [boardR, corpR] = await Promise.allSettled([
      bseGet('/Corp_Fetch_BoardMeeting_With_Filter_ng/w',
        { SCRIPCODE: '', fromDT: fromDD, ToDt: toDD, purposeCode: '',
          IsCanRev: 0, FLAGDUR: 0, ISUBGROUP_CODE: ' ', LnFlag: 'en' }, 20000),
      bseGet('/DefaultData/w',
        { scripcode: '', Fdate: fromDate, Purposecode: '', TDate: toDate,
          ddlcategorys: 'E', ddlindustrys: '', segment: 0, strSearch: 'S' }, 20000),
    ]);

    const boardRows = boardR.status === 'fulfilled'
      ? (boardR.value?.Corp_fetch_BoardMeeting_Table1 || []) : [];
    const corpRows  = corpR.status  === 'fulfilled'  && Array.isArray(corpR.value)
      ? corpR.value : [];

    const events = [];
    const seen   = new Set();

    for (const r of boardRows) {
      const bseCode  = String(r.scrip_code || '').trim();
      const company  = (r.Long_Name  || r.SHORT_NAME || '').trim();
      const purpose  = (r.PURPOSE_NAME || '').trim();
      const exDate   = parseDate(r.MEETING_BOARD_DATE || r.MEETING_DATE || '');
      const category = getCategory(purpose);
      const key = `B|${bseCode}|${exDate}|${purpose.slice(0,25)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        bseCode, company, category, purpose, exDate,
        recDate: '', bcStart: '', bcEnd: '',
        bseUrl: r.URL || null,
        industry: r.Industry_name || '',
        source: 'board',
      });
    }

    for (const r of corpRows) {
      const bseCode  = String(r.scrip_code || '').trim();
      const company  = (r.long_name  || r.short_name || '').trim();
      const purpose  = (r.Purpose    || '').trim();
      const exDate   = r.exdate ? parseDate(String(r.exdate)) : parseDate(r.Ex_date || '');
      const recDate  = parseDate(r.RD_Date   || '');
      const bcStart  = parseDate(r.BCRD_FROM || '');
      const bcEnd    = parseDate(r.BCRD_TO   || '');
      const ndStart  = parseDate(r.ND_START_DATE || '');
      const ndEnd    = parseDate(r.ND_END_DATE   || '');
      const payDate  = parseDate(r.payment_date  || '');
      const category = getCategory(purpose);
      const key = `C|${bseCode}|${exDate}|${purpose.slice(0,25)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        bseCode, company, category, purpose, exDate, recDate, bcStart, bcEnd,
        ndStart, ndEnd, payDate,
        bseUrl: null, industry: '', source: 'corp',
      });
    }

    // Fallback: If 0 events found, scrape forthcoming meetings from BSE ASPX
    if (events.length === 0) {
      try {
        const aspxRows = await scrapeBseBoardMeetingsAspx();
        for (const r of aspxRows) {
          const bseCode  = String(r.scrip_code || '').trim();
          const company  = (r.Long_Name  || r.SHORT_NAME || '').trim();
          const purpose  = (r.PURPOSE_NAME || '').trim();
          const exDate   = parseDate(r.MEETING_DATE || '');
          const category = getCategory(purpose);
          const key = `ASPX|${bseCode}|${exDate}|${purpose.slice(0,25)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          events.push({
            bseCode, company, category, purpose, exDate,
            recDate: '', bcStart: '', bcEnd: '',
            bseUrl: r.URL || null,
            industry: r.Industry_name || '',
            source: 'board',
          });
        }
      } catch (err) {
        console.warn('[BSE Calendar ASPX fallback error]', err.message);
      }
    }

    events.sort((a, b) => (a.exDate || '9999').localeCompare(b.exDate || '9999'));

    const data = { from: fromDate, to: toDate, events, total: events.length };
    _calCache.set(cacheKey, { data, exp: Date.now() + CAL_TTL });
    if (_calCache.size > 50) { const t = Date.now(); for (const [k, v] of _calCache) if (t > v.exp) _calCache.delete(k); }
    res.json(data);
  } catch (e) {
    console.error('[BSE Calendar]', e.message);
    res.json({ from: fromDate, to: toDate, events: [], total: 0 });
  }
});

// ── OPEN: BSE Insider Trading CSV Download ─────────────────────────────────
router.get('/insider/download', async (req, res) => {
  const code = sanitizeCode(req.query.code || '');
  const from = req.query.from || ''; // YYYYMMDD, DD/MM/YYYY or empty
  const to   = req.query.to   || ''; // YYYYMMDD, DD/MM/YYYY or empty

  const toDDMMYYYY = (dStr) => {
    if (!dStr) return '';
    if (dStr.includes('/')) return dStr;
    if (dStr.length === 8) return `${dStr.slice(6,8)}/${dStr.slice(4,6)}/${dStr.slice(0,4)}`;
    return dStr;
  };

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};
    const isDefaultParam = (from || to || code) ? 2 : 1;

    let csvData = null;
    try {
      csvData = await bseGet('/Corp_Regulation_DownloadCSV_ng/w', {
        scripCode: code,
        Regulation: '',
        fromDT: toDDMMYYYY(from),
        ToDate: toDDMMYYYY(to),
        Isdefault: isDefaultParam,
      }, 15000, sessionHdr);
    } catch (err) {
      console.warn('[BSE Insider CSV primary error]', err.message);
    }

    // Fallback: If filtered request returns empty or header-only CSV, try default latest
    if (isDefaultParam === 2 && (!csvData || typeof csvData !== 'string' || csvData.trim().split('\n').length <= 1)) {
      try {
        const fallbackCsv = await bseGet('/Corp_Regulation_DownloadCSV_ng/w', {
          scripCode: '',
          Regulation: '',
          fromDT: '',
          ToDate: '',
          Isdefault: 1,
        }, 15000, sessionHdr);
        if (fallbackCsv && typeof fallbackCsv === 'string' && fallbackCsv.trim().split('\n').length > 1) {
          csvData = fallbackCsv;
        }
      } catch (err) {
        console.warn('[BSE Insider CSV fallback error]', err.message);
      }
    }

    const dateSuffix = (from && to) ? `${from}_to_${to}` : 'Latest';
    const outFilename = `Tatvarth_Insider_Trading_${code ? code + '_' : ''}${dateSuffix}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
    return res.send(csvData || 'Scrip Code,Company Name,Promoter Name,Category,Transaction Type,Mode,Security Type,Quantity,Value,Pre Shareholding,Post Shareholding,Intimation Date,From Date,To Date\n');
  } catch (e) {
    console.error('[BSE Insider CSV Download Error]', e.message);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Tatvarth_Insider_Trading.csv"');
    res.send('Scrip Code,Company Name,Promoter Name,Category,Transaction Type,Mode,Security Type,Quantity,Value,Pre Shareholding,Post Shareholding,Intimation Date,From Date,To Date\n');
  }
});

// ── OPEN: BSE Insider Trading ────────────────────────────────────────────────
router.get('/insider', async (req, res) => {
  const code = sanitizeCode(req.query.code || '');
  const from = req.query.from || ''; // YYYYMMDD, DD/MM/YYYY or empty
  const to   = req.query.to   || ''; // YYYYMMDD, DD/MM/YYYY or empty
  
  res.setHeader('Cache-Control', 'no-store');

  const toDDMMYYYY = (dStr) => {
    if (!dStr) return '';
    if (dStr.includes('/')) return dStr;
    if (dStr.length === 8) return `${dStr.slice(6,8)}/${dStr.slice(4,6)}/${dStr.slice(0,4)}`;
    return dStr;
  };

  try {
    const cookies = await getBseCookies();
    const sessionHdr = cookies ? { Cookie: cookies } : {};
    const isDefaultParam = (from || to || code) ? 2 : 1;
    let fallbackApplied = false;

    let raw = null;
    try {
      raw = await bseGet('/getCorp_Regulation_ng/w', {
        scripCode: code,
        Regulation: '',
        fromDT: toDDMMYYYY(from),
        ToDate: toDDMMYYYY(to),
        Isdefault: isDefaultParam,
      }, 15000, sessionHdr);
    } catch (err) {
      console.warn('[BSE Insider primary error]', err.message);
    }
    
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch {}
    }

    let rows = (raw && Array.isArray(raw.Table)) ? raw.Table
      : (raw && Array.isArray(raw.data)) ? raw.data
      : (raw && Array.isArray(raw.Table1)) ? raw.Table1
      : (Array.isArray(raw) ? raw : []);
    
    // Fallback: If filtered request returned 0 items, fetch default latest items with flag
    if (rows.length === 0 && isDefaultParam === 2) {
      try {
        let fallbackRaw = await bseGet('/getCorp_Regulation_ng/w', {
          scripCode: '',
          Regulation: '',
          fromDT: '',
          ToDate: '',
          Isdefault: 1,
        }, 15000, sessionHdr);
        
        if (typeof fallbackRaw === 'string') {
          try { fallbackRaw = JSON.parse(fallbackRaw); } catch {}
        }
        
        const fallbackRows = (fallbackRaw && Array.isArray(fallbackRaw.Table)) ? fallbackRaw.Table
          : (fallbackRaw && Array.isArray(fallbackRaw.data)) ? fallbackRaw.data
          : (fallbackRaw && Array.isArray(fallbackRaw.Table1)) ? fallbackRaw.Table1
          : (Array.isArray(fallbackRaw) ? fallbackRaw : []);
        
        if (fallbackRows.length > 0) {
          rows = fallbackRows;
          fallbackApplied = true;
        }
      } catch (err) {
        console.warn('[BSE Insider fallback error]', err.message);
      }
    }

    let normalized = rows.map(r => ({
      bseCode: String(r.Fld_ScripCode || ''),
      companyName: (r.Companyname || '').trim(),
      promoterName: (r.Fld_PromoterName || '').trim(),
      category: (r.Fld_PersonCatgName || '').trim(),
      transactionType: (r.Fld_TransactionType || '').trim(),
      mode: (r.ModeOfAquisation || '').trim(),
      securityType: (r.Fld_SecurityTypeName || '').trim(),
      securityNo: parseInt(r.Fld_SecurityNo, 10) || 0,
      securityValue: parseFloat(r.Fld_SecurityValue) || 0,
      preShareholding: parseFloat(r.Fld_PercentofShareholdingPre) || 0,
      postShareholding: parseFloat(r.Fld_PercentofShareholdingPost) || 0,
      dateIntimation: (r.Fld_DateIntimation || '').slice(0, 10),
      fromDate: (r.Fld_FromDate || '').slice(0, 10),
      toDate: (r.Fld_ToDate || '').slice(0, 10),
      xbrlUrl: r.xbrlurl ? `https://www.bseindia.com${r.xbrlurl}` : null,
    }));

    if (normalized.length > 0) {
      _insiderCache = normalized;
      _insiderCacheExp = Date.now() + INSIDER_TTL;
    } else if (_insiderCache && Date.now() < _insiderCacheExp) {
      normalized = _insiderCache;
      fallbackApplied = true;
    }
    
    res.json({ from, to, code, total: normalized.length, insiderTrades: normalized, fallbackApplied });
  } catch (e) {
    console.error('[BSE Insider]', e.message);
    const cachedTrades = (_insiderCache && Date.now() < _insiderCacheExp) ? _insiderCache : [];
    res.json({ from, to, code, total: cachedTrades.length, insiderTrades: cachedTrades, fallbackApplied: true });
  }
});

// ── OPEN: BSE Announcements Proxy ─────────────────────────────────────────────
router.get('/announcements/proxy', async (req, res) => {
  const { scripCode, fromDate, toDate } = req.query;
  try {
    const { fetchBSEAnnouncements } = require('../lib/bseScraper');
    // For Vercel Edge caching - cache this specific query for 60 seconds
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    
    const data = await fetchBSEAnnouncements(scripCode || '', fromDate || '', toDate || '');
    res.json({ data, total: data.length });
  } catch (e) {
    console.error('[BSE Announcements Proxy]', e.message);
    res.status(500).json({ error: e.message });
  }
});

  return router;
};
