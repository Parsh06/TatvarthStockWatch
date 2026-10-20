import React from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import PwaUniversalInstallModal from './PwaUniversalInstallModal';

export default function PwaInstallButton({ variant = 'topbar', className = '' }) {
  const {
    isInstalled,
    isIos,
    hasNativePrompt,
    showModal,
    closeModal,
    promptInstall,
  } = usePwaInstall();

  // If already running as installed standalone PWA, hide install triggers
  if (isInstalled) return null;

  const modal = (
    <PwaUniversalInstallModal
      isOpen={showModal}
      onClose={closeModal}
      isIos={isIos}
      onNativePrompt={hasNativePrompt ? promptInstall : null}
    />
  );

  // 1. Welcome page top desktop navbar
  if (variant === 'welcome') {
    return (
      <>
        <button
          onClick={promptInstall}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-blue-600 hover:from-primaryHover hover:to-blue-700 text-white shadow-md shadow-primary/20 hover:shadow-primary/35 transition-all transform active:scale-95 border border-primary/30 ${className}`}
          title="Install Tatvarth StockWatch to Home Screen / Desktop"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Install App</span>
        </button>
        {modal}
      </>
    );
  }

  // 2. Welcome page mobile navbar (compact pill visible on phones)
  if (variant === 'welcome-mobile') {
    return (
      <>
        <button
          onClick={promptInstall}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-primary to-blue-600 text-white shadow-sm shadow-primary/25 active:scale-95 transition-all border border-primary/30 ${className}`}
          title="Install Tatvarth StockWatch"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Install</span>
        </button>
        {modal}
      </>
    );
  }

  // 3. Welcome page mobile drawer accordion
  if (variant === 'welcome-drawer') {
    return (
      <>
        <button
          onClick={promptInstall}
          className={`w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-primary/10 via-indigo-500/10 to-cyan-500/10 border border-primary/25 hover:border-primary/50 text-left transition-all group ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/25 group-hover:scale-105 transition-transform">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-textPrimary">Install StockWatch App</p>
              <p className="text-[11px] text-textMuted">Add to Home Screen for sub-second alerts</p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-primary font-mono px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
            FREE APP
          </span>
        </button>
        {modal}
      </>
    );
  }

  // 4. Mobile layout topbar (logged-in view on phones)
  if (variant === 'mobile') {
    return (
      <>
        <button
          onClick={promptInstall}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-primary to-blue-600 text-white shadow-sm shadow-primary/20 transition-all active:scale-95 border border-primary/30 ${className}`}
          title="Install App to Home Screen"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px]">Install App</span>
        </button>
        {modal}
      </>
    );
  }

  // 5. Sidebar variant (desktop dashboard sidebar)
  if (variant === 'sidebar') {
    return (
      <>
        <button
          onClick={promptInstall}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary/10 via-indigo-500/10 to-cyan-500/10 hover:from-primary/20 hover:via-indigo-500/20 hover:to-cyan-500/20 text-primary border border-primary/20 transition-all group ${className}`}
        >
          <div className="w-6 h-6 rounded-lg bg-primary text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <Download className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="font-semibold leading-tight text-textPrimary">Install App</p>
            <p className="text-[10px] text-textMuted font-normal">Add to Home Screen</p>
          </div>
        </button>
        {modal}
      </>
    );
  }

  // 6. Default Topbar variant: compact on mobile, pill on desktop
  return (
    <>
      <button
        onClick={promptInstall}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primaryHover hover:to-blue-700 text-white shadow-sm shadow-primary/25 transition-all transform active:scale-95 border border-primary/30 ${className}`}
        title="Install Tatvarth StockWatch app to your device"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Install App</span>
      </button>
      {modal}
    </>
  );
}
