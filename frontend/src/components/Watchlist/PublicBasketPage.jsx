import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
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
  ArrowLeft
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { apiClient } from '../../services/apiClient'
import PageTransition from '../Common/PageTransition'
import Loader from '../Common/Loader'

export default function PublicBasketPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentUser, isApproved, isPendingApproval, isRejected } = useAuth()

  const [basket, setBasket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)

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
    const text = encodeURIComponent(`📊 Check out this curated stock basket "${basket.title}" on StockWatch:\n${shareUrl}\n\nView live filings, price updates, and import into your watchlist in 1-tap!`)
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
  }

  function shareTwitter() {
    if (!basket) return
    const text = encodeURIComponent(`Check out the curated stock basket "${basket.title}" on @StockWatch!\n\nLive corporate filings & 1-tap watchlist import 👇\n`)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, '_blank')
  }

  function shareTelegram() {
    if (!basket) return
    const text = encodeURIComponent(`📊 Curated Stock Basket: "${basket.title}"\nLive corporate announcements & 1-tap import`)
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`, '_blank')
  }

  async function handleImport() {
    if (!currentUser) {
      setAuthPromptOpen(true)
      return
    }

    if (isPendingApproval) {
      toast('Your account is under review for approval. Once approved, you can import this basket to your watchlist.', {
        icon: '⏳'
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
        toast.success(`Successfully added ${res.addedCount} stocks to your Watchlist!`)
        setTimeout(() => navigate('/watchlist'), 900)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader size="lg" message="Loading curated basket..." />
      </div>
    )
  }

  if (error || !basket) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center text-textPrimary">
        <div className="p-4 rounded-2xl bg-danger/10 text-danger mb-4 border border-danger/20">
          <Building2 className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold font-display mb-2">Basket Not Found</h1>
        <p className="text-sm text-textMuted max-w-md mb-6">
          The curated basket link "{slug}" could not be found or has been removed by its creator.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition shadow-lg shadow-primary/20"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Explore StockWatch</span>
        </Link>
      </div>
    )
  }

  const scripts = Array.isArray(basket.scripts) ? basket.scripts : []
  const announcements = Array.isArray(basket.recentAnnouncements) ? basket.recentAnnouncements : []

  return (
    <PageTransition className="min-h-screen bg-background text-textPrimary selection:bg-primary selection:text-white pb-20">
      {/* ── Public Top Bar ── */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-accent-teal flex items-center justify-center shadow-md shadow-primary/20">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight font-display text-textPrimary">StockWatch</span>
              <span className="text-[10px] text-textMuted tracking-wider font-mono uppercase">Curated Baskets</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {currentUser ? (
              <Link
                to="/watchlist"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-textPrimary hover:bg-surfaceHover transition"
              >
                <span>My Watchlist</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-white transition shadow-sm"
              >
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="max-w-6xl mx-auto px-4 pt-8 space-y-8">
        {/* ── Basket Hero Card ── */}
        <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-surface via-surface to-background border border-border shadow-2xl space-y-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/25 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {basket.category || 'Curated Basket'}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-surfaceHover text-textMuted border border-border flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Curated by {basket.creatorName}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight font-display text-textPrimary">
                {basket.title}
              </h1>

              {basket.description && (
                <p className="text-sm sm:text-base text-textMuted leading-relaxed">
                  {basket.description}
                </p>
              )}

              {/* Stats Ribbon */}
              <div className="flex items-center gap-5 pt-2 text-xs font-medium text-textMuted flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span><strong>{scripts.length}</strong> Stocks Included</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-amber-400" />
                  <span><strong>{basket.viewsCount || 1}</strong> Views</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span><strong>{basket.importsCount || 0}</strong> Investors Imported</span>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="flex flex-col gap-3 shrink-0">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-primary to-accent-teal hover:opacity-95 text-white font-bold text-sm sm:text-base shadow-xl shadow-primary/25 transition transform active:scale-95 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Import to My Watchlist</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-center text-textMuted">
                1-Tap import • Tracks announcements & live filing alerts
              </p>
            </div>
          </div>

          {/* ── Viral Social Share Ribbon ── */}
          <div className="pt-4 border-t border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-textMuted flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-primary" />
              Share this basket with friends & investment groups:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-semibold text-textPrimary hover:bg-surfaceHover transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-textMuted" />}
                <span>{copied ? 'Copied Link' : 'Copy Link'}</span>
              </button>
              <button
                onClick={shareWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/25 text-[#25D366] text-xs font-semibold transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                onClick={shareTwitter}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-sky-400 text-xs font-semibold transition"
              >
                <Twitter className="w-3.5 h-3.5" />
                <span>X</span>
              </button>
              <button
                onClick={shareTelegram}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/25 text-[#0088cc] text-xs font-semibold transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Telegram</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Stocks Grid ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-display text-textPrimary flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Basket Holdings ({scripts.length} Stocks)
            </h2>
            <span className="text-xs text-textMuted font-mono">Real-time monitored</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {scripts.map((script, idx) => {
              const code = script.bseCode || script.ltdCode
              const sym = script.symbol || script.nseSymbol
              const tvSymbol = sym ? `NSE:${sym}` : (code ? `BSE:${code}` : null)

              return (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-surface border border-border/80 hover:border-primary/40 transition-all duration-200 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm text-textPrimary line-clamp-1">
                        {script.scriptName || sym || code}
                      </h3>
                      <div className="flex items-center gap-2 font-mono text-xs text-textMuted">
                        {sym && <span className="text-primary font-semibold">{sym}</span>}
                        {sym && code && <span className="text-border">•</span>}
                        {code && <span>{code}</span>}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surfaceHover text-textMuted border border-border">
                      {script.exchange || 'BOTH'}
                    </span>
                  </div>

                  {script.notes && (
                    <div className="p-2 rounded-xl bg-background/70 border border-border/60 text-xs text-textMuted italic">
                      "{script.notes}"
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[11px] text-textMuted border-t border-border/40">
                    <span className="text-textMuted/70">Holding #{idx + 1}</span>
                    <div className="flex items-center gap-3">
                      {tvSymbol && (
                        <a
                          href={`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline font-medium"
                        >
                          <TrendingUp className="w-3 h-3" />
                          <span>Chart</span>
                        </a>
                      )}
                      <Link
                        to={`/all-announcements?search=${encodeURIComponent(sym || code)}`}
                        className="flex items-center gap-1 text-textMuted hover:text-textPrimary transition"
                      >
                        <FileText className="w-3 h-3" />
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
            <h2 className="text-xl font-bold font-display text-textPrimary flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent-teal" />
              Recent Announcements for Basket Stocks
            </h2>
            <span className="text-xs text-textMuted">Today's Exchange Disclosures</span>
          </div>

          {announcements.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface border border-border text-center text-textMuted space-y-2">
              <Clock className="w-8 h-8 mx-auto text-textMuted/40" />
              <p className="text-sm font-medium">No new announcements today for these stocks</p>
              <p className="text-xs text-textMuted/70">Announcements appear automatically in real-time as companies file with BSE/NSE.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/80 border border-border rounded-2xl bg-surface overflow-hidden shadow-sm">
              {announcements.map((ann, i) => (
                <div key={i} className="p-4 hover:bg-surfaceHover transition flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-textPrimary font-mono">
                        {ann.symbol || ann.scripCode}
                      </span>
                      {ann.category && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20">
                          {ann.category}
                        </span>
                      )}
                      <span className="text-textMuted/70">
                        {ann.time || ann.date || 'Recent'}
                      </span>
                    </div>
                    <p className="text-textPrimary/90 font-medium leading-relaxed">
                      {ann.headline || ann.subject || 'Corporate Announcement'}
                    </p>
                  </div>

                  {ann.attachmentUrl && (
                    <a
                      href={ann.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-primary hover:bg-surfaceHover transition font-semibold text-[11px] self-start"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Filing PDF</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Guest Auth Modal (High-converting 1-click loop) ── */}
      {authPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface border border-border rounded-3xl p-6 shadow-2xl text-textPrimary text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-accent-teal mx-auto flex items-center justify-center text-white shadow-xl shadow-primary/25">
              <Download className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold font-display text-textPrimary">Sign In to Import Basket</h3>
              <p className="text-xs text-textMuted max-w-sm mx-auto leading-relaxed">
                Create your free StockWatch account to import "{basket.title}" and get real-time BSE/NSE filing notifications directly on your phone or desktop.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <Link
                to={`/login?redirect=${encodeURIComponent(`/basket/${slug}?autoImport=1`)}`}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                <span>Continue to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setAuthPromptOpen(false)}
                className="w-full py-2.5 text-xs text-textMuted hover:text-textPrimary transition"
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
