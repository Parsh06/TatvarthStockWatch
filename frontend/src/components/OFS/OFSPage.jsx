import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RefreshCw, Search, Download, AlertCircle, Zap, Eye, X, Layers, 
  TrendingUp, Calendar, CheckCircle2, ArrowUpDown, Filter, Building2, 
  Clock, ShieldAlert, CheckCircle, Sparkles, ChevronRight, BarChart3,
  Target, Scale, Check, AlertTriangle
} from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '../../services/apiClient';

import PageTransition from '../Common/PageTransition';
import { Spinner } from '../Common/Loader';

function StatCard({ label, value, sub, color = 'text-textPrimary', icon: Icon, iconColor, gradient, loading }) {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-5 border border-border flex items-center gap-4 animate-pulse">
        <div className="w-12 h-12 rounded-2xl bg-black/10 dark:bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2" />
          <div className="h-6 bg-black/10 dark:bg-white/15 rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(
      "glass-panel hover:-translate-y-1 hover:shadow-premium-hover transition-all duration-300 rounded-2xl p-5 flex items-center gap-4 group relative overflow-hidden border border-border",
      gradient
    )}>
      <div className={clsx("absolute -top-10 -right-10 w-28 h-28 blur-3xl opacity-25 rounded-full transition-opacity group-hover:opacity-40", iconColor || 'bg-primary')} />
      {Icon && (
        <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner z-10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 border border-border', iconColor || 'bg-black/10 dark:bg-black/10 dark:bg-white/10')}>
          <Icon className="w-6 h-6 text-primary" />
        </div>
      )}
      <div className="z-10 min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wider text-textMuted mb-0.5 uppercase">{label}</p>
        <p className={clsx('text-2xl font-bold font-display tabular-nums tracking-tight truncate', color)}>{value}</p>
        {sub && <p className="text-xs text-textMuted/90 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function OFSPage() {
  const [ofsList, setOfsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastFetched, setLastFetched] = useState(null);
  const [nowTime, setNowTime] = useState(Date.now());
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [isStaleData, setIsStaleData] = useState(false);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, OPEN, UPCOMING, CLOSED
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // ALL, RETAIL, HNI
  const [sortField, setSortField] = useState('offerDate'); // offerDate, scriptName, subscription, sharesOfferedNum, cutoffPrice
  const [sortDirection, setSortDirection] = useState('desc'); // asc, desc

  // Modal State & Race-Condition Guard
  const [selectedOfs, setSelectedOfs] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const requestIdRef = useRef(0);

  // Dynamic Ticking Clock (updates "Synced N seconds ago" every second)
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const res = await apiClient('/api/market/ofs');
      if (res && Array.isArray(res.data)) {
        setOfsList(res.data);
        setLastFetched(new Date(res.scrapedAt || Date.now()));
        setIsStaleData(!!res.stale);
        setConsecutiveFailures(0);
      }
    } catch (err) {
      console.error(err);
      if (isBackground) {
        setConsecutiveFailures(prev => prev + 1);
      } else {
        setError(err.message || 'Failed to load OFS data');
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(() => {
      fetchData(true);
    }, 60000); // Background poll every 60s
    return () => clearInterval(intervalId);
  }, []);

  // Modal Race-Condition Safe Trigger
  const openDetailModal = async (ofs) => {
    const myRequestId = ++requestIdRef.current;
    setSelectedOfs(ofs);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(true);

    if (!ofs.slug) {
      setDetailError('Detailed live bid book is unavailable for this entry.');
      setDetailLoading(false);
      return;
    }

    try {
      const data = await apiClient(`/api/market/ofs/${ofs.slug}`);
      if (requestIdRef.current !== myRequestId) return; // Superseded by newer click
      setDetailData(data);
    } catch (err) {
      if (requestIdRef.current !== myRequestId) return;
      console.error(err);
      setDetailError('Could not load Bid Book details. Please check connection.');
    } finally {
      if (requestIdRef.current === myRequestId) setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedOfs(null);
    setDetailData(null);
    setDetailError(null);
  };

  // Keyboard Escape & Modal Backdrop Click-to-close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedOfs) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOfs]);


  // Column Header Sort Toggle
  const handleSortToggle = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Defensive Filter & Sort
  const filteredAndSortedOfs = useMemo(() => {
    let result = ofsList.filter(item => {
      const scriptName = item.scriptName || '';
      const companyName = item.companyName || '';
      const category = item.category || '';
      const status = item.status || '';

      const matchesSearch = 
        scriptName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        companyName.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'OPEN' && status !== 'OPEN') return false;
      if (statusFilter === 'UPCOMING' && status !== 'UPCOMING') return false;
      if (statusFilter === 'CLOSED' && status !== 'CLOSED') return false;

      if (categoryFilter === 'RETAIL' && !category.toLowerCase().includes('retail')) return false;
      if (categoryFilter === 'HNI' && (category.toLowerCase().includes('retail') && !category.toLowerCase().includes('non'))) return false;

      return true;
    });

    return [...result].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'subscription') {
        valA = parseFloat(a.subscription) || 0;
        valB = parseFloat(b.subscription) || 0;
      } else if (sortField === 'sharesOfferedNum') {
        valA = a.sharesOfferedNum || 0;
        valB = b.sharesOfferedNum || 0;
      } else if (sortField === 'offerDate') {
        valA = new Date(a.offerDate || 0).getTime();
        valB = new Date(b.offerDate || 0).getTime();
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [ofsList, searchQuery, statusFilter, categoryFilter, sortField, sortDirection]);

  // Derived Stats
  const openCount = useMemo(() => ofsList.filter(o => (o.status || '') === 'OPEN').length, [ofsList]);
  const upcomingCount = useMemo(() => ofsList.filter(o => (o.status || '') === 'UPCOMING').length, [ofsList]);
  
  const topSubscribed = useMemo(() => {
    if (!ofsList.length) return null;
    return [...ofsList].sort((a, b) => (parseFloat(b.subscription) || 0) - (parseFloat(a.subscription) || 0))[0];
  }, [ofsList]);

  // Seconds ago computation
  const secondsAgo = useMemo(() => {
    if (!lastFetched) return 0;
    return Math.max(0, Math.floor((nowTime - lastFetched.getTime()) / 1000));
  }, [lastFetched, nowTime]);

  const maxTotalQtyInBook = useMemo(() => {
    if (!detailData?.bidBook?.length) return 1;
    return Math.max(...detailData.bidBook.map(r => parseNumber(r.totalQty) || 1));
  }, [detailData]);

  function parseNumber(str) {
    if (!str) return 0;
    const val = parseInt(String(str).replace(/,/g, '').trim(), 10);
    return isNaN(val) ? 0 : val;
  }

  // Volume Matching & Demand Equilibrium Calculations
  const volumeMatchingData = useMemo(() => {
    if (!selectedOfs || !detailData?.bidBook?.length) return null;

    const offeredNum = selectedOfs.sharesOfferedNum || parseNumber(selectedOfs.sharesOffered) || 0;
    const rows = detailData.bidBook;

    let closestRow = null;
    let minDiff = Infinity;
    let totalBidsSum = 0;

    rows.forEach(r => {
      const q = parseNumber(r.totalQty);
      if (q > 0) {
        totalBidsSum += q;
        const diff = Math.abs(q - offeredNum);
        if (diff < minDiff) {
          minDiff = diff;
          closestRow = r;
        }
      }
    });

    const subRatio = parseFloat(selectedOfs.subscription) || (offeredNum > 0 ? totalBidsSum / offeredNum : 0);
    const estAllotmentPct = subRatio > 1 ? (100 / subRatio).toFixed(1) : '100';

    return {
      offeredNum,
      totalBidsSum,
      subRatio: subRatio.toFixed(2),
      estAllotmentPct,
      matchingPrice: closestRow ? closestRow.price : (detailData.summary?.cutoffPrice || selectedOfs.cutoffPrice || 'At Market'),
      matchingQty: closestRow ? closestRow.totalQty : 'N/A'
    };
  }, [selectedOfs, detailData]);

  const cleanCutoffPriceStr = useMemo(() => {
    if (!selectedOfs && !detailData) return '';
    const raw = detailData?.summary?.cutoffPrice || selectedOfs?.cutoffPrice || '';
    const match = raw.match(/[\d,.]+/);
    return match ? match[0] : '';
  }, [selectedOfs, detailData]);

  return (
  <PageTransition className="space-y-5 pb-12">

    {/* ============================================================
        PAGE HERO
    ============================================================ */}
    <section className="relative overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-primary/[0.13] via-surface to-surface shadow-xl">

      {/* Ambient background */}
      <div className="absolute -top-32 -right-20 h-80 w-80 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-emerald-500/[0.06] blur-[100px] pointer-events-none" />

      <div className="relative p-5 sm:p-6 lg:p-7">

        {/* Top Row */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">

          {/* Heading */}
          <div className="min-w-0">

            <div className="flex flex-wrap items-center gap-2 mb-3">

              {consecutiveFailures > 0 || isStaleData ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Sync delayed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Market Feed
                </span>
              )}

              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-black/5 dark:bg-white/5 px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-textMuted">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Updated {secondsAgo}s ago
              </span>

              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-black/5 dark:bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-textMuted">
                <Layers className="w-3.5 h-3.5" />
                {ofsList.length} tracked
              </span>
            </div>

            <div className="flex items-start gap-3">

              <div className="hidden sm:flex w-11 h-11 shrink-0 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl lg:text-[34px] leading-tight font-bold tracking-tight text-textPrimary font-display">
                  Offer For Sale
                </h1>

                <p className="mt-1 text-xs sm:text-sm text-textMuted max-w-2xl leading-relaxed">
                  Monitor active OFS issues, subscription demand, indicative
                  cut-off prices and consolidated NSE + BSE order books.
                </p>
              </div>

            </div>
          </div>

          {/* Actions */}
          <div className="flex w-full xl:w-auto gap-2">

            <button
              onClick={() => fetchData(false)}
              disabled={loading}
              className="group flex-1 xl:flex-none inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-2xl border border-border bg-black/5 dark:bg-white/55] hover:bg-white/[0.08] text-xs sm:text-sm font-bold text-textPrimary transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <RefreshCw
                className={clsx(
                  "w-4 h-4 text-primary transition-transform",
                  loading && "animate-spin"
                )}
              />

              <span>Refresh</span>
            </button>


          </div>

        </div>


        {/* Hero Mini Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-6">

          <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-3.5 py-3">
            <p className="text-[9px] uppercase tracking-widest font-bold text-textMuted">
              Open
            </p>

            <div className="flex items-end justify-between gap-2 mt-1">
              <p className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                {openCount}
              </p>

              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400/70 mb-1" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-3.5 py-3">
            <p className="text-[9px] uppercase tracking-widest font-bold text-textMuted">
              Upcoming
            </p>

            <div className="flex items-end justify-between gap-2 mt-1">
              <p className="text-xl font-extrabold font-mono text-amber-600 dark:text-amber-400">
                {upcomingCount}
              </p>

              <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400/70 mb-1" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-3.5 py-3">
            <p className="text-[9px] uppercase tracking-widest font-bold text-textMuted">
              Tracked
            </p>

            <div className="flex items-end justify-between gap-2 mt-1">
              <p className="text-xl font-extrabold font-mono text-cyan-600 dark:text-cyan-400">
                {ofsList.length}
              </p>

              <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400/70 mb-1" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-3.5 py-3 min-w-0">
            <p className="text-[9px] uppercase tracking-widest font-bold text-textMuted">
              Highest Subscription
            </p>

            <div className="flex items-center justify-between gap-2 mt-1 min-w-0">
              <p className="text-sm sm:text-base font-extrabold font-mono text-primary truncate">
                {topSubscribed?.subscription || 'N/A'}
              </p>

              <TrendingUp className="w-4 h-4 text-primary/70 shrink-0" />
            </div>
          </div>

        </div>

      </div>
    </section>


    {/* ============================================================
        STAT CARDS
    ============================================================ */}
    <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">

      <StatCard
        label="Open OFS Today"
        value={openCount}
        sub={
          openCount > 0
            ? "Bidding is active right now"
            : "No active OFS today"
        }
        icon={CheckCircle2}
        color="text-emerald-600 dark:text-emerald-400"
        iconColor="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
        loading={loading && ofsList.length === 0}
      />

      <StatCard
        label="Upcoming Issues"
        value={upcomingCount}
        sub="Scheduled market bids"
        icon={Calendar}
        color="text-amber-600 dark:text-amber-400"
        iconColor="bg-amber-500/20 text-amber-600 dark:text-amber-400"
        loading={loading && ofsList.length === 0}
      />

      <StatCard
        label="Total Tracked"
        value={ofsList.length}
        sub="Recent + active snapshot"
        icon={Layers}
        color="text-cyan-600 dark:text-cyan-400"
        iconColor="bg-cyan-500/20 text-cyan-600 dark:text-cyan-400"
        loading={loading && ofsList.length === 0}
      />

      <StatCard
        label="Top Subscribed"
        value={
          topSubscribed
            ? topSubscribed.scriptName || 'N/A'
            : 'N/A'
        }
        sub={
          topSubscribed &&
          topSubscribed.subscription !== 'N/A'
            ? `${topSubscribed.subscription} subscription`
            : 'No subscription data'
        }
        icon={TrendingUp}
        color="text-primary"
        iconColor="bg-primary/20 text-primary"
        loading={loading && ofsList.length === 0}
      />

    </section>


    {/* ============================================================
        ERROR BANNER
    ============================================================ */}
    {error && (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3.5 flex items-start gap-3">

        <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
            Unable to refresh market data
          </p>

          <p className="text-xs text-rose-600 dark:text-rose-400/80 mt-0.5">
            {error}
          </p>
        </div>

      </div>
    )}


    {/* ============================================================
        DATA WORKSPACE
    ============================================================ */}
    <section className="rounded-[26px] border border-border bg-surface/70 shadow-xl overflow-hidden">

      {/* Workspace Header */}
      <div className="p-4 sm:p-5 border-b border-border">

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">

          {/* Search */}
          <div className="flex items-center gap-3 w-full xl:w-auto">

            <div className="relative w-full sm:w-[360px]">

              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />

              <input
                type="text"
                placeholder="Search ticker or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="
                  w-full
                  h-11
                  rounded-2xl
                  border border-border
                  bg-black/5 dark:bg-black/5 dark:bg-black/40
                  pl-10 pr-10
                  text-sm
                  text-textPrimary
                  placeholder:text-textMuted/45
                  outline-none
                  transition-all
                  focus:border-primary/40
                  focus:bg-black/10 dark:bg-black/60
                  focus:ring-2
                  focus:ring-primary/10
                "
              />

              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-textMuted hover:text-textPrimary hover:bg-black/10 dark:bg-white/10 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

            </div>

          </div>


          {/* Sort */}
          <div className="flex items-center gap-2 w-full xl:w-auto">

            <div className="hidden sm:flex w-8 h-8 rounded-xl bg-black/5 dark:bg-white/5 border border-border items-center justify-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-textMuted" />
            </div>

            <div className="relative flex-1 xl:flex-none">

              <select
                value={`${sortField}_${sortDirection}`}
                onChange={(e) => {
                  const [f, d] = e.target.value.split('_');
                  setSortField(f);
                  setSortDirection(d);
                }}
                className="
                  w-full
                  xl:w-[280px]
                  h-11
                  appearance-none
                  rounded-2xl
                  border border-border
                  bg-black/5 dark:bg-black/5 dark:bg-black/40
                  px-3.5 pr-10
                  text-xs
                  font-bold
                  text-textPrimary
                  outline-none
                  focus:border-primary/40
                  cursor-pointer
                "
              >
                <option value="offerDate_desc">
                  Latest offer date
                </option>

                <option value="subscription_desc">
                  Highest subscription
                </option>

                <option value="sharesOfferedNum_desc">
                  Most offered shares
                </option>

                <option value="scriptName_asc">
                  Script A–Z
                </option>
              </select>

              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 w-3.5 h-3.5 text-textMuted pointer-events-none" />

            </div>

          </div>

        </div>


        {/* ========================================================
            FILTER TOOLBAR
        ======================================================== */}
        <div className="mt-4 pt-4 border-t border-border">

          <div className="flex flex-col lg:flex-row lg:items-center gap-3">

            {/* Filter label */}
            <div className="flex items-center gap-2 shrink-0">

              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
                <Filter className="w-3.5 h-3.5 text-primary" />
              </div>

              <span className="text-[10px] uppercase tracking-widest font-bold text-textMuted">
                Filters
              </span>

            </div>


            {/* Status */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">

              {[
                {
                  id: 'ALL',
                  label: 'All',
                },
                {
                  id: 'OPEN',
                  label: 'Open',
                },
                {
                  id: 'UPCOMING',
                  label: 'Upcoming',
                },
                {
                  id: 'CLOSED',
                  label: 'Closed',
                },
              ].map((filter) => (

                <button
                  key={filter.id}
                  onClick={() => setStatusFilter(filter.id)}
                  aria-pressed={statusFilter === filter.id}
                  className={clsx(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-[11px] font-bold transition-all active:scale-[0.98]",
                    statusFilter === filter.id
                      ? "border-primary/30 bg-primary text-textPrimary shadow-lg shadow-primary/10"
                      : "border-border bg-black/5 dark:bg-white/55] text-textMuted hover:bg-black/5 dark:bg-white/5 hover:text-textPrimary"
                  )}
                >

                  {filter.id === 'OPEN' && (
                    <span
                      className={clsx(
                        "w-1.5 h-1.5 rounded-full",
                        statusFilter === filter.id
                          ? "bg-white"
                          : "bg-emerald-400"
                      )}
                    />
                  )}

                  {filter.id === 'UPCOMING' && (
                    <Calendar className="w-3 h-3" />
                  )}

                  {filter.label}

                </button>

              ))}

            </div>


            {/* Divider */}
            <div className="hidden lg:block w-px h-6 bg-black/10 dark:bg-white/10" />


            {/* Category */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">

              {[
                {
                  id: 'ALL',
                  label: 'All Categories',
                },
                {
                  id: 'RETAIL',
                  label: 'Retail',
                },
                {
                  id: 'HNI',
                  label: 'HNI',
                },
              ].map((filter) => (

                <button
                  key={filter.id}
                  onClick={() => setCategoryFilter(filter.id)}
                  aria-pressed={categoryFilter === filter.id}
                  className={clsx(
                    "whitespace-nowrap rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all active:scale-[0.98]",
                    categoryFilter === filter.id
                      ? "border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-border bg-black/5 dark:bg-white/55] text-textMuted hover:bg-black/5 dark:bg-white/5 hover:text-textPrimary"
                  )}
                >
                  {filter.label}
                </button>

              ))}

            </div>


            {/* Reset */}
            {(searchQuery ||
              statusFilter !== 'ALL' ||
              categoryFilter !== 'ALL') && (

              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setCategoryFilter('ALL');
                }}
                className="lg:ml-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-black/5 dark:bg-white/55] px-3 py-2 text-[11px] font-bold text-textMuted hover:text-textPrimary hover:bg-black/5 dark:bg-white/5 transition-colors"
              >
                <X className="w-3 h-3" />
                Reset
              </button>
            )}

          </div>

        </div>

      </div>


      {/* ============================================================
          RESULTS SUMMARY BAR
      ============================================================ */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-border bg-black/5 dark:bg-black/5 dark:bg-black/40 flex flex-wrap items-center justify-between gap-2">

        <div className="flex items-center gap-2">

          <span className="text-[11px] font-semibold text-textMuted">
            Showing
          </span>

          <span className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 border border-border text-[10px] font-bold text-textPrimary font-mono">
            {filteredAndSortedOfs.length}
          </span>

          <span className="text-[11px] text-textMuted">
            of {ofsList.length} issues
          </span>

        </div>

        <div className="flex items-center gap-2 text-[10px] text-textMuted">

          <Sparkles className="w-3.5 h-3.5 text-primary" />

          <span>
            Select an issue to inspect the live bid book
          </span>

        </div>

      </div>


      {/* ============================================================
          DESKTOP TABLE
      ============================================================ */}
      <div className="hidden md:block overflow-x-auto scrollbar-hide">

        <table className="w-full text-left">

          <thead className="bg-black/5 dark:bg-white/5 border-b border-border">
            <tr>

              <th
                onClick={() => handleSortToggle('scriptName')}
                className="px-5 py-3.5 cursor-pointer select-none"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-textMuted hover:text-textPrimary">
                  Issue
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('offerDate')}
                className="px-4 py-3.5 cursor-pointer select-none"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-textMuted hover:text-textPrimary">
                  Offer Date
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>

              <th className="px-4 py-3.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-textMuted">
                  Category
                </span>
              </th>

              <th
                onClick={() => handleSortToggle('sharesOfferedNum')}
                className="px-4 py-3.5 cursor-pointer select-none text-right"
              >
                <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wider font-bold text-textMuted hover:text-textPrimary">
                  Shares
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>

              <th
                onClick={() => handleSortToggle('subscription')}
                className="px-4 py-3.5 cursor-pointer select-none text-right"
              >
                <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wider font-bold text-textMuted hover:text-textPrimary">
                  Subscription
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>

              <th className="px-4 py-3.5 text-right">
                <span className="text-[10px] uppercase tracking-wider font-bold text-textMuted">
                  Cut-off
                </span>
              </th>

              <th className="px-4 py-3.5 text-center">
                <span className="text-[10px] uppercase tracking-wider font-bold text-textMuted">
                  Status
                </span>
              </th>

              <th className="px-5 py-3.5 text-right">
                <span className="text-[10px] uppercase tracking-wider font-bold text-textMuted">
                  Action
                </span>
              </th>

            </tr>
          </thead>


          <tbody className="divide-y divide-border">

            {/* Loading */}
            {loading && ofsList.length === 0 ? (

              <tr>
                <td colSpan="8">

                  <div className="py-20 text-center">

                    <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                      <Spinner size="lg" className="text-primary" />
                    </div>

                    <p className="text-sm font-bold text-textPrimary">
                      Loading live OFS snapshot
                    </p>

                    <p className="text-xs text-textMuted mt-1">
                      Fetching the latest market data...
                    </p>

                  </div>

                </td>
              </tr>

            ) : filteredAndSortedOfs.length === 0 ? (

              <tr>
                <td colSpan="8">

                  <div className="py-20 text-center px-5">

                    <div className="w-14 h-14 mx-auto rounded-2xl bg-black/5 dark:bg-white/55] border border-border flex items-center justify-center mb-4">
                      <Search className="w-6 h-6 text-textMuted/60" />
                    </div>

                    <p className="text-sm font-bold text-textPrimary">
                      No OFS issues found
                    </p>

                    <p className="text-xs text-textMuted mt-1">
                      Try adjusting your search or filters.
                    </p>

                    {(searchQuery ||
                      statusFilter !== 'ALL' ||
                      categoryFilter !== 'ALL') && (

                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setStatusFilter('ALL');
                          setCategoryFilter('ALL');
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary hover:bg-primary/15"
                      >
                        Clear filters
                      </button>

                    )}

                  </div>

                </td>
              </tr>

            ) : (

              filteredAndSortedOfs.map((ofs) => {

                const scriptName = ofs.scriptName || 'OFS';
                const companyName = ofs.companyName || scriptName;
                const category = ofs.category || 'Retail';

                const isRetail =
                  category
                    .toLowerCase()
                    .includes('retail') &&
                  !category
                    .toLowerCase()
                    .includes('non');

                const isItemLoading =
                  detailLoading &&
                  selectedOfs?.slug === ofs.slug;

                return (

                  <tr
                    key={ofs.id || ofs.slug}
                    className="group hover:bg-white/[0.025] transition-colors"
                  >

                    {/* Issue */}
                    <td className="px-5 py-4">

                      <div className="flex items-center gap-3 min-w-[220px]">

                        <div className="relative shrink-0">

                          <div className="w-10 h-10 rounded-2xl bg-primary/[0.08] border border-primary/15 flex items-center justify-center font-bold text-[11px] text-primary transition-transform duration-200 group-hover:scale-105">
                            {scriptName.slice(0, 2).toUpperCase()}
                          </div>

                          {ofs.status === 'OPEN' && (
                            <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-surface animate-pulse" />
                          )}

                        </div>

                        <div className="min-w-0">

                          <div className="flex items-center gap-2">

                            <p className="font-bold text-sm text-textPrimary group-hover:text-primary transition-colors">
                              {scriptName}
                            </p>

                            {ofs.status === 'OPEN' && (
                              <span className="hidden lg:inline-flex text-[8px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-1.5 py-0.5 rounded-md">
                                Live
                              </span>
                            )}

                          </div>

                          <p className="text-[11px] text-textMuted truncate max-w-[230px] mt-0.5">
                            {companyName}
                          </p>

                        </div>

                      </div>

                    </td>


                    {/* Date */}
                    <td className="px-4 py-4">

                      <span className="text-xs font-mono font-medium text-textMuted">
                        {ofs.offerDate || '-'}
                      </span>

                    </td>


                    {/* Category */}
                    <td className="px-4 py-4">

                      <span
                        className={clsx(
                          "inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold border",
                          isRetail
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20"
                            : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                        )}
                      >
                        {category}
                      </span>

                    </td>


                    {/* Shares */}
                    <td className="px-4 py-4 text-right">

                      <span className="font-mono text-xs sm:text-sm font-bold text-textPrimary">
                        {ofs.sharesOffered || '-'}
                      </span>

                    </td>


                    {/* Subscription */}
                    <td className="px-4 py-4 text-right">

                      {ofs.subscription &&
                      ofs.subscription !== 'N/A' ? (

                        <div className="inline-flex flex-col items-end">

                          <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-xs sm:text-sm font-extrabold text-primary">
                            <TrendingUp className="w-3 h-3" />
                            {ofs.subscription}
                          </span>

                        </div>

                      ) : (

                        <span className="text-xs text-textMuted">
                          N/A
                        </span>

                      )}

                    </td>


                    {/* Cut-off */}
                    <td className="px-4 py-4 text-right">

                      <span className="font-mono text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        {ofs.cutoffPrice || 'N/A'}
                      </span>

                    </td>


                    {/* Status */}
                    <td className="px-4 py-4 text-center">

                      <span
                        className={clsx(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold",
                          ofs.status === 'OPEN'
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20"
                            : ofs.status === 'UPCOMING'
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20"
                            : "bg-black/5 dark:bg-white/55] text-textMuted border-border"
                        )}
                      >

                        {ofs.status === 'OPEN' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}

                        {ofs.statusRaw ||
                          ofs.status ||
                          'CLOSED'}

                      </span>

                    </td>


                    {/* Action */}
                    <td className="px-5 py-4 text-right">

                      <button
                        onClick={() => openDetailModal(ofs)}
                        disabled={isItemLoading}
                        className="
                          inline-flex
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          border
                          border-primary/20
                          bg-primary/[0.08]
                          hover:bg-primary/[0.15]
                          hover:border-primary/30
                          px-3.5
                          py-2
                          text-[11px]
                          font-bold
                          text-primary
                          transition-all
                          active:scale-[0.97]
                          disabled:opacity-50
                          disabled:cursor-not-allowed
                        "
                      >

                        {isItemLoading ? (
                          <Spinner
                            size="xs"
                            className="text-primary"
                          />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}

                        <span>
                          {isItemLoading
                            ? 'Loading'
                            : 'Order Book'}
                        </span>

                        {!isItemLoading && (
                          <ChevronRight className="w-3 h-3 opacity-60" />
                        )}

                      </button>

                    </td>

                  </tr>

                );

              })

            )}

          </tbody>

        </table>

      </div>


      {/* ============================================================
          MOBILE CARDS
      ============================================================ */}
      <div className="md:hidden">

        {loading && ofsList.length === 0 ? (

          <div className="py-16 text-center px-5">

            <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Spinner size="lg" className="text-primary" />
            </div>

            <p className="text-sm font-bold text-textPrimary">
              Loading OFS data
            </p>

            <p className="text-xs text-textMuted mt-1">
              Fetching live market snapshot...
            </p>

          </div>

        ) : filteredAndSortedOfs.length === 0 ? (

          <div className="py-16 text-center px-5">

            <div className="w-14 h-14 mx-auto rounded-2xl bg-black/5 dark:bg-white/55] border border-border flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-textMuted/60" />
            </div>

            <p className="text-sm font-bold text-textPrimary">
              No matching OFS issues
            </p>

            <p className="text-xs text-textMuted mt-1">
              Adjust your filters or search term.
            </p>

          </div>

        ) : (

          <div className="p-3 space-y-2.5">

            {filteredAndSortedOfs.map((ofs) => {

              const scriptName =
                ofs.scriptName || 'OFS';

              const companyName =
                ofs.companyName || scriptName;

              const category =
                ofs.category || 'Retail';

              const isRetail =
                category
                  .toLowerCase()
                  .includes('retail') &&
                !category
                  .toLowerCase()
                  .includes('non');

              const isItemLoading =
                detailLoading &&
                selectedOfs?.slug === ofs.slug;

              return (

                <article
                  key={ofs.id || ofs.slug}
                  className="rounded-2xl border border-border bg-white/[0.02] overflow-hidden hover:bg-black/5 dark:bg-white/55] transition-colors"
                >

                  {/* Card Header */}
                  <div className="p-4">

                    <div className="flex items-start justify-between gap-3">

                      <div className="flex items-center gap-3 min-w-0">

                        <div className="relative shrink-0">

                          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary">
                            {scriptName
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>

                          {ofs.status === 'OPEN' && (
                            <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-surface" />
                          )}

                        </div>

                        <div className="min-w-0">

                          <div className="flex items-center gap-2 flex-wrap">

                            <h3 className="text-sm font-bold text-textPrimary truncate">
                              {scriptName}
                            </h3>

                            <span
                              className={clsx(
                                "rounded-md border px-1.5 py-0.5 text-[8px] font-bold",
                                isRetail
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20"
                                  : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              )}
                            >
                              {category}
                            </span>

                          </div>

                          <p className="text-[10px] text-textMuted truncate mt-0.5">
                            {companyName}
                          </p>

                        </div>

                      </div>


                      {/* Status */}
                      <span
                        className={clsx(
                          "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold",
                          ofs.status === 'OPEN'
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20"
                            : ofs.status === 'UPCOMING'
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20"
                            : "bg-black/5 dark:bg-white/55] text-textMuted border-border"
                        )}
                      >

                        {ofs.status === 'OPEN' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}

                        {ofs.statusRaw ||
                          ofs.status ||
                          'CLOSED'}

                      </span>

                    </div>


                    {/* Main Metrics */}
                    <div className="grid grid-cols-2 gap-2 mt-4">

                      <div className="rounded-xl bg-black/5 dark:bg-white/5 border border-border p-2.5">

                        <p className="text-[8px] uppercase tracking-widest font-bold text-textMuted">
                          Subscription
                        </p>

                        <p className="text-sm font-extrabold font-mono text-primary mt-1">
                          {ofs.subscription || 'N/A'}
                        </p>

                      </div>


                      <div className="rounded-xl bg-black/5 dark:bg-white/5 border border-border p-2.5">

                        <p className="text-[8px] uppercase tracking-widest font-bold text-textMuted">
                          Cut-off
                        </p>

                        <p className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                          {ofs.cutoffPrice || 'N/A'}
                        </p>

                      </div>

                    </div>


                    {/* Secondary Metrics */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3 px-1">

                      <div>
                        <p className="text-[8px] uppercase tracking-widest font-bold text-textMuted">
                          Offer Date
                        </p>

                        <p className="mt-0.5 text-[11px] font-mono font-semibold text-textPrimary">
                          {ofs.offerDate || '-'}
                        </p>
                      </div>

                      <div>
                        <p className="text-[8px] uppercase tracking-widest font-bold text-textMuted">
                          Shares Offered
                        </p>

                        <p className="mt-0.5 text-[11px] font-mono font-semibold text-textPrimary">
                          {ofs.sharesOffered || '-'}
                        </p>
                      </div>

                    </div>

                  </div>


                  {/* Action */}
                  <div className="px-4 py-3 border-t border-border bg-black/[0.10]">

                    <button
                      onClick={() => openDetailModal(ofs)}
                      disabled={isItemLoading}
                      className="
                        w-full
                        h-10
                        inline-flex
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-primary/[0.10]
                        hover:bg-primary/[0.16]
                        border border-primary/20
                        text-xs
                        font-bold
                        text-primary
                        transition-all
                        active:scale-[0.98]
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                      "
                    >

                      {isItemLoading ? (
                        <>
                          <Spinner
                            size="xs"
                            className="text-primary"
                          />
                          Loading order book...
                        </>
                      ) : (
                        <>
                          <BarChart3 className="w-3.5 h-3.5" />
                          View Live Order Book
                          <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />
                        </>
                      )}

                    </button>

                  </div>

                </article>

              );

            })}

          </div>

        )}

      </div>


      {/* ============================================================
          BOTTOM STATUS
      ============================================================ */}
      {filteredAndSortedOfs.length > 0 && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-border bg-black/5 dark:bg-black/5 dark:bg-black/40">

          <div className="flex flex-wrap items-center justify-between gap-2">

            <div className="flex items-center gap-2 text-[10px] text-textMuted">

              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />

              <span>
                Market snapshot automatically refreshes every 60 seconds
              </span>

            </div>

            <span className="text-[10px] font-mono text-textMuted">
              {secondsAgo}s since last sync
            </span>

          </div>

        </div>
      )}

    </section>

      {/* Trading Terminal Modal: Merged NSE + BSE Order Book */}
{selectedOfs && (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-ofs-title"
    onClick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
    className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 md:p-6 bg-black/40 dark:bg-black/80 backdrop-blur-xl animate-fade-in"
  >
    <div className="w-full h-full sm:h-[94vh] max-w-6xl rounded-none sm:rounded-[28px] overflow-hidden border border-border bg-white/[0.98] dark:bg-[#0b0e14]/[0.98] shadow-[0_30px_100px_rgba(0,0,0,0.55)] flex flex-col">

      {/* =========================================================
          TERMINAL HEADER
      ========================================================= */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-border bg-white/[0.025]">

        <div className="flex items-center justify-between gap-3">

          {/* Company Information */}
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center font-bold text-xs text-primary">
              {(selectedOfs.scriptName || 'OF').slice(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">

                <h3
                  id="modal-ofs-title"
                  className="text-base sm:text-lg font-bold text-textPrimary truncate"
                >
                  {selectedOfs.scriptName || 'OFS'}
                </h3>

                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  {selectedOfs.category || 'OFS'}
                </span>

                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border",
                    selectedOfs.status === 'OPEN'
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20"
                      : selectedOfs.status === 'UPCOMING'
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20"
                      : "bg-black/5 dark:bg-white/5 text-textMuted border-border"
                  )}
                >
                  {selectedOfs.status === 'OPEN' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}

                  {selectedOfs.statusRaw || selectedOfs.status || 'CLOSED'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-textMuted mt-0.5 truncate">
                <span className="truncate">
                  {selectedOfs.companyName || selectedOfs.scriptName}
                </span>

                <span className="opacity-40">•</span>

                <span className="font-mono">
                  {selectedOfs.offerDate || 'Live snapshot'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 shrink-0">

            {selectedOfs.status === 'OPEN' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}

            <button
              onClick={closeModal}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-textMuted hover:text-textPrimary hover:bg-black/10 dark:bg-white/10 border border-transparent hover:border-border transition-all cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* =========================================================
            COMPACT MARKET SNAPSHOT
        ========================================================= */}
        {!detailLoading && !detailError && detailData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">

            {/* Cut-off */}
            <div className="rounded-xl border border-border bg-black/5 dark:bg-white/55] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-textMuted">
                Cut-off
              </p>

              <p className="text-sm sm:text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                {detailData.summary?.cutoffPrice ||
                  selectedOfs.cutoffPrice ||
                  'N/A'}
              </p>
            </div>

            {/* Floor Price */}
            <div className="rounded-xl border border-border bg-black/5 dark:bg-white/55] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-textMuted">
                Floor Price
              </p>

              <p className="text-sm sm:text-base font-extrabold font-mono text-textPrimary mt-0.5 truncate">
                {detailData.summary?.floorPrice || 'N/A'}
              </p>
            </div>

            {/* Subscription */}
            <div className="rounded-xl border border-border bg-black/5 dark:bg-white/55] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-textMuted">
                Subscription
              </p>

              <p className="text-sm sm:text-base font-extrabold font-mono text-primary mt-0.5 truncate">
                {selectedOfs.subscription || 'N/A'}
              </p>
            </div>

            {/* Shares Offered */}
            <div className="rounded-xl border border-border bg-black/5 dark:bg-white/55] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-textMuted">
                Shares Offered
              </p>

              <p className="text-sm sm:text-base font-extrabold font-mono text-textPrimary mt-0.5 truncate">
                {selectedOfs.sharesOffered || 'N/A'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          MAIN TERMINAL AREA
      ========================================================= */}
      <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4">

        {/* Loading */}
        {detailLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm px-6">

              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <Spinner size="lg" className="text-primary" />
              </div>

              <p className="text-sm font-bold text-textPrimary">
                Loading live bid book
              </p>

              <p className="text-xs text-textMuted mt-1.5 leading-relaxed">
                Merging and parsing NSE + BSE price levels.
                This view will update automatically when ready.
              </p>
            </div>
          </div>

        /* Error */
        ) : detailError ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-full max-w-md p-5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-sm flex items-start gap-3">

              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />

              <div>
                <p className="font-bold text-rose-700 dark:text-rose-300">
                  Unable to load order book
                </p>

                <p className="mt-1 text-rose-600 dark:text-rose-400/90">
                  {detailError}
                </p>
              </div>
            </div>
          </div>

        /* Data */
        ) : detailData ? (

          <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px] gap-3">

            {/* =====================================================
                LEFT SIDE — MAIN ORDER BOOK
            ===================================================== */}
            <section className="min-h-0 rounded-2xl border border-border bg-white/[0.025] overflow-hidden flex flex-col">

              {/* Order Book Header */}
              <div className="shrink-0 px-4 py-3 border-b border-border bg-black/5 dark:bg-white/5">

                <div className="flex items-center justify-between gap-3">

                  <div className="min-w-0">

                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <BarChart3 className="w-3.5 h-3.5" />
                      </div>

                      <h4 className="text-sm font-bold text-textPrimary">
                        Merged Order Book
                      </h4>
                    </div>

                    <p className="text-[10px] text-textMuted mt-1 ml-9">
                      NSE + BSE consolidated price levels
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">

                    <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-textMuted">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Cut-off
                    </span>

                    <span className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-border text-[10px] font-mono text-textMuted">
                      {detailData.bidBook?.length || 0} levels
                    </span>
                  </div>
                </div>
              </div>

              {/* ===================================================
                  SCROLLABLE TABLE
                  ONLY THIS SECTION SCROLLS
              =================================================== */}
              {detailData.bidBook && detailData.bidBook.length > 0 ? (

                <div className="flex-1 min-h-0 overflow-auto scrollbar-hide">

                  <table className="w-full text-left text-xs">

                    <thead className="sticky top-0 z-20 bg-white/95 dark:bg-[#0d1118]/95 backdrop-blur-xl border-b border-border text-textMuted uppercase font-bold">
                      <tr>
                        <th className="px-3 sm:px-4 py-3">
                          Bid Price
                        </th>

                        <th className="px-3 sm:px-4 py-3 text-right">
                          BSE
                        </th>

                        <th className="px-3 sm:px-4 py-3 text-right">
                          NSE
                        </th>

                        <th className="px-3 sm:px-4 py-3 text-right">
                          Total
                        </th>

                        <th className="px-3 sm:px-4 py-3 text-center">
                          Result
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border font-mono">

                      {detailData.bidBook.map((row, i) => {

                        const totalNum = parseNumber(row.totalQty);

                        const pct = Math.min(
                          100,
                          Math.round(
                            (totalNum / maxTotalQtyInBook) * 100
                          )
                        );

                        const isPass =
                          row.cutoffStatus === 'PASS';

                        const isCutoff =
                          (cleanCutoffPriceStr &&
                            row.price.includes(cleanCutoffPriceStr)) ||
                          row.price.toLowerCase().includes('cut-off') ||
                          (
                            isPass &&
                            (
                              i === 0 ||
                              detailData.bidBook[i - 1]?.cutoffStatus === 'FAIL'
                            )
                          );

                        let displayPrice = row.price;

                        if (
                          row.price
                            .toLowerCase()
                            .includes('cut-off')
                        ) {
                          const actualRate =
                            detailData.summary?.cutoffPrice ||
                            selectedOfs?.cutoffPrice ||
                            '';

                          if (
                            actualRate &&
                            actualRate !== 'N/A' &&
                            !row.price.includes('₹')
                          ) {
                            displayPrice = `${actualRate} Cut-off`;
                          }
                        }

                        return (
                          <tr
                            key={i}
                            className={clsx(
                              "relative transition-colors",
                              isCutoff
                                ? "bg-emerald-500/[0.12] text-emerald-800 dark:text-emerald-200"
                                : "text-textPrimary hover:bg-black/5 dark:bg-white/55]"
                            )}
                          >

                            {/* Price */}
                            <td className="px-3 sm:px-4 py-3">

                              <div className="flex items-center gap-2 min-w-0">

                                <span
                                  className={clsx(
                                    "font-extrabold text-xs sm:text-sm truncate",
                                    isCutoff
                                      ? "text-emerald-700 dark:text-emerald-300"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  )}
                                >
                                  {displayPrice}
                                </span>

                                {isCutoff && (
                                  <span className="hidden sm:inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/25 shrink-0">
                                    <Check className="w-2.5 h-2.5" />
                                    Cut-off
                                  </span>
                                )}

                              </div>
                            </td>

                            {/* BSE */}
                            <td className="px-3 sm:px-4 py-3 text-right text-textMuted">
                              {row.bseQty || '-'}
                            </td>

                            {/* NSE */}
                            <td className="px-3 sm:px-4 py-3 text-right text-textMuted">
                              {row.nseQty || '-'}
                            </td>

                            {/* Total Volume */}
                            <td className="px-3 sm:px-4 py-3 text-right font-bold relative overflow-hidden">

                              <div
                                className={clsx(
                                  "absolute right-0 top-1 bottom-1 rounded-l pointer-events-none",
                                  isCutoff
                                    ? "bg-emerald-400/15"
                                    : "bg-primary/10"
                                )}
                                style={{
                                  width: `${pct}%`
                                }}
                              />

                              <span className="relative z-10">
                                {row.totalQty || '-'}
                              </span>

                            </td>

                            {/* Result */}
                            <td className="px-3 sm:px-4 py-3 text-center">

                              <div className="flex flex-col items-center gap-0.5">

                                <span
                                  className={clsx(
                                    "inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full text-[9px] font-extrabold border",
                                    isPass
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 dark:border-emerald-500/30 dark:border-emerald-500/20"
                                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                  )}
                                >
                                  {isPass ? (
                                    <CheckCircle className="w-2.5 h-2.5" />
                                  ) : (
                                    <ShieldAlert className="w-2.5 h-2.5" />
                                  )}

                                  {row.cutoffStatus || 'N/A'}
                                </span>

                                {isCutoff && volumeMatchingData && (
                                  <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-semibold">
                                    ~{volumeMatchingData.estAllotmentPct}%
                                  </span>
                                )}

                              </div>
                            </td>

                          </tr>
                        );
                      })}

                    </tbody>
                  </table>
                </div>

              ) : (

                <div className="flex-1 flex items-center justify-center p-8 text-center">

                  <div className="max-w-sm">

                    <BarChart3 className="w-9 h-9 mx-auto mb-3 text-textMuted/40" />

                    <p className="text-sm font-semibold text-textPrimary">
                      Order book not available yet
                    </p>

                    <p className="text-xs text-textMuted mt-1">
                      Detailed bidding may still be processing or the
                      bidding window has not opened.
                    </p>

                  </div>
                </div>
              )}

            </section>


            {/* =====================================================
                RIGHT SIDE — DEMAND / INSIGHT PANEL
            ===================================================== */}
            <aside className="min-h-0 lg:overflow-y-auto scrollbar-hide space-y-3">

              {/* Demand Snapshot */}
              {volumeMatchingData && (

                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-white/[0.025] to-emerald-500/[0.08] p-4">

                  <div className="flex items-start gap-2.5 mb-3">

                    <div className="w-8 h-8 shrink-0 rounded-xl bg-primary/15 text-primary flex items-center justify-center border border-primary/15">
                      <Scale className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-textPrimary">
                        Demand Snapshot
                      </h4>

                      <p className="text-[10px] text-textMuted mt-0.5">
                        Estimated from cumulative bid volume
                      </p>
                    </div>

                  </div>


                  <div className="space-y-2">

                    {/* Estimated Allotment */}
                    <div className="rounded-xl bg-black/5 dark:bg-white/5 border border-border p-3">

                      <p className="text-[9px] font-bold uppercase tracking-wider text-textMuted">
                        Est. Allotment
                      </p>

                      <p className="text-xl font-extrabold font-mono text-primary mt-1">
                        ~{volumeMatchingData.estAllotmentPct}%
                      </p>

                      <p className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                        {volumeMatchingData.subRatio}x oversubscribed
                      </p>

                    </div>


                    <div className="grid grid-cols-2 gap-2">

                      {/* Equilibrium */}
                      <div className="rounded-xl bg-black/5 dark:bg-white/5 border border-border p-3">

                        <p className="text-[9px] font-bold uppercase tracking-wider text-textMuted">
                          Equilibrium
                        </p>

                        <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                          {volumeMatchingData.matchingPrice}
                        </p>

                        <p className="text-[9px] text-textMuted mt-0.5 truncate">
                          {volumeMatchingData.matchingQty}
                        </p>

                      </div>


                      {/* Offered */}
                      <div className="rounded-xl bg-black/5 dark:bg-white/5 border border-border p-3">

                        <p className="text-[9px] font-bold uppercase tracking-wider text-textMuted">
                          Offered
                        </p>

                        <p className="text-sm font-bold font-mono text-textPrimary mt-1 truncate">
                          {selectedOfs.sharesOffered || 'N/A'}
                        </p>

                        <p className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                          {selectedOfs.category || 'Allocation'}
                        </p>

                      </div>

                    </div>

                  </div>

                </div>
              )}


              {/* Quick Interpretation */}
              <div className="rounded-2xl border border-border bg-white/[0.025] p-4">

                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-primary" />

                  <h4 className="text-xs font-bold text-textPrimary">
                    Quick Interpretation
                  </h4>
                </div>


                <div className="space-y-2.5 text-[10px] leading-relaxed">

                  <div className="flex items-start gap-2">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />

                    <p className="text-textMuted">
                      <span className="text-textPrimary font-semibold">
                        Green row
                      </span>
                      {' '}indicates the detected cut-off / passing level.
                    </p>

                  </div>


                  <div className="flex items-start gap-2">

                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />

                    <p className="text-textMuted">
                      <span className="text-textPrimary font-semibold">
                        Bar width
                      </span>
                      {' '}represents relative total demand at that price.
                    </p>

                  </div>


                  <div className="flex items-start gap-2">

                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />

                    <p className="text-textMuted">
                      <span className="text-textPrimary font-semibold">
                        FAIL
                      </span>
                      {' '}means the price level is below the detected passing condition.
                    </p>

                  </div>

                </div>

              </div>


              {/* Data Source */}
              <div className="rounded-2xl border border-border bg-black/5 dark:bg-white/5 p-4">

                <div className="flex items-center justify-between gap-3">

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-textMuted">
                      Data Source
                    </p>

                    <p className="text-xs font-semibold text-textPrimary mt-0.5">
                      Merged NSE + BSE
                    </p>
                  </div>


                  <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />

                    LIVE

                  </span>

                </div>

              </div>

            </aside>

          </div>

        ) : null}

      </div>


      {/* =========================================================
          COMPACT FOOTER
      ========================================================= */}
      <div className="shrink-0 px-4 sm:px-5 py-2.5 border-t border-border bg-white/[0.02] flex items-center justify-between gap-3">

        <div className="flex items-center gap-2 text-[10px] text-textMuted min-w-0">
          <Clock className="w-3.5 h-3.5 shrink-0" />

          <span className="truncate">
            Live merged order-book snapshot
          </span>
        </div>


        <button
          onClick={closeModal}
          className="px-4 py-2 bg-black/10 dark:bg-white/10 hover:bg-black/10 dark:bg-white/15 border border-border text-textPrimary rounded-xl text-[11px] font-bold transition-all active:scale-95 cursor-pointer shrink-0"
        >
          Close
        </button>

      </div>

    </div>
  </div>
)}
    </PageTransition>
  );
}