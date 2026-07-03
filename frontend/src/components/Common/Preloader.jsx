import React from 'react';

export function Preloader() {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50">
      <div className="relative flex flex-col items-center">
        {/* Pulsing rings */}
        <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
        <div className="absolute inset-0 rounded-full border-4 border-primary/40 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
        
        {/* Logo */}
        <img 
          src="/logo2.png" 
          alt="TatvarthStockWatch Logo" 
          className="w-24 h-24 sm:w-32 sm:h-32 object-contain relative z-10 drop-shadow-xl"
        />
      </div>
      
      <h1 className="mt-8 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
        TatvarthStockWatch
      </h1>
      <p className="mt-2 text-textMuted text-sm animate-pulse">Initializing securely...</p>
    </div>
  );
}
