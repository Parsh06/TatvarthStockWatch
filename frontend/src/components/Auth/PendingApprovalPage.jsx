import React, { useState } from 'react'
import { 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  LogOut, 
  RefreshCw, 
  BellRing, 
  FileText, 
  TrendingUp, 
  CheckCircle2, 
  Zap,
  Mail,
  UserCheck
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function PendingApprovalPage() {
  const { currentUser, logout, refreshAdminProfile } = useAuth()
  const [checking, setChecking] = useState(false)

  async function handleCheckStatus() {
    setChecking(true)
    try {
      await refreshAdminProfile()
      toast.success('Status checked. Still pending approval — our real-time listener will unlock automatically once approved!')
    } catch {
      toast.error('Unable to refresh status')
    } finally {
      setTimeout(() => setChecking(false), 500)
    }
  }

  async function handleSignOut() {
    try {
      await logout()
      toast.success('Signed out successfully')
    } catch (err) {
      toast.error('Failed to sign out: ' + err.message)
    }
  }

  const displayName = currentUser?.displayName || 'Valued Trader'
  const email = currentUser?.email || 'Registered User'
  const photoURL = currentUser?.photoURL

  return (
    <div className="min-h-[100dvh] relative overflow-hidden bg-background auth-grid-bg flex flex-col items-center justify-center p-4 sm:p-6 text-textPrimary">
      {/* Ambient background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[140px] mix-blend-screen opacity-60 dark:opacity-40" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] bg-amber-500/15 rounded-full blur-[140px] mix-blend-screen opacity-60 dark:opacity-40" />
      </div>

      <div className="relative z-10 w-full max-w-xl">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center bg-white dark:bg-[#0F172A] shadow-premium">
            <div className="absolute inset-0 rounded-2xl bg-primary/40 blur-lg -z-10" />
            <img src="/logo2.png" alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold font-display text-textPrimary tracking-tight leading-none">Tatvarth</h1>
            <p className="text-xs font-semibold text-primary tracking-wide leading-none mt-1">StockWatch</p>
          </div>
        </div>

        {/* Main Status Glass Card */}
        <div className="glass-panel border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Top Real-time pulse indicator */}
          <div className="flex items-center justify-between pb-6 border-b border-border/60">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-500 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>Account Under Review</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Synced</span>
            </div>
          </div>

          {/* Central Radar Pulse & Clock Icon */}
          <div className="my-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute -inset-4 rounded-full bg-amber-500/20 blur-xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-primary/20 border border-amber-500/30 flex items-center justify-center shadow-inner">
                <Clock className="w-10 h-10 text-amber-400 animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold font-display tracking-tight text-textPrimary">
              Approval Requested
            </h2>
            <p className="text-sm text-textMuted max-w-md mt-2 leading-relaxed">
              Your account has been registered and is currently awaiting administrator authorization. Once approved, your dashboard will automatically unlock in real-time.
            </p>
          </div>

          {/* User Profile Badge */}
          <div className="p-4 rounded-2xl bg-surface/70 border border-border/70 mb-6 flex items-center gap-3.5">
            {photoURL ? (
              <img src={photoURL} alt={displayName} className="w-11 h-11 rounded-full border border-border object-cover shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-base shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-textPrimary truncate">{displayName}</p>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Pending
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-textMuted mt-0.5 truncate">
                <Mail className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate">{email}</span>
              </div>
            </div>
          </div>

          {/* Real-time Flow Explainer */}
          <div className="space-y-3 mb-6 bg-surface/40 p-4 rounded-2xl border border-border/50 text-xs">
            <p className="font-semibold text-textPrimary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              What happens next?
            </p>
            <div className="space-y-2 text-textMuted">
              <div className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</div>
                <p><strong className="text-textPrimary font-medium">Administrator Notified:</strong> An instant push alert & Telegram dispatch have been routed to the admin team.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</div>
                <p><strong className="text-textPrimary font-medium">Instant Authorization:</strong> The administrator reviews your access and grants your exchange feed permissions.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</div>
                <p><strong className="text-textPrimary font-medium">Real-Time Unlock:</strong> This page automatically unlocks into your dashboard without needing to refresh or sign in again.</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="py-3 px-4 rounded-xl border border-border bg-surface hover:bg-surfaceHover text-textPrimary font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin text-primary' : ''}`} />
              <span>{checking ? 'Checking...' : 'Check Status'}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="py-3 px-4 rounded-xl border border-border bg-background hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-textMuted font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-textMuted/70 mt-6">
          Tatvarth StockWatch • Real-time Corporate Intelligence & BSE/NSE Filings
        </p>
      </div>
    </div>
  )
}
