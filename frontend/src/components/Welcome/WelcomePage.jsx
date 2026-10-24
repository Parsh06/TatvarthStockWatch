import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Zap,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Bell,
  Search,
  CheckCircle2,
  ArrowRight,
  Crown,
  ChevronDown,
  Layers,
  Calendar,
  Lock,
  QrCode,
  FileText,
  Users,
  Check,
  X,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  Activity,
  Cpu,
  RefreshCw,
  Sun,
  Moon,
  Menu,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  Clock,
  CheckCheck
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'
import PwaInstallButton from '../Common/PwaInstallButton'

export default function WelcomePage() {
  const { currentUser, isPro, isPremium, plan: userPlan, refreshAdminProfile } = useAuth()
  const navigate = useNavigate()

  // Theme management (persisted in localStorage and synchronizes with html.dark class)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [selectedPlanDetails, setSelectedPlanDetails] = useState(null)
  const [checkoutModalPlan, setCheckoutModalPlan] = useState(null)
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(null)
  const [activeFaq, setActiveFaq] = useState(null)

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

  // Plans catalog
  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      badge: 'Free Forever',
      tagline: 'Essential real-time tracking for active retail investors.',
      priceMonthly: 0,
      priceAnnual: 0,
      popular: false,
      color: 'from-slate-500 to-slate-700',
      borderAccent: 'border-border',
      features: [
        { text: 'Up to 5 Watchlist Scrips', included: true },
        { text: '3 Daily Gemini AI PDF Vision Analyses', included: true },
        { text: '1 Family Member PAN Allotment', included: true },
        { text: 'Real-time BSE & NSE Statutory Filings', included: true },
        { text: 'Standard Web Push Notifications', included: true },
        { text: 'Volume Spurt & Corporate Calendars', included: true },
        { text: 'Automated Multi-Registrar Allotment Radar', included: false },
        { text: 'CSV & Excel Spreadsheet Exports', included: false },
        { text: 'Curated Shareable Baskets', included: false },
        { text: '1-on-1 VIP Concierge Support', included: false },
      ],
      description: 'The Basic tier provides full access to our high-speed statutory feeds and allows you to test institutional Gemini AI summaries on statutory balance sheets and disclosures. Ideal for monitoring a focused portfolio.',
    },
    {
      id: 'pro',
      name: 'Pro Trader',
      badge: 'Most Popular',
      tagline: 'High-speed statutory research & automated multi-registrar allotment.',
      priceMonthly: 999,
      priceAnnual: 8999,
      popular: true,
      color: 'from-cyan-500 via-primary to-indigo-600',
      borderAccent: 'border-primary/80 shadow-xl shadow-primary/20',
      features: [
        { text: 'Up to 50 Watchlist Scrips', included: true },
        { text: 'Unlimited Gemini AI PDF Vision Analyses', included: true },
        { text: '10 Family Member PANs with Automated Check', included: true },
        { text: 'Automated KFintech, MUFG & BigShare Radar', included: true },
        { text: 'Full CSV & Excel Spreadsheet Exports', included: true },
        { text: 'Up to 5 Shareable Curated Baskets', included: true },
        { text: 'High-Priority Instant Push Notifications', included: true },
        { text: 'Real-time OFS Bid-Book Demand Equilibrium', included: true },
        { text: 'Priority Email & Telegram Support', included: true },
        { text: '1-on-1 VIP WhatsApp Concierge Support', included: false },
      ],
      description: 'Built for active traders and family portfolio managers. Unlocks unlimited Gemini AI statutory vision, automated multi-family PAN checks as soon as allotment goes live, and full spreadsheet export capability.',
    },
    {
      id: 'premium',
      name: 'Premium HNI',
      badge: 'Institutional Grade',
      tagline: 'Maximum power, zero caps & 1-on-1 WhatsApp concierge.',
      priceMonthly: 1999,
      priceAnnual: 17999,
      popular: false,
      color: 'from-amber-400 via-amber-500 to-yellow-600',
      borderAccent: 'border-amber-500/70 shadow-xl shadow-amber-500/15',
      features: [
        { text: 'Unlimited Watchlist Scrips (Zero Caps)', included: true },
        { text: 'Unlimited Priority Gemini AI Vision & Research', included: true },
        { text: 'Unlimited Family Member PANs', included: true },
        { text: 'Automated 24/7 Multi-Registrar Allotment Radar', included: true },
        { text: 'Unlimited Curated Shareable Baskets', included: true },
        { text: 'Full CSV & Excel Spreadsheet Exports', included: true },
        { text: 'Ultra-Low Latency VIP Push Notifications', included: true },
        { text: 'Real-time OFS & Volume Spike Radar', included: true },
        { text: 'Dedicated 1-on-1 VIP WhatsApp Concierge', included: true },
        { text: 'Early Access to New Platform Models & Tools', included: true },
      ],
      description: 'The highest tier crafted for Family Offices, HNIs, and institutional investors. Offers completely uncapped capacity across all watchlists, family PANs, and AI research briefs with personal VIP concierge support.',
    },
  ]

  // Feature highlights
  const capabilities = [
    {
      icon: Bell,
      title: 'Sub-Second Statutory Filings',
      desc: 'BSE and NSE corporate disclosures ingested, category-classified, and dispatched in sub-second speed with zero polling lag.',
      tag: 'Real-Time Feed',
    },
    {
      icon: Sparkles,
      title: 'Gemini AI Statutory Vision',
      desc: 'Our multimodal AI inspects official multi-page PDFs, balance sheets, and notes, delivering a structured 5-point equity analyst brief.',
      tag: 'Institutional AI',
    },
    {
      icon: Search,
      title: 'Multi-Registrar IPO Radar',
      desc: 'Verify IPO allotments in 1-click across Link Intime (MUFG), KFintech, and BigShare. Automated alerts when family PANs get shares.',
      tag: 'Automated Check',
    },
    {
      icon: BarChart3,
      title: 'Volume Spurt & OFS Tracker',
      desc: 'Detect explosive volume surges across BSE/NSE equities and track live Offer for Sale (OFS) real-time bid-book demand equilibrium.',
      tag: 'Breakout Detection',
    },
    {
      icon: Calendar,
      title: 'Corporate & Results Calendar',
      desc: 'Stay ahead of board meetings, forthcoming quarterly earnings, dividend records, and AGMs with 1-click exportable schedules.',
      tag: 'Calendar & Filings',
    },
    {
      icon: Layers,
      title: 'Shareable Curated Baskets',
      desc: 'Package your high-conviction thematic stock ideas into public baskets with live statutory feeds and 1-tap deduplicated import.',
      tag: 'Social Investing',
    },
  ]

  // Live Market Pulse Ticker Items (Demonstrating platform capability)
  const pulseEvents = [
    { time: 'Just now', exchange: 'BSE', code: '500325', name: 'Reliance Industries', category: 'Board Meeting', text: 'Intimation of Board Meeting for Q4 Financial Results & Dividend', aiBadge: true },
    { time: '18s ago', exchange: 'NSE', code: 'TATASTEEL', name: 'Tata Steel Ltd', category: 'Financial Results', text: 'Audited Standalone and Consolidated Financial Results for Year ended March 31', aiBadge: true },
    { time: '1m ago', exchange: 'IPO', code: 'LINK INTIME', name: 'Premier Energies Ltd', category: 'Allotment Live', text: 'IPO Basis of Allotment Released & Family PAN Auto-Verification Completed', aiBadge: false },
    { time: '2m ago', exchange: 'BSE', code: '532540', name: 'Tata Consultancy Services', category: 'General', text: 'Press Release on Strategic Cloud Partnership with Global Tier-1 Bank', aiBadge: true },
  ]

  // FAQs
  const faqs = [
    {
      q: 'How fast are corporate announcements delivered compared to other platforms?',
      a: 'Tatvarth StockWatch connects directly to official exchange disclosure feeds. Filings are parsed and categorized in sub-500ms, and instant Web Push alerts trigger before announcements are reported in financial media.',
    },
    {
      q: 'Do my saved stocks or family PANs get deleted if my subscription expires?',
      a: 'Never. We employ a strict non-destructive soft-capping architecture. If a paid plan expires, all your saved stocks and family PANs remain intact and active; you are simply prevented from adding new items beyond the Basic limits until renewal.',
    },
    {
      q: 'How does the automated Family IPO allotment check work?',
      a: 'You save family PAN numbers once (encrypted via military-grade AES-256-GCM). When an IPO registrar (Link Intime, KFintech, or BigShare) releases allotment data, our background worker automatically checks all family members and notifies you immediately if shares are allotted.',
    },
    {
      q: 'Can I cancel or upgrade my membership anytime?',
      a: 'Yes. You can upgrade, switch between monthly and annual billing, or downgrade anytime. When upgrading, new entitlements and higher quotas unlock immediately.',
    },
    {
      q: 'Is my data secure and private?',
      a: 'All sensitive records including PAN numbers are encrypted using AES-256-GCM authenticated encryption. We never share, sell, or disclose your watchlists or portfolio data.',
    },
  ]

  function handleSelectPlan(plan) {
    if (plan.id === 'basic') {
      if (currentUser) {
        navigate('/dashboard')
      } else {
        navigate('/login?plan=basic')
      }
      return
    }

    if (!currentUser) {
      // Direct guest to login while preserving plan intent
      navigate(`/login?plan=${plan.id}&billing=${billingCycle}&redirect=/plans`)
      return
    }

    // Authenticated user: open checkout modal
    setCheckoutModalPlan(plan)
    setCheckoutSuccess(null)
  }

  async function handleCompleteCheckout() {
    if (!checkoutModalPlan) return
    setIsProcessingCheckout(true)

    try {
      const res = await apiClient.post('/api/plans/checkout', {
        plan: checkoutModalPlan.id,
        billing: billingCycle,
        paymentMethod: 'mock', // Pre-connected readiness for Razorpay / UPI
        paymentRef: `TSW-${Date.now().toString().slice(-6)}`,
      })

      if (res.success) {
        setCheckoutSuccess(res)
        toast.success(res.message || 'Plan activated successfully!')
        if (refreshAdminProfile) {
          await refreshAdminProfile()
        }
      } else {
        toast.error(res.error || 'Checkout failed. Please try again.')
      }
    } catch (err) {
      toast.error(err.message || 'Payment initiation failed')
    } finally {
      setIsProcessingCheckout(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-textPrimary selection:bg-primary/20 selection:text-primary transition-colors duration-200">
      {/* ── TOP NAVIGATION BAR ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-2xl bg-surface/85 dark:bg-background/85 border-b border-border/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3.5 group">
            <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center bg-black dark:bg-[#18181b] shadow-md border border-slate-800 dark:border-border/80 transition-transform duration-300 group-hover:scale-105">
              <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-md -z-10 opacity-70 group-hover:opacity-100 transition-opacity" />
              <img src="/logo2.png" alt="Tatvarth Logo" className="w-7 h-7 object-contain brand-logo" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold font-display tracking-tight leading-none text-textPrimary">
                Tatvarth<span className="text-primary font-bold">StockWatch</span>
              </div>
              <div className="text-[10px] uppercase font-semibold font-mono tracking-wider text-textMuted mt-1">
                Institutional Intelligence
              </div>
            </div>
          </Link>

          {/* Center Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-textMuted">
            <a href="#pulse" className="hover:text-textPrimary transition-colors py-1">Live Pulse</a>
            <a href="#capabilities" className="hover:text-textPrimary transition-colors py-1">Capabilities</a>
            <a href="#pricing" className="hover:text-textPrimary transition-colors py-1">Pricing & Plans</a>
            <a href="#faq" className="hover:text-textPrimary transition-colors py-1">FAQ</a>
          </nav>

          {/* Right Action Deck */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* PWA Install Button (Desktop) */}
            <PwaInstallButton variant="welcome" className="hidden sm:inline-flex" />

            {/* PWA Install Button (Mobile navbar) */}
            <PwaInstallButton variant="welcome-mobile" className="sm:hidden" />

            {/* Theme Toggle (Sun / Moon) */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface border border-border/90 text-textMuted hover:text-textPrimary hover:border-primary/50 transition-all shadow-sm"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-blue-500" />
              )}
            </button>

            {/* Desktop Auth Buttons */}
            <div className="hidden sm:flex items-center gap-3">
              {currentUser ? (
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wide border ${
                      isPremium
                        ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
                        : isPro
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'bg-surface text-textMuted border-border'
                    }`}
                  >
                    {userPlan ? userPlan.toUpperCase() : 'BASIC'}
                  </span>
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:bg-primaryHover transition-all shadow-primary/25 border border-primary/40"
                  >
                    Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  <Link
                    to="/login"
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-textPrimary hover:bg-surface border border-transparent hover:border-border transition-all"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/login"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 hover:from-primaryHover hover:to-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all shadow-primary/25 border border-primary/40"
                  >
                    Get Started Free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Open mobile navigation menu"
              className="lg:hidden w-10 h-10 rounded-xl flex items-center justify-center bg-surface border border-border/90 text-textPrimary hover:border-primary/50 transition-colors shadow-sm"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ── MOBILE ACCORDION DRAWER ────────────────────────────────────────── */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-t border-border/80 bg-surface/95 dark:bg-background/95 backdrop-blur-2xl px-4 py-6 shadow-xl"
            >
              <div className="flex flex-col space-y-4">
                <a
                  href="#pulse"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2 text-base font-semibold text-textPrimary border-b border-border/50"
                >
                  <span>Live Market Pulse</span>
                  <Activity className="w-4 h-4 text-primary" />
                </a>
                <a
                  href="#capabilities"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2 text-base font-semibold text-textPrimary border-b border-border/50"
                >
                  <span>Capabilities & Features</span>
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2 text-base font-semibold text-textPrimary border-b border-border/50"
                >
                  <span>Pricing & Membership</span>
                  <Crown className="w-4 h-4 text-amber-500" />
                </a>
                <a
                  href="#faq"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2 text-base font-semibold text-textPrimary border-b border-border/50"
                >
                  <span>FAQ</span>
                  <HelpCircle className="w-4 h-4 text-textMuted" />
                </a>

                {/* Mobile PWA Install App Card */}
                <div className="pt-1">
                  <PwaInstallButton variant="welcome-drawer" />
                </div>

                {/* Mobile Auth CTAs */}
                <div className="pt-2 flex flex-col gap-3">
                  {currentUser ? (
                    <Link
                      to="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-md"
                    >
                      Open Dashboard
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-full text-center py-2.5 rounded-xl border border-border text-sm font-bold text-textPrimary bg-surface"
                      >
                        Sign In
                      </Link>
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-md shadow-primary/25"
                      >
                        Get Started Free
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO SECTION ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32">
        {/* Ambient Glow Orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-primary/10 dark:bg-primary/20 rounded-full blur-[140px] pointer-events-none -z-10" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[300px] bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-[120px] pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Live Market Cadence Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border/90 shadow-sm text-xs font-semibold text-textMuted mb-8 backdrop-blur-md">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-textPrimary">BSE & NSE Direct Exchange Feed Active</span>
            <span className="text-border">|</span>
            <span className="text-primary font-bold font-mono">&lt;500ms Statutory Latency</span>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold font-display tracking-tight text-textPrimary max-w-5xl mx-auto leading-[1.08] mb-6">
            Institutional-Grade{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-500 to-cyan-400 dark:from-blue-400 dark:via-cyan-300 dark:to-teal-300">
              Market Intelligence
            </span>{' '}
            for Indian Equities.
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-textMuted max-w-3xl mx-auto leading-relaxed mb-10 font-sans">
            Track BSE & NSE corporate disclosures in sub-second speed, read Gemini AI PDF vision summaries before the market reacts, verify family IPO allotments in 1-click across 3 registrars, and spot volume spurts before price breakouts.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-16">
            <Link
              to={currentUser ? '/dashboard' : '/login'}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-primary to-blue-600 hover:from-primaryHover hover:to-blue-700 text-white font-bold text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all border border-primary/30"
            >
              <Zap className="w-5 h-5 fill-current" />
              {currentUser ? 'Launch Dashboard' : 'Explore Platform Free'}
            </Link>
            <a
              href="#pricing"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-surface hover:bg-surfaceHover border border-border/90 text-textPrimary font-semibold text-base transition-all shadow-sm"
            >
              <Crown className="w-4 h-4 text-amber-500" />
              View Membership Plans
            </a>
          </div>

          {/* 4 Trust Metric Pillars (Crisp Box Borders) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto text-left">
            <div className="p-5 rounded-2xl bg-surface/80 dark:bg-surface/50 border border-border/90 backdrop-blur-md shadow-sm transition-all hover:border-primary/50 group">
              <div className="flex items-center gap-2 text-primary font-extrabold text-xl font-mono mb-1">
                <Zap className="w-4 h-4" /> &lt;500ms
              </div>
              <div className="text-xs font-semibold text-textPrimary font-display">Statutory Feed Latency</div>
              <div className="text-[11px] text-textMuted mt-0.5">Sub-second exchange ingestion</div>
            </div>

            <div className="p-5 rounded-2xl bg-surface/80 dark:bg-surface/50 border border-border/90 backdrop-blur-md shadow-sm transition-all hover:border-indigo-500/50 group">
              <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400 font-extrabold text-xl font-mono mb-1">
                <Cpu className="w-4 h-4" /> 6-Model Pool
              </div>
              <div className="text-xs font-semibold text-textPrimary font-display">Gemini Multimodal Vision</div>
              <div className="text-[11px] text-textMuted mt-0.5">Direct PDF balance sheet vision</div>
            </div>

            <div className="p-5 rounded-2xl bg-surface/80 dark:bg-surface/50 border border-border/90 backdrop-blur-md shadow-sm transition-all hover:border-emerald-500/50 group">
              <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 font-extrabold text-xl font-mono mb-1">
                <Search className="w-4 h-4" /> 3 Registrars
              </div>
              <div className="text-xs font-semibold text-textPrimary font-display">Automated IPO Allotment</div>
              <div className="text-[11px] text-textMuted mt-0.5">Link Intime, KFintech & BigShare</div>
            </div>

            <div className="p-5 rounded-2xl bg-surface/80 dark:bg-surface/50 border border-border/90 backdrop-blur-md shadow-sm transition-all hover:border-amber-500/50 group">
              <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-extrabold text-xl font-mono mb-1">
                <ShieldCheck className="w-4 h-4" /> AES-256-GCM
              </div>
              <div className="text-xs font-semibold text-textPrimary font-display">Military-Grade Encryption</div>
              <div className="text-[11px] text-textMuted mt-0.5">Zero-leak encrypted family PANs</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE MARKET PULSE DEMO STRIP ────────────────────────────────────── */}
      <section id="pulse" className="py-12 border-y border-border/80 bg-surface/40 dark:bg-surface/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold font-mono uppercase tracking-wider mb-2">
                <Activity className="w-3.5 h-3.5" /> Live Radar Feed
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-textPrimary">
                Real-Time Statutory Stream Preview
              </h2>
            </div>
            <span className="text-xs text-textMuted font-mono bg-surface border border-border px-3 py-1.5 rounded-xl">
              Connected: BSE / NSE / Registrars
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pulseEvents.map((item, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-surface border border-border/90 hover:border-primary/50 transition-all shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono uppercase bg-primary/10 text-primary border border-primary/20">
                        {item.exchange}
                      </span>
                      <span className="text-xs font-mono font-bold text-textPrimary">{item.code}</span>
                      <span className="text-xs text-textMuted font-medium truncate">• {item.name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-textMuted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-textPrimary line-clamp-1 mb-1 font-display">
                    {item.category}: {item.name}
                  </h4>
                  <p className="text-xs text-textMuted line-clamp-2 leading-relaxed">
                    {item.text}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> Statutory Verified
                  </span>
                  {item.aiBadge && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Sparkles className="w-3 h-3" /> AI Summary Ready
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CORE CAPABILITIES SECTION ───────────────────────────────────────── */}
      <section id="capabilities" className="py-24 border-b border-border/80 bg-surface/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold font-mono uppercase tracking-wider mb-3 border border-primary/20">
              <Sparkles className="w-3.5 h-3.5" />
              Engineered for Speed & Precision
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-display text-textPrimary tracking-tight">
              Everything Serious Traders & HNIs Need Under One Roof.
            </h2>
            <p className="text-base text-textMuted mt-4 font-sans leading-relaxed">
              Eliminate information asymmetry with statutory disclosures, AI summaries, and automated family IPO allotment checks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {capabilities.map((c, idx) => {
              const Icon = c.icon
              return (
                <div
                  key={idx}
                  className="glass-panel p-8 rounded-3xl border border-border/90 dark:border-border/80 hover:border-primary/60 transition-all duration-300 group hover:-translate-y-1 shadow-sm flex flex-col justify-between bg-surface/80 dark:bg-surface/50"
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-bold font-mono uppercase tracking-wider px-3 py-1 rounded-full bg-surface border border-border/90 text-textMuted">
                        {c.tag}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold font-display text-textPrimary mb-3">{c.title}</h3>
                    <p className="text-sm text-textMuted leading-relaxed font-sans">{c.desc}</p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/40 flex items-center text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform">
                    <span>Learn how it works</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE PLANS & PRICING MATRIX ──────────────────────────────── */}
      <section id="pricing" className="py-24 border-b border-border/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold font-mono uppercase tracking-wider mb-3 border border-amber-500/20">
              <Crown className="w-3.5 h-3.5" />
              Transparent Institutional Pricing
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-display text-textPrimary tracking-tight">
              Invest in Speed. Monetize Your Edge.
            </h2>
            <p className="text-base text-textMuted mt-4 leading-relaxed font-sans">
              Choose the tier that matches your investment velocity. Upgrade, downgrade, or cancel anytime.
            </p>

            {/* Monthly / Annual Toggle Switch */}
            <div className="mt-8 inline-flex items-center p-1.5 rounded-2xl bg-surface border border-border/90 shadow-sm">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-textMuted hover:text-textPrimary'
                }`}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  billingCycle === 'annual'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-textMuted hover:text-textPrimary'
                }`}
              >
                Annual Billing
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono uppercase bg-amber-400 text-black">
                  Save ~25%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid (Crisp Borders around boxes) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-7xl mx-auto">
            {plans.map((plan) => {
              const isCurrent = userPlan === plan.id
              const displayPrice = billingCycle === 'annual'
                ? Math.round(plan.priceAnnual / 12)
                : plan.priceMonthly

              return (
                <div
                  key={plan.id}
                  className={`glass-panel rounded-3xl p-8 flex flex-col justify-between border relative transition-all duration-300 bg-surface/80 dark:bg-surface/60 ${
                    plan.popular
                      ? `${plan.borderAccent} lg:-translate-y-2 border-2 border-primary`
                      : plan.id === 'premium'
                      ? 'border border-amber-500/70 hover:border-amber-400 shadow-md shadow-amber-500/10'
                      : 'border border-border/90 hover:border-primary/50'
                  }`}
                >
                  {/* Popular Ribbon */}
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-primary to-indigo-600 text-white text-[11px] font-extrabold font-mono uppercase tracking-wider shadow-md">
                      {plan.badge}
                    </div>
                  )}

                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-2xl font-bold font-display text-textPrimary">{plan.name}</h3>
                        <p className="text-xs text-textMuted mt-1">{plan.tagline}</p>
                      </div>
                      {!plan.popular && (
                        <span className="text-[11px] font-bold font-mono px-3 py-1 rounded-full bg-surface border border-border text-textMuted">
                          {plan.badge}
                        </span>
                      )}
                    </div>

                    {/* Price Block */}
                    <div className="my-6 pb-6 border-b border-border/60">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl sm:text-5xl font-extrabold text-textPrimary font-mono">
                          {plan.priceMonthly === 0 ? '₹0' : `₹${displayPrice.toLocaleString('en-IN')}`}
                        </span>
                        <span className="text-sm font-semibold text-textMuted">/ month</span>
                      </div>
                      {billingCycle === 'annual' && plan.priceAnnual > 0 && (
                        <div className="text-xs text-amber-500 font-semibold font-mono mt-1.5">
                          Billed annually at ₹{plan.priceAnnual.toLocaleString('en-IN')}/year
                        </div>
                      )}
                    </div>

                    {/* Feature Inclusions */}
                    <ul className="space-y-3.5 mb-8">
                      {plan.features.map((f, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-3 text-sm">
                          {f.included ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-4 h-4 text-textMuted/40 shrink-0 mt-0.5" />
                          )}
                          <span className={f.included ? 'text-textPrimary font-medium font-sans' : 'text-textMuted/60 line-through font-sans'}>
                            {f.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions Deck */}
                  <div className="pt-4 border-t border-border/50 space-y-3">
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isCurrent}
                      className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border ${
                        isCurrent
                          ? 'bg-surface text-textMuted border-border cursor-not-allowed'
                          : plan.popular
                          ? 'bg-primary hover:bg-primaryHover text-white shadow-md shadow-primary/25 border-primary/30'
                          : plan.id === 'premium'
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-extrabold shadow-md shadow-amber-500/20 border-amber-400'
                          : 'bg-surface hover:bg-surfaceHover border-border text-textPrimary'
                      }`}
                    >
                      {isCurrent ? (
                        'Current Active Plan'
                      ) : (
                        <>
                          {plan.id === 'basic' ? 'Start Free' : `Select ${plan.name} & Checkout`}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedPlanDetails(plan)}
                      className="w-full text-center text-xs font-semibold text-textMuted hover:text-primary transition-colors py-1.5 flex items-center justify-center gap-1.5"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      View Full Plan Description
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ SECTION ─────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 border-b border-border/80 bg-surface/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-textMuted text-xs font-mono uppercase tracking-wider mb-2">
              Questions & Answers
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-textPrimary">Frequently Asked Questions</h2>
            <p className="text-base text-textMuted mt-3 font-sans">Everything you need to know about StockWatch data integrity, quotas, and plans.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border/90 bg-surface/80 dark:bg-surface/50 overflow-hidden transition-all shadow-sm"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full p-6 text-left flex items-center justify-between font-bold text-textPrimary text-base sm:text-lg hover:bg-surfaceHover/50 transition-colors font-display"
                >
                  <span className="pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-textMuted shrink-0 transition-transform duration-300 ${activeFaq === idx ? 'rotate-180 text-primary' : ''}`} />
                </button>

                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 pb-6 text-sm sm:text-base text-textMuted leading-relaxed border-t border-border/40 pt-4 font-sans"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="py-14 bg-surface/60 dark:bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-black dark:bg-[#0B0F19] border border-slate-800 dark:border-border flex items-center justify-center">
              <img src="/logo2.png" alt="Logo" className="w-5 h-5 object-contain brand-logo" />
            </div>
            <span className="font-display font-extrabold text-textPrimary text-base">
              Tatvarth<span className="text-primary font-bold">StockWatch</span>
            </span>
            <span className="text-xs text-textMuted border-l border-border pl-3 ml-1">
              © {new Date().getFullYear()} Arth Projects Company. All rights reserved.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-textMuted">
            <a href="#pulse" className="hover:text-textPrimary transition-colors">Live Pulse</a>
            <a href="#capabilities" className="hover:text-textPrimary transition-colors">Capabilities</a>
            <a href="#pricing" className="hover:text-textPrimary transition-colors">Pricing</a>
            <Link to="/login" className="hover:text-textPrimary transition-colors">Sign In</Link>
            <a
              href="https://wa.me/919428014500?text=Hi%2C%20I%20have%20a%20query%20about%20Tatvarth%20StockWatch%20Membership"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-emerald-500 font-bold hover:underline"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp VIP Concierge
            </a>
          </div>
        </div>
      </footer>

      {/* ── PLAN DESCRIPTION MODAL ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPlanDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel max-w-lg w-full rounded-3xl p-7 sm:p-8 border border-border/90 shadow-2xl relative bg-surface"
            >
              <button
                onClick={() => setSelectedPlanDetails(null)}
                className="absolute top-5 right-5 p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-surfaceHover transition-colors border border-transparent hover:border-border"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-primary">Plan Specification</span>
              </div>
              <h3 className="text-2xl font-bold font-display text-textPrimary mb-3">
                {selectedPlanDetails.name} Tier
              </h3>
              <p className="text-sm text-textMuted leading-relaxed mb-6 font-sans">
                {selectedPlanDetails.description}
              </p>

              <div className="space-y-3 mb-6 bg-surfaceHover/50 p-5 rounded-2xl border border-border">
                <div className="text-xs font-bold font-mono uppercase tracking-wider text-textMuted mb-2">Entitlement Matrix</div>
                <div className="flex justify-between text-sm py-1.5 border-b border-border/40">
                  <span className="text-textMuted">Watchlist Scrip Limit:</span>
                  <span className="font-bold font-mono text-textPrimary">
                    {selectedPlanDetails.id === 'basic' ? '5 scrips' : selectedPlanDetails.id === 'pro' ? '50 scrips' : 'Unlimited'}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b border-border/40">
                  <span className="text-textMuted">Gemini AI PDF Vision:</span>
                  <span className="font-bold font-mono text-textPrimary">
                    {selectedPlanDetails.id === 'basic' ? '3 per day (resets midnight)' : 'Unlimited'}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b border-border/40">
                  <span className="text-textMuted">Family Member PANs:</span>
                  <span className="font-bold font-mono text-textPrimary">
                    {selectedPlanDetails.id === 'basic' ? '1 member' : selectedPlanDetails.id === 'pro' ? 'Up to 10 members' : 'Unlimited'}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b border-border/40">
                  <span className="text-textMuted">Automated IPO Discovery:</span>
                  <span className="font-bold text-textPrimary">
                    {selectedPlanDetails.id === 'basic' ? 'Manual Check Only' : 'Automated Multi-Registrar'}
                  </span>
                </div>
                <div className="flex justify-between text-sm py-1.5">
                  <span className="text-textMuted">Data Export (.xlsx/.csv):</span>
                  <span className="font-bold text-textPrimary">
                    {selectedPlanDetails.id === 'basic' ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  const plan = selectedPlanDetails
                  setSelectedPlanDetails(null)
                  handleSelectPlan(plan)
                }}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:bg-primaryHover transition-all border border-primary/30"
              >
                Proceed to Checkout ({selectedPlanDetails.name})
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── CHECKOUT / PAYMENT MODAL (RAZORPAY READY) ────────────────────────── */}
      <AnimatePresence>
        {checkoutModalPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel max-w-lg w-full rounded-3xl p-7 sm:p-8 border border-border shadow-2xl relative bg-surface"
            >
              <button
                onClick={() => setCheckoutModalPlan(null)}
                className="absolute top-5 right-5 p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-surfaceHover transition-colors border border-transparent hover:border-border"
              >
                <X className="w-5 h-5" />
              </button>

              {checkoutSuccess ? (
                /* Success View */
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h3 className="text-2xl font-bold font-display text-textPrimary mb-2">
                    Payment & Activation Successful!
                  </h3>
                  <p className="text-sm text-textMuted mb-6 font-sans">
                    {checkoutSuccess.message || `Your ${checkoutModalPlan.name} plan is now active.`}
                  </p>
                  <div className="bg-surfaceHover/50 p-4 rounded-2xl border border-border text-left space-y-2.5 mb-6 text-sm">
                    <div className="flex justify-between">
                      <span className="text-textMuted">Tier:</span>
                      <span className="font-bold text-primary">{checkoutModalPlan.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-textMuted">Billing Frequency:</span>
                      <span className="font-semibold text-textPrimary capitalize">{billingCycle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-textMuted">Status:</span>
                      <span className="font-bold text-emerald-500 font-mono">Active</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCheckoutModalPlan(null)
                      navigate('/dashboard')
                    }}
                    className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:bg-primaryHover transition-all flex items-center justify-center gap-2 border border-primary/30"
                  >
                    Open Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Checkout Form */
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="w-5 h-5 text-amber-500" />
                    <span className="text-xs font-bold font-mono uppercase tracking-wider text-primary">Checkout Summary</span>
                  </div>
                  <h3 className="text-2xl font-bold font-display text-textPrimary mb-1">
                    Upgrade to {checkoutModalPlan.name}
                  </h3>
                  <p className="text-xs text-textMuted mb-6">Instant activation with 100% data safety guarantee.</p>

                  <div className="bg-surfaceHover/50 p-4 rounded-2xl border border-border space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted">Plan:</span>
                      <span className="font-bold text-textPrimary">{checkoutModalPlan.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted">Billing Cycle:</span>
                      <span className="font-semibold text-textPrimary capitalize">{billingCycle}</span>
                    </div>
                    <div className="flex justify-between text-base pt-2.5 border-t border-border font-bold">
                      <span className="text-textPrimary">Total Amount:</span>
                      <span className="text-primary text-xl font-mono">
                        ₹{(billingCycle === 'annual' ? checkoutModalPlan.priceAnnual : checkoutModalPlan.priceMonthly).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleCompleteCheckout}
                      disabled={isProcessingCheckout}
                      className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:bg-primaryHover transition-all flex items-center justify-center gap-2 disabled:opacity-50 border border-primary/30"
                    >
                      {isProcessingCheckout ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Processing Activation...
                        </>
                      ) : (
                        <>
                          Proceed with Payment & Activate
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="text-center pt-2">
                      <p className="text-xs text-textMuted flex items-center justify-center gap-1.5 font-sans">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        Razorpay Gateway & UPI Instant Verification Enabled
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
