import React from 'react';

export function Preloader() {
  return (
    <div className="fixed inset-0 bg-[#0A0F1C] flex flex-col items-center justify-center z-50 overflow-hidden">
      {/* Dynamic Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>

      <div className="relative flex flex-col items-center z-10">
        {/* Premium Spinner Rings around Logo */}
        <div className="relative flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40">
          {/* Outer rotating ring */}
          <div className="absolute inset-0 rounded-full border border-white/5 border-t-primary/80 animate-[spin_3s_linear_infinite]"></div>
          {/* Inner rotating ring (reverse) */}
          <div className="absolute inset-2 rounded-full border border-white/5 border-b-primary/60 animate-[spin_2s_linear_infinite_reverse]"></div>
          
          {/* Pulsing core behind logo */}
          <div className="absolute inset-4 rounded-full bg-primary/10 blur-xl animate-pulse"></div>
          
          {/* Logo */}
          <img 
            src="/logo2.png" 
            alt="TatvarthStockWatch Logo" 
            className="w-20 h-20 sm:w-28 sm:h-28 object-contain relative z-10 drop-shadow-[0_0_15px_rgba(14,165,233,0.3)]"
          />
        </div>
      </div>
      
      {/* Text Container with Glassmorphism */}
      <div className="mt-10 flex flex-col items-center px-8 py-4 bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl relative z-10">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-300 drop-shadow-sm">
          TatvarthStockWatch
        </h1>
        <div className="flex items-center gap-2 mt-3">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></div>
          <p className="text-textMuted text-xs font-medium tracking-widest uppercase">Initializing Securely</p>
        </div>
      </div>
    </div>
  );
}
