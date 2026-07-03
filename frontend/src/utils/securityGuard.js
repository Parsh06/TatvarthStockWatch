/**
 * Network Security Guard
 * Prevents common ways of accessing Developer Tools (F12, Right-Click, Shortcuts)
 * Triggers a passive debugger trap if DevTools is forcibly opened.
 */
export function initSecurityGuard() {
  if (import.meta.env.VITE_NETWORK_GUARD !== 'ON') {
    return;
  }

  // 1. Disable Right-Click Context Menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // 2. Block Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+C / Cmd+Option+C (Elements)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      return;
    }
    // Ctrl+U / Cmd+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault();
      return;
    }
  });

  // 3. Passive Debugger Trap
  // This loop makes the browser pause execution continuously if DevTools is open.
  setInterval(() => {
    const before = new Date().getTime();
    // eslint-disable-next-line no-debugger
    debugger;
    const after = new Date().getTime();
    if (after - before > 100) {
      // DevTools was opened (execution paused for > 100ms)
      document.body.innerHTML = 'Security violation detected. Access denied.';
    }
  }, 1000);

  console.log('🛡️ Security Guard Enabled');
}
