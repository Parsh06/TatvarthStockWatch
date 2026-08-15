import React, { useEffect, useState } from 'react';

const STATUS_MESSAGES = [
  'Connecting to exchange…',
  'Fetching live prices…',
  'Syncing your watchlist…',
  'Calibrating indicators…',
];

// Heights (%) for each candle — irregular, like a real intraday move
const CANDLES = [
  { h: 38, up: true },
  { h: 62, up: true },
  { h: 45, up: false },
  { h: 80, up: true },
  { h: 58, up: false },
  { h: 90, up: true },
  { h: 70, up: false },
];

export function Preloader() {
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const progressTimer = setInterval(() => {
      setProgress((p) => (p >= 96 ? 96 : p + Math.random() * 9));
    }, 220);
    const statusTimer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 1400);
    return () => {
      clearInterval(progressTimer);
      clearInterval(statusTimer);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#060911] flex flex-col items-center justify-center z-50 overflow-hidden">
      <style>{`
        @keyframes candleGrow {
          0% { transform: scaleY(0); opacity: 0; }
          100% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes candlePulse {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.08); }
        }
        @keyframes trendDraw {
          0% { stroke-dashoffset: 340; }
          70%, 100% { stroke-dashoffset: 0; }
        }
        @keyframes gridDrift {
          0% { background-position: 0 0; }
          100% { background-position: -48px -48px; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        @keyframes floatGlow {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>

      {/* Faint scrolling chart-grid, grounds the whole scene in "market data" */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #7DD3FC 1px, transparent 1px), linear-gradient(to bottom, #7DD3FC 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          animation: 'gridDrift 6s linear infinite',
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 w-[560px] h-[560px] bg-primary/15 rounded-full blur-[130px] pointer-events-none"
        style={{ animation: 'floatGlow 5s ease-in-out infinite' }}
      />

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Signature: candlestick chart with sweeping trend line + logo mark */}
        <div className="relative flex items-end justify-center gap-[6px] sm:gap-2 h-24 sm:h-28 w-[220px] sm:w-[260px]">
          {/* Trend line drawn across the candles */}
          <svg
            viewBox="0 0 260 100"
            className="absolute inset-0 w-full h-full overflow-visible"
            preserveAspectRatio="none"
          >
            <path
              d="M 5 70 L 42 40 L 80 55 L 118 18 L 156 45 L 194 8 L 250 25"
              fill="none"
              stroke="url(#trendGradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="340"
              style={{ animation: 'trendDraw 2.2s ease-out infinite' }}
            />
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#F5B942" stopOpacity="0" />
                <stop offset="15%" stopColor="#F5B942" />
                <stop offset="100%" stopColor="#38E1C6" />
              </linearGradient>
            </defs>
          </svg>

          {CANDLES.map((c, i) => (
            <div
              key={i}
              className="relative w-3 sm:w-3.5 rounded-[3px] origin-bottom"
              style={{
                height: `${c.h}%`,
                background: c.up
                  ? 'linear-gradient(180deg, #38E1C6, #0EA5E9)'
                  : 'linear-gradient(180deg, #FB7185, #F43F5E)',
                animation: `candleGrow 0.6s ease-out ${i * 0.09}s backwards, candlePulse 2.4s ease-in-out ${1.6 + i * 0.09}s infinite`,
                boxShadow: c.up
                  ? '0 0 12px rgba(56,225,198,0.35)'
                  : '0 0 12px rgba(244,63,94,0.3)',
              }}
            />
          ))}
        </div>

        {/* Logo, sitting on the "chart floor" like a ticker mark */}
        <div className="relative -mt-2 flex items-center justify-center">
          <img
            src="/logo2.png"
            alt="TatvarthStockWatch Logo"
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_0_18px_rgba(14,165,233,0.35)]"
          />
        </div>

        {/* Brand + live status */}
        <div className="mt-6 flex flex-col items-center px-8 py-5 bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-2xl shadow-2xl w-[280px] sm:w-[340px]">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#38E1C6] via-primary to-[#F5B942] text-center">
            TatvarthStockWatch
          </h1>

          <p className="mt-2 text-[11px] sm:text-xs text-textMuted font-medium tracking-wide h-4 transition-all">
            {STATUS_MESSAGES[statusIndex]}
          </p>

          {/* Progress bar with shimmer + live ticking % (mono, like a data readout) */}
          <div className="w-full mt-4">
            <div className="relative w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#38E1C6] via-primary to-[#F5B942] transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-0 left-0 h-full w-1/4 bg-white/40 blur-sm"
                style={{ animation: 'shimmer 1.8s linear infinite' }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-textMuted/80 tabular-nums">
              <span className="tracking-widest uppercase">Live sync</span>
              <span>{Math.min(99, Math.round(progress))}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}