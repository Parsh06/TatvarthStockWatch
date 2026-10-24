import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share, PlusSquare, Zap, ShieldCheck, Download, Laptop, Smartphone, CheckCircle2 } from 'lucide-react';

export default function PwaUniversalInstallModal({ isOpen, onClose, isIos, onNativePrompt }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const isAndroid = /android/i.test(navigator.userAgent);
  const canDirectPrompt = Boolean(onNativePrompt || (typeof window !== 'undefined' && window.__pwaDeferredPrompt));

  const handleDirectInstall = async () => {
    if (onNativePrompt) {
      await onNativePrompt();
      onClose();
      return;
    }
    if (typeof window !== 'undefined' && window.__pwaDeferredPrompt) {
      try {
        window.__pwaDeferredPrompt.prompt();
        const choice = await window.__pwaDeferredPrompt.userChoice;
        window.__pwaDeferredPrompt = null;
        if (choice?.outcome === 'accepted') {
          onClose();
        }
      } catch (err) {
        console.warn('[PWA] Direct install error:', err);
      }
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        {/* Backdrop click to close */}
        <div className="fixed inset-0 -z-10" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden my-auto"
        >
          {/* Ambient Top Glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-gradient-to-br from-primary/20 via-blue-500/15 to-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Brand Header */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-black dark:bg-[#0F172A] border border-slate-800 dark:border-border/80 flex items-center justify-center shadow-md p-2 shrink-0">
              <img src="/logo2.png" alt="StockWatch" className="w-full h-full object-contain brand-logo" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight font-display">
                Install Tatvarth StockWatch
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {isIos
                  ? 'Standalone App for iPhone & iPad (Safari)'
                  : isAndroid
                  ? 'Standalone App for Android (Chrome & Edge)'
                  : 'Desktop Standalone App (Chrome, Edge & Safari)'}
              </p>
            </div>
          </div>

          {/* Value Props Pills */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Instant Full-Screen
              </span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Lockscreen Alerts
              </span>
            </div>
          </div>

          {/* Direct One-Tap Install Action Button (When supported by browser) */}
          {canDirectPrompt && !isIos && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleDirectInstall}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Install StockWatch Now</span>
              </button>
              <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2">
                Click to open your browser's direct one-tap install dialog
              </p>
            </div>
          )}

          {/* Step-by-Step Guidance Container */}
          <div className="space-y-3 mb-6">
            {isIos ? (
              /* iOS Safari Instructions */
              <>
                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm font-mono border border-blue-500/20">
                    1
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        Tap Share Button <Share className="w-4 h-4 text-blue-500 inline shrink-0" />
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">STEP 1</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Tap the Share icon in Safari's bottom toolbar on iPhone (or top-right toolbar on iPad).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0 text-sm font-mono border border-emerald-500/20">
                    2
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        Tap "Add to Home Screen" <PlusSquare className="w-4 h-4 text-emerald-500 inline shrink-0" />
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">STEP 2</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Scroll down in the action list, tap <strong>Add to Home Screen</strong>, and tap <strong>Add</strong> in the top corner.
                    </p>
                  </div>
                </div>
              </>
            ) : isAndroid ? (
              /* Android Chrome Instructions */
              <>
                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm font-mono border border-blue-500/20">
                    1
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
                      <span>Open Browser Menu (⋮)</span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">STEP 1</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Tap the three vertical dots in the top-right corner of Chrome, Edge, or Samsung Internet.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0 text-sm font-mono border border-emerald-500/20">
                    2
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
                      <span>Tap "Install App" or "Add to Home screen"</span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">STEP 2</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      StockWatch icon will be downloaded and placed directly on your phone's home screen.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              /* Desktop Chrome / Edge Instructions */
              <>
                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm font-mono border border-blue-500/20">
                    1
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
                      <span>Check Browser Address Bar</span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">STEP 1</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Look for the Install App icon (<span className="font-bold font-mono text-primary">⊕</span> or <span className="font-bold font-mono text-primary">💻</span> or <span className="font-bold font-mono text-primary">📥</span>) on the right side of the address bar.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0 text-sm font-mono border border-emerald-500/20">
                    2
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
                      <span>Click "Install" to Confirm</span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">STEP 2</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      StockWatch will launch in its own dedicated, high-speed standalone window.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Dismiss Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-semibold text-sm transition-all border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-center"
          >
            Got It
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
