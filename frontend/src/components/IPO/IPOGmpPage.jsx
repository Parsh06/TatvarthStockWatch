import { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, Search, Download, TrendingUp, AlertCircle, Calendar, Briefcase, Zap, 
  ChevronLeft, ChevronRight, Clock, CheckCircle2, Flame, ArrowUpRight,
  ArrowUpDown, ArrowUp, ArrowDown, Layers, Award, Sparkles, DollarSign
} from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '../../services/apiClient';
import { exportToXLSX } from '../../utils/csvParser';
import PageTransition from '../Common/PageTransition';
import Loader, { Spinner } from '../Common/Loader';
import IpoDetailModal from './IpoDetailModal';

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

// Top highlight micro-card
function HighlightCard({ title, badge, ipo, metric, metricLabel, subText, icon: Icon, color = 'text-primary', bgGlow = 'bg-primary/20', onSelect }) {
  if (!ipo) return null;
  return (
    <div 
      onClick={() => onSelect(ipo)}
      className="glass-panel hover:-translate-y-1 hover:shadow-premium-hover transition-all duration-300 rounded-2xl p-4 cursor-pointer group relative overflow-hidden flex flex-col justify-between border border-border/70 hover:border-primary/40"
    >
      <div className={clsx("absolute -top-10 -right-10 w-28 h-28 blur-3xl opacity-15 rounded-full transition-opacity group-hover:opacity-30", bgGlow)} />
      
      <div className="flex items-center justify-between gap-2 z-10 mb-2">
        <div className="flex items-center gap-1.5 text-xs text-textMuted font-medium">
          {Icon && <Icon className={clsx("w-3.5 h-3.5", color)} />}
          <span>{title}</span>
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-textMuted border border-white/10 uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>

      <div className="z-10 my-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={clsx("text-xl font-bold font-display tabular-nums tracking-tight", color)}>
            {metric}
          </p>
          <span className="text-[10px] uppercase tracking-wider text-textMuted font-mono">
            {metricLabel}
          </span>
        </div>
        <p className="text-sm font-semibold text-textPrimary truncate group-hover:text-primary transition-colors flex items-center gap-1 mt-0.5">
          {ipo.company_name}
          <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-primary transition-all flex-shrink-0" />
        </p>
      </div>

      <div className="z-10 pt-2 border-t border-border/40 flex items-center justify-between text-xs text-textMuted">
        <span className="truncate">{subText}</span>
        <span className="text-[10px] text-primary font-medium flex items-center gap-0.5 group-hover:underline flex-shrink-0 ml-1">
          View Details
        </span>
      </div>
    </div>
  );
}

export default function IPOGmpPage() {
  const [ipos, setIpos]                   = useState([]);
  const [selectedIpo, setSelectedIpo]     = useState(null);
  const [loading, setLoading]             = useState(false);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [error, setError]                 = useState(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lastFetched, setLastFetched]     = useState(null);
  const [activeFilter, setActiveFilter]   = useState('ALL'); // 'ALL' | 'CT' | 'OPEN' | 'UPCOMING' | 'CLOSED'
  const [segmentFilter, setSegmentFilter] = useState('ALL'); // 'ALL' | 'MAINBOARD' | 'SME'
  const [sortKey, setSortKey]             = useState('DEFAULT'); // 'DEFAULT' | 'NAME' | 'CLOSE' | 'SIZE' | 'PE' | 'SUB' | 'PRICE' | 'LOT' | 'GMP' | 'GAIN'
  const [sortDir, setSortDir]             = useState('desc'); // 'asc' | 'desc'
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [totalItems, setTotalItems]   = useState(0);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchData = async (isBackground = false) => {
    if (!isBackground) {
      if (ipos.length > 0) setIsRefreshing(true);
      else setLoading(true);
    } else {
      setIsRefreshing(true);
    }
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
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(() => {
      fetchData(true);
    }, 60000);
    return () => clearInterval(intervalId);
  }, [currentPage, debouncedSearch]);

  // Helper to determine Segment
  const getSegment = (item) => {
    if (item.segment) return item.segment;
    const exch = String(item.listing_exch || '').toUpperCase();
    const name = String(item.company_name || '').toUpperCase();
    if (exch.includes('SME') || name.includes('SME')) return 'SME';
    return 'MAINBOARD';
  };

  const handleExport = () => {
    if (!ipos.length) return;
    const exportData = ipos.map(m => {
      const issuePrice = parseFloat(m.issue_price) || 0;
      const gmp = parseFloat(m.gmp) || 0;
      const estPrice = issuePrice + gmp;
      const estGain = issuePrice > 0 ? (gmp / issuePrice) * 100 : 0;
      const lotNum = parseInt(String(m.lot_size || '0').replace(/,/g, ''), 10) || 0;
      const minInv = m.min_investment || (lotNum > 0 && issuePrice > 0 ? Math.round(lotNum * issuePrice) : '');
      
      return {
        'Company Name': m.company_name,
        'Segment': getSegment(m),
        'Status': m.tab_status,
        'Exchange': m.listing_exch,
        'Open Date': m.open_date,
        'Close Date': m.close_date,
        'Allotment Date (BoA)': m.allotment_date || '-',
        'Refund Date': m.refund_date || '-',
        'Demat Credit Date': m.demat_date || '-',
        'Listing Date': m.listing_date,
        'Issue Size': m.ipo_size || '-',
        'P/E Ratio': m.pe_ratio || '-',
        'Issue Price': m.issue_price,
        'Lot Size': m.lot_size,
        'Min Investment (₹)': minInv,
        'Total Sub.': m.subscriptions?.total || m.subscription || '-',
        'Retail Sub.': m.subscriptions?.retail || '-',
        'Small HNI Sub.': m.subscriptions?.shni || '-',
        'Big HNI Sub.': m.subscriptions?.bhni || '-',
        'Total NII Sub.': m.subscriptions?.nii || '-',
        'QIB Sub.': m.subscriptions?.qib || '-',
        'GMP (₹)': m.gmp,
        'GMP Range': m.gmp_range || '-',
        'Est. Listing Price': estPrice > 0 ? estPrice.toFixed(2) : '-',
        'Est. Gain %': estGain !== 0 ? `${estGain.toFixed(2)}%` : '-'
      };
    });
    exportToXLSX(exportData, `IPO_GMP_Master_${new Date().toISOString().slice(0, 10)}`);
  };

  // Status categories & counts
  const ctIposCount = useMemo(() => ipos.filter(i => String(i.tab_status || '').toUpperCase() === 'CT').length, [ipos]);
  const openIposCount = useMemo(() => ipos.filter(i => String(i.tab_status || '').toLowerCase() === 'open').length, [ipos]);
  const upcomingIposCount = useMemo(() => ipos.filter(i => ['upcoming', 'soon'].includes(String(i.tab_status || '').toLowerCase())).length, [ipos]);
  const closedIposCount = useMemo(() => ipos.filter(i => String(i.tab_status || '').toLowerCase() === 'closed').length, [ipos]);

  // Segment counts
  const mainboardCount = useMemo(() => ipos.filter(i => getSegment(i) === 'MAINBOARD').length, [ipos]);
  const smeCount       = useMemo(() => ipos.filter(i => getSegment(i) === 'SME').length, [ipos]);

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

  // Helper numeric parsers for sorting
  const parseNum = (val) => {
    if (val == null) return 0;
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  // Handle Sort Toggle
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(['NAME', 'CLOSE'].includes(key) ? 'asc' : 'desc');
    }
  };

  // Top Highlights calculation
  const highlights = useMemo(() => {
    if (!ipos.length) return null;

    // 1. Top Gainer: highest estGain %
    let topGainer = null;
    let maxGain = -Infinity;

    // 2. Most Subscribed: highest numeric subscription
    let mostSub = null;
    let maxSub = -Infinity;

    // 3. Urgent Closing Today
    let closingToday = null;

    // 4. Largest Issue Size in Cr
    let largestIssue = null;
    let maxSize = -Infinity;

    ipos.forEach(item => {
      const issue = parseNum(item.issue_price);
      const gmp = parseNum(item.gmp);
      const gain = issue > 0 ? (gmp / issue) * 100 : 0;
      const sub = parseNum(item.subscriptions?.total || item.subscription || 0);
      const size = parseNum(item.ipo_size);

      if (gain > maxGain && gmp > 0) {
        maxGain = gain;
        topGainer = { ipo: item, gain, gmp };
      }

      if (sub > maxSub && sub > 0) {
        maxSub = sub;
        mostSub = { ipo: item, sub };
      }

      if (size > maxSize && size > 0) {
        maxSize = size;
        largestIssue = { ipo: item, size };
      }

      if (getStatusCategory(item.tab_status) === 'CT' && !closingToday) {
        closingToday = item;
      }
    });

    // Fallbacks if some metrics aren't populated
    if (!closingToday && ipos.length > 0) {
      closingToday = ipos.find(i => getStatusCategory(i.tab_status) === 'OPEN') || ipos[0];
    }

    return {
      topGainer: topGainer || (ipos[0] ? { ipo: ipos[0], gain: 0, gmp: parseNum(ipos[0].gmp) } : null),
      mostSub: mostSub || (ipos[0] ? { ipo: ipos[0], sub: 0 } : null),
      closingToday,
      largestIssue: largestIssue || (ipos[0] ? { ipo: ipos[0], size: parseNum(ipos[0].ipo_size) } : null)
    };
  }, [ipos]);

  // Filtered and Sorted IPO list
  const processedIpos = useMemo(() => {
    let filtered = [...ipos];

    // Status Filter
    if (activeFilter !== 'ALL') {
      filtered = filtered.filter(i => getStatusCategory(i.tab_status) === activeFilter);
    }

    // Segment Filter
    if (segmentFilter !== 'ALL') {
      filtered = filtered.filter(i => getSegment(i) === segmentFilter);
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sortKey !== 'DEFAULT') {
        let valA = 0;
        let valB = 0;

        switch (sortKey) {
          case 'NAME':
            return sortDir === 'asc' 
              ? (a.company_name || '').localeCompare(b.company_name || '')
              : (b.company_name || '').localeCompare(a.company_name || '');
          case 'CLOSE':
            return sortDir === 'asc'
              ? (a.close_date || '').localeCompare(b.close_date || '')
              : (b.close_date || '').localeCompare(a.close_date || '');
          case 'SIZE':
            valA = parseNum(a.ipo_size);
            valB = parseNum(b.ipo_size);
            break;
          case 'PE':
            valA = parseNum(a.pe_ratio);
            valB = parseNum(b.pe_ratio);
            break;
          case 'SUB':
            valA = parseNum(a.subscriptions?.total || a.subscription || 0);
            valB = parseNum(b.subscriptions?.total || b.subscription || 0);
            break;
          case 'PRICE':
            valA = parseNum(a.issue_price);
            valB = parseNum(b.issue_price);
            break;
          case 'LOT':
            valA = parseNum(a.lot_size);
            valB = parseNum(b.lot_size);
            break;
          case 'GMP':
            valA = parseNum(a.gmp);
            valB = parseNum(b.gmp);
            break;
          case 'GAIN': {
            const issueA = parseNum(a.issue_price);
            const gmpA = parseNum(a.gmp);
            valA = issueA > 0 ? (gmpA / issueA) * 100 : 0;
            const issueB = parseNum(b.issue_price);
            const gmpB = parseNum(b.gmp);
            valB = issueB > 0 ? (gmpB / issueB) * 100 : 0;
            break;
          }
          default:
            break;
        }

        return sortDir === 'asc' ? valA - valB : valB - valA;
      }

      // Default Status Priority sort: CT (1) -> OPEN (2) -> UPCOMING (3) -> CLOSED (4)
      const catA = getStatusCategory(a.tab_status);
      const catB = getStatusCategory(b.tab_status);

      const weightDiff = getStatusWeight(catA) - getStatusWeight(catB);
      if (weightDiff !== 0) return weightDiff;

      // Within category: sort by Estimated Gain % descending, then GMP descending
      const issueA = parseNum(a.issue_price);
      const gmpA = parseNum(a.gmp);
      const gainA = issueA > 0 ? (gmpA / issueA) * 100 : 0;

      const issueB = parseNum(b.issue_price);
      const gmpB = parseNum(b.gmp);
      const gainB = issueB > 0 ? (gmpB / issueB) * 100 : 0;

      if (gainB !== gainA) return gainB - gainA;
      return gmpB - gmpA;
    });

    return filtered;
  }, [ipos, activeFilter, segmentFilter, sortKey, sortDir]);

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
            disabled={loading || isRefreshing}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw className={clsx("w-4 h-4", (loading || isRefreshing) && "animate-spin")} />
            {loading ? 'Loading...' : isRefreshing ? 'Syncing...' : 'Refresh'}
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

      {/* Top Highlights Strip (Clickable to open deep-dive modal) */}
      {highlights && ipos.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-textMuted px-1">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Key Market Opportunities & Highlights
            </span>
            <span className="text-[11px] text-textMuted/80 hidden sm:inline">
              Click any card for instant profit calculator & timeline
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {highlights.topGainer && (
              <HighlightCard
                title="Top Listing Gainer"
                badge="Highest ROI"
                ipo={highlights.topGainer.ipo}
                metric={`+${highlights.topGainer.gain.toFixed(2)}%`}
                metricLabel="Est. Gain"
                subText={`GMP: +₹${highlights.topGainer.gmp} • Issue: ₹${highlights.topGainer.ipo.issue_price}`}
                icon={TrendingUp}
                color="text-emerald-400"
                bgGlow="bg-emerald-500/20"
                onSelect={setSelectedIpo}
              />
            )}
            {highlights.mostSub && (
              <HighlightCard
                title="Most Subscribed"
                badge="Demand Leader"
                ipo={highlights.mostSub.ipo}
                metric={`${highlights.mostSub.sub.toFixed(2)}x`}
                metricLabel="Total Sub."
                subText={`Retail: ${highlights.mostSub.ipo.subscriptions?.retail || '-'} • sHNI: ${highlights.mostSub.ipo.subscriptions?.shni || '-'}`}
                icon={Flame}
                color="text-amber-400"
                bgGlow="bg-amber-500/20"
                onSelect={setSelectedIpo}
              />
            )}
            {highlights.closingToday && (
              <HighlightCard
                title="Closing Today"
                badge="Urgent Window"
                ipo={highlights.closingToday}
                metric={highlights.closingToday.close_date || 'Today'}
                metricLabel="Final Window"
                subText={`Issue: ₹${highlights.closingToday.issue_price || '-'} • Lot: ${highlights.closingToday.lot_size || '-'} sh`}
                icon={Clock}
                color="text-red-400"
                bgGlow="bg-red-500/20"
                onSelect={setSelectedIpo}
              />
            )}
            {highlights.largestIssue && (
              <HighlightCard
                title="Largest Issue Size"
                badge="Mega Issue"
                ipo={highlights.largestIssue.ipo}
                metric={highlights.largestIssue.ipo.ipo_size || '₹- Cr'}
                metricLabel="Capital Raise"
                subText={`Exch: ${highlights.largestIssue.ipo.listing_exch || '-'} • P/E: ${highlights.largestIssue.ipo.pe_ratio || '-'}`}
                icon={Award}
                color="text-primary"
                bgGlow="bg-primary/20"
                onSelect={setSelectedIpo}
              />
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
            <input 
              type="text" 
              placeholder="Search by company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100/90 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all shadow-sm placeholder:text-textMuted/60 text-textPrimary"
            />
          </div>

          {/* Segment Filter (All, Mainboard, SME) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 dark:bg-black/20 border border-border rounded-xl">
            <button
              onClick={() => setSegmentFilter('ALL')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                segmentFilter === 'ALL'
                  ? "bg-primary text-white shadow-sm"
                  : "text-textMuted hover:text-textPrimary"
              )}
            >
              All Segments ({ipos.length})
            </button>
            <button
              onClick={() => setSegmentFilter('MAINBOARD')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5",
                segmentFilter === 'MAINBOARD'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-textMuted hover:text-textPrimary"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Mainboard ({mainboardCount})
            </button>
            <button
              onClick={() => setSegmentFilter('SME')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5",
                segmentFilter === 'SME'
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-textMuted hover:text-textPrimary"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              SME Issues ({smeCount})
            </button>
          </div>
        </div>

        {/* Status Filter & Active Sort Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shadow-sm",
                activeFilter === 'ALL'
                  ? "bg-primary text-white border-primary shadow-primary/20"
                  : "bg-white/5 hover:bg-white/10 text-textMuted border-white/10"
              )}
            >
              All Statuses
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

          {/* Active Sort Tag */}
          {sortKey !== 'DEFAULT' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-textMuted">
                Sorted by <strong className="text-textPrimary">{sortKey} ({sortDir.toUpperCase()})</strong>
              </span>
              <button
                onClick={() => { setSortKey('DEFAULT'); setSortDir('desc'); }}
                className="text-primary hover:underline font-medium"
              >
                Reset Sort
              </button>
            </div>
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
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-[400px] relative">
        {isRefreshing && (
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse z-20" />
        )}
        {loading && ipos.length === 0 ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <Loader text="Loading live IPO market data..." />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1 scrollbar-hide">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100/90 dark:bg-black/20 border-b border-border text-[11px] uppercase tracking-wider text-slate-700 dark:text-textMuted sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  {/* Company */}
                  <th 
                    onClick={() => handleSort('NAME')}
                    className="px-4 py-3 font-medium cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Company</span>
                      {sortKey === 'NAME' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* Dates */}
                  <th 
                    onClick={() => handleSort('CLOSE')}
                    className="px-4 py-3 font-medium cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Dates</span>
                      {sortKey === 'CLOSE' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* Size */}
                  <th 
                    onClick={() => handleSort('SIZE')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Size</span>
                      {sortKey === 'SIZE' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* P/E */}
                  <th 
                    onClick={() => handleSort('PE')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>P/E</span>
                      {sortKey === 'PE' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* Sub. */}
                  <th 
                    onClick={() => handleSort('SUB')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Sub.</span>
                      {sortKey === 'SUB' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* Issue Price */}
                  <th 
                    onClick={() => handleSort('PRICE')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Issue Price</span>
                      {sortKey === 'PRICE' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* Lot Size */}
                  <th 
                    onClick={() => handleSort('LOT')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Lot Size</span>
                      {sortKey === 'LOT' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* GMP (₹) */}
                  <th 
                    onClick={() => handleSort('GMP')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>GMP (₹)</span>
                      {sortKey === 'GMP' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>

                  {/* Est. Listing */}
                  <th className="px-4 py-3 font-medium text-right">
                    <span>Est. Listing</span>
                  </th>

                  {/* Gain % */}
                  <th 
                    onClick={() => handleSort('GAIN')}
                    className="px-4 py-3 font-medium text-right cursor-pointer hover:text-textPrimary select-none group/th"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Gain %</span>
                      {sortKey === 'GAIN' ? (
                        sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-50 text-textMuted" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {processedIpos.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-16 text-center text-textMuted">
                      No IPOs found for the selected segment and filters.
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
                  const segment = getSegment(m);

                  return (
                    <tr 
                      key={`${m.id || m.company_name || 'ipo'}-${m.listing_date || idx}`} 
                      onClick={() => setSelectedIpo(m)}
                      className={clsx(
                        "hover:bg-slate-100/80 dark:hover:bg-white/5 transition-colors group cursor-pointer",
                        isCT && "bg-red-500/[0.02]"
                      )}
                      title="Click to view full IPO details, SEBI timeline, lot size calculator & allotment check"
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
                              <span className="group-hover:text-primary transition-colors flex items-center gap-1">
                                {m.company_name}
                                <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-primary transition-all -translate-y-0.5" />
                              </span>
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

                            {/* Exchange, Segment & Fire rating */}
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={clsx(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border",
                                segment === 'SME' 
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/25" 
                                  : "bg-blue-500/10 text-blue-400 border-blue-500/25"
                              )}>
                                {segment}
                              </span>
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

                      {/* Size, PE */}
                      <td className="px-4 py-3 text-right font-medium text-textMuted">{m.ipo_size || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-textMuted">{m.pe_ratio || '-'}</td>

                      {/* Subscription (Total + Retail/sHNI/bHNI Breakdown + Allotment Odds Indicator) */}
                      <td className="px-4 py-3 text-right">
                        <span className={clsx(
                          "font-bold font-mono text-sm block",
                          (m.subscriptions?.total && m.subscriptions.total !== '-') || (m.subscription && m.subscription !== '-') 
                            ? "text-textPrimary" 
                            : "text-textMuted"
                        )}>
                          {m.subscriptions?.total || m.subscription || '-'}
                        </span>
                        {(m.subscriptions?.retail || m.subscriptions?.shni || m.subscriptions?.bhni) && (
                          <div className="text-[10px] text-textMuted flex items-center justify-end gap-1.5 mt-0.5 font-mono">
                            {m.subscriptions?.retail && m.subscriptions.retail !== '-' && (
                              <span title="Retail (RII)">R: <strong className="text-emerald-500 dark:text-emerald-400 font-semibold">{m.subscriptions.retail}</strong></span>
                            )}
                            {m.subscriptions?.shni && m.subscriptions.shni !== '-' && (
                              <span title="Small HNI">sH: <strong className="text-amber-500 dark:text-amber-400 font-semibold">{m.subscriptions.shni}</strong></span>
                            )}
                            {m.subscriptions?.bhni && m.subscriptions.bhni !== '-' && (
                              <span title="Big HNI">bH: <strong className="text-blue-500 dark:text-blue-400 font-semibold">{m.subscriptions.bhni}</strong></span>
                            )}
                          </div>
                        )}
                        {(() => {
                          const rawRetail = parseFloat(String(m.subscriptions?.retail || '').replace(/[^0-9.]/g, '')) || 0;
                          const isSme = String(m.segment || '').toUpperCase().includes('SME');
                          const formRetail = isSme ? rawRetail : rawRetail / 1.26;
                          const roundRetailOdds = Math.round(formRetail);

                          if (roundRetailOdds > 1) {
                            return (
                              <div className="flex justify-end mt-0.5">
                                <span 
                                  title={`SEBI Retail Allotment Odds (Form Basis): 1 in ${roundRetailOdds} applicants (Raw share demand: ${rawRetail}x). Click row for full simulator.`} 
                                  className="text-[9px] font-mono font-bold text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded"
                                >
                                  🎯 1 in {roundRetailOdds}
                                </span>
                              </div>
                            );
                          } else if (rawRetail > 0) {
                            return (
                              <div className="flex justify-end mt-0.5">
                                <span 
                                  title="Retail Category Undersubscribed (100% Guaranteed 1 Lot Allotment)" 
                                  className="text-[9px] font-mono font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded"
                                >
                                  ✓ 100% Odds
                                </span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>

                      {/* Issue Price */}
                      <td className="px-4 py-3 text-right font-medium">
                        {m.issue_price && m.issue_price !== 'NA' ? `₹${m.issue_price}` : 'NA'}
                      </td>

                      {/* Lot Size + Min Investment */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-textPrimary block font-mono text-xs">
                          {m.lot_size ? `${m.lot_size} sh` : '-'}
                        </span>
                        {(() => {
                          const lotNum = parseInt(String(m.lot_size || '0').replace(/,/g, ''), 10);
                          const minInv = m.min_investment || (issuePrice > 0 && lotNum > 0 ? Math.round(issuePrice * lotNum) : null);
                          return minInv ? (
                            <span className="text-[10px] text-textMuted block font-mono mt-0.5">
                              ₹{minInv.toLocaleString('en-IN')}
                            </span>
                          ) : null;
                        })()}
                      </td>

                      {/* GMP (₹) + 24h Trading Movement Range */}
                      <td className="px-4 py-3 text-right">
                        <span className={clsx(
                          "font-bold text-sm block",
                          gmp > 0 ? "text-emerald-400" : gmp < 0 ? "text-red-400" : "text-textMuted"
                        )}>
                          {gmp > 0 ? '+' : ''}{m.gmp !== 'NA' && m.gmp != null ? `₹${m.gmp}` : 'NA'}
                        </span>
                        {m.gmp_range && (
                          <div className="text-[10px] text-textMuted font-mono flex items-center justify-end gap-1 mt-0.5" title="24-hour Grey Market trading range (Low ↓ / High ↑)">
                            <span className="text-textMuted/80 font-medium">{m.gmp_range}</span>
                          </div>
                        )}
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
        <div className="px-4 py-3 border-t border-border bg-slate-50 dark:bg-black/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-textMuted">
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

      {/* Detailed IPO Insights Modal */}
      {selectedIpo && (
        <IpoDetailModal 
          ipo={selectedIpo} 
          onClose={() => setSelectedIpo(null)} 
        />
      )}
    </PageTransition>
  );
}
