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
 *
 * @param {Object} subObj - Object containing { retail, shni, bhni, nii, total }
 * @param {string} segment - "MAINBOARD" or "SME"
 * @param {number} familyPans - Number of distinct family PAN cards (1 to 25)
 * @param {number} minInvestment - Approximate minimum lot cost in INR
 * @returns {Object} Comprehensive odds, probabilities, badges, and strategic advisory recommendations
 */
function computeAllotmentOdds(subObj, segment = 'MAINBOARD', familyPans = 1, minInvestment = 15000) {
  const pansCount = Math.max(1, parseInt(familyPans, 10) || 1);

  const subRetail = parseSubscriptionValue(subObj?.retail);
  const subShni   = parseSubscriptionValue(subObj?.shni);
  const subBhni   = parseSubscriptionValue(subObj?.bhni);
  const subNii    = parseSubscriptionValue(subObj?.nii);
  const subTotal  = parseSubscriptionValue(subObj?.total);

  // If specific HNI tiers are not yet segregated, derive from Total NII or Total
  const effectiveRetail = subRetail > 0 ? subRetail : (subTotal > 0 ? subTotal * 0.75 : 0);
  const effectiveShni   = subShni > 0 ? subShni : (subNii > 0 ? subNii * 0.85 : (subTotal > 0 ? subTotal * 1.5 : 0));
  const effectiveBhni   = subBhni > 0 ? subBhni : (subNii > 0 ? subNii * 1.15 : (subTotal > 0 ? subTotal * 2.0 : 0));

  const buildCategoryOdds = (mult, categoryTitle, sebiRule, categoryQuotaTag) => {
    if (mult <= 0) {
      return {
        multiplier: 0,
        probabilitySingle: 0,
        probabilityFamily: 0,
        oddsRatioText: 'Awaiting Live Bids',
        roundOdds: 0,
        status: 'AWAITING',
        rule: sebiRule,
        quotaTag: categoryQuotaTag,
        badge: 'Early / Upcoming',
        badgeClass: 'text-textMuted bg-slate-100 dark:bg-white/5 border-border'
      };
    }

    if (mult <= 1.0) {
      return {
        multiplier: mult,
        probabilitySingle: 100,
        probabilityFamily: 100,
        oddsRatioText: '1 in 1 (100% Guaranteed)',
        roundOdds: 1,
        status: 'GUARANTEED',
        rule: 'Every valid applicant receives 1 lot guaranteed. Remaining shares allotted pro-rata.',
        quotaTag: categoryQuotaTag,
        badge: '100% Guaranteed',
        badgeClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
      };
    }

    // Oversubscribed: Computerized lottery
    const probSingle = Math.min(100, Math.max(0.01, 100 / mult));
    const roundOdds  = Math.max(1, Math.round(mult));
    
    // Binomial Probability for N family PANs: 1 - (1 - p)^N
    // If pansCount === 1, exactly equals probSingle without floating-point cancellation drift
    const pDecimal   = probSingle / 100;
    const probFamily = pansCount === 1
      ? probSingle
      : Math.min(100, (1 - Math.pow(1 - pDecimal, pansCount)) * 100);
    const oddsBoost  = probSingle > 0 ? (probFamily / probSingle).toFixed(1) : '1.0';

    return {
      multiplier: mult,
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
        : 'text-rose-500 bg-rose-500/10 border-rose-500/20'
    };
  };

  const retail = buildCategoryOdds(
    effectiveRetail,
    'Retail (RII)',
    'SEBI Draw of Lots (Pure Computerized Lottery for 1 Min Lot)',
    '≤ ₹2 Lakhs (35% Quota)'
  );

  const shni = buildCategoryOdds(
    effectiveShni,
    'Small HNI (sHNI)',
    'SEBI April 2022 Lottery (Only Min sHNI Lot, excess bid refunded)',
    '₹2L – ₹10L (5% Quota)'
  );

  const bhni = buildCategoryOdds(
    effectiveBhni,
    'Big HNI (bHNI)',
    effectiveBhni > 10
      ? 'SEBI bHNI Lottery for Min Lot (Due to heavy oversubscription)'
      : 'SEBI Min Lot + Pro-Rata Distribution of surplus',
    '> ₹10 Lakhs (10% Quota)'
  );

  // Strategic Advisor Comparison
  let advisorTitle = '';
  let advisorMessage = '';

  if (effectiveRetail > 0 && effectiveShni > 0) {
    if (effectiveRetail <= 1.0) {
      advisorTitle = `Retail Category Undersubscribed (100% Guaranteed)`;
      advisorMessage = `All valid Retail applicants will receive 1 full lot guaranteed. This is an optimal entry window for 1-lot applicants.`;
    } else if (effectiveShni > effectiveRetail) {
      const timesBetter = (effectiveShni / effectiveRetail).toFixed(1);
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

module.exports = {
  computeLotApplications,
  parseSubscriptionValue,
  computeAllotmentOdds
};
