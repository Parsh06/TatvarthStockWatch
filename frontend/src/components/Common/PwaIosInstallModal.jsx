import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share, PlusSquare, Smartphone, ShieldCheck, Zap } from 'lucide-react';

export default function PwaIosInstallModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-border/80 flex items-center justify-center shadow-md p-2 shrink-0">
              <img src="/logo2.png" alt="StockWatch" className="w-full h-full object-contain brand-logo" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Install Tatvarth StockWatch
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Standalone App for iPhone & iPad
              </p>
            </div>
          </div>

          {/* Value Props */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Instant Full-Screen</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Zero App Store Fees</span>
            </div>
          </div>

          {/* Step-by-Step Instructions */}
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
                  Located in Safari’s navigation bar at the bottom or top of your screen.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-sm">
                2
              </div>
              <div className="text-sm">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  Select "Add to Home Screen" <PlusSquare className="w-4 h-4 text-emerald-500 inline" />
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Scroll down the share options and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all transform active:scale-[0.98]"
          >
            Got It, I'll Add It
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
