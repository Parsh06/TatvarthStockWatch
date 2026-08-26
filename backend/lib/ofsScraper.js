'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

// In-memory live cache & snapshot
let _ofsListCache = { data: null, fetchedAt: 0, stale: false, consecutiveFailures: 0 };
const _ofsDetailCache = new Map(); // slug -> { data, fetchedAt }

const CACHE_TTL_MS = 60 * 1000; // 1 minute (60,000ms)
let _pollerTimer = null;

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.ipoguru.in/'
};

function parseNumber(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/,/g, '').trim();
  const val = parseInt(cleaned, 10);
  return isNaN(val) ? 0 : val;
}

function getISTDateString() {
  const now = new Date();
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  return new Date(istMs).toISOString().slice(0, 10);
}

/**
 * Returns the latest in-memory snapshot synchronously (Volume Spurt contract).
 * Returns null if the poller has not completed its first successful fetch.
 */
function getLatestOfs() {
  return _ofsListCache.data;
}

/**
 * Scrapes live & upcoming OFS issues from https://www.ipoguru.in/ofs
 * Pre-fetches detail bid books for active OPEN issues automatically.
 */
async function fetchOfsList(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!forceRefresh && _ofsListCache.data && (now - _ofsListCache.fetchedAt) < CACHE_TTL_MS) {
    return _ofsListCache.data;
  }

  try {
    const res = await axios.get('https://www.ipoguru.in/ofs', {
      headers: AXIOS_HEADERS,
      timeout: 10000
    });

    const $ = cheerio.load(res.data);
    const ofsItems = [];
    const todayIST = getISTDateString();

    $('table tbody tr').each((_, element) => {
      const $row = $(element);
      const cells = $row.find('td');

      if (cells.length >= 6) {
        const scriptP = cells.eq(0).find('p.font-bold').text().trim() || cells.eq(0).find('p').first().text().trim();
        const fullTextCol0 = cells.eq(0).text().trim().replace(/\s+/g, ' ');
        const companyP = cells.eq(0).find('p.text-xs').text().trim() || fullTextCol0.replace(scriptP, '').trim();

        const offerDate = cells.eq(1).text().trim();
        const category = cells.eq(2).text().trim();
        const offeredSharesStr = cells.eq(3).text().trim();
        const subscriptionStr = cells.eq(4).text().trim();
        const cutoffStr = cells.eq(5).text().trim();
        const href = cells.eq(6).find('a').attr('href') || $row.find('a').attr('href') || '';

        let slug = '';
        if (href) {
          const parts = href.split('/ofs/');
          if (parts.length > 1) {
            slug = parts[1].replace(/\/$/, '');
          }
        }

        let status = 'CLOSED';
        if (offerDate === todayIST) {
          status = 'OPEN';
        } else if (offerDate > todayIST) {
          status = 'UPCOMING';
        } else if (offerDate < todayIST) {
          status = 'CLOSED';
        }

        const scriptName = scriptP || 'OFS Issue';

        ofsItems.push({
          id: slug || `${scriptName.toLowerCase().replace(/\s+/g, '-')}-${category.toLowerCase()}-${offerDate}`,
          scriptName,
          companyName: companyP || scriptName,
          offerDate,
          category: category || 'Retail',
          sharesOffered: offeredSharesStr !== '—' ? offeredSharesStr : 'N/A',
          sharesOfferedNum: parseNumber(offeredSharesStr),
          subscription: subscriptionStr !== '—' ? subscriptionStr : 'N/A',
          cutoffPrice: cutoffStr !== '—' ? cutoffStr : 'N/A',
          status,
          statusRaw: status === 'OPEN' ? 'Open Today' : (status === 'UPCOMING' ? 'Upcoming' : 'Closed'),
          slug,
          detailUrl: href.startsWith('http') ? href : (href ? `https://www.ipoguru.in${href}` : '')
        });
      }
    });

    const payload = {
      scrapedAt: new Date().toISOString(),
      total: ofsItems.length,
      stale: false,
      consecutiveFailures: 0,
      data: ofsItems
    };

    _ofsListCache = { data: payload, fetchedAt: now };

    // Asynchronously pre-fetch bid books for active OPEN/UPCOMING issues in background
    const activeSlugs = ofsItems.filter(i => (i.status === 'OPEN' || i.status === 'UPCOMING') && i.slug).map(i => i.slug);
    Promise.allSettled(activeSlugs.map(slug => fetchOfsDetail(slug, { forceRefresh: true }))).catch(() => {});

    return payload;

  } catch (err) {
    console.error('[OFS Scraper Error]', err.message);
    if (_ofsListCache.data) {
      _ofsListCache.data.stale = true;
      _ofsListCache.data.consecutiveFailures = (_ofsListCache.data.consecutiveFailures || 0) + 1;
      return _ofsListCache.data; // Serve stale cache on network failure
    }
    throw new Error(`Failed to scrape OFS data: ${err.message}`);
  }
}

/**
 * Scrapes specific OFS detail page for Cut-off Price & Live Combined NSE+BSE Bid Book
 */
async function fetchOfsDetail(slug, options = {}) {
  if (!slug) throw new Error('OFS Slug is required');
  const { forceRefresh = false } = options;
  const now = Date.now();

  const cached = _ofsDetailCache.get(slug);
  if (!forceRefresh && cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://www.ipoguru.in/ofs/${slug}`;

  try {
    const res = await axios.get(url, {
      headers: AXIOS_HEADERS,
      timeout: 10000
    });

    const $ = cheerio.load(res.data);
    const pageTitle = $('title').text().trim();

    let cutoffPrice = 'N/A';
    let floorPrice = 'N/A';

    $('.grid, table, div').each((_, el) => {
      const text = $(el).text();
      if (text.includes('Cut-off Price') || text.includes('Indicative Price')) {
        const match = text.match(/(?:Cut-off Price|Indicative Price)[^\u20b9\d]*[\u20b9\s]*([\d,.]+)/i);
        if (match) cutoffPrice = `₹${match[1]}`;
      }
      if (text.includes('Floor Price')) {
        const match = text.match(/Floor Price[^\u20b9\d]*[\u20b9\s]*([\d,.]+)/i);
        if (match) floorPrice = `₹${match[1]}`;
      }
    });

    const bidBook = [];
    $('table').each((_, tbl) => {
      const headerText = $(tbl).find('thead tr').text().toLowerCase();
      if (headerText.includes('price') || headerText.includes('bse') || headerText.includes('nse')) {
        $(tbl).find('tbody tr').each((_, tr) => {
          const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
          if (cells.length >= 4) {
            bidBook.push({
              price: cells[0] || 'N/A',
              bseQty: cells[1] || '0',
              nseQty: cells[2] || '0',
              totalQty: cells[3] || '0',
              cutoffStatus: cells[4] || '—'
            });
          }
        });
      }
    });

    const detailPayload = {
      slug,
      pageTitle,
      scrapedAt: new Date().toISOString(),
      summary: {
        cutoffPrice: cutoffPrice !== 'N/A' ? cutoffPrice : 'At Market/Floor',
        floorPrice: floorPrice !== 'N/A' ? floorPrice : 'N/A'
      },
      bidBook
    };

    _ofsDetailCache.set(slug, { data: detailPayload, fetchedAt: now });
    return detailPayload;

  } catch (err) {
    console.error(`[OFS Detail Scraper Error for ${slug}]`, err.message);
    if (cached) return cached.data;
    throw new Error(`Failed to scrape OFS detail for ${slug}: ${err.message}`);
  }
}

/**
 * Starts background poller to keep OFS list and bid books pre-warmed every 60 seconds
 */
function startOfsPoller() {
  if (_pollerTimer) return;
  console.log('[OFS Poller] Started — pre-fetching list & bid books every 60 seconds');

  const poll = async () => {
    try {
      await fetchOfsList({ forceRefresh: true });
    } catch (e) {
      console.error('[OFS Poller Error]', e.message);
    }
  };

  poll();
  _pollerTimer = setInterval(poll, CACHE_TTL_MS);
}

module.exports = {
  getLatestOfs,
  fetchOfsList,
  fetchOfsDetail,
  startOfsPoller
};
