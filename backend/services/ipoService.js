'use strict';

const { getISTDateString, parseToISTDateString } = require('../lib/time/istTime');

async function fetchIpoGmpData(page = 1, search = '') {
  search = search.toLowerCase();
  
  const mbGmpUrl = `https://mainboardgmp.com/ipos-pagination.php?type=all&page=${page}&search=${encodeURIComponent(search)}&year=`;
  
  // Investorgain URL for current active/upcoming IPOs
  const date = new Date();
  const currentYear = date.getFullYear();
  const nextYear = currentYear + 1;
  const igUrl = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/331/1/8/${currentYear}/${currentYear}-${nextYear.toString().slice(-2)}/0/all?search=${encodeURIComponent(search)}&v=11-18`;

  // Fetch concurrently
  const [mbGmpRes, igRes] = await Promise.allSettled([
    axios.get(mbGmpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://mainboardgmp.com/'
      },
      timeout: 8000
    }),
    axios.get(igUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.investorgain.com/'
      },
      timeout: 8000
    })
  ]);

  const mbData = mbGmpRes.status === 'fulfilled' ? mbGmpRes.value?.data : null;
  const igData = igRes.status === 'fulfilled' ? igRes.value?.data : null;

  const mbTransportOk = mbGmpRes.status === 'fulfilled' && mbGmpRes.value?.status === 200;
  const mbSchemaValid = mbData && typeof mbData === 'object' && Array.isArray(mbData.data);

  const igTransportOk = igRes.status === 'fulfilled' && igRes.value?.status === 200;
  const igSchemaValid = igData && typeof igData === 'object' && Array.isArray(igData.reportTableData);

  const sourcesStatus = {
    mainboardGmp: {
      attempted: true,
      transportOk: mbTransportOk,
      schemaValid: mbSchemaValid,
      usable: mbTransportOk && mbSchemaValid,
      count: mbSchemaValid ? mbData.data.length : 0,
    },
    investorgain: {
      attempted: true,
      transportOk: igTransportOk,
      schemaValid: igSchemaValid,
      usable: igTransportOk && igSchemaValid,
      count: igSchemaValid ? igData.reportTableData.length : 0,
    },
  };

  let finalData = { data: [], current_page: page, total_pages: 1, total: 0 };
  const companySet = new Set();

  const getMatchKey = (name) => {
    return name.toLowerCase()
      .replace(/\bltd\b/g, '')
      .replace(/\blimited\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  // Process MainboardGMP (Primary Source)
  if (sourcesStatus.mainboardGmp.usable) {
    finalData = mbData;
    if (!finalData.data) finalData.data = [];
    finalData.data.forEach(ipo => companySet.add(getMatchKey(ipo.company_name)));
  }

  // Process Investorgain (Secondary Source)
  if (sourcesStatus.investorgain.usable) {
    const rawIgData = igData.reportTableData;
    
    const normalizedIgData = rawIgData.map(item => {
      // Extract name from HTML <a> tag
      let company_name = item['~ipo_name'] || '';
      const nameMatch = item.Name?.match(/title="([^"]+)"/);
      if (nameMatch) company_name = nameMatch[1];
      company_name = company_name.replace(' IPO', '').trim();

      // Extract GMP from HTML
      let gmp = 0;
      const gmpMatch = item.GMP?.match(/<b>([\d.]+)<\/b>/);
      if (gmpMatch && gmpMatch[1] !== '--') gmp = parseFloat(gmpMatch[1]);

      // Extract Status (upcoming, open, closed)
      let tab_status = 'closed';
      const now = new Date();
      const openD = new Date(item['~Srt_Open']);
      const closeD = new Date(item['~Srt_Close']);
      // Add 1 day to closeD to cover the whole day
      closeD.setHours(23, 59, 59, 999);
      if (now < openD) tab_status = 'upcoming';
      else if (now >= openD && now <= closeD) tab_status = 'open';

      // Format dates to DD MMM YYYY
      const formatDate = (ds) => {
        if (!ds || ds === '0000-00-00') return '-';
        const d = new Date(ds);
        return isNaN(d) ? ds : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, ' ');
      };

      // Extract rating (count fire emojis)
      let fireRating = 0;
      if (item.Rating) {
        const matches = item.Rating.match(/&#128293;/g);
        if (matches) fireRating = matches.length;
      }
      
      // Clean IPO size
      let ipoSize = (item['IPO Size'] || '-').replace(/&#8377;/g, '₹');

      const rawCloseDate = item['~Srt_Close'] || item.close_date || '';

      return {
        id: item['~id'] || Math.floor(Math.random() * 100000),
        slug: company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        company_name,
        company_logo: null,
        logo_txt: company_name.substring(0, 2).toUpperCase(),
        listing_exch: item['~IPO_Category'] === 'SME' ? 'SME' : 'Mainboard',
        gmp,
        open_date: formatDate(item['~Srt_Open']),
        close_date: formatDate(item['~Srt_Close']),
        closeDateISO: parseToISTDateString(rawCloseDate),
        listing_date: formatDate(item['~Str_Listing']),
        issue_price: item['Price (₹)'] || '0',
        lot_size: item['Lot'] || '0',
        tab_status,
        subscription: item['Sub'] || '-',
        pe_ratio: item['~P/E'] || '-',
        ipo_size: ipoSize,
        fire_rating: fireRating
      };
    });

    // Create a map for quick lookup by name to enrich MainboardGMP data
    const igMap = new Map();
    normalizedIgData.forEach(ipo => {
      igMap.set(getMatchKey(ipo.company_name), ipo);
    });

    // Enrich MainboardGMP data
    finalData.data = finalData.data.map(mbIpo => {
      const nameKey = getMatchKey(mbIpo.company_name);
      const igIpo = igMap.get(nameKey);
      const rawCloseDate = mbIpo.close_date || igIpo?.close_date || '';
      const closeDateISO = parseToISTDateString(rawCloseDate) || igIpo?.closeDateISO;

      if (igIpo) {
        return {
          ...mbIpo,
          closeDateISO,
          subscription: igIpo.subscription,
          pe_ratio: igIpo.pe_ratio,
          ipo_size: igIpo.ipo_size,
          fire_rating: igIpo.fire_rating,
          gmp: igIpo.gmp > 0 ? igIpo.gmp : mbIpo.gmp,
          issue_price: igIpo.issue_price && igIpo.issue_price !== '0' ? igIpo.issue_price : mbIpo.issue_price,
          lot_size: igIpo.lot_size && igIpo.lot_size !== '0' ? igIpo.lot_size : mbIpo.lot_size
        };
      }
      return {
        ...mbIpo,
        closeDateISO,
        subscription: '-',
        pe_ratio: '-',
        ipo_size: '-',
        fire_rating: 0
      };
    });

    // Filter and Merge unique Investorgain data
    const uniqueIgData = normalizedIgData.filter(ipo => {
      if (search && !ipo.company_name.toLowerCase().includes(search)) return false;
      const nameKey = getMatchKey(ipo.company_name);
      if (companySet.has(nameKey)) return false;
      companySet.add(nameKey);
      return true;
    });

    if (page === 1 || search) {
      uniqueIgData.sort((a, b) => {
        const statusWeight = { 'open': 1, 'upcoming': 2, 'closed': 3 };
        return statusWeight[a.tab_status] - statusWeight[b.tab_status];
      });
      
      finalData.data = [...uniqueIgData, ...finalData.data];
      finalData.total += uniqueIgData.length;
    }
  }

  const todayIST = getISTDateString();
  finalData.data = finalData.data.map(ipo => {
    const isClosingTodayByISO = ipo.closeDateISO === todayIST;
    if (ipo.tab_status === 'open' && isClosingTodayByISO) {
      return { ...ipo, tab_status: 'CT' };
    }
    return ipo;
  });

  finalData.sourcesStatus = sourcesStatus;
  return finalData;
}

/**
 * getIposClosingToday
 *
 * Clean contract for the IPO closing notification service.
 * Returns a normalized status object and array of IPOs closing today.
 *
 * @returns {Promise<{ ok: boolean, status: string, ipos: Array, sources: Object, error: string|null }>}
 */
async function getIposClosingToday() {
  try {
    const result = await fetchIpoGmpData(1, '');
    const ipos = result?.data || [];
    const sourcesStatus = result?.sourcesStatus || {};

    const isAnySourceUsable = sourcesStatus.mainboardGmp?.usable || sourcesStatus.investorgain?.usable;
    if (!isAnySourceUsable) {
      return {
        ok: false,
        status: 'UPSTREAM_FAILURE',
        ipos: [],
        sources: sourcesStatus,
        error: 'Both MainboardGMP and Investorgain scrapers failed transport/schema validation'
      };
    }

    const filtered = ipos
      .filter(ipo => {
        const isCT = String(ipo.tab_status || '').trim().toUpperCase() === 'CT';
        const isToday = ipo.closeDateISO === getISTDateString();
        return isCT || isToday;
      })
      .map(ipo => {
        const issuePrice = parseFloat(ipo.issue_price) || 0;
        const gmp        = parseFloat(ipo.gmp)         || 0;
        const gmpPct     = issuePrice > 0 ? Math.round((gmp / issuePrice) * 1000) / 10 : 0;
        const slug       = ipo.slug || (ipo.company_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        return {
          id:            String(ipo.id || slug),
          name:          ipo.company_name || 'Unknown IPO',
          slug,
          gmp,
          gmpPercentage: gmpPct,
          issuePrice,
          closeDate:     ipo.close_date || '',
          closeDateISO:  ipo.closeDateISO || getISTDateString(),
          exchange:      ipo.listing_exch || '',
        };
      });

    const isPartial = !sourcesStatus.mainboardGmp?.ok || !sourcesStatus.investorgain?.ok;

    return {
      ok: true,
      status: isPartial ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      ipos: filtered,
      sources: sourcesStatus,
      error: null
    };
  } catch (err) {
    return {
      ok: false,
      status: 'UPSTREAM_FAILURE',
      ipos: [],
      sources: {},
      error: err.message
    };
  }
}

module.exports = {
  fetchIpoGmpData,
  getIposClosingToday,
};
