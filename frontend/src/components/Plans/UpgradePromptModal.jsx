import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { X, Sparkles, Zap, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react'

const FEATURE_CONFIGS = {
  watchlist: {
    title: 'Watchlist Limit Reached',
    desc: 'You have reached the 5-script limit on the Basic plan. Upgrade to Pro for up to 50 stocks, or Premium for unlimited stocks.',
    highlight: '50 Scrip Slots',
  },
  ai_analysis: {
    title: 'Daily AI Quota Reached',
    desc: 'You have used all 3 free Gemini AI analyses for today. Upgrade to Pro for unlimited real-time statutory PDF analysis.',
    highlight: 'Unlimited AI Analyses',
  },
  family_pans: {
    title: 'Family PAN Limit Reached',
    desc: 'The Basic plan allows 1 saved family PAN. Upgrade to Pro to track up to 10 family members with automated allotment checks.',
    highlight: '10 Saved Family PANs',
  },
  export: {
    title: 'Excel & CSV Export is a Pro Feature',
    desc: 'Instant data downloads and audit-ready spreadsheets are unlocked for Pro and Premium members.',
    highlight: 'Full .xlsx & .csv Data Exports',
  },
  baskets: {
    title: 'Public Basket Creation is Pro',
    desc: 'Curate, publish, and share viral watchlist baskets across WhatsApp and Telegram on Pro and Premium tiers.',
    highlight: 'Shareable Curated Baskets',
  },
  general: {
    title: 'Unlock Full Market Intelligence',
    desc: 'Take your equity research to institutional speed with Tatvarth StockWatch Pro & Premium.',
    highlight: '50+ Stocks, Unlimited AI & Multi-PAN Allotments',
  },
}

export default function UpgradePromptModal({ isOpen, onClose, feature = 'general', currentPlan = 'basic' }) {
  const navigate = useNavigate()
  if (!isOpen) return null

  const config = FEATURE_CONFIGS[feature] || FEATURE_CONFIGS.general

  function handleViewPlans() {
    onClose()
    navigate('/plans')
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="glass-panel w-full max-w-md p-6 sm:p-7 rounded-3xl relative border border-primary/30 shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Ambient inner glow */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-primary/25 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-xl text-textMuted hover:text-textPrimary hover:bg-white/10 transition z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Hero Icon */}
          <div className="relative mb-5 flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-indigo-500/20 border border-primary/30 flex items-center justify-center shadow-inner">
              <Zap className="w-7 h-7 text-primary animate-pulse" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pro Membership Tier</span>
            </div>
            <h3 className="text-xl font-bold font-display text-textPrimary tracking-tight">
              {config.title}
            </h3>
            <p className="text-xs text-textMuted mt-1.5 leading-relaxed max-w-xs mx-auto">
              {config.desc}
            </p>
          </div>

          {/* Value Props Pill Box */}
          <div className="p-3.5 rounded-2xl bg-surface/70 border border-border/80 mb-6 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-textPrimary font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{config.highlight}</span>
            </div>
            <div className="flex items-center gap-2 text-textMuted">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Priority multi-device Web Push & Telegram alerts</span>
            </div>
            <div className="flex items-center gap-2 text-textMuted">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Event-driven automated family PAN allotment check</span>
            </div>
          </div>

          {/* Pricing indicator */}
          <div className="flex items-baseline justify-between mb-6 px-1">
            <div>
              <p className="text-[11px] text-textMuted font-medium">Pro Plan starting at</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold font-display text-textPrimary">₹999</span>
                <span className="text-xs text-textMuted">/ month</span>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              Cancel Anytime
            </span>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <button
              onClick={handleViewPlans}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold bg-primary hover:bg-primaryHover text-white shadow-lg shadow-primary/20 transition active:scale-[0.99]"
            >
              <span>Explore Plans & Upgrade</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-xs font-semibold text-textMuted hover:text-textPrimary transition"
            >
              Maybe Later
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
