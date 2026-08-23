/**
 * MarketPulse — Decorative market-themed widgets for Auth pages.
 *
 * • TickerTape      – Infinitely-scrolling horizontal stock ticker (fake data, purely visual).
 * • MarketPulseRibbon – Animated status dots signalling "live" feel.
 * • CandlestickHero   – Large SVG candlestick chart illustration with subtle animation.
 *
 * None of these fetch real data — they exist purely for visual polish on the
 * Login & Register pages.
 */

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

/* ─── Mock ticker data ─────────────────────────────────────────────────────── */
const TICKER_DATA = [
  { symbol: 'RELIANCE', price: '2,847.50', change: '+1.82%', up: true },
  { symbol: 'TCS', price: '3,956.20', change: '+0.64%', up: true },
  { symbol: 'HDFC BANK', price: '1,632.75', change: '-0.38%', up: false },
  { symbol: 'INFOSYS', price: '1,489.30', change: '+1.15%', up: true },
  { symbol: 'ITC', price: '468.90', change: '+0.92%', up: true },
  { symbol: 'BAJFINANCE', price: '7,124.80', change: '-0.51%', up: false },
  { symbol: 'SBIN', price: '812.45', change: '+2.13%', up: true },
  { symbol: 'BHARTIARTL', price: '1,542.60', change: '+0.77%', up: true },
  { symbol: 'HDFCLIFE', price: '642.15', change: '-0.24%', up: false },
  { symbol: 'WIPRO', price: '478.35', change: '+1.45%', up: true },
]

/* ─── TickerTape ───────────────────────────────────────────────────────────── */
export function TickerTape({ className }) {
  const doubled = [...TICKER_DATA, ...TICKER_DATA]

  return (
    <div className={clsx('relative overflow-hidden rounded-xl', className)}>
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />

      <div className="tsw-ticker-track flex gap-6 whitespace-nowrap py-2.5 px-1">
        {doubled.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-xs font-mono tracking-tight select-none shrink-0">
            <span className="font-semibold text-textPrimary">{t.symbol}</span>
            <span className="text-textMuted">₹{t.price}</span>
            <span className={t.up ? 'text-emerald-500' : 'text-rose-500'}>
              {t.change}
            </span>
          </span>
        ))}
      </div>

      <style>{`
        .tsw-ticker-track {
          animation: tsw-ticker-scroll 30s linear infinite;
        }
        @keyframes tsw-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tsw-ticker-track { animation: none; }
        }
      `}</style>
    </div>
  )
}

/* ─── MarketPulseRibbon ────────────────────────────────────────────────────── */
export function MarketPulseRibbon({ className }) {
  return (
    <div className={clsx('flex items-center gap-2 text-xs font-medium', className)}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="text-emerald-600 dark:text-emerald-400 tracking-wide uppercase text-[11px] font-semibold">
        Markets Active
      </span>
      <span className="text-textMuted/50">•</span>
      <span className="text-textMuted text-[11px]">BSE &amp; NSE Live</span>
    </div>
  )
}

/* ─── CandlestickHero ──────────────────────────────────────────────────────── */
export function CandlestickHero({ className }) {
  // Generates a decorative candlestick chart SVG
  const candles = [
    { x: 30,  o: 180, c: 120, h: 100, l: 200 },
    { x: 70,  o: 140, c: 160, h: 110, l: 190 },
    { x: 110, o: 170, c: 110, h: 80,  l: 195 },
    { x: 150, o: 120, c: 90,  h: 60,  l: 150 },
    { x: 190, o: 100, c: 130, h: 70,  l: 160 },
    { x: 230, o: 140, c: 80,  h: 50,  l: 170 },
    { x: 270, o: 95,  c: 130, h: 70,  l: 155 },
    { x: 310, o: 120, c: 70,  h: 40,  l: 145 },
    { x: 350, o: 80,  c: 110, h: 55,  l: 140 },
    { x: 390, o: 100, c: 60,  h: 30,  l: 130 },
    { x: 430, o: 70,  c: 100, h: 45,  l: 125 },
    { x: 470, o: 90,  c: 55,  h: 25,  l: 120 },
  ]

  return (
    <div className={clsx('pointer-events-none select-none', className)}>
      <svg
        viewBox="0 0 520 240"
        fill="none"
        className="w-full h-full opacity-[0.18] dark:opacity-[0.12]"
        preserveAspectRatio="xMidYMax meet"
      >
        {/* Grid lines */}
        {[60, 100, 140, 180].map((y) => (
          <line key={y} x1="10" y1={y} x2="510" y2={y} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
        ))}

        {/* Candlesticks */}
        {candles.map((c, i) => {
          const bullish = c.c < c.o
          const bodyTop = Math.min(c.o, c.c)
          const bodyHeight = Math.abs(c.o - c.c) || 2
          const color = bullish ? '#10B981' : '#F43F5E'

          return (
            <g key={i} className="tsw-candle-group" style={{ animationDelay: `${i * 120}ms` }}>
              {/* Wick */}
              <line x1={c.x} y1={c.h} x2={c.x} y2={c.l} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
              {/* Body */}
              <rect
                x={c.x - 10}
                y={bodyTop}
                width="20"
                height={bodyHeight}
                rx="3"
                fill={color}
                fillOpacity="0.7"
              />
            </g>
          )
        })}

        {/* Trend line */}
        <path
          d="M 30 150 Q 100 130, 150 105 T 270 95 T 390 50 T 470 60"
          stroke="url(#heroTrend)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          className="tsw-trend-line"
        />

        {/* Area fill under trend */}
        <path
          d="M 30 150 Q 100 130, 150 105 T 270 95 T 390 50 T 470 60 L 470 240 L 30 240 Z"
          fill="url(#heroArea)"
          opacity="0.15"
        />

        <defs>
          <linearGradient id="heroTrend" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38E1C6" />
            <stop offset="50%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        .tsw-candle-group {
          animation: tsw-candle-rise 0.8s ease-out both;
        }
        @keyframes tsw-candle-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tsw-trend-line {
          stroke-dasharray: 800;
          stroke-dashoffset: 800;
          animation: tsw-draw-line 2.5s ease-out 0.6s forwards;
        }
        @keyframes tsw-draw-line {
          to { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tsw-candle-group, .tsw-trend-line { animation: none; opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}
