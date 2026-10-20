import React from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import PwaIosInstallModal from './PwaIosInstallModal';

export default function PwaInstallButton({ variant = 'topbar', className = '' }) {
  const {
    isInstallable,
    isInstalled,
    isIos,
    showIosModal,
    promptInstall,
    closeIosModal,
  } = usePwaInstall();

  // If already running as installed standalone PWA, hide install triggers
  if (isInstalled) return null;

  // On non-iOS browsers, only show when beforeinstallprompt fired or forced
  if (!isInstallable && !isIos) return null;

  if (variant === 'sidebar') {
    return (
      <>
        <button
          onClick={promptInstall}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10 hover:from-blue-500/20 hover:via-indigo-500/20 hover:to-cyan-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-all group ${className}`}
        >
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <Download className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="font-semibold leading-tight">Install App</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Add to Home Screen</p>
          </div>
        </button>
        <PwaIosInstallModal isOpen={showIosModal} onClose={closeIosModal} />
      </>
    );
  }

  // Default Topbar variant: compact on mobile, pill on desktop
  return (
    <>
      <button
        onClick={promptInstall}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm shadow-blue-500/25 transition-all transform active:scale-95 ${className}`}
        title="Install Tatvarth StockWatch app to your device"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Install App</span>
      </button>
      <PwaIosInstallModal isOpen={showIosModal} onClose={closeIosModal} />
    </>
  );
}
