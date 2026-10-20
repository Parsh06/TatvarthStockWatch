import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Building2,
  TrendingUp,
  TrendingDown,
  Layers,
  Table as TableIcon,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import clsx from 'clsx';

// Format numbers in ₹ Crores with sign
function formatCrores(val) {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00 Cr';
  const abs = Math.abs(val);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(abs);
  const sign = val > 0 ? '+' : val < 0 ? '-' : '';
  return `${sign}₹${formatted} Cr`;
}

// Format numbers without currency prefix (standard table format)
function formatNumber(val) {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(val);
}

export default function FiiDiiWidget({ data, loading, error }) {
  const [activeScope, setActiveScope] = useState('combined'); // 'combined' | 'nseOnly' | 'tables'

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-52 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-5 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const current = data?.current;
  const history = Array.isArray(data?.history) ? data.history : [];
  const asOf = data?.asOf || current?.displayDate || 'Latest Session';

  if (!current || error) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm text-center">
        <Landmark className="w-8 h-8 text-textMuted mx-auto mb-2 opacity-60" />
        <p className="text-sm font-semibold text-textPrimary">Institutional Flow Unavailable</p>
        <p className="text-xs text-textMuted mt-1">
          FII/DII cash market reports are updated every trading evening after 17:30 IST.
        </p>
      </div>
    );
  }

  // Parse Combined vs NSE-Only datasets
  const combined = current.combined || {
    fii: current.fii || { buyValue: 0, sellValue: 0, netValue: 0 },
    dii: current.dii || { buyValue: 0, sellValue: 0, netValue: 0 },
    totalNet: current.totalNet || 0,
    totalBuy: (current.fii?.buyValue || 0) + (current.dii?.buyValue || 0),
    totalSell: (current.fii?.sellValue || 0) + (current.dii?.sellValue || 0),
    sentiment: current.sentiment || 'neutral',
    displayDate: current.displayDate,
  };

  const nseOnly = current.nseOnly || combined;
  const otherExchanges = current.otherExchanges;

  // Active dataset for cards & chart
  const activeData = activeScope === 'nseOnly' ? nseOnly : combined;
  const fii = activeData.fii || { buyValue: 0, sellValue: 0, netValue: 0 };
  const dii = activeData.dii || { buyValue: 0, sellValue: 0, netValue: 0 };
  const totalNet = activeData.totalNet !== undefined ? activeData.totalNet : (fii.netValue + dii.netValue);
  const isNetInflow = totalNet >= 0;

  // Chart data preparation (last 7 sessions)
  const chartData = history.slice(-7).map(item => {
    const scopeItem = activeScope === 'nseOnly' && item.nseOnly ? item.nseOnly : (item.combined || item);
    return {
      date: item.displayDate ? item.displayDate.split('-').slice(0, 2).join(' ') : item.date,
      net: scopeItem.totalNet,
      fiiNet: scopeItem.fii?.netValue || 0,
      diiNet: scopeItem.dii?.netValue || 0,
    };
  });

  // Balance bar calculations
  const totalBuy = (fii.buyValue || 0) + (dii.buyValue || 0);
  const fiiBuyPercent = totalBuy > 0 ? Math.round((fii.buyValue / totalBuy) * 100) : 50;
  const diiBuyPercent = 100 - fiiBuyPercent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm overflow-hidden"
    >
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-border/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-sm shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-textPrimary tracking-tight">
                Institutional Flow (FII / DII Cash)
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-textMuted border border-border font-mono">
                {asOf}
              </span>
            </div>
            <p className="text-xs text-textMuted mt-0.5">
              Foreign & Domestic Institutional cash market turnover & daily net flow
            </p>
          </div>
        </div>

        {/* Scope Pill Switcher & Net Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segment Selector */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-border text-xs font-semibold">
            <button
              onClick={() => setActiveScope('combined')}
              className={clsx(
                'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5',
                activeScope === 'combined'
                  ? 'bg-white dark:bg-slate-800 text-textPrimary shadow-sm'
                  : 'text-textMuted hover:text-textPrimary'
              )}
            >
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span>All Exchanges (NSE+BSE)</span>
            </button>
            <button
              onClick={() => setActiveScope('nseOnly')}
              className={clsx(
                'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5',
                activeScope === 'nseOnly'
                  ? 'bg-white dark:bg-slate-800 text-textPrimary shadow-sm'
                  : 'text-textMuted hover:text-textPrimary'
              )}
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>NSE Only</span>
            </button>
            <button
              onClick={() => setActiveScope('tables')}
              className={clsx(
                'px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5',
                activeScope === 'tables'
                  ? 'bg-white dark:bg-slate-800 text-textPrimary shadow-sm'
                  : 'text-textMuted hover:text-textPrimary'
              )}
            >
              <TableIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span>Both Reports</span>
            </button>
          </div>

          {/* Combined Net Sentiment Pill */}
          <div
            className={clsx(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-sm',
              isNetInflow
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
            )}
          >
            {isNetInflow ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            )}
            <span>
              Net {isNetInflow ? 'Inflow' : 'Outflow'}: {formatCrores(totalNet)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content View ──────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeScope !== 'tables' ? (
          /* Card View (Combined or NSE-Only) */
          <motion.div
            key={activeScope}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Segment Scope Indicator */}
            <div className="flex items-center justify-between text-xs text-textMuted px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Viewing:{' '}
                <strong className="text-textPrimary font-semibold">
                  {activeScope === 'nseOnly'
                    ? 'FII/FPI & DII trading activity on NSE in Capital Market Segment'
                    : 'FII/FPI & DII trading activity on NSE, BSE and MSEI in Capital Market Segment'}
                </strong>
              </span>
              <button
                onClick={() => setActiveScope('tables')}
                className="text-primary hover:underline font-semibold flex items-center gap-1"
              >
                View Both Raw Tables &rarr;
              </button>
            </div>

            {/* ── Dual Flow Cards ─────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FII / FPI Card */}
              <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/90 dark:border-white/5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-textPrimary tracking-tight block">
                        FII / FPI (Foreign Institutions)
                      </span>
                      <span className="text-[10px] text-textMuted">
                        {activeScope === 'nseOnly' ? 'NSE Cash Segment' : 'All Exchanges Combined'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'text-xs font-bold flex items-center gap-0.5 px-2 py-0.5 rounded-lg',
                      fii.netValue >= 0
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {fii.netValue >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {fii.netValue >= 0 ? 'Net Buyer' : 'Net Seller'}
                  </span>
                </div>

                <p
                  className={clsx(
                    'text-2xl font-extrabold tracking-tight mb-2.5',
                    fii.netValue >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {formatCrores(fii.netValue)}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2.5 border-t border-border/60">
                  <div>
                    <span className="text-textMuted block font-medium">Gross Buy</span>
                    <span className="font-bold text-textPrimary font-mono">
                      ₹{formatNumber(fii.buyValue)} Cr
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-textMuted block font-medium">Gross Sell</span>
                    <span className="font-bold text-textPrimary font-mono">
                      ₹{formatNumber(fii.sellValue)} Cr
                    </span>
                  </div>
                </div>
              </div>

              {/* DII Card */}
              <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/90 dark:border-white/5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-textPrimary tracking-tight block">
                        DII (Mutual Funds & Domestic)
                      </span>
                      <span className="text-[10px] text-textMuted">
                        {activeScope === 'nseOnly' ? 'NSE Cash Segment' : 'All Exchanges Combined'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'text-xs font-bold flex items-center gap-0.5 px-2 py-0.5 rounded-lg',
                      dii.netValue >= 0
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {dii.netValue >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {dii.netValue >= 0 ? 'Net Buyer' : 'Net Seller'}
                  </span>
                </div>

                <p
                  className={clsx(
                    'text-2xl font-extrabold tracking-tight mb-2.5',
                    dii.netValue >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {formatCrores(dii.netValue)}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2.5 border-t border-border/60">
                  <div>
                    <span className="text-textMuted block font-medium">Gross Buy</span>
                    <span className="font-bold text-textPrimary font-mono">
                      ₹{formatNumber(dii.buyValue)} Cr
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-textMuted block font-medium">Gross Sell</span>
                    <span className="font-bold text-textPrimary font-mono">
                      ₹{formatNumber(dii.sellValue)} Cr
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Visual Balance Ratio Bar ────────────────────────── */}
            <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-white/[0.02] border border-border/60">
              <div className="flex items-center justify-between text-xs font-medium text-textMuted mb-1.5">
                <span className="flex items-center gap-1 font-semibold text-textPrimary">
                  <Globe className="w-3.5 h-3.5 text-blue-500" /> FII Buy Share: {fiiBuyPercent}%
                </span>
                <span className="flex items-center gap-1 font-semibold text-textPrimary">
                  DII Buy Share: {diiBuyPercent}% <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${fiiBuyPercent}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${diiBuyPercent}%` }}
                />
              </div>
            </div>

            {/* ── 7-Day Trend Chart ───────────────────────────────── */}
            {chartData.length > 1 && (
              <div className="pt-4 border-t border-border/70">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-textPrimary flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    Rolling 7-Session Combined Net Flow Trend (
                    {activeScope === 'nseOnly' ? 'NSE Only' : 'All Exchanges'})
                  </span>
                  <span className="text-[10px] text-textMuted">Values in ₹ Crores</span>
                </div>

                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 9, fill: '#94a3b8' }}
                        tickFormatter={(val) =>
                          `${val >= 0 ? '+' : ''}${Math.round(val / 1000)}k`
                        }
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const p = payload[0].payload;
                          return (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 shadow-xl text-xs space-y-1">
                              <p className="font-bold text-slate-900 dark:text-white border-b border-border pb-1">
                                {p.date}
                              </p>
                              <p className="flex justify-between gap-3 text-textMuted">
                                <span>Total Net:</span>
                                <strong
                                  className={p.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}
                                >
                                  {formatCrores(p.net)}
                                </strong>
                              </p>
                              <p className="flex justify-between gap-3 text-textMuted">
                                <span>FII Net:</span>
                                <span
                                  className={
                                    p.fiiNet >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                  }
                                >
                                  {formatCrores(p.fiiNet)}
                                </span>
                              </p>
                              <p className="flex justify-between gap-3 text-textMuted">
                                <span>DII Net:</span>
                                <span
                                  className={
                                    p.diiNet >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                  }
                                >
                                  {formatCrores(p.diiNet)}
                                </span>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.net >= 0 ? '#10b981' : '#f43f5e'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          /* Detailed Dual Table View (Matching Official NSE Report) */
          <motion.div
            key="tables-view"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* ── Table 1: All Exchanges (NSE, BSE, MSEI) ──────────── */}
            <div className="rounded-xl border border-border overflow-hidden bg-white/40 dark:bg-white/[0.02]">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-textPrimary flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    FII/FPI & DII trading activity on NSE, BSE and MSEI in Capital Market Segment
                  </h3>
                  <p className="text-[11px] text-textMuted mt-0.5">
                    Official consolidated figures across all Indian stock exchanges
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold rounded-lg border border-blue-500/20">
                  Consolidated
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 dark:bg-white/5 text-textMuted uppercase text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">Category</th>
                      <th className="py-2.5 px-4 font-bold">Date</th>
                      <th className="py-2.5 px-4 font-bold text-right">Buy Value (₹ Crores)</th>
                      <th className="py-2.5 px-4 font-bold text-right">Sell Value (₹ Crores)</th>
                      <th className="py-2.5 px-4 font-bold text-right">Net Value (₹ Crores)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {/* DII Row */}
                    <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-bold text-textPrimary flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                        DII
                      </td>
                      <td className="py-3 px-4 text-textMuted font-mono">
                        {combined.displayDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(combined.dii.buyValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(combined.dii.sellValue)}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 text-right font-mono font-bold',
                          combined.dii.netValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                      >
                        {formatCrores(combined.dii.netValue)}
                      </td>
                    </tr>

                    {/* FII Row */}
                    <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-bold text-textPrimary flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        FII/FPI
                      </td>
                      <td className="py-3 px-4 text-textMuted font-mono">
                        {combined.displayDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(combined.fii.buyValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(combined.fii.sellValue)}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 text-right font-mono font-bold',
                          combined.fii.netValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                      >
                        {formatCrores(combined.fii.netValue)}
                      </td>
                    </tr>

                    {/* Consolidated Total Row */}
                    <tr className="bg-slate-100/50 dark:bg-white/[0.03] font-bold">
                      <td className="py-3 px-4 text-textPrimary font-semibold">Total Institutional</td>
                      <td className="py-3 px-4 text-textMuted font-mono font-normal">
                        {combined.displayDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-textPrimary">
                        {formatNumber(combined.totalBuy)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-textPrimary">
                        {formatNumber(combined.totalSell)}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 text-right font-mono text-sm font-extrabold',
                          combined.totalNet >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                      >
                        {formatCrores(combined.totalNet)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Table 2: NSE Segment Only ────────────────────────── */}
            <div className="rounded-xl border border-border overflow-hidden bg-white/40 dark:bg-white/[0.02]">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-textPrimary flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    FII/FPI & DII trading activity on NSE in Capital Market Segment
                  </h3>
                  <p className="text-[11px] text-textMuted mt-0.5">
                    Trades matched strictly on the National Stock Exchange of India (NSE)
                  </p>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg border border-indigo-500/20">
                  NSE Only
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 dark:bg-white/5 text-textMuted uppercase text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">Category</th>
                      <th className="py-2.5 px-4 font-bold">Date</th>
                      <th className="py-2.5 px-4 font-bold text-right">Buy Value (₹ Crores)</th>
                      <th className="py-2.5 px-4 font-bold text-right">Sell Value (₹ Crores)</th>
                      <th className="py-2.5 px-4 font-bold text-right">Net Value (₹ Crores)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {/* DII Row */}
                    <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-bold text-textPrimary flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                        DII
                      </td>
                      <td className="py-3 px-4 text-textMuted font-mono">
                        {nseOnly.displayDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(nseOnly.dii.buyValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(nseOnly.dii.sellValue)}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 text-right font-mono font-bold',
                          nseOnly.dii.netValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                      >
                        {formatCrores(nseOnly.dii.netValue)}
                      </td>
                    </tr>

                    {/* FII Row */}
                    <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-bold text-textPrimary flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        FII/FPI
                      </td>
                      <td className="py-3 px-4 text-textMuted font-mono">
                        {nseOnly.displayDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(nseOnly.fii.buyValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-textPrimary">
                        {formatNumber(nseOnly.fii.sellValue)}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 text-right font-mono font-bold',
                          nseOnly.fii.netValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                      >
                        {formatCrores(nseOnly.fii.netValue)}
                      </td>
                    </tr>

                    {/* NSE Segment Total Row */}
                    <tr className="bg-slate-100/50 dark:bg-white/[0.03] font-bold">
                      <td className="py-3 px-4 text-textPrimary font-semibold">Total NSE Segment</td>
                      <td className="py-3 px-4 text-textMuted font-mono font-normal">
                        {nseOnly.displayDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-textPrimary">
                        {formatNumber(nseOnly.totalBuy)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-textPrimary">
                        {formatNumber(nseOnly.totalSell)}
                      </td>
                      <td
                        className={clsx(
                          'py-3 px-4 text-right font-mono text-sm font-extrabold',
                          nseOnly.totalNet >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                      >
                        {formatCrores(nseOnly.totalNet)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Derived Delta Breakdown (BSE & Other Exchanges) ── */}
            {otherExchanges && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-cyan-500/5 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-textPrimary block">
                    BSE & Other Exchanges Contribution (Derived Delta)
                  </span>
                  <span className="text-textMuted text-[11px]">
                    Calculated by subtracting NSE Segment from All Exchanges Total
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono font-semibold">
                  <div>
                    <span className="text-textMuted block text-[10px]">DII on BSE</span>
                    <span
                      className={
                        otherExchanges.dii.netValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      }
                    >
                      {formatCrores(otherExchanges.dii.netValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-textMuted block text-[10px]">FII on BSE</span>
                    <span
                      className={
                        otherExchanges.fii.netValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      }
                    >
                      {formatCrores(otherExchanges.fii.netValue)}
                    </span>
                  </div>
                  <div className="border-l border-border pl-4">
                    <span className="text-textMuted block text-[10px]">BSE Total Net</span>
                    <span
                      className={
                        otherExchanges.totalNet >= 0
                          ? 'text-emerald-500 font-bold'
                          : 'text-rose-500 font-bold'
                      }
                    >
                      {formatCrores(otherExchanges.totalNet)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
