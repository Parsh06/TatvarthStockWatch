import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, Zap, Activity, Sparkles, BarChart3, Bell,
  TrendingUp, Briefcase, Search, PieChart
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Spinner } from '../Common/Loader'
import { TickerTape, MarketPulseRibbon, CandlestickHero } from '../Common/MarketPulse'

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function FeaturePill({ icon: Icon, text, delayMs }) {
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 glass-panel rounded-full text-xs sm:text-sm font-medium animate-fade-in-up transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-premium"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-textPrimary whitespace-nowrap">{text}</span>
    </div>
  )
}

/* ─── Feature grid items (mobile-only, below the card) ─────────────────────── */
function FeatureItem({ icon: Icon, title, desc, delayMs }) {
  return (
    <div
      className="flex gap-3 animate-fade-in-up"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-textPrimary leading-tight">{title}</p>
        <p className="text-xs text-textMuted mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { loginWithGoogle } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      toast.success('Welcome back!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] relative overflow-hidden bg-background auth-grid-bg flex flex-col md:flex-row">

      {/* Ambient background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="tsw-blob-a absolute -top-1/4 -right-1/4 w-full h-full max-w-[800px] max-h-[800px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen opacity-50 dark:opacity-30" />
        <div className="tsw-blob-b absolute -bottom-1/4 -left-1/4 w-full h-full max-w-[600px] max-h-[600px] bg-indigo-500/20 rounded-full blur-[100px] mix-blend-screen opacity-50 dark:opacity-30" />
      </div>

      {/* ── Left: Brand story (DESKTOP ONLY) ─────────────────────────────────── */}
      <div className="relative z-10 hidden md:flex flex-1 flex-col justify-center p-16 lg:p-24 border-r border-border/30 bg-background/50 backdrop-blur-sm overflow-hidden">

        {/* Candlestick chart watermark */}
        <div className="absolute inset-x-0 bottom-0 h-[45%] opacity-90">
          <CandlestickHero className="w-full h-full" />
        </div>

        <div className="relative max-w-xl">

          {/* Logo + brand */}
          <div className="flex items-center gap-3 mb-7 animate-fade-in-up">
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center bg-white dark:bg-[#0F172A] shadow-premium">
              <div className="tsw-logo-glow absolute inset-0 rounded-2xl bg-primary/40 blur-xl -z-10" />
              <img src="/logo2.png" alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-textPrimary tracking-tight leading-none">Tatvarth</h1>
              <h2 className="text-lg font-medium text-primary tracking-wide leading-none mt-1">StockWatch</h2>
            </div>
          </div>

          {/* Live pulse */}
          <div className="mb-3 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
            <MarketPulseRibbon />
          </div>

          {/* Hero headline */}
          <h2 className="text-4xl lg:text-5xl font-extrabold text-textPrimary tracking-tight leading-tight mb-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            Your all-in-one{' '}
            <span className="tsw-gradient-text text-transparent bg-clip-text bg-[length:200%_auto] bg-gradient-to-r from-primary via-indigo-400 to-primary">
              market intelligence
            </span>{' '}
            platform.
          </h2>

          <p className="text-lg text-textMuted mb-8 animate-fade-in-up leading-relaxed max-w-lg" style={{ animationDelay: '220ms' }}>
            Track BSE &amp; NSE announcements, verify IPO allotments, monitor insider trading, and get AI-powered insights — all in real time.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 mb-10">
            <FeaturePill icon={Bell} text="Instant Alerts" delayMs={300} />
            <FeaturePill icon={BarChart3} text="Volume Spurt" delayMs={360} />
            <FeaturePill icon={Search} text="IPO Verification" delayMs={420} />
            <FeaturePill icon={Sparkles} text="AI Analysis" delayMs={480} />
            <FeaturePill icon={TrendingUp} text="Gainers & Losers" delayMs={540} />
            <FeaturePill icon={Briefcase} text="Portfolio Tracking" delayMs={600} />
          </div>

          {/* Ticker tape */}
          <div className="animate-fade-in-up" style={{ animationDelay: '660ms' }}>
            <TickerTape />
          </div>
        </div>
      </div>

      {/* ── Right / Mobile: Sign-in ──────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-5 sm:p-8 md:p-16">
        <div className="w-full max-w-md mx-auto">

          {/* Logo (shown everywhere, but on desktop it's the right-side version) */}
          <div className="flex items-center justify-center gap-3 mb-2 animate-fade-in-up">
            <div className="relative w-12 h-12 rounded-xl flex items-center justify-center bg-white dark:bg-[#0F172A] shadow-premium">
              <div className="tsw-logo-glow absolute inset-0 rounded-xl bg-primary/40 blur-lg -z-10 md:hidden" />
              <img src="/logo2.png" alt="Logo" className="w-9 h-9 object-contain" />
            </div>
            <span className="text-2xl font-bold font-display text-textPrimary">
              Tatvarth<span className="text-primary">StockWatch</span>
            </span>
          </div>

          {/* Mobile-only tagline + pulse */}
          <div className="md:hidden text-center mb-6 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
            <p className="text-sm text-textMuted mb-2">Your all-in-one market intelligence platform</p>
            <div className="flex justify-center">
              <MarketPulseRibbon />
            </div>
          </div>

          {/* Desktop-only subtle spacing */}
          <div className="hidden md:block h-4" />

          {/* Glass card */}
          <div className="glass-panel p-7 sm:p-10 rounded-3xl shadow-premium relative animate-fade-in-up tsw-float" style={{ animationDelay: '150ms' }}>

            {/* Inner glow accents */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 text-center mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Welcome back
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold font-display text-textPrimary mb-2">Access your account</h3>
              <p className="text-sm text-textMuted">Sign in or create a new account with Google</p>
            </div>

            {/* Google sign-in button */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="relative z-10 w-full group flex items-center justify-center gap-3 bg-white dark:bg-[#1E293B] border border-border hover:border-primary/50 text-textPrimary font-semibold py-3.5 px-4 rounded-xl shadow-sm hover:shadow-premium-hover transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <span className="tsw-shine absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
              {googleLoading ? <Spinner size="sm" /> : <GoogleIcon />}
              <span className="relative">{googleLoading ? 'Connecting…' : 'Continue with Google'}</span>
            </button>

            {/* Security badge */}
            <div className="relative z-10 flex items-center justify-center gap-1.5 mt-5 text-xs text-textMuted">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Secured with Google OAuth — no passwords stored
            </div>

            {/* Legal */}
            <div className="relative z-10 mt-5 text-center">
              <p className="text-xs text-textMuted/70 leading-relaxed">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </div>

          {/* ── Mobile-only feature showcase ──────────────────────────────────── */}
          <div className="md:hidden mt-10 space-y-5">
            <h4 className="text-sm font-semibold text-textMuted uppercase tracking-wider text-center animate-fade-in-up" style={{ animationDelay: '300ms' }}>
              What you get
            </h4>
            <div className="grid gap-4">
              <FeatureItem
                icon={Bell}
                title="Real-time Announcements"
                desc="BSE & NSE corporate announcements with AI-powered summaries delivered instantly."
                delayMs={340}
              />
              <FeatureItem
                icon={Search}
                title="IPO Allotment Verification"
                desc="Check allotment status for your entire family in one click with bulk verification."
                delayMs={400}
              />
              <FeatureItem
                icon={BarChart3}
                title="Volume Spurt & Deals"
                desc="Track unusual volume activity, bulk deals, block deals, and insider trading."
                delayMs={460}
              />
              <FeatureItem
                icon={Sparkles}
                title="AI-Powered Analysis"
                desc="Get intelligent insights on any announcement powered by Google Gemini AI."
                delayMs={520}
              />
              <FeatureItem
                icon={TrendingUp}
                title="Market Overview"
                desc="Gainers, losers, board meetings, AGM updates, and corporate calendar at a glance."
                delayMs={580}
              />
              <FeatureItem
                icon={PieChart}
                title="Family Portfolio"
                desc="Manage and track investments for your entire family in one secure dashboard."
                delayMs={640}
              />
            </div>
          </div>

          {/* Ticker tape */}
          <div className="mt-8 animate-fade-in-up" style={{ animationDelay: '700ms' }}>
            <TickerTape />
          </div>
        </div>
      </div>

      {/* Scoped animations */}
      <style>{`
        .tsw-blob-a { animation: tsw-drift-a 14s ease-in-out infinite; }
        .tsw-blob-b { animation: tsw-drift-b 16s ease-in-out infinite; }
        @keyframes tsw-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-4%, 3%) scale(1.06); }
        }
        @keyframes tsw-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4%, -3%) scale(1.08); }
        }
        .tsw-gradient-text { animation: tsw-gradient-pan 6s ease-in-out infinite; }
        @keyframes tsw-gradient-pan {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .tsw-logo-glow { animation: tsw-glow-pulse 3s ease-in-out infinite; }
        @keyframes tsw-glow-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.7; }
        }
        .tsw-float { animation: tsw-float 6s ease-in-out 1s infinite; }
        @keyframes tsw-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tsw-blob-a, .tsw-blob-b, .tsw-gradient-text, .tsw-logo-glow, .tsw-float {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
