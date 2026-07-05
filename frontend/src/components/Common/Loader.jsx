export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10', xl: 'w-16 h-16' }
  return (
    <div className={`relative flex items-center justify-center ${sizes[size]} ${className}`}>
      {/* Outer ring */}
      <div className="absolute inset-0 rounded-full border-[3px] border-primary/20"></div>
      {/* Spinning gradient ring */}
      <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary border-r-primary/80 animate-spin"></div>
      {/* Inner pulsing core */}
      <div className="absolute inset-[25%] rounded-full bg-primary/40 blur-[2px] animate-pulse"></div>
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="relative overflow-hidden bg-surface/60 backdrop-blur-md border border-white/10 rounded-xl p-5 space-y-4 shadow-xl">
      {/* Shimmer overlay */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]"></div>
      
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-3 flex-1">
          <div className="h-4 w-32 bg-white/10 rounded-md"></div>
          <div className="h-3 w-20 bg-white/5 rounded-md"></div>
        </div>
        <div className="h-6 w-14 bg-white/10 rounded-full"></div>
      </div>
      <div className="space-y-2 relative z-10 pt-2">
        <div className="h-3 w-full bg-white/10 rounded-md"></div>
        <div className="h-3 w-3/4 bg-white/5 rounded-md"></div>
      </div>
      <div className="flex gap-2 pt-3 relative z-10">
        <div className="h-8 w-24 bg-white/10 rounded-lg"></div>
        <div className="h-8 w-8 bg-white/10 rounded-lg"></div>
      </div>
    </div>
  )
}

export function SkeletonAnnouncementCard() {
  return (
    <div className="relative overflow-hidden bg-surface/50 backdrop-blur-md border border-white/5 rounded-xl p-4 flex gap-4 shadow-lg">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]"></div>
      
      <div className="w-1 rounded-full h-auto self-stretch bg-gradient-to-b from-primary/50 to-transparent" style={{ minHeight: 64 }} />
      <div className="flex-1 space-y-3 relative z-10">
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-white/10 rounded-full" />
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

export default function Loader({ fullScreen = false }) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xl">
        <Spinner size="xl" />
        <div className="mt-6 text-sm font-medium tracking-widest text-primary/80 uppercase animate-pulse">Loading Workspace</div>
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
