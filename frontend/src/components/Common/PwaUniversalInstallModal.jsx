import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share, PlusSquare, Smartphone, Laptop, Zap, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function PwaUniversalInstallModal({ isOpen, onClose, isIos, onNativePrompt }) {
  if (!isOpen) return null;

  const isMac = typeof window !== 'undefined' && /macintosh|mac os x/i.test(navigator.userAgent);
  const isMobile = typeof window !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25 p-2">
              <img src="/logo2.png" alt="StockWatch" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Install Tatvarth StockWatch
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isIos ? 'Standalone App for iPhone & iPad' : isMobile ? 'Install Standalone App on Android' : 'Desktop Standalone App (Chrome, Edge & Safari)'}
              </p>
            </div>
          </div>

          {/* Value Props */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Instant Full-Screen</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Lockscreen Alerts</span>
            </div>
          </div>

          {/* Platform Specific Instructions */}
          {isIos ? (
            /* iOS Safari Instructions */
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm">
                  1
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Tap the Share button <Share className="w-4 h-4 text-blue-500 inline" />
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Found at the bottom or top navigation bar in Safari.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm">
                  2
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Tap "Add to Home Screen" <PlusSquare className="w-4 h-4 text-emerald-500 inline" />
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Scroll down in the share sheet and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop / Android Instructions */
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm">
                  1
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {isMobile ? 'Open Browser Menu' : 'Check Browser Address Bar'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isMobile
                      ? 'Tap the three dots (⋮) in the top-right corner of Chrome or Edge.'
                      : 'Look for the Install App icon (⊕ or 💻) on the right side of the address bar.'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm">
                  2
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {isMobile ? 'Select "Install App"' : 'Click "Install" to Confirm'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    StockWatch will launch in its own dedicated, high-speed standalone window.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {onNativePrompt && (
              <button
                type="button"
                onClick={onNativePrompt}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all transform active:scale-[0.98]"
              >
                Trigger Install Prompt
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`py-3 rounded-2xl font-semibold text-sm transition-all border ${
                onNativePrompt
                  ? 'px-5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  : 'w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
              }`}
            >
              Got It
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
