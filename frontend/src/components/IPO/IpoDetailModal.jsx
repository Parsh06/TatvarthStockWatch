import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Clock, 
  Calendar, 
  Copy, 
  Check, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  Users,
  Layers,
  Calculator,
  ChevronRight,
  Plus,
  Minus,
  Sparkles,
  ArrowRight,
  Activity
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

/**
 * Calculates SEBI standard IPO application bidding lots, shares, and amounts
 * for Retail (Min/Max), Small HNI (Min/Max), and Big HNI (Min).
 */
function computeLotApplications(lotSize, issuePrice) {
  const lot = parseInt(String(lotSize || '0').replace(/,/g, ''), 10);
  const price = parseFloat(issuePrice) || 0;
  if (!lot || lot <= 0 || !price || price <= 0) return null;

  const costPerLot = Math.round(lot * price);

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

export default function IpoDetailModal({ ipo, onClose }) {
  const [copied, setCopied] = useState(false);
  const [selectedLots, setSelectedLots] = useState(1);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!ipo) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [ipo]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const issuePrice = parseFloat(ipo?.issue_price) || 0;
  const gmp = parseFloat(ipo?.gmp) || 0;
  const estPrice = issuePrice + gmp;
  const estGain = issuePrice > 0 ? (gmp / issuePrice) * 100 : 0;
  
  const lotSizeNum = parseInt(String(ipo?.lot_size || '0').replace(/,/g, ''), 10) || 0;
  const minInvestment = ipo?.min_investment || (lotSizeNum > 0 && issuePrice > 0 ? Math.round(lotSizeNum * issuePrice) : null);

  const status = String(ipo?.tab_status || '').toUpperCase();
  const isCT = status === 'CT';
  const isOpen = status === 'OPEN';
  const isUpcoming = ['UPCOMING', 'SOON'].includes(status);

  const sub = ipo?.subscriptions || {
    total: ipo?.subscription || '-',
    retail: '-',
    shni: '-',
    bhni: '-',
    nii: '-',
    qib: '-',
    updatedAt: null
  };

  // Compute exact SEBI application lots breakdown
  const lotApplications = useMemo(() => {
    return computeLotApplications(ipo?.lot_size, ipo?.issue_price);
  }, [ipo?.lot_size, ipo?.issue_price]);

  // Reset or initialize calculator lots
  useEffect(() => {
    setSelectedLots(1);
  }, [ipo?.id]);

  // Interactive Calculator computations
  const effectiveLots = Math.max(1, parseInt(selectedLots, 10) || 1);
  const calcShares = effectiveLots * (lotSizeNum > 0 ? lotSizeNum : 1);
  const calcInvestment = Math.round(calcShares * issuePrice);
  const calcProfit = Math.round(calcShares * gmp);
  const calcListingValue = calcInvestment + calcProfit;
  const calcGainPercent = calcInvestment > 0 ? (calcProfit / calcInvestment) * 100 : 0;

  if (!ipo) return null;

  const handleCopySummary = () => {
    const lines = [
      `📊 ${ipo.company_name} — IPO Details`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🏷️ Category: ${ipo.listing_exch || 'Mainboard'} (${ipo.segment || 'Mainboard'})`,
      `💰 Issue Price: ₹${ipo.issue_price || 'NA'}`,
      `📦 Lot Size: ${ipo.lot_size || 'NA'} shares (Min: ₹${minInvestment ? minInvestment.toLocaleString('en-IN') : 'NA'})`,
      `📈 Live GMP: ${gmp > 0 ? `+₹${gmp}` : `₹${gmp}`} (${estGain > 0 ? `+${estGain.toFixed(2)}%` : `${estGain.toFixed(2)}%`})`,
      ipo.gmp_range ? `🔄 GMP Range: ${ipo.gmp_range}` : null,
      `🎯 Est. Listing Price: ₹${estPrice > 0 ? estPrice.toFixed(2) : 'NA'}`,
    ].filter(Boolean);

    if (lotApplications && lotApplications.length > 0) {
      lines.push(
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📋 IPO Lot Size & Bidding Applications:`,
        ` • Min ${ipo.lot_size} shares and multiples thereof.`,
        ...lotApplications.map(
          (a) => ` • ${a.category}: ${a.lots} Lot${a.lots > 1 ? 's' : ''} (${a.shares.toLocaleString('en-IN')} sh) = ₹${a.amount.toLocaleString('en-IN')}`
        )
      );
    }

    lines.push(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👥 Subscriptions:`,
      ` • Total: ${sub.total || '-'}`,
      ` • Retail (RII): ${sub.retail || '-'}`,
      ` • Small HNI (sHNI): ${sub.shni || '-'}`,
      ` • Big HNI (bHNI): ${sub.bhni || '-'}`,
      ` • Total NII: ${sub.nii || '-'}`,
      ` • QIB: ${sub.qib || '-'}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📅 6-Stage Timeline:`,
      ` • 1. Issue Opens: ${ipo.open_date || '-'}`,
      ` • 2. Issue Closes: ${ipo.close_date || '-'}`,
      ` • 3. Allotment (BoA): ${ipo.boa_date || '-'}`,
      ` • 4. Initiation of Refunds: ${ipo.refund_date || '-'}`,
      ` • 5. Credit of Shares to Demat: ${ipo.demat_date || '-'}`,
      ` • 6. Listing Date: ${ipo.listing_date || '-'}`,
      `\n🔗 Track live on Tatvarth StockWatch: https://tatvarthstockwatch.web.app/ipo-gmp`
    );

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    toast.success('IPO details copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const modalElement = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 select-none">
        {/* Backdrop (Dark blur overlay centered on viewport) */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-md" 
          onClick={onClose} 
          aria-hidden="true" 
        />

        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl bg-surface border border-border/80 shadow-2xl rounded-3xl overflow-hidden z-10 flex flex-col max-h-[92vh] sm:max-h-[88vh] select-text"
          onClick={e => e.stopPropagation()}
        >
          {/* Top Accent Gradient Bar */}
          <div className={clsx(
            "h-1.5 w-full flex-shrink-0",
            isCT ? "bg-gradient-to-r from-red-500 via-amber-500 to-rose-500" :
            isOpen ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" :
            "bg-gradient-to-r from-primary via-indigo-500 to-purple-500"
          )} />

          {/* Sticky Header */}
          <div className="p-5 sm:p-6 pb-4 flex items-start justify-between gap-4 border-b border-border/60 bg-surface/95 backdrop-blur-md flex-shrink-0">
            <div className="flex items-start gap-3.5 min-w-0">
              {ipo.company_logo ? (
                <img 
                  src={ipo.company_logo} 
                  alt={ipo.logo_txt || 'IPO'} 
                  className="w-12 h-12 rounded-2xl object-cover bg-white/10 p-0.5 border border-border flex-shrink-0 shadow-sm" 
                />
              ) : (
                <div className={clsx(
                  "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold border flex-shrink-0 font-display shadow-sm",
                  isCT ? "bg-red-500/10 text-red-500 border-red-500/20" :
                  isOpen ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  "bg-primary/10 text-primary border-primary/20"
                )}>
                  {ipo.logo_txt || 'IPO'}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-textPrimary tracking-tight truncate max-w-[280px] sm:max-w-[400px]">
                    {ipo.company_name}
                  </h2>
                  
                  <span className={clsx(
                    "text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold border inline-flex items-center gap-1 shadow-xs",
                    isCT ? 'bg-red-500/15 text-red-500 border-red-500/30' : 
                    isOpen ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25' : 
                    isUpcoming ? 'bg-amber-500/15 text-amber-500 border-amber-500/25' : 
                    'bg-slate-100 dark:bg-white/5 text-textMuted border-border/60'
                  )}>
                    {isCT && <Clock className="w-2.5 h-2.5 animate-spin" />}
                    {isCT ? 'Closing Today' : ipo.tab_status || 'Active'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-textMuted">
                  <span className="font-semibold text-textPrimary bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-border/60">
                    {ipo.listing_exch || 'Mainboard'}
                  </span>
                  
                  {ipo.ipo_size && ipo.ipo_size !== '-' && (
                    <span>Issue: <strong className="text-textPrimary font-semibold">{ipo.ipo_size}</strong></span>
                  )}

                  {ipo.fire_rating > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-400">
                      {Array(ipo.fire_rating).fill('🔥').map((emoji, fIdx) => (
                        <span key={fIdx} className="text-xs">{emoji}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Smooth Scrollable Body */}
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto scrollbar-thin">
            {/* Key Pricing & Valuation 4-Card Hero Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Issue Price */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-border/80 rounded-2xl p-3">
                <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider block mb-1">Issue Price</span>
                <p className="text-base sm:text-lg font-bold text-textPrimary tabular-nums font-mono">
                  {issuePrice > 0 ? `₹${ipo.issue_price}` : 'NA'}
                </p>
                <span className="text-[11px] text-textMuted block mt-0.5">Price Band</span>
              </div>

              {/* Lot Size & Min Capital */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-border/80 rounded-2xl p-3">
                <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider block mb-1">Lot Size</span>
                <p className="text-base sm:text-lg font-bold text-textPrimary tabular-nums font-mono">
                  {ipo.lot_size || '-'} <span className="text-xs font-normal text-textMuted font-sans">shares</span>
                </p>
                <span className="text-[11px] text-textMuted block mt-0.5">
                  {minInvestment ? `Min: ₹${minInvestment.toLocaleString('en-IN')}` : '1 Lot Application'}
                </span>
              </div>

              {/* Live GMP & Range */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-border/80 rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider block">Live GMP</span>
                  {ipo.gmp_range && (
                    <span className="text-[9px] font-mono text-primary font-bold bg-primary/10 px-1 py-0.2 rounded">
                      {ipo.gmp_range}
                    </span>
                  )}
                </div>
                <p className={clsx(
                  "text-base sm:text-lg font-bold tabular-nums font-mono mt-1",
                  gmp > 0 ? "text-emerald-500 dark:text-emerald-400" : gmp < 0 ? "text-red-500" : "text-textMuted"
                )}>
                  {gmp > 0 ? '+' : ''}{ipo.gmp !== 'NA' && ipo.gmp != null ? `₹${ipo.gmp}` : '₹0'}
                </p>
                <span className="text-[11px] text-textMuted block mt-0.5">
                  {ipo.gmp_updated_on ? ipo.gmp_updated_on : 'Grey Market'}
                </span>
              </div>

              {/* Estimated Listing & Gain */}
              <div className={clsx(
                "rounded-2xl p-3 border",
                estGain > 0 ? "bg-emerald-500/10 border-emerald-500/20" :
                estGain < 0 ? "bg-red-500/10 border-red-500/20" :
                "bg-slate-50 dark:bg-white/[0.03] border-border/80"
              )}>
                <span className="text-[10px] font-semibold text-textMuted uppercase tracking-wider block mb-1">Est. Listing</span>
                <p className="text-base sm:text-lg font-bold text-textPrimary tabular-nums font-mono">
                  {estPrice > 0 ? `₹${estPrice.toFixed(2)}` : 'NA'}
                </p>
                <span className={clsx(
                  "text-[11px] font-semibold inline-flex items-center gap-0.5 mt-0.5",
                  estGain > 0 ? "text-emerald-500 dark:text-emerald-400" : estGain < 0 ? "text-red-500" : "text-textMuted"
                )}>
                  {estGain > 0 ? <TrendingUp className="w-3 h-3" /> : estGain < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                  {estGain !== 0 ? `${estGain > 0 ? '+' : ''}${estGain.toFixed(2)}%` : 'At Par (0%)'}
                </span>
              </div>
            </div>

            {/* ── NEW: Interactive Expected Listing Profit & ROI Calculator ── */}
            <div className="bg-gradient-to-br from-primary/5 via-slate-50 to-primary/10 dark:from-primary/10 dark:via-black/20 dark:to-primary/5 border border-primary/25 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-primary/20">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-textPrimary flex items-center gap-1.5">
                    Listing Profit Calculator
                    <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">Live ROI</span>
                  </h3>
                </div>
                <span className="text-[11px] text-textMuted">
                  Based on live GMP of <strong className="text-primary font-mono">{gmp > 0 ? `+₹${gmp}` : `₹${gmp}`}</strong> / share
                </span>
              </div>

              {/* Quick Preset Chips & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedLots(1)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all",
                      selectedLots === 1 
                        ? "bg-primary text-white border-primary shadow-xs" 
                        : "bg-surface border-border/80 hover:bg-slate-100 dark:hover:bg-white/5 text-textMuted"
                    )}
                  >
                    1 Lot (Retail Min)
                  </button>

                  {lotApplications && lotApplications[1] && (
                    <button
                      type="button"
                      onClick={() => setSelectedLots(lotApplications[1].lots)}
                      className={clsx(
                        "px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all",
                        selectedLots === lotApplications[1].lots 
                          ? "bg-primary text-white border-primary shadow-xs" 
                          : "bg-surface border-border/80 hover:bg-slate-100 dark:hover:bg-white/5 text-textMuted"
                      )}
                    >
                      {lotApplications[1].lots} Lots (Max Retail)
                    </button>
                  )}

                  {lotApplications && lotApplications[2] && (
                    <button
                      type="button"
                      onClick={() => setSelectedLots(lotApplications[2].lots)}
                      className={clsx(
                        "px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all",
                        selectedLots === lotApplications[2].lots 
                          ? "bg-primary text-white border-primary shadow-xs" 
                          : "bg-surface border-border/80 hover:bg-slate-100 dark:hover:bg-white/5 text-textMuted"
                      )}
                    >
                      {lotApplications[2].lots} Lots (sHNI Min)
                    </button>
                  )}
                </div>

                {/* Plus / Minus Lot Stepper */}
                <div className="flex items-center gap-1.5 bg-surface border border-border/80 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedLots(p => Math.max(1, p - 1))}
                    disabled={selectedLots <= 1}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 text-textMuted transition-colors"
                    aria-label="Decrease lots"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-xs font-bold text-textPrimary px-2 min-w-[3.5rem] text-center">
                    {selectedLots} {selectedLots === 1 ? 'Lot' : 'Lots'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedLots(p => p + 1)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-textMuted transition-colors"
                    aria-label="Increase lots"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Reactive Profit Projection 3-Card Deck */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center">
                {/* 1. Required Capital */}
                <div className="bg-surface/90 border border-border/80 rounded-xl p-3">
                  <span className="text-[10px] uppercase tracking-wider text-textMuted font-semibold block mb-0.5">Required Capital</span>
                  <p className="text-base font-extrabold text-textPrimary font-mono">
                    ₹{calcInvestment.toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] text-textMuted">
                    {calcShares.toLocaleString('en-IN')} total shares @ ₹{issuePrice}
                  </span>
                </div>

                {/* 2. Expected Net Profit */}
                <div className={clsx(
                  "border rounded-xl p-3",
                  calcProfit > 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                  calcProfit < 0 ? "bg-red-500/10 border-red-500/30 text-red-500" :
                  "bg-surface/90 border-border/80 text-textMuted"
                )}>
                  <span className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5">Expected Net Profit</span>
                  <p className="text-base font-extrabold font-mono">
                    {calcProfit > 0 ? '+' : ''}₹{calcProfit.toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] font-bold inline-flex items-center gap-0.5">
                    {calcProfit > 0 ? <TrendingUp className="w-3 h-3" /> : calcProfit < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                    {calcGainPercent !== 0 ? `${calcGainPercent > 0 ? '+' : ''}${calcGainPercent.toFixed(2)}% gain` : '0% listing return'}
                  </span>
                </div>

                {/* 3. Est. Total Listing Value */}
                <div className="bg-surface/90 border border-border/80 rounded-xl p-3">
                  <span className="text-[10px] uppercase tracking-wider text-textMuted font-semibold block mb-0.5">Est. Value on Listing</span>
                  <p className="text-base font-extrabold text-textPrimary font-mono">
                    ₹{calcListingValue.toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] text-textMuted">
                    @ est. ₹{estPrice.toFixed(2)} / share
                  </span>
                </div>
              </div>
            </div>

            {/* Section: IPO Lot Size & Bidding Applications Table */}
            {lotApplications && lotApplications.length > 0 && (
              <div className="bg-slate-50/70 dark:bg-white/[0.02] border border-border/80 rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3 pb-2.5 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-textPrimary">
                      IPO Lot Size & Bidding Limits
                    </h3>
                  </div>
                  <span className="text-[11px] text-textMuted font-sans">
                    Min <strong className="text-textPrimary font-semibold">{ipo.lot_size} shares</strong> & multiples thereof
                  </span>
                </div>

                <div className="overflow-x-auto -mx-1 sm:mx-0">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-textMuted font-semibold">
                        <th className="pb-2 pl-2">Application</th>
                        <th className="pb-2 text-center">Lots</th>
                        <th className="pb-2 text-right">Shares</th>
                        <th className="pb-2 pr-2 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {lotApplications.map((row, rIdx) => (
                        <tr 
                          key={rIdx} 
                          onClick={() => setSelectedLots(row.lots)}
                          className="hover:bg-primary/[0.06] transition-colors cursor-pointer"
                          title="Click to calculate profit for this tier"
                        >
                          <td className="py-2 pl-2 font-sans font-medium text-textPrimary flex items-center gap-2">
                            <span className="font-semibold">{row.category}</span>
                            <span className={clsx("text-[9px] px-1.5 py-0.5 rounded-md font-semibold border hidden sm:inline-block", row.badgeClass)}>
                              {row.tag}
                            </span>
                          </td>
                          <td className="py-2 text-center font-bold text-textPrimary">
                            {row.lots}
                          </td>
                          <td className="py-2 text-right font-medium text-textMuted">
                            {row.shares.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 pr-2 text-right font-bold text-textPrimary">
                            ₹{row.amount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section: Live Subscriptions Breakdown (with Total NII) */}
            <div className="bg-slate-50/70 dark:bg-white/[0.02] border border-border/80 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-textPrimary">
                    Subscription Status
                  </h3>
                </div>
                {sub.updatedAt && (
                  <span className="text-[10px] text-textMuted">
                    Updated: {sub.updatedAt}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                {/* Retail */}
                <div className="bg-surface border border-border/60 rounded-xl p-2.5 shadow-xs">
                  <span className="text-[10px] font-semibold text-textMuted block mb-0.5">Retail (RII)</span>
                  <p className={clsx(
                    "text-base font-bold tabular-nums font-mono",
                    sub.retail !== '-' ? "text-emerald-500 dark:text-emerald-400" : "text-textMuted"
                  )}>
                    {sub.retail || '-'}
                  </p>
                  <span className="text-[9px] text-textMuted">≤ ₹2 Lakhs</span>
                </div>

                {/* Small HNI */}
                <div className="bg-surface border border-border/60 rounded-xl p-2.5 shadow-xs">
                  <span className="text-[10px] font-semibold text-textMuted block mb-0.5">Small HNI</span>
                  <p className={clsx(
                    "text-base font-bold tabular-nums font-mono",
                    sub.shni !== '-' ? "text-amber-500 dark:text-amber-400" : "text-textMuted"
                  )}>
                    {sub.shni || '-'}
                  </p>
                  <span className="text-[9px] text-textMuted">₹2L – ₹10L</span>
                </div>

                {/* Big HNI */}
                <div className="bg-surface border border-border/60 rounded-xl p-2.5 shadow-xs">
                  <span className="text-[10px] font-semibold text-textMuted block mb-0.5">Big HNI</span>
                  <p className={clsx(
                    "text-base font-bold tabular-nums font-mono",
                    sub.bhni !== '-' ? "text-blue-500 dark:text-blue-400" : "text-textMuted"
                  )}>
                    {sub.bhni || '-'}
                  </p>
                  <span className="text-[9px] text-textMuted">&gt; ₹10 Lakhs</span>
                </div>

                {/* Total NII (Combined HNI) */}
                <div className="bg-surface border border-border/60 rounded-xl p-2.5 shadow-xs">
                  <span className="text-[10px] font-semibold text-textMuted block mb-0.5">Total NII</span>
                  <p className={clsx(
                    "text-base font-bold tabular-nums font-mono",
                    sub.nii !== '-' ? "text-indigo-500 dark:text-indigo-400" : "text-textMuted"
                  )}>
                    {sub.nii || '-'}
                  </p>
                  <span className="text-[9px] text-textMuted">Combined HNI</span>
                </div>

                {/* QIB */}
                <div className="bg-surface border border-border/60 rounded-xl p-2.5 shadow-xs">
                  <span className="text-[10px] font-semibold text-textMuted block mb-0.5">QIB</span>
                  <p className="text-base font-bold text-textPrimary tabular-nums font-mono">
                    {sub.qib || '-'}
                  </p>
                  <span className="text-[9px] text-textMuted">Institutional</span>
                </div>

                {/* Total Overall */}
                <div className="col-span-2 sm:col-span-1 bg-primary/10 border border-primary/25 rounded-xl p-2.5 shadow-xs">
                  <span className="text-[10px] font-bold text-primary uppercase block mb-0.5">Total Sub.</span>
                  <p className="text-base font-extrabold text-primary tabular-nums font-mono">
                    {sub.total || '-'}
                  </p>
                  <span className="text-[9px] text-primary/80 font-medium">All Categories</span>
                </div>
              </div>
            </div>

            {/* Section: Complete SEBI 6-Milestone Issue Timeline */}
            <div className="bg-slate-50/70 dark:bg-white/[0.02] border border-border/80 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-textPrimary">
                  SEBI Issue Milestones & Dates
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {/* 1. Open */}
                <div className="bg-surface border border-border/50 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-textMuted text-[10px] block">1. Issue Opens</span>
                  <span className="font-semibold text-textPrimary text-sm block">
                    {ipo.open_date || '-'}
                  </span>
                </div>

                {/* 2. Close */}
                <div className="bg-surface border border-border/50 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-textMuted text-[10px] block">2. Issue Closes</span>
                  <span className={clsx(
                    "font-semibold text-sm block",
                    isCT ? "text-red-500 font-bold" : "text-textPrimary"
                  )}>
                    {ipo.close_date || '-'} {isCT && '(Today)'}
                  </span>
                </div>

                {/* 3. Allotment */}
                <div className="bg-surface border border-border/50 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-textMuted text-[10px] block">3. Allotment (BoA)</span>
                  <span className="font-semibold text-textPrimary text-sm block">
                    {ipo.boa_date || '-'}
                  </span>
                </div>

                {/* 4. Refunds */}
                <div className="bg-surface border border-border/50 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-textMuted text-[10px] block">4. Initiation of Refunds</span>
                  <span className="font-semibold text-textPrimary text-sm block">
                    {ipo.refund_date || '-'}
                  </span>
                </div>

                {/* 5. Demat Credit */}
                <div className="bg-surface border border-border/50 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-textMuted text-[10px] block">5. Demat Credit</span>
                  <span className="font-semibold text-textPrimary text-sm block">
                    {ipo.demat_date || '-'}
                  </span>
                </div>

                {/* 6. Listing Date */}
                <div className="bg-surface border border-border/50 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-textMuted text-[10px] block">6. Listing on Exchange</span>
                  <span className="font-semibold text-textPrimary text-sm block text-emerald-500 font-bold">
                    {ipo.listing_date || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section: Extra Metadata & Valuation */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-surface border border-border/70 rounded-xl p-2.5 space-y-0.5">
                <span className="text-textMuted text-[10px] block">P/E Ratio</span>
                <p className="font-bold text-textPrimary text-sm font-mono">{ipo.pe_ratio || '-'}</p>
              </div>

              <div className="bg-surface border border-border/70 rounded-xl p-2.5 space-y-0.5">
                <span className="text-textMuted text-[10px] block">Anchor Quota</span>
                <p className="font-bold text-textPrimary text-sm">{ipo.anchor || '-'}</p>
              </div>

              <div className="bg-surface border border-border/70 rounded-xl p-2.5 space-y-0.5">
                <span className="text-textMuted text-[10px] block">Segment</span>
                <p className="font-bold text-textPrimary text-sm">{ipo.segment || 'Mainboard'}</p>
              </div>

              <div className="bg-surface border border-border/70 rounded-xl p-2.5 space-y-0.5">
                <span className="text-textMuted text-[10px] block">Listing Exchange</span>
                <p className="font-bold text-textPrimary text-sm">{ipo.listing_exch || '-'}</p>
              </div>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-black/30 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
            <button
              onClick={handleCopySummary}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold text-textPrimary transition-colors shadow-sm"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied Details' : 'Copy Summary'}
            </button>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Link
                to={`/ipo-check?search=${encodeURIComponent(ipo.company_name)}`}
                onClick={onClose}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold shadow-md shadow-primary/20 transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                Check Allotment
              </Link>

              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-border/80 hover:bg-slate-200/50 dark:hover:bg-white/5 text-xs font-medium text-textMuted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalElement, document.body);
}
