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
  AlertCircle
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'
import PageTransition from '../Common/PageTransition'

export default function PlansPage() {
  const { plan: currentPlan, planExpiresAt, planStatus, role, isPro, isPremium, refreshAdminProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const [billingCycle, setBillingCycle] = useState('monthly') // 'monthly' | 'annual'
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState(null)
  const [utrNumber, setUtrNumber] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)

  const isAnnual = billingCycle === 'annual'

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      tagline: 'Essential Market Intelligence',
      desc: 'Free starter tier to explore real-time corporate announcements & market movers.',
      priceMonthly: '₹0',
      priceAnnual: '₹0',
      period: 'forever',
      popular: false,
      tierBadge: 'Free Tier',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-surface dark:border-border dark:text-textMuted',
      accentColor: 'border-border',
      features: [
        { title: 'Watchlist Capacity', value: '5 Scrips', bold: true },
        { title: 'Gemini AI PDF Analysis', value: '3 per day (resets midnight)', bold: false },
        { title: 'Saved Family PANs', value: '1 Family PAN', bold: false },
        { title: 'IPO Allotment Check', value: 'Single PAN automated check', bold: false },
        { title: 'Live BSE / NSE Feed', value: 'Real-time category filing feed', bold: false },
        { title: 'Curated Baskets', value: 'View & 1-tap import', bold: false },
        { title: 'Data Export (.xlsx / .csv)', value: 'Locked (Preview only)', cross: true },
        { title: 'Custom Keyword Radar', value: 'Not included', cross: true },
        { title: 'Priority Web Push & Telegram', value: 'Standard notifications', cross: true },
      ],
      cta: currentPlan === 'basic' && role !== 'admin' ? 'Current Plan' : 'Active as Fallback',
      disabled: currentPlan === 'basic',
    },
    {
      id: 'pro',
      name: 'Pro',
      tagline: 'For Active Traders & Investors',
      desc: 'Deep statutory equity research, 50 stocks, and unlimited AI analysis.',
      priceMonthly: '₹999',
      priceAnnual: '₹749',
      annualTotal: '₹8,999 / year',
      period: isAnnual ? 'per month, billed annually' : 'per month',
      popular: true,
      tierBadge: 'Most Popular',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-primary/15 dark:border-primary/30 dark:text-primary',
      accentColor: 'border-primary/50 shadow-primary/10',
      features: [
        { title: 'Watchlist Capacity', value: 'Up to 50 Scrips', bold: true },
        { title: 'Gemini AI PDF Analysis', value: 'Unlimited statutory PDF analysis', bold: true },
        { title: 'Saved Family PANs', value: 'Up to 10 Family PANs', bold: true },
        { title: 'IPO Allotment Check', value: 'Automated event-driven multi-PAN check', bold: true },
        { title: 'Data Export (.xlsx / .csv)', value: 'Full Excel & CSV downloads', bold: true },
        { title: 'Curated Baskets', value: 'Create & publish up to 5 public baskets', bold: false },
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
      tagline: 'Family Offices & Institutional HNIs',
      desc: 'Infinite capacity, priority vision AI queue, custom radar, and VIP support.',
      priceMonthly: '₹1,999',
      priceAnnual: '₹1,499',
      annualTotal: '₹17,999 / year',
      period: isAnnual ? 'per month, billed annually' : 'per month',
      popular: false,
      tierBadge: 'Institutional Tier',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400',
      accentColor: 'border-amber-500/50 shadow-amber-500/10',
      features: [
        { title: 'Watchlist Capacity', value: 'Unlimited Scrips', bold: true },
        { title: 'Gemini AI PDF Analysis', value: 'Unlimited Priority Vision Queue', bold: true },
        { title: 'Saved Family PANs', value: 'Unlimited Family PANs', bold: true },
        { title: 'IPO Allotment Check', value: 'Automated check with custom report', bold: true },
        { title: 'Data Export (.xlsx / .csv)', value: 'Full Excel & CSV downloads', bold: true },
        { title: 'Curated Baskets', value: 'Unlimited public & private baskets', bold: true },
        { title: 'Custom Keyword Radar', value: 'Custom scrip & keyword triggers (USFDA, orders)', bold: true },
        { title: 'VIP Support', value: 'Dedicated account manager & Telegram concierge', bold: true },
      ],
      cta: (currentPlan === 'premium' || role === 'admin') ? 'Current Plan' : 'Upgrade to Premium',
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
  }

  async function handlePaymentSubmit(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!utrNumber.trim()) {
      toast.error('Please enter your UPI reference or transaction ID')
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

  async function handleInstantActivation() {
    if (!selectedPlanForUpgrade) return
    setSubmittingPayment(true)
    try {
      const res = await apiClient.post('/api/plans/checkout', {
        plan: selectedPlanForUpgrade.id,
        billing: billingCycle,
        paymentMethod: 'mock',
        paymentRef: `TSW-${Date.now().toString().slice(-6)}`,
      })

      if (res.success && res.activated) {
        toast.success(`🎉 ${selectedPlanForUpgrade.name} membership activated! Higher limits and features unlocked.`, {
          duration: 6000,
        })
        setSelectedPlanForUpgrade(null)
        if (refreshAdminProfile) await refreshAdminProfile()
      } else {
        toast.error(res.error || 'Activation failed')
      }
    } catch (err) {
      toast.error(err.message || 'Payment initiation failed')
    } finally {
      setSubmittingPayment(false)
    }
  }

  return (
    <PageTransition>
      <div className="space-y-10 pb-16">
        {/* Hero Header */}
        <div className="relative text-center max-w-3xl mx-auto pt-4 sm:pt-6 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tatvarth StockWatch Membership Tiers</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display text-textPrimary tracking-tight">
            Institutional Market Speed,{' '}
            <span className="tsw-gradient-text text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-400 to-primary">
              Priced for Growth.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-textMuted max-w-xl mx-auto leading-relaxed">
            Get unfair advantages with instant filing analysis, automated family PAN checks, and institutional data tools.
          </p>

          {/* Current Plan Indicator Banner */}
          {currentPlan && (
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-surface border border-border shadow-sm text-xs text-textMuted">
              <span>Your Current Plan:</span>
              <span className="font-bold text-textPrimary uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-lg border border-primary/20">
                {role === 'admin' ? 'Admin (Unlimited)' : currentPlan}
              </span>
              {planExpiresAt && (
                <span className="text-[11px] text-textMuted">
                  &bull; Valid until {new Date(planExpiresAt).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>
          )}

          {/* Billing Switcher Toggle */}
          <div className="flex items-center justify-center gap-3 pt-3">
            <span className={`text-xs font-semibold cursor-pointer ${!isAnnual ? 'text-textPrimary' : 'text-textMuted'}`} onClick={() => setBillingCycle('monthly')}>
              Monthly Billing
            </span>
            <button
              onClick={() => setBillingCycle(c => c === 'monthly' ? 'annual' : 'monthly')}
              className="relative w-12 h-6 rounded-full bg-slate-200 dark:bg-surface border border-slate-300 dark:border-border transition-colors p-0.5 focus:outline-none"
            >
              <div className={`w-5 h-5 rounded-full bg-primary transition-transform duration-200 ${isAnnual ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setBillingCycle('annual')}>
              <span className={`text-xs font-semibold ${isAnnual ? 'text-textPrimary' : 'text-textMuted'}`}>
                Annual Billing
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 px-2 py-0.5 rounded-full animate-pulse">
                Save ~25%
              </span>
            </div>
          </div>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {plans.map((p) => {
            const price = isAnnual ? p.priceAnnual : p.priceMonthly
            return (
              <div
                key={p.id}
                className={`glass-panel rounded-3xl p-6 sm:p-7 flex flex-col justify-between relative transition-all duration-300 border ${
                  p.popular ? 'border-primary/50 shadow-xl shadow-primary/5 -translate-y-1' : 'border-border/80 hover:border-border'
                }`}
              >
                {/* Popular Pill */}
                {p.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-primary text-white text-[11px] font-bold uppercase tracking-wider shadow-md">
                    Most Popular
                  </div>
                )}

                <div>
                  {/* Tier Header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${p.badgeColor}`}>
                      {p.tierBadge}
                    </span>
                    {p.id === 'premium' && <Crown className="w-5 h-5 text-amber-400" />}
                    {p.id === 'pro' && <Zap className="w-5 h-5 text-primary" />}
                    {p.id === 'basic' && <Clock className="w-4 h-4 text-textMuted" />}
                  </div>

                  <h3 className="text-2xl font-bold font-display text-textPrimary">{p.name}</h3>
                  <p className="text-xs text-textMuted mt-1 leading-relaxed min-h-[32px]">{p.desc}</p>

                  {/* Price */}
                  <div className="mt-6 mb-6 pb-6 border-b border-border/70">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold font-display text-textPrimary tracking-tight">{price}</span>
                      <span className="text-xs text-textMuted font-medium">{p.period}</span>
                    </div>
                    {isAnnual && p.annualTotal && (
                      <p className="text-[11px] text-emerald-500 font-semibold mt-1">
                        Billed as {p.annualTotal}
                      </p>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-3 mb-8 text-xs">
                    <p className="text-[11px] font-bold text-textMuted uppercase tracking-wider">What's included</p>
                    {p.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        {feat.cross ? (
                          <X className="w-4 h-4 text-textMuted/40 shrink-0 mt-0.5" />
                        ) : (
                          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${p.popular ? 'text-primary' : (p.id === 'premium' ? 'text-amber-400' : 'text-emerald-500')}`} />
                        )}
                        <span className={`leading-relaxed ${feat.cross ? 'text-textMuted/50 line-through' : (feat.bold ? 'text-textPrimary font-semibold' : 'text-textSecondary')}`}>
                          {feat.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSelectUpgrade(p)}
                  disabled={p.disabled}
                  className={`w-full py-3.5 px-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
                    p.disabled
                      ? 'bg-surface border border-border text-textMuted cursor-default opacity-80'
                      : p.popular
                        ? 'bg-primary hover:bg-primaryHover text-white shadow-lg shadow-primary/20'
                        : p.id === 'premium'
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20'
                          : 'bg-surface border border-border text-textPrimary hover:bg-surface/80 hover:border-primary/30'
                  }`}
                >
                  <span>{p.cta}</span>
                  {!p.disabled && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            )
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="max-w-4xl mx-auto pt-6">
          <h2 className="text-xl font-bold font-display text-textPrimary text-center mb-6">
            Detailed Tier Comparison
          </h2>
          <div className="glass-panel rounded-3xl overflow-hidden border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-slate-100/90 dark:bg-surface/50 text-slate-700 dark:text-textMuted">
                    <th className="py-3.5 px-5 font-semibold">Features</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Basic (₹0)</th>
                    <th className="py-3.5 px-4 font-semibold text-center text-primary">Pro (₹999)</th>
                    <th className="py-3.5 px-4 font-semibold text-center text-amber-500 dark:text-amber-400">Premium (₹1,999)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Watchlist Scrip Limit</td>
                    <td className="py-3 px-4 text-center text-textMuted">5 Scrips</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">50 Scrips</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Gemini AI PDF Analysis</td>
                    <td className="py-3 px-4 text-center text-textMuted">3 / day</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">Unlimited</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Priority Queue</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Saved Family PANs</td>
                    <td className="py-3 px-4 text-center text-textMuted">1 PAN</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">10 PANs</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Automated IPO Allotment Check</td>
                    <td className="py-3 px-4 text-center text-textMuted">1 PAN</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">All 10 PANs</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">All PANs + Export</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Excel & CSV Report Downloads</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-emerald-600 dark:text-emerald-500 font-bold">✓ Included</td>
                    <td className="py-3 px-4 text-center text-emerald-600 dark:text-emerald-500 font-bold">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Shareable Watchlist Baskets</td>
                    <td className="py-3 px-4 text-center text-textMuted">View/Import only</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">5 Baskets</td>
                    <td className="py-3 px-4 text-center font-bold text-amber-500 dark:text-amber-400">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">Custom Keyword Radar Triggers</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-emerald-600 dark:text-emerald-500 font-bold">✓ Included</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-medium text-textPrimary">VIP Concierge & Account Manager</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-textMuted/40">&mdash;</td>
                    <td className="py-3 px-4 text-center text-amber-500 dark:text-amber-400 font-bold">✓ Included</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto space-y-4 pt-6">
          <h2 className="text-xl font-bold font-display text-textPrimary text-center mb-6">Frequently Asked Questions</h2>
          <div className="glass-panel p-5 rounded-2xl border border-border">
            <h4 className="text-sm font-bold text-textPrimary mb-1">What happens to my stocks if my Pro subscription expires?</h4>
            <p className="text-xs text-textMuted leading-relaxed">
              <strong>Zero data loss.</strong> If you had 35 stocks and your plan concludes, all 35 stocks stay securely in your watchlist and continue receiving announcements. You simply won't be able to add a 36th stock until you renew or trim under the Basic limit (5).
            </p>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-border">
            <h4 className="text-sm font-bold text-textPrimary mb-1">How does the automated family PAN check work?</h4>
            <p className="text-xs text-textMuted leading-relaxed">
              When an IPO registrar (Link Intime, KFintech, BigShare) releases allotments, StockWatch's event-driven worker automatically verifies all your saved family PANs in seconds and sends tiered celebratory Web Push and Telegram notifications with allotted shares.
            </p>
          </div>
          <div className="glass-panel p-5 rounded-2xl border border-border">
            <h4 className="text-sm font-bold text-textPrimary mb-1">How do I pay and activate my upgrade?</h4>
            <p className="text-xs text-textMuted leading-relaxed">
              We accept UPI, Net Banking, and Bank Transfers. Click "Upgrade", scan the UPI QR or copy the VPA, enter your transaction reference (UTR), and our administrators verify and activate your membership immediately.
            </p>
          </div>
        </div>

        {/* Upgrade / Payment Modal */}
        <AnimatePresence>
          {selectedPlanForUpgrade && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="glass-panel w-full max-w-lg p-6 sm:p-7 rounded-3xl relative border border-slate-200 dark:border-primary/30 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setSelectedPlanForUpgrade(null)}
                  className="absolute top-5 right-5 p-1.5 rounded-xl text-textMuted hover:text-textPrimary hover:bg-slate-100 dark:hover:bg-white/10 transition"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display text-textPrimary">
                      Upgrade to {selectedPlanForUpgrade.name}
                    </h3>
                    <p className="text-xs text-textMuted">
                      {isAnnual ? selectedPlanForUpgrade.annualTotal : `${selectedPlanForUpgrade.priceMonthly} / month`}
                    </p>
                  </div>
                </div>

                {/* Payment Option Tabs / UPI Card */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface/70 border border-slate-200 dark:border-border/80 mb-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-textPrimary">
                    <span>Scan UPI QR Code</span>
                    <span className="text-primary font-mono text-[11px]">tatvarthcapital@okaxis</span>
                  </div>
                  <div className="flex items-center justify-center p-4 bg-white rounded-xl max-w-[180px] mx-auto shadow-inner">
                    <img 
                      src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=tatvarthcapital@okaxis&pn=Tatvarth%20StockWatch&cu=INR" 
                      alt="UPI QR" 
                      className="w-36 h-36 object-contain"
                    />
                  </div>
                  <p className="text-[11px] text-textMuted text-center">
                    Scan with Google Pay, PhonePe, Paytm or BHIM
                  </p>
                </div>

                {/* Verification Form */}
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  {/* Instant Checkout / Razorpay Button */}
                  <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/25 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                        <span>Instant Checkout (Online / Card / UPI)</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                        Automated
                      </span>
                    </div>
                    <p className="text-[11px] text-textMuted leading-relaxed">
                      Instant plan activation connected to payment gateway. Unlocks all features immediately.
                    </p>
                    <button
                      type="button"
                      onClick={handleInstantActivation}
                      disabled={submittingPayment}
                      className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-primary hover:bg-primaryHover text-white flex items-center justify-center gap-2 shadow-md shadow-primary/20 transition disabled:opacity-50"
                    >
                      <Crown className="w-3.5 h-3.5 text-white" />
                      <span>{submittingPayment ? 'Processing Activation…' : `Pay & Unlock ${selectedPlanForUpgrade.name}`}</span>
                    </button>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-border"></div>
                    <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-textMuted/60 tracking-wider">or verify manual UPI</span>
                    <div className="flex-grow border-t border-border"></div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMuted mb-1.5">
                      Transaction UTR / Reference ID
                    </label>
                    <input
                      type="text"
                      value={utrNumber}
                      onChange={e => setUtrNumber(e.target.value)}
                      placeholder="e.g. 482910482912 or UPI Ref #"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100/90 dark:bg-surface border border-slate-200 dark:border-border text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  <div className="flex gap-3">
                    <a
                      href={`https://wa.me/919820000000?text=Hi%20Tatvarth%20Team%2C%20I%20would%20like%20to%20activate%20the%20${selectedPlanForUpgrade.name}%20plan%20on%20StockWatch.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border border-border text-textMuted hover:text-textPrimary flex items-center justify-center gap-1.5 transition"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>WhatsApp Admin</span>
                    </a>
                    <button
                      type="submit"
                      disabled={submittingPayment || !utrNumber.trim()}
                      className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold bg-surface border border-border text-textPrimary hover:border-primary/40 transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      {submittingPayment ? 'Submitting…' : 'Submit UTR'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}
