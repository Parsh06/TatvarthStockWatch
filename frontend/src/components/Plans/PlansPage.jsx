import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Check, 
  X, 
  Sparkles, 
  Zap, 
  Crown, 
  ShieldCheck, 
  ArrowRight, 
  MessageCircle, 
  QrCode, 
  Clock, 
  Calendar, 
  FileSpreadsheet, 
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  CreditCard,
  Smartphone,
  ChevronDown,
  Lock,
  Layers,
  Search,
  Bell,
  TrendingUp,
  Cpu,
  Flame
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'
import PageTransition from '../Common/PageTransition'

/**
 * Dynamically injects Razorpay Checkout script if not already loaded.
 */
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function PlansPage() {
  const { 
    currentUser, 
    plan: currentPlan, 
    planExpiresAt, 
    planStatus, 
    role, 
    isPro, 
    isPremium, 
    refreshAdminProfile 
  } = useAuth()
  
  const [searchParams] = useSearchParams()
  const [billingCycle, setBillingCycle] = useState('monthly') // 'monthly' | 'annual'
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState(null)
  const [paymentTab, setPaymentTab] = useState('razorpay') // 'razorpay' | 'upi'
  const [utrNumber, setUtrNumber] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState(null)
  const [copiedUpi, setCopiedUpi] = useState(false)

  const isAnnual = billingCycle === 'annual'
  const upiId = 'tatvarthcapital@okaxis'

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      tagline: 'Essential Market Intelligence',
      desc: 'Free starter tier to explore real-time corporate announcements & market movers.',
      priceMonthly: '₹0',
      priceAnnual: '₹0',
      rawMonthly: 0,
      rawAnnual: 0,
      period: 'forever',
      popular: false,
      tierBadge: 'Starter • Free Forever',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-surface dark:border-border dark:text-textMuted',
      accentBorder: 'border-border',
      glowBg: 'from-slate-500/5 to-transparent',
      features: [
        { title: 'Watchlist Capacity', value: '5 Scrips', bold: true },
        { title: 'Gemini AI PDF Analysis', value: '3 per day (resets midnight)', bold: false },
        { title: 'Saved Family PANs', value: '1 Family PAN', bold: false },
        { title: 'IPO Allotment Check', value: 'Single PAN automated check', bold: false },
        { title: 'Live BSE / NSE Feed', value: 'Real-time category filing feed', bold: false },
        { title: 'Curated Baskets', value: 'View & 1-tap import', bold: false },
        { title: 'Data Export (.xlsx / .csv)', value: 'Locked (Preview only)', cross: true },
        { title: 'Custom Keyword Radar', value: 'Not included in Basic', cross: true },
        { title: 'Priority Web Push & Telegram', value: 'Standard notifications', cross: true },
      ],
      cta: currentPlan === 'basic' && role !== 'admin' ? 'Current Plan' : 'Active as Fallback',
      disabled: currentPlan === 'basic',
    },
    {
      id: 'pro',
      name: 'Pro',
      tagline: 'For Active Traders & Serious Investors',
      desc: 'Deep statutory equity research, 50 stocks, and unlimited institutional AI analysis.',
      priceMonthly: '₹999',
      priceAnnual: '₹749',
      originalAnnualMonthly: '₹999',
      annualTotal: '₹8,999 / year',
      savingsLabel: 'Save ₹2,989 / yr (2 Months Free)',
      rawMonthly: 999,
      rawAnnual: 8999,
      period: isAnnual ? 'per month, billed annually' : 'per month',
      popular: true,
      tierBadge: 'Most Popular • Trader Choice',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-primary/15 dark:border-primary/30 dark:text-primary',
      accentBorder: 'border-primary/60 shadow-2xl shadow-primary/10',
      glowBg: 'from-blue-600/15 via-indigo-600/10 to-transparent',
      features: [
        { title: 'Watchlist Capacity', value: 'Up to 50 Scrips', bold: true },
        { title: 'Gemini AI PDF Analysis', value: 'Unlimited statutory PDF vision', bold: true },
        { title: 'Saved Family PANs', value: 'Up to 10 Family PANs', bold: true },
        { title: 'IPO Allotment Check', value: 'Automated multi-registrar radar', bold: true },
        { title: 'Data Export (.xlsx / .csv)', value: 'Full Excel & CSV downloads', bold: true },
        { title: 'Curated Baskets', value: 'Publish up to 10 public baskets', bold: false },
        { title: 'Priority Web Push & Telegram', value: 'High-priority instant alerts', bold: true },
        { title: 'Multi-Device Sync', value: 'All phones, tablets & desktop', bold: false },
        { title: 'Custom Keyword Radar', value: 'Not included in Pro', cross: true },
      ],
      cta: currentPlan === 'pro' && role !== 'admin' ? 'Current Plan' : 'Upgrade to Pro',
      disabled: currentPlan === 'pro' && role !== 'admin',
    },
    {
      id: 'premium',
      name: 'Premium HNI',
      tagline: 'Family Offices & Institutional Investors',
      desc: 'Infinite capacity, priority vision AI queue, custom radar, and VIP support.',
      priceMonthly: '₹1,999',
      priceAnnual: '₹1,499',
      originalAnnualMonthly: '₹1,999',
      annualTotal: '₹17,999 / year',
      savingsLabel: 'Save ₹5,989 / yr (2 Months Free)',
      rawMonthly: 1999,
      rawAnnual: 17999,
      period: isAnnual ? 'per month, billed annually' : 'per month',
      popular: false,
      tierBadge: 'Institutional • Family Offices',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400',
      accentBorder: 'border-amber-500/50 shadow-2xl shadow-amber-500/15',
      glowBg: 'from-amber-500/15 via-yellow-500/10 to-transparent',
      features: [
        { title: 'Watchlist Capacity', value: 'Unlimited Scrips (Zero Caps)', bold: true },
        { title: 'Gemini AI PDF Analysis', value: 'Unlimited Priority Vision Queue', bold: true },
        { title: 'Saved Family PANs', value: 'Unlimited Family PANs', bold: true },
        { title: 'IPO Allotment Check', value: 'Automated check with custom report', bold: true },
        { title: 'Data Export (.xlsx / .csv)', value: 'Full Excel & CSV downloads', bold: true },
        { title: 'Curated Baskets', value: 'Unlimited public & private baskets', bold: true },
        { title: 'Custom Keyword Radar', value: 'Custom scrip & keyword triggers', bold: true },
        { title: 'VIP Concierge', value: 'Dedicated account manager on WhatsApp', bold: true },
      ],
      cta: (currentPlan === 'premium' || role === 'admin') ? 'Current Plan' : 'Upgrade to Premium HNI',
      disabled: (currentPlan === 'premium' || role === 'admin'),
    },
  ]

  useEffect(() => {
    const select = searchParams.get('select') || searchParams.get('plan')
    const cycle = searchParams.get('billing')
    if (cycle === 'annual' || cycle === 'monthly') {
      setBillingCycle(cycle)
    }
    if (select) {
      const target = plans.find(p => p.id === select.toLowerCase())
      if (target && !target.disabled) {
        setSelectedPlanForUpgrade(target)
      }
    }
  }, [searchParams, currentPlan])

  function handleSelectUpgrade(p) {
    if (p.disabled || p.id === 'basic') return
    setSelectedPlanForUpgrade(p)
    setPaymentTab('razorpay')
  }

  function handleCopyUpi() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(upiId)
      setCopiedUpi(true)
      toast.success('UPI ID copied to clipboard!')
      setTimeout(() => setCopiedUpi(false), 2500)
    }
  }

  /**
   * Razorpay Payment Flow
   * - Ready for live credentials: when user adds RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET,
   *   this automatically executes real checkout.
   * - As requested: when gateway is down or credentials are not yet live, shows informative toast:
   *   "Razorpay is down for now. Please use UPI direct transfer or try again shortly."
   */
  async function handleRazorpayCheckout() {
    if (!selectedPlanForUpgrade) return
    setSubmittingPayment(true)

    try {
      const orderRes = await apiClient.post('/api/plans/create-order', {
        plan: selectedPlanForUpgrade.id,
        billing: billingCycle,
      })

      if (!orderRes || !orderRes.success || orderRes.gatewayDown) {
        toast.error('Razorpay is down for now. Please use UPI direct transfer or try again shortly.', {
          id: 'razorpay-down',
          duration: 4500,
          icon: '⚠️',
        })
        return
      }

      // Load Razorpay JS SDK dynamically
      const loaded = await loadRazorpayScript()
      if (!loaded || !window.Razorpay) {
        toast.error('Razorpay is down for now. Please use UPI direct transfer.', {
          id: 'razorpay-down',
          icon: '⚠️',
        })
        return
      }

      const options = {
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency || 'INR',
        name: 'Tatvarth StockWatch',
        description: `${selectedPlanForUpgrade.name} Membership (${billingCycle})`,
        image: '/logo2-black.png',
        order_id: orderRes.orderId,
        prefill: {
          email: currentUser?.email || '',
          name: currentUser?.displayName || 'StockWatch Investor',
        },
        theme: {
          color: selectedPlanForUpgrade.id === 'premium' ? '#F59E0B' : '#3B82F6',
        },
        handler: async function (response) {
          try {
            const verifyRes = await apiClient.post('/api/plans/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: selectedPlanForUpgrade.id,
              billing: billingCycle,
            })

            if (verifyRes.success && verifyRes.activated) {
              toast.success(`🎉 Congratulations! Your ${selectedPlanForUpgrade.name} membership is active! All features have been unlocked.`, {
                duration: 6000,
              })
              setSelectedPlanForUpgrade(null)
              if (refreshAdminProfile) await refreshAdminProfile()
            } else {
              toast.error(verifyRes.error || 'Payment verification failed')
            }
          } catch (vErr) {
            toast.error(vErr.message || 'Signature verification error')
          }
        },
        modal: {
          ondismiss: function () {
            setSubmittingPayment(false)
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (resp) {
        toast.error(`Payment failed: ${resp.error?.description || 'Transaction declined'}`)
        setSubmittingPayment(false)
      })
      rzp.open()
    } catch (err) {
      toast.error('Razorpay is down for now. Please use UPI direct transfer or try again shortly.', {
        id: 'razorpay-down',
        duration: 4500,
        icon: '⚠️',
      })
    } finally {
      setSubmittingPayment(false)
    }
  }

  /**
   * Manual UPI UTR Submission
   */
  async function handlePaymentSubmit(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!utrNumber.trim()) {
      toast.error('Please enter your 12-digit UPI reference (UTR) number')
      return
    }
    setSubmittingPayment(true)
    try {
      const res = await apiClient.post('/api/plans/checkout', {
        plan: selectedPlanForUpgrade.id,
        billing: billingCycle,
        paymentMethod: 'upi',
        paymentRef: utrNumber.trim(),
      })

      if (res.success && res.activated) {
        toast.success(`🎉 Congratulations! Your ${selectedPlanForUpgrade.name} plan is now active! All institutional features have unlocked.`, {
          duration: 6000,
        })
        setSelectedPlanForUpgrade(null)
        setUtrNumber('')
        if (refreshAdminProfile) await refreshAdminProfile()
      } else {
        toast.success('Upgrade request submitted! An administrator will verify and activate your plan shortly.', {
          duration: 5000,
        })
        setSelectedPlanForUpgrade(null)
        setUtrNumber('')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to submit request')
    } finally {
      setSubmittingPayment(false)
    }
  }

  const faqs = [
    {
      q: 'What happens to my stocks if my subscription expires?',
      a: 'Zero data loss. If you had 35 stocks and your plan concludes, all 35 stocks stay securely in your watchlist and continue receiving announcements. You simply won\'t be able to add a 36th stock until you renew or trim under the Basic limit (5).'
    },
    {
      q: 'How does the automated family PAN check work?',
      a: 'When an IPO registrar (Link Intime, KFintech, BigShare) releases allotments, StockWatch\'s event-driven worker automatically verifies all your saved family PANs in seconds and sends tiered celebratory Web Push and Telegram notifications with allotted shares.'
    },
    {
      q: 'Which payment methods are supported on Tatvarth StockWatch?',
      a: 'We support all major payment modes including UPI (Google Pay, PhonePe, Paytm, BHIM), Net Banking across 50+ banks, Credit/Debit Cards, and direct bank transfers with instant verification.'
    },
    {
      q: 'Can I switch between Monthly and Annual billing anytime?',
      a: 'Yes! You can upgrade from Monthly to Annual at any point to unlock the ~25% annual discount (giving you 2 months completely free).'
    },
    {
      q: 'Is there a money-back guarantee?',
      a: 'Absolutely. If you are not satisfied with the speed and depth of our institutional announcements and AI summaries within 7 days, contact our WhatsApp concierge for a no-questions-asked refund.'
    }
  ]

  const activePlanPrice = selectedPlanForUpgrade 
    ? (isAnnual ? selectedPlanForUpgrade.rawAnnual : selectedPlanForUpgrade.rawMonthly) 
    : 0

  return (
    <PageTransition>
      <div className="space-y-12 pb-20 max-w-7xl mx-auto">
        
        {/* Ambient Top Glows */}
        <div className="relative">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-tr from-primary/10 via-indigo-500/10 to-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

          {/* Hero Header */}
          <div className="relative text-center max-w-3xl mx-auto pt-6 sm:pt-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide uppercase shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              <span>Tatvarth StockWatch Institutional Access</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold font-display text-textPrimary tracking-tight leading-[1.15]">
              Institutional Market Speed,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-indigo-400 to-amber-400">
                Priced for Growth.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-textMuted max-w-2xl mx-auto leading-relaxed">
              Gain unfair advantages with sub-second statutory filing intelligence, automated family PAN allotment radar, and unlimited Gemini AI research briefs.
            </p>

            {/* Current Plan Status Pill */}
            {currentPlan && (
              <div className="inline-flex flex-wrap items-center justify-center gap-2.5 px-4 py-2 rounded-2xl bg-surface border border-border shadow-sm text-xs text-textMuted mt-2">
                <span>Active Account Status:</span>
                <span className="font-bold text-textPrimary uppercase tracking-wider bg-primary/15 text-primary px-3 py-0.5 rounded-lg border border-primary/25">
                  {role === 'admin' ? '👑 Admin (Unlimited VIP)' : `${currentPlan} Tier`}
                </span>
                {planExpiresAt && (
                  <span className="text-[11px] text-textMuted font-mono">
                    • Renews on {new Date(planExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            )}

            {/* Interactive Billing Switcher Toggle */}
            <div className="pt-4 flex flex-col items-center gap-2">
              <div className="p-1 rounded-2xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border inline-flex items-center shadow-inner">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                    !isAnnual 
                      ? 'bg-primary text-white shadow-md shadow-primary/25' 
                      : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    isAnnual 
                      ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-md shadow-primary/25' 
                      : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  <span>Annual Billing</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-white uppercase tracking-wider animate-pulse">
                    Save ~25%
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {isAnnual ? '🎉 Annual membership unlocks 2 months completely free!' : '💡 Switch to annual to save up to ₹5,989/year'}
              </p>
            </div>
          </div>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto pt-2">
          {plans.map((p) => {
            const price = isAnnual ? p.priceAnnual : p.priceMonthly
            const isProCard = p.id === 'pro'
            const isPremiumCard = p.id === 'premium'

            return (
              <div
                key={p.id}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 bg-surface border ${p.accentBorder} ${
                  p.popular 
                    ? '-translate-y-2 shadow-2xl' 
                    : 'hover:-translate-y-1 shadow-lg'
                }`}
              >
                {/* Ambient Card Radial Gradient */}
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-b ${p.glowBg} pointer-events-none`} />

                {/* Popular / Recommended Pill */}
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-lg shadow-primary/30 flex items-center gap-1.5 whitespace-nowrap">
                    <Flame className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>Most Popular</span>
                  </div>
                )}

                <div className="relative z-10">
                  {/* Tier Badge & Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border ${p.badgeColor}`}>
                      {p.tierBadge}
                    </span>
                    {isPremiumCard && (
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-inner">
                        <Crown className="w-4 h-4 text-amber-400" />
                      </div>
                    )}
                    {isProCard && (
                      <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-inner">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    {p.id === 'basic' && (
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 border border-border flex items-center justify-center">
                        <Clock className="w-4 h-4 text-textMuted" />
                      </div>
                    )}
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-extrabold font-display text-textPrimary">
                    {p.name}
                  </h3>
                  <p className="text-xs text-textMuted mt-1 leading-relaxed min-h-[36px]">
                    {p.desc}
                  </p>

                  {/* Price Box */}
                  <div className="mt-6 mb-6 pb-6 border-b border-border/60">
                    <div className="flex items-baseline gap-2">
                      {isAnnual && p.originalAnnualMonthly && (
                        <span className="text-lg text-textMuted line-through font-mono">
                          {p.originalAnnualMonthly}
                        </span>
                      )}
                      <span className="text-4xl sm:text-5xl font-black font-display text-textPrimary tracking-tight">
                        {price}
                      </span>
                      <span className="text-xs text-textMuted font-medium">
                        {p.period}
                      </span>
                    </div>

                    {isAnnual && p.annualTotal && (
                      <div className="mt-2 space-y-0.5">
                        <p className="text-xs font-bold text-textPrimary">
                          Billed as {p.annualTotal}
                        </p>
                        <p className="text-[11px] font-semibold text-emerald-500">
                          {p.savingsLabel}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-3 mb-8 text-xs">
                    <p className="text-[11px] font-extrabold text-textMuted uppercase tracking-wider">
                      Included Capabilities
                    </p>
                    {p.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        {feat.cross ? (
                          <X className="w-4 h-4 text-textMuted/40 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              isProCard 
                                ? 'text-primary' 
                                : (isPremiumCard ? 'text-amber-400' : 'text-emerald-500')
                            }`} 
                          />
                        )}
                        <span className={`leading-relaxed ${
                          feat.cross 
                            ? 'text-textMuted/40 line-through' 
                            : (feat.bold ? 'text-textPrimary font-bold' : 'text-textSecondary')
                        }`}>
                          {feat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <div className="relative z-10 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSelectUpgrade(p)}
                    disabled={p.disabled}
                    className={`w-full py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                      p.disabled
                        ? 'bg-slate-100 dark:bg-surface border border-border text-textMuted cursor-default opacity-70'
                        : isProCard
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:brightness-110 text-white shadow-xl shadow-primary/25'
                          : isPremiumCard
                            ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:brightness-110 text-slate-950 font-extrabold shadow-xl shadow-amber-500/25'
                            : 'bg-slate-100 dark:bg-surface border border-border text-textPrimary hover:border-primary/40'
                    }`}
                  >
                    <span>{p.cta}</span>
                    {!p.disabled && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Institutional Trust & Security Strip */}
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-surface border border-border/80 shadow-sm text-center">
          <div className="flex flex-col items-center justify-center gap-1.5 p-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span className="text-xs font-bold text-textPrimary">256-Bit SSL Encryption</span>
            <span className="text-[10px] text-textMuted">Bank-grade transaction security</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 p-2">
            <Cpu className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-textPrimary">Sub-Second Radar</span>
            <span className="text-[10px] text-textMuted">Direct BSE & NSE stream feeds</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 p-2">
            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-bold text-textPrimary">Zero Data Loss</span>
            <span className="text-[10px] text-textMuted">Watchlist preserved forever</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 p-2">
            <MessageCircle className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold text-textPrimary">WhatsApp Concierge</span>
            <span className="text-[10px] text-textMuted">Priority live human assistance</span>
          </div>
        </div>

        {/* Feature Comparison Matrix */}
        <div className="max-w-5xl mx-auto pt-6 space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-textPrimary">
              Comprehensive Feature Comparison
            </h2>
            <p className="text-xs text-textMuted">
              Inspect granular capabilities across all 3 StockWatch membership tiers
            </p>
          </div>

          <div className="rounded-3xl overflow-hidden border border-border bg-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-slate-50 dark:bg-surface text-textMuted">
                    <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-textPrimary">Features & Modules</th>
                    <th className="py-4 px-4 font-bold text-xs uppercase tracking-wider text-center text-textMuted">Basic (₹0)</th>
                    <th className="py-4 px-4 font-bold text-xs uppercase tracking-wider text-center text-primary">Pro (₹999)</th>
                    <th className="py-4 px-4 font-bold text-xs uppercase tracking-wider text-center text-amber-500 dark:text-amber-400">Premium (₹1,999)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {/* Category 1: Portfolio & Tracking */}
                  <tr className="bg-slate-100/50 dark:bg-white/5 font-bold text-[11px] uppercase tracking-wider text-textPrimary">
                    <td colSpan={4} className="py-2.5 px-6">📈 Portfolio & Market Tracking</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Watchlist Capacity</td>
                    <td className="py-3 px-4 text-center text-textMuted">5 Scrips</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">50 Scrips</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited (∞)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Live Statutory Announcements (BSE/NSE)</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Real-time</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Real-time</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Real-time</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Volume Spurt & Block Deals Terminal</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Included</td>
                  </tr>

                  {/* Category 2: AI & Research */}
                  <tr className="bg-slate-100/50 dark:bg-white/5 font-bold text-[11px] uppercase tracking-wider text-textPrimary">
                    <td colSpan={4} className="py-2.5 px-6">🤖 Institutional AI Equity Research</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Gemini AI PDF Vision Analysis</td>
                    <td className="py-3 px-4 text-center text-textMuted">3 / day</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">Unlimited (∞)</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited (VIP Queue)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Executive Briefs & Balance Sheet OCR</td>
                    <td className="py-3 px-4 text-center text-textMuted">Standard</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">High-Speed Vision</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Dedicated Cascade</td>
                  </tr>

                  {/* Category 3: IPO Allotments */}
                  <tr className="bg-slate-100/50 dark:bg-white/5 font-bold text-[11px] uppercase tracking-wider text-textPrimary">
                    <td colSpan={4} className="py-2.5 px-6">🎟️ Family IPO Allotment Verification</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Saved Family PAN Portfolio</td>
                    <td className="py-3 px-4 text-center text-textMuted">1 PAN</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">Up to 10 PANs</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited (∞)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Automated Event-Driven Allotment Radar</td>
                    <td className="py-3 px-4 text-center text-textMuted">1 PAN Only</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">All 10 PANs</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">All PANs + Custom Report</td>
                  </tr>

                  {/* Category 4: Data Tools */}
                  <tr className="bg-slate-100/50 dark:bg-white/5 font-bold text-[11px] uppercase tracking-wider text-textPrimary">
                    <td colSpan={4} className="py-2.5 px-6">📊 Export Tools & Curated Sharing</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Excel (.xlsx) & CSV Spreadsheet Downloads</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Curated Watchlist Baskets (Public Links)</td>
                    <td className="py-3 px-4 text-center text-textMuted">View/Import only</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">Up to 10 Baskets</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited (∞)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Custom Keyword Radar (USFDA, Orders, Litigation)</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-emerald-500 font-bold">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-6 font-medium text-textPrimary">Dedicated WhatsApp Concierge</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-textMuted">Priority Email</td>
                    <td className="py-3 px-4 text-center text-amber-500 dark:text-amber-400 font-bold">✓ 1-on-1 VIP Direct</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Interactive FAQ Accordion */}
        <div className="max-w-3xl mx-auto space-y-4 pt-4">
          <div className="text-center space-y-1 mb-6">
            <h2 className="text-2xl font-bold font-display text-textPrimary">
              Frequently Asked Questions
            </h2>
            <p className="text-xs text-textMuted">
              Everything you need to know about StockWatch memberships and billing
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = expandedFaq === idx
              return (
                <div 
                  key={idx}
                  className="rounded-2xl border border-border bg-surface overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-textPrimary hover:bg-slate-50 dark:hover:bg-white/5 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-textMuted transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-5 pb-5 text-xs text-textMuted leading-relaxed border-t border-border/40 pt-3">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upgrade / Checkout Modal */}
        <AnimatePresence>
          {selectedPlanForUpgrade && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
              onClick={() => setSelectedPlanForUpgrade(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 20 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="w-full max-w-lg p-6 sm:p-8 rounded-3xl relative bg-surface border border-border shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setSelectedPlanForUpgrade(null)}
                  className="absolute top-5 right-5 p-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-white/10 transition z-10"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Modal Header */}
                <div className="flex items-center gap-3.5 mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shadow-inner ${
                    selectedPlanForUpgrade.id === 'premium' 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                      : 'bg-primary/20 text-primary border border-primary/30'
                  }`}>
                    {selectedPlanForUpgrade.id === 'premium' ? <Crown className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold font-display text-textPrimary">
                      Upgrade to {selectedPlanForUpgrade.name}
                    </h3>
                    <p className="text-xs text-textMuted">
                      {isAnnual ? `${selectedPlanForUpgrade.annualTotal} (Annual Access)` : `${selectedPlanForUpgrade.priceMonthly} / month (Monthly Access)`}
                    </p>
                  </div>
                </div>

                {/* Selected Plan Summary Banner */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-border mb-6 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-textPrimary">
                      Amount Payable
                    </span>
                    <p className="text-2xl font-black font-display text-textPrimary">
                      ₹{activePlanPrice.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border ${selectedPlanForUpgrade.badgeColor}`}>
                    {isAnnual ? 'Annual Save ~25%' : 'Monthly Plan'}
                  </span>
                </div>

                {/* Payment Option Switcher Tabs */}
                <div className="flex rounded-xl bg-slate-100 dark:bg-white/5 p-1 mb-6 border border-border">
                  <button
                    type="button"
                    onClick={() => setPaymentTab('razorpay')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
                      paymentTab === 'razorpay'
                        ? 'bg-primary text-white shadow-md'
                        : 'text-textMuted hover:text-textPrimary'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Razorpay Online</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentTab('upi')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
                      paymentTab === 'upi'
                        ? 'bg-primary text-white shadow-md'
                        : 'text-textMuted hover:text-textPrimary'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Direct UPI Transfer</span>
                  </button>
                </div>

                {/* Tab 1: Razorpay Online Checkout */}
                {paymentTab === 'razorpay' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-primary/10 border border-primary/25 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-primary" />
                          <span>Instant Online Gateway</span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                          Auto-Unlock
                        </span>
                      </div>
                      <p className="text-[11px] text-textMuted leading-relaxed">
                        Pay securely with UPI apps, Credit/Debit Cards, or Net Banking. Your subscription unlocks immediately upon payment confirmation.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRazorpayCheckout}
                      disabled={submittingPayment}
                      className={`w-full py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 text-white transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 ${
                        selectedPlanForUpgrade.id === 'premium'
                          ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 shadow-amber-500/25 text-slate-950 font-black'
                          : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 shadow-primary/25'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {submittingPayment ? 'Connecting Gateway…' : `Pay ₹${activePlanPrice.toLocaleString('en-IN')} with Razorpay`}
                      </span>
                    </button>

                    <div className="flex items-center justify-center gap-2 text-[11px] text-textMuted pt-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Protected by Razorpay 256-Bit SSL Checkout</span>
                    </div>
                  </div>
                )}

                {/* Tab 2: Manual UPI Transfer & UTR Submission */}
                {paymentTab === 'upi' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-border space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-textPrimary">
                        <span>Scan UPI QR Code</span>
                        <button
                          type="button"
                          onClick={handleCopyUpi}
                          className="flex items-center gap-1 text-[11px] font-mono text-primary hover:underline"
                        >
                          {copiedUpi ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>{upiId}</span>
                        </button>
                      </div>

                      {/* Real Dynamic QR Code with Amount */}
                      <div className="flex items-center justify-center p-3 bg-white rounded-xl max-w-[170px] mx-auto shadow-inner border border-slate-200">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=upi://pay?pa=${upiId}&pn=Tatvarth%20StockWatch&am=${activePlanPrice}&cu=INR`} 
                          alt="UPI QR Code" 
                          className="w-36 h-36 object-contain"
                        />
                      </div>

                      <p className="text-[11px] text-textMuted text-center font-medium">
                        Scan with Google Pay, PhonePe, Paytm, CRED or BHIM
                      </p>
                    </div>

                    <form onSubmit={handlePaymentSubmit} className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-textPrimary mb-1">
                          Transaction Reference (UTR Number)
                        </label>
                        <input
                          type="text"
                          value={utrNumber}
                          onChange={e => setUtrNumber(e.target.value)}
                          placeholder="e.g. 482910482912 (12 digits)"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border text-xs sm:text-sm text-textPrimary placeholder:text-textMuted/40 focus:outline-none focus:border-primary transition"
                        />
                      </div>

                      <div className="flex gap-2.5 pt-1">
                        <a
                          href={`https://wa.me/919820000000?text=Hi%20Tatvarth%20Team%2C%20I%20have%20transferred%20%E2%82%B9${activePlanPrice}%20for%20the%20${selectedPlanForUpgrade.name}%20plan%20(${billingCycle}).%20My%20email%20is%20${encodeURIComponent(currentUser?.email || '')}.`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold border border-border text-textMuted hover:text-textPrimary flex items-center justify-center gap-1.5 transition hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                          <span>WhatsApp Admin</span>
                        </a>

                        <button
                          type="submit"
                          disabled={submittingPayment || !utrNumber.trim()}
                          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primaryHover text-white transition flex items-center justify-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-50"
                        >
                          {submittingPayment ? 'Submitting…' : 'Submit UTR Verification'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </PageTransition>
  )
}
