import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Download, TrendingUp, AlertCircle, Calendar, Briefcase, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '../../services/apiClient';
import { exportToXLSX } from '../../utils/csvParser';
import PageTransition from '../Common/PageTransition';

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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to page 1 on new search
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

  // Fetch on mount, and when page or debounced search changes. Also poll every 60s.
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

  const openIposCount = ipos.filter(i => i.tab_status === 'open').length;
  const upcomingIposCount = ipos.filter(i => i.tab_status === 'upcoming').length;

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IPO GMP Tracker</h1>
          <p className="text-textMuted mt-1">
            Track active & upcoming IPOs, current Grey Market Premium, and estimated listing gains.
          </p>
          {lastFetched && (
            <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Live updating (Last updated: {lastFetched.toLocaleTimeString()})
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

      {/* Filters and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-center">
          <label className="text-[11px] font-semibold text-textMuted uppercase tracking-wider mb-2">Search IPOs</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input 
              type="text" 
              placeholder="Company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-inner placeholder:text-textMuted/50"
            />
          </div>
        </div>
        <StatCard label="Open IPOs" value={openIposCount} icon={Briefcase} color="text-emerald-400" iconColor="bg-emerald-500/20" />
        <StatCard label="Upcoming IPOs" value={upcomingIposCount} icon={Calendar} color="text-amber-400" iconColor="bg-amber-500/20" />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-4 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1 scrollbar-hide">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/20 border-b border-white/5 text-[11px] uppercase tracking-wider text-textMuted sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium text-right">Issue Price</th>
                <th className="px-4 py-3 font-medium text-right">Lot Size</th>
                <th className="px-4 py-3 font-medium text-right">GMP (₹)</th>
                <th className="px-4 py-3 font-medium text-right">Est. Listing</th>
                <th className="px-4 py-3 font-medium text-right">Gain %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && ipos.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-16 text-center text-textMuted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 opacity-50 text-primary" />
                    <p>Loading IPO data...</p>
                  </td>
                </tr>
              ) : ipos.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-16 text-center text-textMuted">
                    No IPOs found.
                  </td>
                </tr>
              ) : (
                ipos.map((m) => {
                  const issuePrice = parseFloat(m.issue_price) || 0;
                  const gmp = parseFloat(m.gmp) || 0;
                  const estPrice = issuePrice + gmp;
                  const estGain = issuePrice > 0 ? (gmp / issuePrice) * 100 : 0;
                  
                  return (
                    <tr key={m.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {m.company_logo ? (
                            <img src={m.company_logo} alt={m.logo_txt || 'Logo'} className="w-8 h-8 rounded-full object-cover bg-white/10" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                              {m.logo_txt || 'IPO'}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-textPrimary flex items-center gap-2">
                              {m.company_name}
                              <span className={clsx(
                                "text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-semibold border",
                                m.tab_status === 'open' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                m.tab_status === 'upcoming' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                'bg-white/5 text-textMuted border-white/10'
                              )}>
                                {m.tab_status}
                              </span>
                            </div>
                            <div className="text-xs text-textMuted mt-0.5">{m.listing_exch}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-textMuted">
                        <div><span className="opacity-70">Open:</span> <span className="text-textPrimary">{m.open_date || '-'}</span></div>
                        <div><span className="opacity-70">Close:</span> <span className="text-textPrimary">{m.close_date || '-'}</span></div>
                        <div><span className="opacity-70">List:</span> <span className="text-textPrimary">{m.listing_date || '-'}</span></div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {m.issue_price && m.issue_price !== 'NA' ? `₹${m.issue_price}` : 'NA'}
                      </td>
                      <td className="px-4 py-3 text-right text-textMuted">
                        {m.lot_size}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={clsx(
                          "font-bold",
                          gmp > 0 ? "text-emerald-400" : gmp < 0 ? "text-red-400" : "text-textMuted"
                        )}>
                          {gmp > 0 ? '+' : ''}{m.gmp !== 'NA' ? `₹${m.gmp}` : 'NA'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-textPrimary">
                        {estPrice > 0 ? `₹${estPrice.toFixed(2)}` : 'NA'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={clsx(
                          "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded",
                          estGain > 0 ? 'bg-emerald-500/10 text-emerald-400' : estGain < 0 ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-textMuted'
                        )}>
                          {estGain > 0 && <TrendingUp className="w-3 h-3" />}
                          {estGain !== 0 ? `${estGain > 0 ? '+' : ''}${estGain.toFixed(2)}%` : 'NA'}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-white/5 bg-black/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-textMuted">
          <span>Showing {ipos.length} IPOs {totalItems > 0 && `(Total: ${totalItems})`}</span>
          
          {/* Pagination Controls */}
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
