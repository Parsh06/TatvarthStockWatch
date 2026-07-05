import { useState } from 'react'
import { TrendingUp, ShieldCheck, Zap, Activity } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import clsx from 'clsx'

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

function FeaturePill({ icon: Icon, text, delay }) {
  return (
    <div className={clsx(
      "flex items-center gap-2 px-4 py-2 glass-panel rounded-full text-sm font-medium animate-fade-in-up",
      delay
    )}>
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-textPrimary">{text}</span>
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
    <div className="min-h-screen relative overflow-hidden bg-background flex flex-col md:flex-row">
      
      {/* ── Background Mesh & Blobs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 w-full h-full max-w-[800px] max-h-[800px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen opacity-50 dark:opacity-30 animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute -bottom-1/4 -left-1/4 w-full h-full max-w-[600px] max-h-[600px] bg-indigo-500/20 rounded-full blur-[100px] mix-blend-screen opacity-50 dark:opacity-30 animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      {/* ── Left Side (Branding & Features) ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-8 md:p-16 lg:p-24 border-b md:border-b-0 md:border-r border-border/50 bg-background/50 backdrop-blur-sm">
        <div className="max-w-xl mx-auto md:mx-0">
          
          <div className="flex items-center gap-3 mb-8 animate-fade-in-up">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white dark:bg-[#0F172A] shadow-premium">
              <img src="/logo2.png" alt="Logo" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-textPrimary tracking-tight">Tatvarth</h1>
              <h2 className="text-lg font-medium text-primary tracking-wide">StockWatch</h2>
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl font-extrabold text-textPrimary tracking-tight leading-tight mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            The smartest way to track <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-500">market moves.</span>
          </h2>
          
          <p className="text-lg text-textMuted mb-10 animate-fade-in-up leading-relaxed" style={{ animationDelay: '200ms' }}>
            Real-time corporate announcements, price alerts, and intelligent watchlist management — all in one beautifully designed platform.
          </p>

          <div className="flex flex-wrap gap-3">
            <FeaturePill icon={Zap} text="Real-time Announcements" delay="[animation-delay:300ms]" />
            <FeaturePill icon={Activity} text="Live Market Rates" delay="[animation-delay:400ms]" />
            <FeaturePill icon={ShieldCheck} text="Instant Price Alerts" delay="[animation-delay:500ms]" />
          </div>

        </div>
      </div>

      {/* ── Right Side (Login Form) ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center p-8 md:p-16">
        <div className="w-full max-w-md mx-auto">
          
          <div className="glass-panel p-8 md:p-10 rounded-3xl shadow-premium relative animate-fade-in-up float" style={{ animationDelay: '200ms' }}>
            
            {/* Soft inner glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 text-center mb-8">
              <h3 className="text-2xl font-bold text-textPrimary mb-2">Welcome Back</h3>
              <p className="text-sm text-textMuted">Sign in to access your portfolio</p>
            </div>

            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="relative z-10 w-full group flex items-center justify-center gap-3 bg-white dark:bg-[#1E293B] border border-border hover:border-primary/50 text-textPrimary font-semibold py-3.5 px-4 rounded-xl shadow-sm hover:shadow-premium-hover transition-all duration-300 disabled:opacity-60 overflow-hidden"
            >
              {/* Button hover gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              <span>{googleLoading ? 'Connecting...' : 'Continue with Google'}</span>
            </button>

            <div className="relative z-10 mt-8 text-center">
              <p className="text-xs text-textMuted/70">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>

          </div>

        </div>
      </div>

    </div>
  )
}
