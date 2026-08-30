import React from 'react'
import { motion } from 'framer-motion'

// Multi-color conic ring with luxury gold, teal, and electric blue tones
function ColorRing({ thickness = 3 }) {
  return (
    <div
      className="absolute inset-0 rounded-full animate-spin"
      style={{
        background:
          'conic-gradient(from 0deg, transparent 0%, #c8a84b 22%, #f0d080 45%, #38E1C6 72%, #0EA5E9 90%, transparent 100%)',
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
      {/* Outer track */}
      <div className="absolute inset-0 rounded-full border-[1.5px] border-amber-500/20" />
      {/* Luxury colorful spinning arc */}
      <ColorRing thickness={thickness[size]} />
      {/* Inner glowing core */}
      <div
        className="absolute inset-[28%] rounded-full blur-[1.5px] animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(200,168,75,0.8) 0%, rgba(56,225,198,0.5) 60%, transparent 100%)',
        }}
      />
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="relative overflow-hidden bg-surface/60 backdrop-blur-md border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-[shimmer_2s_infinite]" />

      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-3 flex-1">
          <div className="h-4 w-32 bg-white/10 rounded-md" />
          <div className="h-3 w-20 bg-white/5 rounded-md" />
        </div>
        {/* Status pill tinted */}
        <div className="h-6 w-14 bg-amber-500/10 border border-amber-500/20 rounded-full" />
      </div>

      {/* Fake luxury sparkline */}
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
              <stop offset="0%" stopColor="#c8a84b" />
              <stop offset="50%" stopColor="#38E1C6" />
              <stop offset="100%" stopColor="#0EA5E9" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex gap-2 pt-1 relative z-10">
        <div className="h-8 w-24 bg-white/10 rounded-xl" />
        <div className="h-8 w-8 bg-cyan-500/10 border border-cyan-500/20 rounded-xl" />
      </div>
    </div>
  )
}

export function SkeletonAnnouncementCard() {
  return (
    <div className="relative overflow-hidden bg-surface/50 backdrop-blur-md border border-white/[0.06] rounded-2xl p-4 flex gap-4 shadow-lg">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]" />

      <div
        className="w-1 rounded-full h-auto self-stretch bg-gradient-to-b from-[#c8a84b] via-[#38E1C6]/70 to-transparent"
        style={{ minHeight: 64 }}
      />
      <div className="flex-1 space-y-3 relative z-10">
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-amber-500/10 border border-amber-500/20 rounded-full" />
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
    <div className="flex justify-between items-center py-2.5 relative overflow-hidden">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-[shimmer_2s_infinite]" />
      <div className="space-y-1.5 relative z-10 flex-1">
        <div className="h-4 w-28 bg-white/10 rounded-md" />
        <div className="h-3 w-16 bg-white/5 rounded-md" />
      </div>
      <div className="h-4 w-14 bg-white/10 rounded-md relative z-10 ml-4" />
    </div>
  )
}

const CornerDeco = ({ position }) => {
  const styles = {
    tl: { top: 16, left: 16, borderTop: '1px solid rgba(200,168,75,0.45)', borderLeft: '1px solid rgba(200,168,75,0.45)' },
    tr: { top: 16, right: 16, borderTop: '1px solid rgba(200,168,75,0.45)', borderRight: '1px solid rgba(200,168,75,0.45)' },
    bl: { bottom: 16, left: 16, borderBottom: '1px solid rgba(200,168,75,0.45)', borderLeft: '1px solid rgba(200,168,75,0.45)' },
    br: { bottom: 16, right: 16, borderBottom: '1px solid rgba(200,168,75,0.45)', borderRight: '1px solid rgba(200,168,75,0.45)' },
  }

  return (
    <div
      className="absolute w-6 h-6 sm:w-8 sm:h-8 pointer-events-none opacity-60"
      style={styles[position]}
    />
  )
}

export default function Loader({ fullScreen = false, text = 'Synchronizing Market Feed...' }) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050811]/92 backdrop-blur-2xl overflow-hidden animate-fade-in">
        {/* Radial Ambient Glow */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 440,
            height: 440,
            background: 'radial-gradient(circle, rgba(200,168,75,0.14) 0%, rgba(56,225,198,0.06) 45%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Corner Accents */}
        <CornerDeco position="tl" />
        <CornerDeco position="tr" />
        <CornerDeco position="bl" />
        <CornerDeco position="br" />

        {/* Emblem Pod */}
        <div className="relative flex items-center justify-center mb-5">
          {/* Pulsing Outer Ring */}
          <div
            className="absolute rounded-full animate-pulse"
            style={{
              inset: -8,
              border: '1px solid rgba(200,168,75,0.3)',
              boxShadow: '0 0 22px rgba(200,168,75,0.2)',
            }}
          />

          {/* Inner Logo Pod */}
          <div
            className="flex items-center justify-center rounded-full overflow-hidden shadow-2xl"
            style={{
              width: 86,
              height: 86,
              border: '1px solid rgba(200,168,75,0.45)',
              background: 'radial-gradient(circle at 35% 15%, rgba(255,255,255,0.08), transparent 60%), rgba(6,12,24,0.95)',
              boxShadow: '0 0 30px rgba(200,168,75,0.22)',
            }}
          >
            <img
              src="/logo2.png"
              alt="Tatvarth StockWatch"
              className="w-14 h-14 object-contain drop-shadow-[0_0_12px_rgba(200,168,75,0.45)]"
            />
          </div>
        </div>

        {/* Brand Text */}
        <div
          className="tracking-[0.45em] font-medium text-xl text-center select-none"
          style={{
            fontFamily: "'Space Grotesk', 'Playfair Display', serif, sans-serif",
            marginLeft: '0.45em',
            background: 'linear-gradient(135deg, #c8a84b 0%, #f6e096 35%, #c8a84b 70%, #987228 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 25px rgba(200,168,75,0.25)',
          }}
        >
          TATVARTH
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2.5 my-2.5">
          <div style={{ width: 24, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,168,75,0.5))' }} />
          <div style={{ width: 4, height: 4, background: 'rgba(200,168,75,0.7)', transform: 'rotate(45deg)' }} />
          <div style={{ width: 24, height: 1, background: 'linear-gradient(to left, transparent, rgba(200,168,75,0.5))' }} />
        </div>

        <div className="text-[10px] font-mono tracking-[0.38em] text-cyan-400/85 uppercase mb-4" style={{ marginLeft: '0.38em' }}>
          StockWatch
        </div>

        {/* Spinner */}
        <Spinner size="md" className="my-2" />

        <div className="mt-3 text-xs font-mono text-slate-400 tracking-wider uppercase animate-pulse">
          {text}
        </div>
      </div>
    )
  }

  // In-page Unified Luxury Loader
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-12 px-4 w-full"
    >
      <div className="relative flex items-center justify-center mb-4">
        {/* Ambient Ring */}
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            inset: -8,
            border: '1px solid rgba(200,168,75,0.25)',
            boxShadow: '0 0 18px rgba(200,168,75,0.15)',
          }}
        />

        {/* Concentric Rotating Dash Ring */}
        <div
          className="absolute rounded-full animate-spin pointer-events-none"
          style={{
            inset: -14,
            border: '0.5px dashed rgba(56,225,198,0.3)',
            animationDuration: '18s',
          }}
        />

        {/* Mini Luxury Emblem Pod */}
        <div
          className="flex items-center justify-center rounded-full overflow-hidden shadow-2xl backdrop-blur-md"
          style={{
            width: 68,
            height: 68,
            border: '1px solid rgba(200,168,75,0.4)',
            background: 'radial-gradient(circle at 35% 15%, rgba(255,255,255,0.08), transparent 60%), rgba(6,12,24,0.95)',
            boxShadow: '0 0 25px rgba(200,168,75,0.2), inset 0 0 15px rgba(0,0,0,0.8)',
          }}
        >
          <img
            src="/logo2.png"
            alt="Tatvarth StockWatch"
            className="w-11 h-11 object-contain drop-shadow-[0_0_10px_rgba(200,168,75,0.4)]"
          />
        </div>
      </div>

      {/* Brand Header */}
      <div
        className="tracking-[0.4em] font-medium text-sm text-center select-none uppercase mt-1"
        style={{
          fontFamily: "'Space Grotesk', 'Playfair Display', serif, sans-serif",
          marginLeft: '0.4em',
          background: 'linear-gradient(135deg, #c8a84b 0%, #f6e096 35%, #c8a84b 70%, #987228 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        TATVARTH
      </div>

      {/* Mini Diamond Divider */}
      <div className="flex items-center gap-2 my-1.5">
        <div style={{ width: 16, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,168,75,0.5))' }} />
        <div style={{ width: 3.5, height: 3.5, background: 'rgba(200,168,75,0.7)', transform: 'rotate(45deg)' }} />
        <div style={{ width: 16, height: 1, background: 'linear-gradient(to left, transparent, rgba(200,168,75,0.5))' }} />
      </div>

      <div className="text-[9px] font-mono tracking-[0.35em] text-cyan-400/80 uppercase mb-3" style={{ marginLeft: '0.35em' }}>
        StockWatch
      </div>

      {/* Conic Spinner */}
      <Spinner size="md" className="my-1" />

      {/* Status Text */}
      <div className="mt-2 text-[11px] font-mono text-slate-400 tracking-wider uppercase animate-pulse">
        {text}
      </div>
    </motion.div>
  )
}