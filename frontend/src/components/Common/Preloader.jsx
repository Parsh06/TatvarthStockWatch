import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CornerDeco = ({ position }) => {
  const styles = {
    tl: { top: 20, left: 20, borderTop: "1px solid rgba(200,168,75,0.45)", borderLeft: "1px solid rgba(200,168,75,0.45)" },
    tr: { top: 20, right: 20, borderTop: "1px solid rgba(200,168,75,0.45)", borderRight: "1px solid rgba(200,168,75,0.45)" },
    bl: { bottom: 20, left: 20, borderBottom: "1px solid rgba(200,168,75,0.45)", borderLeft: "1px solid rgba(200,168,75,0.45)" },
    br: { bottom: 20, right: 20, borderBottom: "1px solid rgba(200,168,75,0.45)", borderRight: "1px solid rgba(200,168,75,0.45)" },
  };

  return (
    <motion.div
      className="absolute w-8 h-8 sm:w-12 sm:h-12 pointer-events-none"
      style={styles[position]}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 0.6, scale: 1 }}
      transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
    />
  );
};

const STATUS_MESSAGES = [
  "Connecting to BSE & NSE market feeds…",
  "Calibrating corporate announcement radars…",
  "Syncing your monitored watchlist…",
  "Verifying real-time IPO & market data…",
];

export function Preloader({ isVisible = true }) {
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    // Smooth progress bar calculation calibrated for ~2.2s display time
    const startTime = Date.now();
    const totalDuration = 2000;

    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(progressTimer);
      }
    }, 40);

    const statusTimer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 1000);

    return () => {
      clearInterval(progressTimer);
      clearInterval(statusTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#050811]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          {/* Subtle Financial Chart Grid Background */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, #c8a84b 1px, transparent 1px), linear-gradient(to bottom, #c8a84b 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />

          {/* Radial Ambient Gold & Cyan Glow */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 540,
              height: 540,
              background:
                "radial-gradient(circle, rgba(200,168,75,0.12) 0%, rgba(14,165,233,0.06) 40%, transparent 70%)",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
            animate={{ scale: [0.92, 1.12, 0.92], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Corner Architectural Luxury Accents */}
          <CornerDeco position="tl" />
          <CornerDeco position="tr" />
          <CornerDeco position="bl" />
          <CornerDeco position="br" />

          {/* Center Brand Architecture */}
          <div className="relative z-10 flex flex-col items-center px-6 max-w-sm sm:max-w-md w-full">
            {/* Emblem Ring with Logo */}
            <motion.div
              className="relative flex items-center justify-center mb-6 sm:mb-7"
              initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Outer Radar Glow Ring */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  inset: -10,
                  border: "1px solid rgba(200,168,75,0.25)",
                  boxShadow: "0 0 25px rgba(200,168,75,0.15)",
                }}
                animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.85, 0.35] }}
                transition={{ duration: 3, delay: 0.6, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Secondary Concentric Ring */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  inset: -18,
                  border: "0.5px dashed rgba(56,225,198,0.25)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              />

              {/* Inner Luxury Logo Pod */}
              <div
                className="flex items-center justify-center rounded-full overflow-hidden shadow-2xl backdrop-blur-md"
                style={{
                  width: 104,
                  height: 104,
                  border: "1px solid rgba(200,168,75,0.4)",
                  background:
                    "radial-gradient(circle at 35% 15%, rgba(255,255,255,0.08), transparent 60%), rgba(6,12,24,0.95)",
                  boxShadow: "0 0 35px rgba(200,168,75,0.2), inset 0 0 20px rgba(0,0,0,0.8)",
                }}
              >
                <img
                  src="/logo2.png"
                  alt="Tatvarth StockWatch"
                  className="w-16 h-16 sm:w-18 sm:h-18 object-contain drop-shadow-[0_0_15px_rgba(200,168,75,0.45)]"
                />
              </div>
            </motion.div>

            {/* Wordmark: TATVARTH */}
            <motion.div
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                className="tracking-[0.45em] sm:tracking-[0.55em] font-medium text-2xl sm:text-3xl text-center select-none"
                style={{
                  fontFamily: "'Space Grotesk', 'Playfair Display', serif, sans-serif",
                  marginLeft: "0.45em",
                  background: "linear-gradient(135deg, #c8a84b 0%, #f6e096 35%, #c8a84b 70%, #987228 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "0 0 30px rgba(200,168,75,0.25)",
                }}
              >
                TATVARTH
              </span>
            </motion.div>

            {/* Elegant Geometric Diamond Divider */}
            <motion.div
              className="flex items-center gap-3 my-3.5"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.7, delay: 0.65, ease: "easeOut" }}
            >
              <div
                style={{
                  width: 32,
                  height: 1,
                  background: "linear-gradient(to right, transparent, rgba(200,168,75,0.5))",
                }}
              />
              <div
                style={{
                  width: 5,
                  height: 5,
                  background: "rgba(200,168,75,0.7)",
                  transform: "rotate(45deg)",
                  boxShadow: "0 0 8px rgba(200,168,75,0.6)",
                }}
              />
              <div
                style={{
                  width: 32,
                  height: 1,
                  background: "linear-gradient(to left, transparent, rgba(200,168,75,0.5))",
                }}
              />
            </motion.div>

            {/* StockWatch Subtitle */}
            <motion.span
              className="text-[10px] sm:text-xs font-mono font-bold tracking-[0.42em] uppercase select-none"
              style={{
                marginLeft: "0.42em",
                color: "rgba(56,225,198,0.85)",
                textShadow: "0 0 15px rgba(56,225,198,0.3)",
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.8, ease: "easeOut" }}
            >
              StockWatch
            </motion.span>

            {/* Dynamic Market Status Message */}
            <motion.p
              className="mt-3.5 text-xs text-slate-400 font-mono tracking-wide text-center h-5 transition-all duration-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.95 }}
            >
              {STATUS_MESSAGES[statusIndex]}
            </motion.p>

            {/* Metallic Gold / Cyan Progress Bar */}
            <motion.div
              className="mt-5 w-44 sm:w-56 overflow-hidden rounded-full p-[1px] bg-slate-900 border border-white/10 shadow-inner"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.05, duration: 0.5 }}
            >
              <div className="h-1.5 w-full bg-slate-950/80 rounded-full overflow-hidden relative">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #8a6020, #c8a84b, #38E1C6, #f0d080)",
                    boxShadow: "0 0 12px rgba(200,168,75,0.5)",
                  }}
                  animate={{ width: `${Math.min(100, Math.round(progress))}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            </motion.div>

            {/* Live Data Ticker Percentage Readout */}
            <motion.div
              className="mt-2 flex items-center justify-between w-44 sm:w-56 font-mono text-[10px] text-slate-500 tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.15, duration: 0.5 }}
            >
              <span className="tracking-widest uppercase text-cyan-400/70">LIVE FEED</span>
              <span className="text-amber-400/90 font-bold">{Math.min(99, Math.round(progress))}%</span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Preloader;