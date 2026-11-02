'use strict';

/**
 * ipoAllotmentMath.js
 *
 * Core mathematical engine for SEBI IPO Lot Applications, Allotment Odds,
 * Family PAN Binomial Probability, and Strategic Advisory.
 */

/**
 * Calculates SEBI standard IPO application bidding lots, shares, and amounts
 * for Retail (Min/Max), Small HNI (Min/Max), and Big HNI (Min).
 *
 * @param {number|string} lotSize - IPO minimum bidding lot size (e.g. 182, "1,500")
 * @param {number|string} issuePrice - Issue cut-off price (e.g. 82, "₹67.00")
 * @returns {Array<Object>|null} List of 5 standardized application tiers or null if invalid inputs
 */
function computeLotApplications(lotSize, issuePrice) {
  if (lotSize === null || lotSize === undefined || issuePrice === null || issuePrice === undefined) {
    return null;
  }
  if (typeof lotSize === 'number' && lotSize <= 0) return null;
  if (typeof issuePrice === 'number' && issuePrice <= 0) return null;

  const rawLotStr = String(lotSize).trim();
  const rawPriceStr = String(issuePrice).trim();
  if (rawLotStr.startsWith('-') || rawPriceStr.startsWith('-')) return null;

  const cleanLotStr = rawLotStr.replace(/[^0-9]/g, '');
  const cleanPriceStr = rawPriceStr.replace(/[^0-9.]/g, '');

  const lot = parseInt(cleanLotStr, 10);
  const price = parseFloat(cleanPriceStr);

  if (isNaN(lot) || lot <= 0 || isNaN(price) || price <= 0) return null;

  const costPerLot = Math.round(lot * price);
  if (costPerLot <= 0) return null;

  // Retail: Max amount <= 2,00,000 (₹2 Lakhs)
  const retailMinLots = 1;
  const retailMaxLots = Math.max(1, Math.floor(200000 / costPerLot));

  // Small HNI (sHNI): > 2,00,000 and <= 10,00,000 (₹2L – ₹10L)
  const sHniMinLots = retailMaxLots + 1;
  const sHniMaxLots = Math.max(sHniMinLots, Math.floor(1000000 / costPerLot));

  // Big HNI (bHNI): strictly > 10,00,000 (> ₹10 Lakhs)
  const bHniMinLots = sHniMaxLots + 1;

  return [
    {
      category: 'Retail (Min)',
      type: 'retail',
      lots: retailMinLots,
      shares: retailMinLots * lot,
      amount: retailMinLots * costPerLot,
      badge: 'Min Bid',
      badgeClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      tag: '≤ ₹2 Lakhs'
    },
    {
      category: 'Retail (Max)',
      type: 'retail',
      lots: retailMaxLots,
      shares: retailMaxLots * lot,
      amount: retailMaxLots * costPerLot,
      badge: 'Max Retail',
      badgeClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      tag: '≤ ₹2 Lakhs'
    },
    {
      category: 'S-HNI (Min)',
      type: 'shni',
      lots: sHniMinLots,
      shares: sHniMinLots * lot,
      amount: sHniMinLots * costPerLot,
      badge: 'Small HNI Min',
      badgeClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      tag: '₹2L – ₹10L'
    },
    {
      category: 'S-HNI (Max)',
      type: 'shni',
      lots: sHniMaxLots,
      shares: sHniMaxLots * lot,
      amount: sHniMaxLots * costPerLot,
      badge: 'Small HNI Max',
      badgeClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      tag: '₹2L – ₹10L'
    },
    {
      category: 'B-HNI (Min)',
      type: 'bhni',
      lots: bHniMinLots,
      shares: bHniMinLots * lot,
      amount: bHniMinLots * costPerLot,
      badge: 'Big HNI Min',
      badgeClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      tag: '> ₹10 Lakhs'
    }
  ];
}

/**
 * Parses raw subscription string or number into a valid positive float.
 * Handles strings like "28.68x", " 10.5 ", "-", "NA", null, undefined.
 */
function parseSubscriptionValue(val) {
  if (val === null || val === undefined || val === '' || val === '-' || val === 'NA' || val === 'N/A') {
    return 0;
  }
  if (typeof val === 'number') {
    return val <= 0 || isNaN(val) ? 0 : val;
  }
  const str = String(val).trim();
  if (str.startsWith('-')) return 0;
  const clean = str.replace(/[^0-9.]/g, '');
  const n = parseFloat(clean);
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Computes exact SEBI allotment probability and odds across Retail, Small HNI, and Big HNI.
 * Supports both Share-Basis subscription demand and SEBI Application (Form/PAN) Basis lottery odds.
 *
 * @param {Object} subObj - Object containing { retail, shni, bhni, nii, total }
 * @param {string} segment - "MAINBOARD" or "SME"
 * @param {number} familyPans - Number of distinct family PAN cards (1 to 25)
 * @param {number} minInvestment - Approximate minimum lot cost in INR
 * @param {number|string} lotSize - IPO minimum bidding lot size (e.g. 182)
 * @param {number|string} issuePrice - Issue cut-off price (e.g. 82)
 * @returns {Object} Comprehensive odds, probabilities, badges, and strategic advisory recommendations
 */
function computeAllotmentOdds(subObj, segment = 'MAINBOARD', familyPans = 1, minInvestment = 15000, lotSize = 0, issuePrice = 0) {
  const pansCount = Math.max(1, parseInt(familyPans, 10) || 1);
  const isSme = String(segment || '').toUpperCase().includes('SME');

  const subRetail = parseSubscriptionValue(subObj?.retail);
  const subShni   = parseSubscriptionValue(subObj?.shni);
  const subBhni   = parseSubscriptionValue(subObj?.bhni);
  const subNii    = parseSubscriptionValue(subObj?.nii);
  const subTotal  = parseSubscriptionValue(subObj?.total);

  // If specific HNI tiers are not yet segregated, derive from Total NII or Total
  const effectiveRetail = subRetail > 0 ? subRetail : (subTotal > 0 ? subTotal * 0.75 : 0);
  const effectiveShni   = subShni > 0 ? subShni : (subNii > 0 ? subNii * 0.85 : (subTotal > 0 ? subTotal * 1.5 : 0));
  const effectiveBhni   = subBhni > 0 ? subBhni : (subNii > 0 ? subNii * 1.15 : (subTotal > 0 ? subTotal * 2.0 : 0));

  // Determine lot applications to compute exact bHNI lottery leverage ratio
  let bHniLeverage = 5.0; // Standard mainboard default (₹10L / ₹2L = 5.0)
  let retailBidIntensity = isSme ? 1.0 : 1.26; // Multi-lot bidding intensity factor in mainboard retail
  let shniBidIntensity = isSme ? 1.0 : 1.04;   // Slight multi-lot bidding intensity factor in mainboard sHNI

  const cleanLot = parseInt(String(lotSize || '').replace(/[^0-9]/g, ''), 10) || 0;
  const cleanPrice = parseFloat(String(issuePrice || '').replace(/[^0-9.]/g, '')) || 0;

  if (isSme) {
    bHniLeverage = 1.0;
  } else if (cleanLot > 0 && cleanPrice > 0) {
    const costPerLot = Math.round(cleanLot * cleanPrice);
    if (costPerLot > 0) {
      const retailMaxLots = Math.max(1, Math.floor(200000 / costPerLot));
      const sHniMin = retailMaxLots + 1;
      const sHniMax = Math.max(sHniMin, Math.floor(1000000 / costPerLot));
      const bHniMin = sHniMax + 1;
      if (sHniMin > 0 && bHniMin >= sHniMin) {
        bHniLeverage = bHniMin / sHniMin;
      }
    }
  }

  const buildCategoryOdds = (rawMult, divisor, categoryTitle, sebiRule, categoryQuotaTag) => {
    if (rawMult <= 0) {
      return {
        rawMultiplier: 0,
        formMultiplier: 0,
        multiplier: 0,
        probabilitySingle: 0,
        probabilityFamily: 0,
        oddsRatioText: 'Awaiting Live Bids',
        roundOdds: 0,
        status: 'AWAITING',
        rule: sebiRule,
        quotaTag: categoryQuotaTag,
        badge: 'Early / Upcoming',
        badgeClass: 'text-textMuted bg-slate-100 dark:bg-white/5 border-border',
        leverage: divisor
      };
    }

    // Effective form/application subscription multiplier
    const formMult = rawMult / divisor;

    if (formMult <= 1.0) {
      return {
        rawMultiplier: rawMult,
        formMultiplier: parseFloat(formMult.toFixed(2)),
        multiplier: rawMult,
        probabilitySingle: 100,
        probabilityFamily: 100,
        oddsRatioText: '1 in 1 (100% Guaranteed)',
        roundOdds: 1,
        status: 'GUARANTEED',
        rule: 'Every valid applicant receives 1 lot guaranteed. Remaining shares allotted pro-rata.',
        quotaTag: categoryQuotaTag,
        badge: '100% Guaranteed',
        badgeClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        leverage: divisor
      };
    }

    // Oversubscribed: Computerized lottery based on applicant forms (PANs)
    const probSingle = Math.min(100, Math.max(0.01, 100 / formMult));
    const roundOdds  = Math.max(1, Math.round(formMult));
    
    // Binomial Probability for N family PANs: 1 - (1 - p)^N
    // If pansCount === 1, exactly equals probSingle without floating-point cancellation drift
    const pDecimal   = probSingle / 100;
    const probFamily = pansCount === 1
      ? probSingle
      : Math.min(100, (1 - Math.pow(1 - pDecimal, pansCount)) * 100);
    const oddsBoost  = probSingle > 0 ? (probFamily / probSingle).toFixed(1) : '1.0';

    return {
      rawMultiplier: rawMult,
      formMultiplier: parseFloat(formMult.toFixed(2)),
      multiplier: rawMult,
      probabilitySingle: probSingle,
      probabilityFamily: probFamily,
      oddsBoost,
      oddsRatioText: `1 in ${roundOdds} applicants`,
      roundOdds,
      status: 'OVERSUBSCRIBED',
      rule: sebiRule,
      quotaTag: categoryQuotaTag,
      badge: probSingle >= 20 ? 'High Odds' : probSingle >= 5 ? 'Moderate Odds' : 'Competitive Lottery',
      badgeClass: probSingle >= 20 
        ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
        : probSingle >= 5 
        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        : 'text-rose-500 bg-rose-500/10 border-rose-500/20',
      leverage: divisor
    };
  };

  const retail = buildCategoryOdds(
    effectiveRetail,
    retailBidIntensity,
    'Retail (RII)',
    'SEBI Draw of Lots (Pure Computerized Lottery for 1 Min Lot / lucky PAN. Multi-lot bids do not increase lottery odds.)',
    '≤ ₹2 Lakhs (35% Quota)'
  );

  const shni = buildCategoryOdds(
    effectiveShni,
    shniBidIntensity,
    'Small HNI (sHNI)',
    'SEBI April 2022 Lottery (Only Min sHNI Lot allotted, excess bid refunded. Lottery among valid PAN forms.)',
    '₹2L – ₹10L (5% Quota)'
  );

  const bhni = buildCategoryOdds(
    effectiveBhni,
    bHniLeverage,
    'Big HNI (bHNI)',
    effectiveBhni > 10
      ? `SEBI bHNI Lottery: Each winning applicant receives the minimum sHNI allotment size (~₹2 Lakhs), satisfying ${bHniLeverage.toFixed(1)}x more applicants than raw share quota!`
      : 'SEBI Min Lot + Pro-Rata Distribution of surplus',
    '> ₹10 Lakhs (10% Quota)'
  );

  // Strategic Advisor Comparison
  let advisorTitle = '';
  let advisorMessage = '';

  if (effectiveRetail > 0 && effectiveShni > 0) {
    if (retail.roundOdds <= 1) {
      advisorTitle = `Retail Category Undersubscribed (100% Guaranteed)`;
      advisorMessage = `All valid Retail applicants will receive 1 full lot guaranteed. This is an optimal entry window for 1-lot applicants.`;
    } else if (shni.roundOdds > retail.roundOdds) {
      const timesBetter = (shni.roundOdds / retail.roundOdds).toFixed(1);
      advisorTitle = `Retail Family Strategy is ~${timesBetter}x More Capital-Efficient`;
      advisorMessage = `Instead of blocking ~₹2 Lakhs in 1 Small HNI application (${shni.oddsRatioText}, ${shni.probabilitySingle.toFixed(2)}% chance), distributing that same capital across ${pansCount > 1 ? pansCount : '10–13'} Retail Family PANs surges your winning chance to ~${retail.probabilityFamily.toFixed(1)}%!`;
    } else {
      advisorTitle = `Balanced Demand Across Categories`;
      advisorMessage = `Both Retail and HNI are experiencing steady bidding. Ensure you check 'Cut-Off Price' in Retail to avoid price-band disqualification.`;
    }
  } else {
    advisorTitle = `Bidding In Progress`;
    advisorMessage = `Subscription numbers will ramp up during market hours. Final odds typically crystallize on Day 3 between 2:00 PM and 4:30 PM IST.`;
  }

  return {
    retail,
    shni,
    bhni,
    hasLiveBids: effectiveRetail > 0 || effectiveShni > 0 || effectiveBhni > 0,
    advisorTitle,
    advisorMessage
  };
}

/**
 * Validates whether a fetched listing date is genuine and chronologically plausible
 * relative to the issue closing date.
 * Under SEBI regulations (T+3 settlement), an IPO never lists on or before its closing date.
 * Upstream scrapers (e.g. MainboardGMP) occasionally populate listing_date = close_date as a placeholder.
 *
 * @param {string|null} listingDate - Formatted listing date string (e.g. "05 Nov 2026", "2026-11-05")
 * @param {string|null} closeDate - Formatted closing date string (e.g. "02 Nov 2026", "2026-11-02")
 * @returns {boolean} True if listing date is genuine and strictly after close date; false if invalid/placeholder
 */
function isValidListingDate(listingDate, closeDate) {
  if (!listingDate || typeof listingDate !== 'string') return false;
  const cleanList = listingDate.trim();
  if (!cleanList || cleanList === '-' || cleanList === '0000-00-00' || cleanList === 'TBD' || cleanList === 'NA' || cleanList === 'N/A') {
    return false;
  }
  if (!closeDate || typeof closeDate !== 'string') return true;
  const cleanClose = closeDate.trim();
  if (!cleanClose || cleanClose === '-' || cleanClose === '0000-00-00') return true;

  // Exact string match (e.g. "02 Nov 2026" and "02 Nov 2026") indicates an upstream placeholder
  if (cleanList.toLowerCase() === cleanClose.toLowerCase()) {
    return false;
  }

  const dList = new Date(cleanList);
  const dClose = new Date(cleanClose);
  if (!isNaN(dList.getTime()) && !isNaN(dClose.getTime())) {
    // Listing must be strictly after closing date
    if (dList.getTime() <= dClose.getTime()) {
      return false;
    }
  }

  return true;
}

module.exports = {
  computeLotApplications,
  parseSubscriptionValue,
  computeAllotmentOdds,
  isValidListingDate
};
