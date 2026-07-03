import { useEffect } from 'react';

export default function SecurityGuard() {
  useEffect(() => {
    // Check if the security guard is enabled in the environment variables
    const isGuardOn = import.meta.env.VITE_NETWORK_GUARD === 'ON';

    if (!isGuardOn) {
      return; // If not ON, allow everything
    }

    // 1. Prevent Right Click (Context Menu)
    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    // 2. Prevent Keyboard Shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
    const handleKeyDown = (e) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
      }
      
      // Ctrl+Shift+I (Inspect)
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
      }
      
      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
      }

      // Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
      }
    };

    // 3. Debugger Loop to freeze DevTools if they manage to open it
    let debuggerLoop;
    const startDebuggerLoop = () => {
      debuggerLoop = setInterval(() => {
        // eslint-disable-next-line no-debugger
        debugger;
      }, 100);
    };

    // Apply event listeners
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    
    // Start the debugger loop
    startDebuggerLoop();

    // Cleanup function when component unmounts
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      if (debuggerLoop) clearInterval(debuggerLoop);
    };
  }, []);

  return null; // This component doesn't render anything
}
