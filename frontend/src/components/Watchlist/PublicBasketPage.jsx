import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Share2, 
  Copy, 
  Check, 
  MessageCircle, 
  Twitter, 
  Send, 
  Download, 
  ArrowRight, 
  TrendingUp, 
  Building2, 
  FileText, 
  Eye, 
  Users, 
  Clock, 
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  Sun,
  Moon,
  Layers,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Flame,
  ArrowUpRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useWatchlist } from '../../contexts/WatchlistContext'
import { apiClient } from '../../services/apiClient'
import PageTransition from '../Common/PageTransition'
import Loader from '../Common/Loader'

export default function PublicBasketPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentUser, isApproved, isPendingApproval, isRejected, plan } = useAuth()
  const { refresh: refreshWatchlist, watchlist } = useWatchlist()

  // Theme synchronization with html.dark class and localStorage
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [basket, setBasket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importedSuccess, setImportedSuccess] = useState(false)
  const [copied, setCopied] = useState(false)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)

  // Sync theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  // Fetch basket data
  useEffect(() => {
    async function loadBasket() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiClient.get(`/api/baskets/${encodeURIComponent(slug)}`)
        if (res?.success && res.basket) {
          setBasket(res.basket)
        } else {
          setError(res?.error || 'Basket not found')
        }
      } catch (err) {
        setError(err.message || 'Failed to load basket')
      } finally {
        setLoading(false)
      }
    }
    if (slug) loadBasket()
  }, [slug])

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/basket/${slug}` : ''

  function copyToClipboard() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopied(false), 2500)
  }

  function shareWhatsApp() {
    if (!basket) return
    const text = encodeURIComponent(`📊 Check out the "${basket.title}" curated basket on Tatvarth StockWatch:\n${shareUrl}\n\nTrack real-time statutory announcements & import all stocks in 1-tap!`)
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
  }

  function shareTwitter() {
    if (!basket) return
    const text = encodeURIComponent(`Check out the curated stock basket "${basket.title}" on @TatvarthStockWatch!\n\nLive corporate filings & 1-tap watchlist import 👇\n`)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, '_blank')
  }

  function shareTelegram() {
    if (!basket) return
    const text = encodeURIComponent(`📊 Curated Stock Basket: "${basket.title}"\nLive corporate announcements & 1-tap watchlist import`)
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`, '_blank')
  }

  async function handleImport() {
    if (!currentUser) {
      setAuthPromptOpen(true)
      return
    }

    if (isPendingApproval) {
      toast('Your account is currently under review by administrator. Once approved, you can import this basket to your watchlist.', {
        icon: '⏳',
        duration: 5000,
      })
      return
    }

    if (isRejected) {
      toast.error('Account access has been declined by administrator.')
      return
    }

    setImporting(true)
    try {
      const res = await apiClient.post(`/api/baskets/${encodeURIComponent(slug)}/import`)
      if (res?.success) {
        setImportedSuccess(true)
        await refreshWatchlist?.()

        if (res.planCapped) {
          toast.success(
            `Added ${res.addedCount} stock${res.addedCount === 1 ? '' : 's'} to Watchlist. Note: Plan limit reached on ${res.plan?.toUpperCase()} tier.`,
            { duration: 6000 }
          )
        } else if (res.alreadyInWatchlistCount > 0 && res.addedCount === 0) {
          toast('All stocks in this basket are already in your active Watchlist!', { icon: 'ℹ️', duration: 4000 })
        } else {
          toast.success(`Successfully added ${res.addedCount} stock${res.addedCount === 1 ? '' : 's'} to your Watchlist!`, { duration: 4000 })
        }
      } else {
        toast.error(res?.error || 'Failed to import basket')
      }
    } catch (err) {
      toast.error(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // Handle seamless post-login auto-import
  useEffect(() => {
    const shouldAutoImport = searchParams.get('autoImport') === '1'
    if (shouldAutoImport && basket && currentUser && !importing) {
      if (isPendingApproval) {
        toast('Your account is under review for approval. You can import this basket once authorized!', { icon: '⏳' })
        setSearchParams({}, { replace: true })
        return
      }
      if (isRejected) {
        toast.error('Account access request was declined.')
        setSearchParams({}, { replace: true })
        return
      }
      if (isApproved) {
        setSearchParams({}, { replace: true })
        handleImport()
      }
    }
  }, [searchParams, basket, currentUser, isApproved, isPendingApproval, isRejected])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-textPrimary">
        <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center bg-white dark:bg-[#18181b] shadow-xl border border-border/80 mb-6">
          <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-lg -z-10 animate-pulse" />
          <img src="/logo2.png" alt="Tatvarth Logo" className="w-9 h-9 object-contain" />
        </div>
        <Loader size="lg" message="Loading curated basket..." />
      </div>
    )
  }

  // Error / Not Found state
  if (error || !basket) {
    return (
      <div className="min-h-screen bg-background text-textPrimary flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 backdrop-blur-2xl bg-surface/85 dark:bg-background/85 border-b border-border/80 h-20 flex items-center">
          <div className="max-w-6xl mx-auto px-4 w-full flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-[#18181b] shadow-md border border-border/80">
                <img src="/logo2.png" alt="Tatvarth Logo" className="w-6 h-6 object-contain" />
              </div>
              <div className="font-extrabold text-xl font-display tracking-tight text-textPrimary">
                Tatvarth<span className="text-primary font-bold">StockWatch</span>
              </div>
            </Link>
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface border border-border/90 text-textMuted hover:text-textPrimary transition shadow-sm"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-danger/10 text-danger mb-5 flex items-center justify-center border border-danger/25 shadow-xl shadow-danger/10">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display mb-3 tracking-tight">Basket Not Found</h1>
          <p className="text-sm text-textMuted leading-relaxed mb-6">
            The curated basket link <span className="font-mono text-textPrimary font-semibold px-2 py-0.5 rounded bg-surface border border-border">"{slug}"</span> does not exist or has been removed by its creator.
          </p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primaryHover text-white font-bold text-sm shadow-lg shadow-primary/25 transition border border-primary/40"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to Dashboard</span>
            </Link>
            <Link
              to="/watchlist"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border/90 hover:bg-surfaceHover text-textPrimary font-semibold text-sm transition"
            >
              <span>View Watchlist</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const scripts = Array.isArray(basket.scripts) ? basket.scripts : []
  const announcements = Array.isArray(basket.recentAnnouncements) ? basket.recentAnnouncements : []

  return (
    <PageTransition className="min-h-screen bg-background text-textPrimary selection:bg-primary selection:text-white pb-24">
      {/* ── Official Brand Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-surface/85 dark:bg-background/85 border-b border-border/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          {/* Logo & Brand Emblem */}
          <Link to="/" className="flex items-center gap-3.5 group">
            <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center bg-white dark:bg-[#18181b] shadow-md border border-border/80 transition-transform duration-300 group-hover:scale-105">
              <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-md -z-10 opacity-70 group-hover:opacity-100 transition-opacity" />
              <img src="/logo2.png" alt="Tatvarth Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold font-display tracking-tight leading-none text-textPrimary">
                Tatvarth<span className="text-primary font-bold">StockWatch</span>
              </div>
              <div className="text-[10px] uppercase font-semibold font-mono tracking-wider text-textMuted mt-1 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                <span>Curated Watchlist Basket</span>
              </div>
            </div>
          </Link>

          {/* Right Action Deck */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle (Sun / Moon) */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface border border-border/90 text-textMuted hover:text-textPrimary hover:border-primary/50 transition-all shadow-sm"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-blue-500" />
              )}
            </button>

            {/* User State Navigation */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/watchlist"
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-surface border border-border text-textPrimary hover:bg-surfaceHover transition"
                >
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  <span>My Watchlist</span>
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primaryHover text-white transition shadow-sm border border-primary/40"
                >
                  <span>Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-textPrimary hover:bg-surface border border-transparent hover:border-border transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/login?mode=signup"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primaryHover text-white transition shadow-md shadow-primary/20 border border-primary/40"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* ── Luxury Basket Hero Card ── */}
        <div className="relative overflow-hidden rounded-3xl p-6 sm:p-9 bg-surface/90 dark:bg-surface/60 backdrop-blur-xl border border-border shadow-2xl space-y-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent-teal/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              {/* Badges Ribbon */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wide bg-primary/15 text-primary border border-primary/30 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  {basket.category || 'High-Conviction'}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-surfaceHover text-textMuted border border-border flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Shared by <strong className="text-textPrimary">{basket.creatorName || 'StockWatch Investor'}</strong>
                </span>
                {basket.createdAt && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-mono text-textMuted/80 bg-surface/80 border border-border/60 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Published {new Date(basket.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display text-textPrimary leading-tight">
                {basket.title}
              </h1>

              {basket.description && (
                <p className="text-sm sm:text-base text-textMuted leading-relaxed">
                  {basket.description}
                </p>
              )}

              {/* Stats Counters */}
              <div className="flex items-center gap-6 pt-2 text-xs font-medium text-textMuted flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span><strong className="text-textPrimary font-mono text-sm">{scripts.length}</strong> Stocks Included</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <Eye className="w-4 h-4" />
                  </div>
                  <span><strong className="text-textPrimary font-mono text-sm">{basket.viewsCount || 1}</strong> Views</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <span><strong className="text-textPrimary font-mono text-sm">{basket.importsCount || 0}</strong> Investors Imported</span>
                </div>
              </div>
            </div>

            {/* ── Primary 1-Tap Import Action Deck ── */}
            <div className="flex flex-col gap-3 shrink-0 lg:w-72">
              <button
                onClick={handleImport}
                disabled={importing}
                className={`w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl font-bold text-sm sm:text-base shadow-xl transition-all transform active:scale-[0.98] ${
                  importedSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25 border border-emerald-400/40'
                    : 'bg-gradient-to-r from-primary to-accent-teal hover:opacity-95 text-white shadow-primary/25 border border-primary/40'
                }`}
              >
                {importing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importing Stocks...</span>
                  </>
                ) : importedSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>In Your Watchlist!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Import to My Watchlist</span>
                  </>
                )}
              </button>

              {importedSuccess && (
                <Link
                  to="/watchlist"
                  className="w-full text-center py-2 text-xs font-bold text-primary hover:underline flex items-center justify-center gap-1.5"
                >
                  <span>Open in My Watchlist</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}

              <p className="text-[11px] text-center text-textMuted leading-normal">
                1-Tap import • Tracks sub-second BSE/NSE disclosures & push notifications
              </p>
            </div>
          </div>

          {/* ── Social Share Ribbon ── */}
          <div className="pt-5 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-textMuted flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              Share this curated basket with fellow investors:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-textPrimary hover:bg-surfaceHover transition shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-textMuted" />}
                <span>{copied ? 'Copied Link' : 'Copy Link'}</span>
              </button>
              <button
                onClick={shareWhatsApp}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] text-xs font-bold transition shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                onClick={shareTwitter}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 text-xs font-bold transition shadow-sm"
              >
                <Twitter className="w-3.5 h-3.5" />
                <span>X / Twitter</span>
              </button>
              <button
                onClick={shareTelegram}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/30 text-[#0088cc] text-xs font-bold transition shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Telegram</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Basket Stocks Grid ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-display text-textPrimary flex items-center gap-2.5">
              <Building2 className="w-5 h-5 text-primary" />
              <span>Basket Holdings ({scripts.length} Stocks)</span>
            </h2>
            <span className="text-xs font-mono text-textMuted bg-surface px-2.5 py-1 rounded-lg border border-border">
              Real-time monitored
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map((script, idx) => {
              const code = script.bseCode || script.ltdCode
              const sym = script.symbol || script.nseSymbol
              const name = script.scriptName || script.companyName || sym || code
              const tvSymbol = sym ? `NSE:${sym}` : (code ? `BSE:${code}` : null)

              return (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-surface/90 dark:bg-surface/50 border border-border/80 hover:border-primary/50 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between group space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-textPrimary font-display line-clamp-1 group-hover:text-primary transition-colors">
                          {name}
                        </h3>
                        <div className="flex items-center gap-2 font-mono text-xs text-textMuted">
                          {sym && <span className="font-bold text-primary">{sym}</span>}
                          {sym && code && <span className="text-border">•</span>}
                          {code && <span className="text-textMuted">{code}</span>}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-surfaceHover text-textMuted border border-border shrink-0">
                        {script.exchange || 'BOTH'}
                      </span>
                    </div>

                    {script.notes && (
                      <div className="p-2.5 rounded-xl bg-background/80 border border-border/60 text-xs text-textMuted italic leading-relaxed">
                        "{script.notes}"
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 text-xs text-textMuted border-t border-border/60">
                    <span className="font-mono text-[11px] text-textMuted/70">#{idx + 1}</span>
                    <div className="flex items-center gap-3">
                      {tvSymbol && (
                        <a
                          href={`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline font-semibold text-xs"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Chart</span>
                        </a>
                      )}
                      <Link
                        to={`/all-announcements?search=${encodeURIComponent(sym || code)}`}
                        className="flex items-center gap-1 text-textMuted hover:text-textPrimary transition font-medium text-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Filings</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Recent Announcements Feed for this Basket ── */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-display text-textPrimary flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-accent-teal" />
              <span>Today's Disclosures for Basket Stocks</span>
            </h2>
            <span className="text-xs text-textMuted font-mono">Sub-second ingestion</span>
          </div>

          {announcements.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface/70 border border-border text-center text-textMuted space-y-2">
              <Clock className="w-8 h-8 mx-auto text-textMuted/40" />
              <p className="text-sm font-semibold text-textPrimary">No statutory announcements filed today yet</p>
              <p className="text-xs text-textMuted max-w-md mx-auto">Exchange announcements appear automatically here in real-time as soon as companies submit disclosures to BSE/NSE.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/80 border border-border rounded-2xl bg-surface/90 dark:bg-surface/50 overflow-hidden shadow-sm">
              {announcements.map((ann, i) => (
                <div key={i} className="p-4 sm:p-5 hover:bg-surfaceHover transition flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-textPrimary font-mono">
                        {ann.symbol || ann.scripCode}
                      </span>
                      {ann.category && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                          {ann.category}
                        </span>
                      )}
                      <span className="text-textMuted font-mono text-[11px]">
                        {ann.time || ann.date || 'Recent'}
                      </span>
                    </div>
                    <p className="text-textPrimary/95 font-medium leading-relaxed">
                      {ann.headline || ann.subject || 'Corporate Announcement'}
                    </p>
                  </div>

                  {ann.attachmentUrl && (
                    <a
                      href={ann.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-primary hover:bg-surfaceHover transition font-semibold text-xs self-start shrink-0 shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Filing PDF</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Curate Your Own Basket CTA ── */}
        <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-primary/10 via-surface to-accent-teal/10 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2 max-w-xl">
            <h3 className="text-lg sm:text-xl font-bold font-display text-textPrimary">
              Curate and Share Your Own High-Conviction Baskets
            </h3>
            <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
              Create thematic portfolios with customized stock conviction theses, share via viral links, and get real-time exchange announcements straight to your phone.
            </p>
          </div>
          <Link
            to={currentUser ? "/watchlist" : "/login?mode=signup"}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary hover:bg-primaryHover text-white font-bold text-sm shadow-lg shadow-primary/25 transition shrink-0 border border-primary/40"
          >
            <span>{currentUser ? "Build in Watchlist" : "Get Started Free"}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>

      {/* ── Guest Auth Modal (High-converting 1-tap onboarding) ── */}
      {authPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-surface border border-border rounded-3xl p-6 sm:p-7 shadow-2xl text-textPrimary text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-accent-teal mx-auto flex items-center justify-center text-white shadow-xl shadow-primary/25">
              <Download className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold font-display text-textPrimary">Sign In to Import Basket</h3>
              <p className="text-xs text-textMuted max-w-sm mx-auto leading-relaxed">
                Sign in to your Tatvarth StockWatch account to import <span className="font-semibold text-textPrimary font-mono">"{basket.title}"</span> into your Watchlist and receive instant BSE/NSE filing notifications.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <Link
                to={`/login?redirect=${encodeURIComponent(`/basket/${slug}?autoImport=1`)}`}
                className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primaryHover text-white font-bold text-sm transition shadow-lg shadow-primary/25 flex items-center justify-center gap-2 border border-primary/40"
              >
                <span>Continue to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setAuthPromptOpen(false)}
                className="w-full py-2.5 text-xs font-semibold text-textMuted hover:text-textPrimary transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
