import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Download, TrendingUp, AlertCircle, Calendar, Briefcase, Zap, ChevronLeft, ChevronRight, Clock, CheckCircle2, Flame } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '../../services/apiClient';
import { exportToXLSX } from '../../utils/csvParser';
import PageTransition from '../Common/PageTransition';
import Loader, { Spinner } from '../Common/Loader';

function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor }) {
  return (
    <div className="glass-panel hover:-translate-y-1 hover:shadow-premium-hover transition-all duration-300 rounded-2xl p-5 flex items-center gap-4 group relative overflow-hidden">
      <div className={clsx("absolute -top-10 -right-10 w-24 h-24 blur-3xl opacity-20 rounded-full transition-opacity group-hover:opacity-30", iconColor || 'bg-primary')} />
      {Icon && (
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner z-10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3', iconColor || 'bg-black/5 dark:bg-white/5')}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
      )}
      <div className="z-10">
        <p className="text-[11px] font-medium tracking-tight text-textMuted mb-0.5 uppercase">{label}</p>
        <p className={clsx('text-2xl font-bold font-display tabular-nums tracking-tight', color)}>{value}</p>
        {sub && <p className="text-xs text-textMuted mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function IPOGmpPage() {
  const [ipos, setIpos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lastFetched, setLastFetched] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'CT' | 'OPEN' | 'UPCOMING' | 'CLOSED'
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const data = await apiClient(`/api/market/ipo-gmp?page=${currentPage}&search=${encodeURIComponent(debouncedSearch)}`);
      if (data) {
        setIpos(data.data || []);
        if (data.total_pages) setTotalPages(data.total_pages);
        if (data.total) setTotalItems(data.total);
        setLastFetched(new Date());
      }
    } catch (err) {
      console.error(err);
      if (!isBackground) setError(err.message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(() => {
      fetchData(true);
    }, 60000);
    return () => clearInterval(intervalId);
  }, [currentPage, debouncedSearch]);

  const handleExport = () => {
    if (!ipos.length) return;
    const exportData = ipos.map(m => {
      const issuePrice = parseFloat(m.issue_price) || 0;
      const gmp = parseFloat(m.gmp) || 0;
      const estPrice = issuePrice + gmp;
      const estGain = issuePrice > 0 ? (gmp / issuePrice) * 100 : 0;
      
      return {
        'Company Name': m.company_name,
        'Status': m.tab_status,
        'Exchange': m.listing_exch,
        'Open Date': m.open_date,
        'Close Date': m.close_date,
        'Listing Date': m.listing_date,
        'Issue Price': m.issue_price,
        'Lot Size': m.lot_size,
        'GMP': m.gmp,
        'Est. Listing Price': estPrice.toFixed(2),
        'Est. Gain %': `${estGain.toFixed(2)}%`
      };
    });
    exportToXLSX(exportData, `IPO_GMP_${new Date().toISOString().slice(0, 10)}`);
  };

  // Counts by category
  const ctIposCount = useMemo(() => ipos.filter(i => String(i.tab_status || '').toUpperCase() === 'CT').length, [ipos]);
  const openIposCount = useMemo(() => ipos.filter(i => String(i.tab_status || '').toLowerCase() === 'open').length, [ipos]);
  const upcomingIposCount = useMemo(() => ipos.filter(i => ['upcoming', 'soon'].includes(String(i.tab_status || '').toLowerCase())).length, [ipos]);
  const closedIposCount = useMemo(() => ipos.filter(i => String(i.tab_status || '').toLowerCase() === 'closed').length, [ipos]);

  // Order priority: CT (1) -> OPEN (2) -> UPCOMING (3) -> CLOSED (4)
  const getStatusCategory = (tabStatus) => {
    const s = String(tabStatus || '').trim().toUpperCase();
    if (s === 'CT') return 'CT';
    if (s === 'OPEN') return 'OPEN';
    if (['UPCOMING', 'SOON'].includes(s)) return 'UPCOMING';
    return 'CLOSED';
  };

  const getStatusWeight = (category) => {
    if (category === 'CT') return 1;
    if (category === 'OPEN') return 2;
    if (category === 'UPCOMING') return 3;
    return 4;
  };

  // Filtered and Sorted IPO list
  const processedIpos = useMemo(() => {
    let filtered = [...ipos];

    if (activeFilter !== 'ALL') {
      filtered = filtered.filter(i => getStatusCategory(i.tab_status) === activeFilter);
    }

    filtered.sort((a, b) => {
      const catA = getStatusCategory(a.tab_status);
      const catB = getStatusCategory(b.tab_status);

      const weightDiff = getStatusWeight(catA) - getStatusWeight(catB);
      if (weightDiff !== 0) return weightDiff;

      // Within category: sort by Estimated Gain % descending, then GMP descending
      const issueA = parseFloat(a.issue_price) || 0;
      const gmpA = parseFloat(a.gmp) || 0;
      const gainA = issueA > 0 ? (gmpA / issueA) * 100 : 0;

      const issueB = parseFloat(b.issue_price) || 0;
      const gmpB = parseFloat(b.gmp) || 0;
      const gainB = issueB > 0 ? (gmpB / issueB) * 100 : 0;

      if (gainB !== gainA) return gainB - gainA;
      return gmpB - gmpA;
    });

    return filtered;
  }, [ipos, activeFilter]);

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IPO GMP Tracker</h1>
          <p className="text-textMuted mt-1">
            Track active & upcoming IPOs, current Grey Market Premium, and estimated listing gains.
          </p>
          {lastFetched && (
            <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1 font-medium">
              <Zap className="w-3 h-3 text-primary animate-pulse" /> Live updating (Last updated: {lastFetched.toLocaleTimeString()})
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => fetchData(false)}
            disabled={loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
          <button 
            onClick={handleExport}
            disabled={!ipos.length}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary rounded-xl text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="Closing Today (CT)" 
          value={ctIposCount} 
          icon={Clock} 
          color="text-red-400" 
          iconColor="bg-red-500/20 text-red-400" 
          sub="Last day to apply"
        />
        <StatCard 
          label="Open for Bidding" 
          value={openIposCount} 
          icon={CheckCircle2} 
          color="text-emerald-400" 
          iconColor="bg-emerald-500/20 text-emerald-400" 
          sub="Active bidding window"
        />
        <StatCard 
          label="Upcoming IPOs" 
          value={upcomingIposCount} 
          icon={Calendar} 
          color="text-amber-400" 
          iconColor="bg-amber-500/20 text-amber-400" 
          sub="Announced issues"
        />
        <StatCard 
          label="Total Active Issues" 
          value={ctIposCount + openIposCount} 
          icon={Briefcase} 
          color="text-primary" 
          iconColor="bg-primary/20 text-primary" 
          sub="Open + Closing Today"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
          <input 
            type="text" 
            placeholder="Search by company name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner placeholder:text-textMuted/50"
          />
        </div>

        {/* Category Pills (CT -> OPEN -> UPCOMING -> CLOSED) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shadow-sm",
              activeFilter === 'ALL'
                ? "bg-primary text-white border-primary shadow-primary/20"
                : "bg-white/5 hover:bg-white/10 text-textMuted border-white/10"
            )}
          >
            All ({ipos.length})
          </button>

          <button
            onClick={() => setActiveFilter('CT')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 shadow-sm",
              activeFilter === 'CT'
                ? "bg-red-500 text-white border-red-500 shadow-red-500/20"
                : "bg-red-500/10 hover:bg-red-500/15 text-red-400 border-red-500/20"
            )}
          >
            <Clock className="w-3.5 h-3.5" /> Closing Today ({ctIposCount})
          </button>

          <button
            onClick={() => setActiveFilter('OPEN')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 shadow-sm",
              activeFilter === 'OPEN'
                ? "bg-emerald-500 text-white border-emerald-500 shadow-emerald-500/20"
                : "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Open ({openIposCount})
          </button>

          <button
            onClick={() => setActiveFilter('UPCOMING')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 shadow-sm",
              activeFilter === 'UPCOMING'
                ? "bg-amber-500 text-white border-amber-500 shadow-amber-500/20"
                : "bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 border-amber-500/20"
            )}
          >
            <Calendar className="w-3.5 h-3.5" /> Upcoming ({upcomingIposCount})
          </button>

          {closedIposCount > 0 && (
            <button
              onClick={() => setActiveFilter('CLOSED')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shadow-sm",
                activeFilter === 'CLOSED'
                  ? "bg-textMuted text-white border-textMuted"
                  : "bg-white/5 hover:bg-white/10 text-textMuted border-white/10"
              )}
            >
              Closed ({closedIposCount})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Main Table Card */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
        {loading && ipos.length === 0 ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <Loader text="Loading live IPO market data..." />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1 scrollbar-hide">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium text-right">Size</th>
                  <th className="px-4 py-3 font-medium text-right">P/E</th>
                  <th className="px-4 py-3 font-medium text-right">Sub.</th>
                  <th className="px-4 py-3 font-medium text-right">Issue Price</th>
                  <th className="px-4 py-3 font-medium text-right">Lot Size</th>
                  <th className="px-4 py-3 font-medium text-right">GMP (₹)</th>
                  <th className="px-4 py-3 font-medium text-right">Est. Listing</th>
                  <th className="px-4 py-3 font-medium text-right">Gain %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {processedIpos.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-16 text-center text-textMuted">
                      No IPOs found for the selected filter.
                    </td>
                  </tr>
                ) : (
                processedIpos.map((m, idx) => {
                  const issuePrice = parseFloat(m.issue_price) || 0;
                  const gmp = parseFloat(m.gmp) || 0;
                  const estPrice = issuePrice + gmp;
                  const estGain = issuePrice > 0 ? (gmp / issuePrice) * 100 : 0;
                  const category = getStatusCategory(m.tab_status);
                  const isCT = category === 'CT';
                  const isOpen = category === 'OPEN';
                  const isUpcoming = category === 'UPCOMING';

                  // Group Section Divider (in ALL view mode when category changes)
                  const prevCategory = idx > 0 ? getStatusCategory(processedIpos[idx - 1].tab_status) : null;
                  const isFirstInCategory = activeFilter === 'ALL' && category !== prevCategory;

                  return (
                    <tr 
                      key={`${m.id || 'ipo'}-${idx}`} 
                      className={clsx(
                        "hover:bg-white/5 transition-colors group",
                        isCT && "bg-red-500/[0.02]"
                      )}
                    >
                      {/* Company & Badges */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {m.company_logo ? (
                            <img src={m.company_logo} alt={m.logo_txt || 'Logo'} className="w-8 h-8 rounded-full object-cover bg-white/10" />
                          ) : (
                            <div className={clsx(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                              isCT ? "bg-red-500/20 text-red-400" : isOpen ? "bg-emerald-500/20 text-emerald-400" : "bg-primary/20 text-primary"
                            )}>
                              {m.logo_txt || 'IPO'}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-textPrimary flex items-center gap-2">
                              <span>{m.company_name}</span>
                              <span className={clsx(
                                "text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold border inline-flex items-center gap-1",
                                isCT ? 'bg-red-500/20 text-red-400 border-red-500/30 shadow-sm' : 
                                isOpen ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 
                                isUpcoming ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 
                                'bg-white/5 text-textMuted border-white/10'
                              )}>
                                {isCT && <Clock className="w-2.5 h-2.5" />}
                                {isCT ? 'CLOSING TODAY' : m.tab_status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-textMuted font-medium">{m.listing_exch}</span>
                              {m.fire_rating > 0 && (
                                <div className="flex gap-0.5">
                                  {Array(m.fire_rating).fill('🔥').map((emoji, fIdx) => (
                                    <span key={fIdx} className="text-[10px] leading-none">{emoji}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-4 py-3 text-xs text-textMuted">
                        <div><span className="opacity-70">Open:</span> <span className="text-textPrimary font-medium">{m.open_date || '-'}</span></div>
                        <div><span className="opacity-70">Close:</span> <span className={clsx("font-medium", isCT ? "text-red-400 font-bold" : "text-textPrimary")}>{m.close_date || '-'}</span></div>
                        <div><span className="opacity-70">List:</span> <span className="text-textPrimary font-medium">{m.listing_date || '-'}</span></div>
                      </td>

                      {/* Size, PE, Subscription */}
                      <td className="px-4 py-3 text-right font-medium text-textMuted">{m.ipo_size || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-textMuted">{m.pe_ratio || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-textMuted">{m.subscription || '-'}</td>

                      {/* Issue Price */}
                      <td className="px-4 py-3 text-right font-medium">
                        {m.issue_price && m.issue_price !== 'NA' ? `₹${m.issue_price}` : 'NA'}
                      </td>

                      {/* Lot Size */}
                      <td className="px-4 py-3 text-right text-textMuted">
                        {m.lot_size || '-'}
                      </td>

                      {/* GMP (₹) */}
                      <td className="px-4 py-3 text-right">
                        <span className={clsx(
                          "font-bold text-sm",
                          gmp > 0 ? "text-emerald-400" : gmp < 0 ? "text-red-400" : "text-textMuted"
                        )}>
                          {gmp > 0 ? '+' : ''}{m.gmp !== 'NA' && m.gmp != null ? `₹${m.gmp}` : 'NA'}
                        </span>
                      </td>

                      {/* Estimated Listing */}
                      <td className="px-4 py-3 text-right font-bold text-textPrimary text-sm">
                        {estPrice > 0 ? `₹${estPrice.toFixed(2)}` : 'NA'}
                      </td>

                      {/* Estimated Gain % */}
                      <td className="px-4 py-3 text-right">
                        <div className={clsx(
                          "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border",
                          estGain > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                          estGain < 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                          'bg-white/5 text-textMuted border-white/10'
                        )}>
                          {estGain > 0 && <TrendingUp className="w-3 h-3" />}
                          {estGain !== 0 ? `${estGain > 0 ? '+' : ''}${estGain.toFixed(2)}%` : 'NA'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Footer / Pagination */}
        <div className="px-4 py-3 border-t border-white/5 bg-black/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-textMuted">
          <span>Showing {processedIpos.length} of {ipos.length} IPOs {totalItems > 0 && `(Total across pages: ${totalItems})`}</span>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || loading}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
