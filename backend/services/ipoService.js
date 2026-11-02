'use strict';

const axios = require('axios');
const { getISTDateString, parseToISTDateString } = require('../lib/time/istTime');
const { getCanonicalIpoKey, computeIpoFingerprint, computeNameSimilarity } = require('../lib/ipoUtils');
const { isValidListingDate } = require('../lib/ipoAllotmentMath');

// ── Module-level dedup constants ───────────────────────────────────────────────
// Sørensen-Dice token-set similarity threshold for IPO name matching.
// ≥ 0.72 = "same company, different name style" → merge
//  < 0.72 = genuinely different companies       → keep separate
const FUZZY_THRESHOLD = 0.72;

// In-memory cache for live IPO GMP & subscription queries (60s TTL)
const _ipoGmpCache = new Map();
const IPO_GMP_CACHE_TTL_MS = 60 * 1000;

// Format dates to DD MMM YYYY (e.g. "05 Nov 2026")
const formatDate = (ds) => {
  if (!ds || ds === '0000-00-00' || ds === '-') return '-';
  const d = new Date(ds);
  return isNaN(d.getTime()) ? ds : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, ' ');
};

const addDaysToDate = (ds, days) => {
  if (!ds || ds === '0000-00-00' || ds === '-') return '-';
  const d = new Date(ds);
  if (isNaN(d.getTime())) return '-';
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, ' ');
};

/**
 * Merge `incoming` IPO entry into the existing entry at `key` in `map`.
 * Best values from either source always win (highest GMP, richest exchange, etc.)
 *
 * @param {Map}    map      - The dedup Map
 * @param {string} key      - Key of the entry to merge into
 * @param {Object} incoming - The entry being collapsed
 */
function _mergeEntry(map, key, incoming) {
  const existing = map.get(key);
  if (!existing) return;

  const mergedGmp        = Math.max(existing.gmp, incoming.gmp);
  const mergedIssuePrice = incoming.issuePrice > 0 ? incoming.issuePrice : existing.issuePrice;
  const mergedGmpPct     = mergedIssuePrice > 0
    ? Math.round((mergedGmp / mergedIssuePrice) * 1000) / 10
    : 0;
  // Shorter name = cleaner (MainboardGMP tends to omit suffixes like "Ltd")
  const mergedName = existing.name.length <= incoming.name.length
    ? existing.name
    : incoming.name;
  // Exchange with '&' is more descriptive e.g. "NSE & BSE" beats "NSE SME"
  const mergedExch = (existing.exchange?.includes('&'))
    ? existing.exchange
    : (incoming.exchange || existing.exchange);
  // Keep first non-dash subscription string
  const mergedSub = existing.subscription !== '-'
    ? existing.subscription
    : incoming.subscription;

  map.set(key, {
    ...existing,
    name:          mergedName,
    gmp:           mergedGmp,
    gmpPercentage: mergedGmpPct,
    issuePrice:    mergedIssuePrice,
    exchange:      mergedExch,
    subscription:  mergedSub,
    fireRating:    Math.max(existing.fireRating || 0, incoming.fireRating || 0),
    lotSize:       existing.lotSize || incoming.lotSize,
  });
}

async function fetchIpoGmpData(page = 1, search = '') {
  search = search.toLowerCase();
  const cacheKey = `${page}:${search}`;

  const cached = _ipoGmpCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  
  const mbGmpUrl = `https://mainboardgmp.com/ipos-pagination.php?type=all&page=${page}&search=${encodeURIComponent(search)}&year=`;
  
  // Investorgain URLs: Report 331 (GMP) & Report 333 (Live Subscriptions)
  const date = new Date();
  const currentYear = date.getFullYear();
  const nextYear = currentYear + 1;
  const igUrl = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/331/1/8/${currentYear}/${currentYear}-${nextYear.toString().slice(-2)}/0/all?search=${encodeURIComponent(search)}&v=11-18`;
  const igSubUrl = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/333/1/8/${currentYear}/${currentYear}-${nextYear.toString().slice(-2)}/0/all?search=${encodeURIComponent(search)}&v=11-18`;

  // Fetch all 3 data streams concurrently
  const [mbGmpRes, igRes, igSubRes] = await Promise.allSettled([
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
    }),
    axios.get(igSubUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.investorgain.com/'
      },
      timeout: 8000
    })
  ]);

  const mbData = mbGmpRes.status === 'fulfilled' ? mbGmpRes.value?.data : null;
  const igData = igRes.status === 'fulfilled' ? igRes.value?.data : null;
  const igSubData = igSubRes.status === 'fulfilled' ? igSubRes.value?.data : null;

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
    investorgainSub: {
      attempted: true,
      usable: igSubRes.status === 'fulfilled' && Array.isArray(igSubData?.reportTableData),
      count: Array.isArray(igSubData?.reportTableData) ? igSubData.reportTableData.length : 0,
    }
  };

  // Helper: Canonical match key
  const getMatchKey = (name) => getCanonicalIpoKey(name);

  // Helper: Clean subscription value (e.g. 0.66 -> 0.66x)
  const formatSubRatio = (val) => {
    if (!val || val === '--' || val === '-') return '-';
    const s = String(val).replace(/<[^>]+>/g, '').trim();
    if (!s || s === '-' || s === '--') return '-';
    return s.endsWith('x') ? s : `${s}x`;
  };

  // Build Subscription Map from Report 333
  const subMap = new Map();
  if (sourcesStatus.investorgainSub.usable) {
    igSubData.reportTableData.forEach(item => {
      let subName = item['~ipo_name'] || '';
      const nameMatch = item.Name?.match(/title="([^"]+)"/);
      if (nameMatch) subName = nameMatch[1];
      subName = subName.replace(' IPO', '').trim();

      let totalTimes = '';
      const totalMatch = item.Total?.match(/<b>([\d.]+)<\/b>/);
      if (totalMatch) totalTimes = totalMatch[1];
      else totalTimes = (item.Total || '').replace(/<[^>]+>/g, '').trim();

      let updatedAt = '';
      const timeMatch = item.Total?.match(/<small[^>]*><b>([^<]+)<\/b><\/small>/);
      if (timeMatch) updatedAt = timeMatch[1];

      const subEntry = {
        total: totalTimes && totalTimes !== '-' ? (totalTimes.endsWith('x') ? totalTimes : `${totalTimes}x`) : '-',
        qib: formatSubRatio(item.QIB),
        nii: formatSubRatio(item.NII),
        shni: formatSubRatio(item.SHNI),
        bhni: formatSubRatio(item.BHNI),
        retail: formatSubRatio(item.RII),
        updatedAt: updatedAt || null,
      };

      if (item['~id']) subMap.set(String(item['~id']), subEntry);
      if (subName) subMap.set(getMatchKey(subName), subEntry);
    });
  }

  let finalData = { data: [], current_page: page, total_pages: 1, total: 0 };
  const companySet = new Set();

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

      // Extract GMP Range from HTML (e.g. 5 ↓ / 15 ↑)
      let gmp_range = null;
      if (item.GMP) {
        const rangeMatch = item.GMP.match(/([\d.]+\s*[↓]\s*\/\s*[\d.]+\s*[↑])/);
        if (rangeMatch) gmp_range = rangeMatch[1].trim();
      }
      const max_gmp = parseFloat(item['~max_gmp1']) || null;

      // Extract exact exchange & segment (Mainboard vs BSE SME / NSE SME)
      let listing_exch = item['~IPO_Category'] === 'SME' ? 'SME' : 'Mainboard';
      if (item.Name) {
        if (item.Name.includes('BSE SME')) listing_exch = 'BSE SME';
        else if (item.Name.includes('NSE SME')) listing_exch = 'NSE SME';
        else if (item.Name.includes('BSE & NSE') || item.Name.includes('NSE & BSE')) listing_exch = 'NSE & BSE';
        else if (item.Name.includes('NSE') && item.Name.includes('BSE')) listing_exch = 'NSE & BSE';
        else if (item.Name.includes('BSE')) listing_exch = 'BSE';
        else if (item.Name.includes('NSE')) listing_exch = 'NSE';
      }
      const is_sme = listing_exch.includes('SME') || item['~IPO_Category'] === 'SME';
      const segment = is_sme ? 'SME' : 'MAINBOARD';

      // Extract Status (upcoming, open, closed)
      let tab_status = 'closed';
      const now = new Date();
      const openD = new Date(item['~Srt_Open']);
      const closeD = new Date(item['~Srt_Close']);
      closeD.setHours(23, 59, 59, 999);
      if (now < openD) tab_status = 'upcoming';
      else if (now >= openD && now <= closeD) tab_status = 'open';

      // Extract rating (count fire emojis)
      let fireRating = 0;
      if (item.Rating) {
        const matches = item.Rating.match(/&#128293;/g);
        if (matches) fireRating = matches.length;
      }
      
      // Clean IPO size
      let ipoSize = (item['IPO Size'] || '-').replace(/&#8377;/g, '₹');
      const rawCloseDate = item['~Srt_Close'] || item.close_date || '';
      const rawBoaDate = item['~Srt_BoA_Dt'] || item['BoA Dt'] || '';
      const rawListingDate = item['~Str_Listing'] || item.Listing || '';
      const formattedClose = formatDate(rawCloseDate);
      const formattedListing = formatDate(rawListingDate);
      const validListing = isValidListingDate(formattedListing, formattedClose) ? formattedListing : '-';

      const subEntry = subMap.get(String(item['~id'])) || subMap.get(getMatchKey(company_name)) || null;
      const subscriptionObj = subEntry || {
        total: item['Sub'] || '-',
        qib: '-',
        nii: '-',
        shni: '-',
        bhni: '-',
        retail: '-',
        updatedAt: null,
      };

      const lotVal = item['Lot'] || '0';
      const priceVal = item['Price (₹)'] || '0';
      const lotNum = parseInt(String(lotVal).replace(/,/g, ''), 10) || 0;
      const priceNum = parseFloat(String(priceVal).replace(/[^0-9.]/g, '')) || 0;
      const minInvestment = (lotNum > 0 && priceNum > 0) ? Math.round(lotNum * priceNum) : null;

      let anchorStatus = '-';
      if (item.Anchor) {
        if (item.Anchor.includes('❌')) anchorStatus = 'No';
        else if (item.Anchor.includes('✔️') || item.Anchor.includes('✅')) anchorStatus = 'Yes';
        else anchorStatus = item.Anchor.replace(/<[^>]+>/g, '').trim() || '-';
      }

      return {
        id: item['~id'] || Math.floor(Math.random() * 100000),
        slug: company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        company_name,
        company_logo: null,
        logo_txt: company_name.substring(0, 2).toUpperCase(),
        listing_exch,
        segment,
        gmp,
        gmp_range,
        max_gmp,
        open_date: formatDate(item['~Srt_Open']),
        close_date: formattedClose,
        closeDateISO: parseToISTDateString(rawCloseDate),
        boa_date: formatDate(rawBoaDate),
        refund_date: addDaysToDate(rawBoaDate, 1),
        demat_date: addDaysToDate(rawListingDate, -1),
        listing_date: validListing,
        issue_price: priceVal,
        lot_size: lotVal,
        min_investment: minInvestment,
        tab_status,
        subscription: subscriptionObj.total !== '-' ? subscriptionObj.total : (item['Sub'] || '-'),
        subscriptions: subscriptionObj,
        pe_ratio: item['~P/E'] || '-',
        ipo_size: ipoSize,
        fire_rating: fireRating,
        anchor: anchorStatus,
        gmp_updated_on: item['Updated-On'] ? item['Updated-On'].replace(/<[^>]+>/g, '').trim() : null,
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
      const formattedClose = formatDate(rawCloseDate) || mbIpo.close_date || '-';

      // Resolve valid listing date:
      // MainboardGMP has a known upstream bug where it sets listing_date = close_date as a placeholder.
      // We always prefer Investorgain's verified listing date if valid, or MainboardGMP's listing date if valid.
      let resolvedListingDate = '-';
      if (igIpo && isValidListingDate(igIpo.listing_date, formattedClose)) {
        resolvedListingDate = igIpo.listing_date;
      } else if (isValidListingDate(mbIpo.listing_date, formattedClose)) {
        resolvedListingDate = mbIpo.listing_date;
      }

      const subEntry = subMap.get(String(mbIpo.id)) || subMap.get(nameKey) || igIpo?.subscriptions;
      const lotVal = (igIpo?.lot_size && igIpo.lot_size !== '0') ? igIpo.lot_size : (mbIpo.lot_size || '0');
      const priceVal = (igIpo?.issue_price && igIpo.issue_price !== '0') ? igIpo.issue_price : (mbIpo.issue_price || '0');
      const lotNum = parseInt(String(lotVal).replace(/,/g, ''), 10) || 0;
      const priceNum = parseFloat(String(priceVal).replace(/[^0-9.]/g, '')) || 0;
      const minInvestment = (lotNum > 0 && priceNum > 0) ? Math.round(lotNum * priceNum) : null;

      if (igIpo) {
        return {
          ...mbIpo,
          company_name: igIpo.company_name || mbIpo.company_name,
          open_date: igIpo.open_date || mbIpo.open_date || '-',
          close_date: formattedClose,
          closeDateISO,
          listing_date: resolvedListingDate,
          listing_exch: igIpo.listing_exch || mbIpo.listing_exch || 'Mainboard',
          segment: igIpo.segment || ((mbIpo.listing_exch || '').toUpperCase().includes('SME') ? 'SME' : 'MAINBOARD'),
          boa_date: igIpo.boa_date || '-',
          refund_date: igIpo.refund_date || '-',
          demat_date: igIpo.demat_date || '-',
          subscription: subEntry?.total && subEntry.total !== '-' ? subEntry.total : igIpo.subscription,
          subscriptions: subEntry || igIpo.subscriptions || { total: igIpo.subscription || '-', qib: '-', nii: '-', shni: '-', bhni: '-', retail: '-', updatedAt: null },
          pe_ratio: igIpo.pe_ratio,
          ipo_size: igIpo.ipo_size,
          fire_rating: igIpo.fire_rating,
          gmp: igIpo.gmp > 0 ? igIpo.gmp : mbIpo.gmp,
          gmp_range: igIpo.gmp_range || null,
          max_gmp: igIpo.max_gmp || null,
          issue_price: priceVal,
          lot_size: lotVal,
          min_investment: minInvestment,
          anchor: igIpo.anchor,
          gmp_updated_on: igIpo.gmp_updated_on,
        };
      }
      return {
        ...mbIpo,
        close_date: formattedClose,
        closeDateISO,
        listing_date: resolvedListingDate,
        listing_exch: mbIpo.listing_exch || 'Mainboard',
        segment: (mbIpo.listing_exch || '').toUpperCase().includes('SME') ? 'SME' : 'MAINBOARD',
        boa_date: '-',
        refund_date: '-',
        demat_date: '-',
        subscription: subEntry?.total && subEntry.total !== '-' ? subEntry.total : (mbIpo.subscription || '-'),
        subscriptions: subEntry || { total: mbIpo.subscription || '-', qib: '-', nii: '-', shni: '-', bhni: '-', retail: '-', updatedAt: null },
        pe_ratio: '-',
        ipo_size: '-',
        fire_rating: 0,
        gmp_range: null,
        max_gmp: null,
        lot_size: lotVal,
        issue_price: priceVal,
        min_investment: minInvestment,
        anchor: '-',
        gmp_updated_on: null,
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

  const getStatusWeight = (status) => {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'ct') return 1;
    if (s === 'open') return 2;
    if (s === 'upcoming' || s === 'soon') return 3;
    return 4; // closed or other
  };

  finalData.data.sort((a, b) => {
    const weightDiff = getStatusWeight(a.tab_status) - getStatusWeight(b.tab_status);
    if (weightDiff !== 0) return weightDiff;
    const gmpA = parseFloat(a.gmp) || 0;
    const gmpB = parseFloat(b.gmp) || 0;
    return gmpB - gmpA;
  });

  finalData.sourcesStatus = sourcesStatus;
  _ipoGmpCache.set(cacheKey, { data: finalData, expiresAt: Date.now() + IPO_GMP_CACHE_TTL_MS });
  return finalData;
}

/**
 * getIposClosingToday  —  Hybrid Deduplication (3-Pass)
 *
 * Fetches all IPOs from both scrapers, filters to those closing today,
 * then deduplicates them through three independent passes so that
 * EXACTLY ONE record per real-world company reaches MongoDB.
 *
 * Pass 1 ─ FINGERPRINT  (closeDateISO + issuePrice)
 *   Catches: "Credent Connect N Care Ltd" @ ₹189 vs "Credent Connect" @ ₹189
 *   → Same date + same price = same IPO.  100% reliable, zero maintenance.
 *
 * Pass 2 ─ FUZZY (no-fingerprint fallback)
 *   Catches: Entries missing closeDateISO or issuePrice.
 *   Name token-set Dice similarity ≥ 0.72 → merge.
 *
 * Pass 3 ─ CROSS-FINGERPRINT FUZZY (price-band mismatches)
 *   Catches: MainboardGMP shows ₹189 (upper band),
 *            Investorgain shows ₹179 (lower band) → different fingerprints
 *            but same company by name similarity ≥ 0.72.
 *
 * Result: sorted array of unique IPOs, each with the best live GMP from any source.
 *
 * @returns {Promise<{ ok, status, ipos, sources, error, dedupStats }>}
 */
async function getIposClosingToday() {
  try {
    const result = await fetchIpoGmpData(1, '');
    const ipos         = result?.data        || [];
    const sourcesStatus = result?.sourcesStatus || {};

    const isAnySourceUsable =
      sourcesStatus.mainboardGmp?.usable || sourcesStatus.investorgain?.usable;
    if (!isAnySourceUsable) {
      return {
        ok:     false,
        status: 'UPSTREAM_FAILURE',
        ipos:   [],
        sources: sourcesStatus,
        error:  'Both MainboardGMP and Investorgain scrapers failed transport/schema validation',
      };
    }

    const todayIST = getISTDateString();

    // ────────────────────────────────────────────────────────────────
    // Step 1: Filter to IPOs closing today
    // ────────────────────────────────────────────────────────────────
    const closingToday = ipos.filter(ipo => {
      const isCT    = String(ipo.tab_status || '').trim().toUpperCase() === 'CT';
      const isToday = ipo.closeDateISO === todayIST;
      return isCT || isToday;
    });

    if (closingToday.length === 0) {
      return {
        ok:     true,
        status: 'NO_IPOS_CLOSING_TODAY',
        ipos:   [],
        sources: sourcesStatus,
        error:  null,
        dedupStats: { rawCount: 0, uniqueCount: 0, mergedCount: 0 },
      };
    }

    // ────────────────────────────────────────────────────────────────
    // Step 2: Normalize all entries
    // ────────────────────────────────────────────────────────────────
    const normalizedEntries = closingToday.map(ipo => {
      const issuePrice  = parseFloat(ipo.issue_price) || 0;
      const gmp         = parseFloat(ipo.gmp)         || 0;
      const gmpPct      = issuePrice > 0
        ? Math.round((gmp / issuePrice) * 1000) / 10
        : 0;
      const slug        = ipo.slug
        || (ipo.company_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fingerprint = computeIpoFingerprint(ipo.closeDateISO, issuePrice);

      return {
        _fp:           fingerprint,          // internal dedup field, stripped before output
        id:            fingerprint || slug,  // fingerprint as stable id (preferred)
        name:          ipo.company_name || 'Unknown IPO',
        slug,
        gmp,
        gmpPercentage: gmpPct,
        issuePrice,
        closeDate:     ipo.close_date   || '',
        closeDateISO:  ipo.closeDateISO || todayIST,
        exchange:      ipo.listing_exch || '',
        lotSize:       ipo.lot_size ? (parseInt(ipo.lot_size, 10) || null) : null,
        subscription:  ipo.subscription || '-',
        fireRating:    ipo.fire_rating  || 0,
      };
    });

    // ────────────────────────────────────────────────────────────────
    // PASS 1: Fingerprint grouping  (closeDateISO + issuePrice)
    // ────────────────────────────────────────────────────────────────
    // Two records with the same fingerprint = same IPO. No name comparison needed.
    const dedupMap  = new Map();  // fp/key → merged IPO entry
    const noFpQueue = [];         // entries missing a fingerprint (no price or no date)

    for (const entry of normalizedEntries) {
      if (!entry._fp) {
        noFpQueue.push(entry);
        continue;
      }
      if (!dedupMap.has(entry._fp)) {
        dedupMap.set(entry._fp, { ...entry });
      } else {
        _mergeEntry(dedupMap, entry._fp, entry);
        console.log(
          `[IpoService] Pass1 FP-merge: "${entry.name}" → "${dedupMap.get(entry._fp).name}" (fp=${entry._fp})`
        );
      }
    }

    // ────────────────────────────────────────────────────────────────
    // PASS 2: Fuzzy match for entries without a fingerprint
    // ────────────────────────────────────────────────────────────────
    // Entries missing closeDateISO or issuePrice can still be matched by name.
    for (const entry of noFpQueue) {
      let bestFp  = null;
      let bestSim = 0;

      for (const [fp, existing] of dedupMap) {
        const sim = computeNameSimilarity(entry.name, existing.name);
        if (sim >= FUZZY_THRESHOLD && sim > bestSim) {
          bestSim = sim;
          bestFp  = fp;
        }
      }

      if (bestFp) {
        _mergeEntry(dedupMap, bestFp, entry);
        console.log(
          `[IpoService] Pass2 fuzzy-merge (no-fp): "${entry.name}" → "${dedupMap.get(bestFp).name}" (sim=${bestSim.toFixed(2)})`
        );
      } else {
        // Truly standalone — give it a deterministic key
        const fallbackKey = `${entry.closeDateISO}__slug__${entry.slug}`;
        dedupMap.set(fallbackKey, { ...entry, id: fallbackKey });
      }
    }

    // ────────────────────────────────────────────────────────────────
    // PASS 3: Cross-fingerprint fuzzy  (price-band mismatches)
    // ────────────────────────────────────────────────────────────────
    // Handles: MainboardGMP shows ₹189 (upper band) → fp "2026-09-03__189"
    //          Investorgain  shows ₹179 (lower band) → fp "2026-09-03__179"
    //          Same date + same company by name similarity → merge.
    // Only compares entries that close on the same calendar date (avoids cross-day false positives).
    const dedupKeys    = [...dedupMap.keys()];
    const mergeActions = [];   // {keepKey, dropKey, sim} — collected before mutating the map

    for (let i = 0; i < dedupKeys.length; i++) {
      for (let j = i + 1; j < dedupKeys.length; j++) {
        const keyA = dedupKeys[i];
        const keyB = dedupKeys[j];
        const eA   = dedupMap.get(keyA);
        const eB   = dedupMap.get(keyB);

        // Gate: must close on the same date
        if (eA.closeDateISO !== eB.closeDateISO) continue;

        const sim = computeNameSimilarity(eA.name, eB.name);
        if (sim >= FUZZY_THRESHOLD) {
          // Keep the entry with the higher GMP (more live data)
          const [keepKey, dropKey] = eA.gmp >= eB.gmp ? [keyA, keyB] : [keyB, keyA];
          mergeActions.push({ keepKey, dropKey, sim,
            keepName: dedupMap.get(keepKey).name, dropName: dedupMap.get(dropKey).name });
        }
      }
    }

    // Apply merges (guarded against double-deletion)
    const dropped = new Set();
    for (const { keepKey, dropKey, sim, keepName, dropName } of mergeActions) {
      if (dropped.has(dropKey) || dropped.has(keepKey)) continue;
      if (!dedupMap.has(keepKey) || !dedupMap.has(dropKey))  continue;

      _mergeEntry(dedupMap, keepKey, dedupMap.get(dropKey));
      dedupMap.delete(dropKey);
      dropped.add(dropKey);
      console.log(
        `[IpoService] Pass3 cross-fp fuzzy-merge: "${keepName}" ← "${dropName}" (sim=${sim.toFixed(2)})`
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Step 6: Final output — strip internal fields, sort by GMP% descending
    // ────────────────────────────────────────────────────────────────
    const deduped = [...dedupMap.values()]
      .map(({ _fp, ...rest }) => rest)       // strip internal _fp field
      .sort((a, b) => b.gmpPercentage - a.gmpPercentage);

    const rawCount    = closingToday.length;
    const uniqueCount = deduped.length;
    const isPartial   = !sourcesStatus.mainboardGmp?.usable || !sourcesStatus.investorgain?.usable;

    console.log(
      `[IpoService] getIposClosingToday: ${rawCount} raw → ${uniqueCount} unique ` +
      `(${rawCount - uniqueCount} merged) status=${isPartial ? 'PARTIAL' : 'SUCCESS'}`
    );

    return {
      ok:     true,
      status: isPartial ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      ipos:   deduped,
      sources: sourcesStatus,
      error:   null,
      dedupStats: {
        rawCount,
        uniqueCount,
        mergedCount: rawCount - uniqueCount,
      },
    };
  } catch (err) {
    return {
      ok:     false,
      status: 'UPSTREAM_FAILURE',
      ipos:   [],
      sources: {},
      error:   err.message,
    };
  }
}

module.exports = {
  fetchIpoGmpData,
  getIposClosingToday,
};
