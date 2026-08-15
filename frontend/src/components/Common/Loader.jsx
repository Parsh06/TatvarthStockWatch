// Multi-color conic ring — same technique used by top-tier loaders (Linear, Stripe).
// A border can only do 1–2 colors well; a masked conic-gradient gives a true color arc.
function ColorRing({ sizePx, thickness = 3 }) {
  return (
    <div
      className="absolute inset-0 rounded-full animate-spin"
      style={{
        background:
          'conic-gradient(from 0deg, transparent 0%, #38E1C6 20%, #0EA5E9 50%, #F5B942 78%, transparent 100%)',
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
        mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
        animationDuration: '1.1s',
      }}
    />
  )
}

export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10', xl: 'w-16 h-16' }
  const thickness = { sm: 2, md: 2.5, lg: 3, xl: 3.5 }

  return (
    <div className={`relative flex items-center justify-center ${sizes[size]} ${className}`}>
      {/* Faint track */}
      <div className="absolute inset-0 rounded-full border-[2.5px] border-white/[0.06]"></div>
      {/* Colorful spinning arc */}
      <ColorRing thickness={thickness[size]} />
      {/* Inner core — subtle two-tone blend, not a flat pulse */}
      <div
        className="absolute inset-[30%] rounded-full blur-[1.5px] animate-pulse"
        style={{ background: 'radial-gradient(circle, #38E1C6 0%, #0EA5E9 60%, transparent 100%)', opacity: 0.5 }}
      ></div>
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="relative overflow-hidden bg-surface/60 backdrop-blur-md border border-white/10 rounded-xl p-5 space-y-4 shadow-xl">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]"></div>

      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-3 flex-1">
          <div className="h-4 w-32 bg-white/10 rounded-md"></div>
          <div className="h-3 w-20 bg-white/5 rounded-md"></div>
        </div>
        {/* Status pill tinted instead of flat gray — reads as "price change" placeholder */}
        <div className="h-6 w-14 bg-primary/10 border border-primary/10 rounded-full"></div>
      </div>

      {/* Fake sparkline — signals "this card will hold a price chart" rather than generic text lines */}
      <div className="relative z-10 h-10 w-full">
        <svg viewBox="0 0 200 40" className="w-full h-full opacity-40" preserveAspectRatio="none">
          <path
            d="M 0 28 L 25 22 L 50 30 L 75 12 L 100 20 L 125 6 L 150 16 L 175 10 L 200 18"
            fill="none"
            stroke="url(#skelSparkGradient)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="skelSparkGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38E1C6" />
              <stop offset="100%" stopColor="#0EA5E9" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex gap-2 pt-1 relative z-10">
        <div className="h-8 w-24 bg-white/10 rounded-lg"></div>
        <div className="h-8 w-8 bg-primary/10 rounded-lg"></div>
      </div>
    </div>
  )
}

export function SkeletonAnnouncementCard() {
  return (
    <div className="relative overflow-hidden bg-surface/50 backdrop-blur-md border border-white/5 rounded-xl p-4 flex gap-4 shadow-lg">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]"></div>

      <div className="w-1 rounded-full h-auto self-stretch bg-gradient-to-b from-primary via-[#38E1C6]/60 to-transparent" style={{ minHeight: 64 }} />
      <div className="flex-1 space-y-3 relative z-10">
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-primary/10 rounded-full" />
          <div className="h-5 w-20 bg-white/5 rounded-full" />
        </div>
        <div className="space-y-2 pt-1">
          <div className="h-4 w-3/4 bg-white/10 rounded-md" />
          <div className="h-3 w-full bg-white/5 rounded-md" />
          <div className="h-3 w-1/2 bg-white/5 rounded-md" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex justify-between items-center py-2 relative overflow-hidden">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]"></div>
      <div className="space-y-1.5 relative z-10 flex-1">
        <div className="h-4 w-28 bg-white/10 rounded-md"></div>
        <div className="h-3 w-16 bg-white/5 rounded-md"></div>
      </div>
      <div className="h-4 w-14 bg-white/10 rounded-md relative z-10 ml-4"></div>
    </div>
  )
}

export default function Loader({ fullScreen = false }) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xl">
        <Spinner size="xl" />
        <div className="mt-6 text-sm font-medium tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#38E1C6] via-primary to-[#F5B942] animate-pulse">
          Loading Workspace
        </div>
        <div className="mt-2 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-primary/60"
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Spinner size="lg" />
      <div className="mt-4 text-xs font-semibold tracking-wider text-textMuted uppercase animate-pulse">Fetching Data...</div>
    </div>
  )
}