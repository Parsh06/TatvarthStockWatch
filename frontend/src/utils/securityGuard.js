/**
 * securityGuard.js
 *
 * Enterprise-grade client security guard for StockWatch:
 * 1. Self-XSS console deterrence banner
 * 2. Anti-clickjacking / frame-busting protection
 * 3. DOM mutation shield (detects and removes rogue injected scripts/iframes)
 * 4. Reverse tab-nabbing / window.opener nullification
 * 5. High-security mode: DevTools shortcut blocking & debugger tripwire
 */

// Trusted origins & hostnames allowed for external script execution
const TRUSTED_SCRIPT_DOMAINS = [
  'tatvarthstockwatch.web.app',
  'tatvarthstockwatch.firebaseapp.com',
  'tatvarth-stockwatch.vercel.app',
  'tatvarthstockwatch.onrender.com',
  'localhost',
  'apis.google.com',
  'www.gstatic.com',
  'va.vercel-scripts.com',
  'cdn.jsdelivr.net',
];

/**
 * 1. Anti-Clickjacking / Framebuster
 * Prevents unauthorized framing or embedding inside malicious iframes.
 */
function protectAgainstClickjacking() {
  try {
    if (window.self !== window.top) {
      // Try to bust out of iframe
      window.top.location = window.self.location;
    }
  } catch (err) {
    // If cross-origin framing blocks access to window.top.location, blank the page
    document.documentElement.innerHTML = '<div style="background:#0F172A;color:#EF4444;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:20px;font-weight:bold;">Embedding this application in external frames is disabled for security reasons.</div>';
  }
}

/**
 * 2. Self-XSS Deterrent Console Banner
 * Prevents social engineering attacks where users are tricked into pasting malicious code in the console.
 */
function displaySelfXssWarning() {
  const titleStyle = 'color: #EF4444; font-size: 34px; font-weight: 900; -webkit-text-stroke: 1px black; padding: 4px;';
  const bodyStyle = 'color: #F59E0B; font-size: 14px; font-weight: 600; line-height: 1.5; padding: 4px 0;';
  const alertStyle = 'color: #E2E8F0; font-size: 13px; font-style: italic;';

  try {
    console.log('%c⚠️ STOP! ATTENTION! ⚠️', titleStyle);
    console.log(
      '%cThis browser console is intended strictly for authorized engineering and diagnostics. ' +
      'If someone told you to copy and paste code here to "hack", "unlock VIP plans", or "bypass approval", ' +
      'IT IS A SCAM to compromise your session and steal your account data.\n\n' +
      'Do not paste any code here!',
      bodyStyle
    );
    console.log('%cTatvarth StockWatch Security Shield Active — All security violations are monitored.', alertStyle);
  } catch {}
}

/**
 * 3. Reverse Tab-nabbing Protection
 * Disconnects opener access on opened tabs.
 */
function protectWindowOpener() {
  try {
    if (window.opener && window.opener !== window) {
      window.opener = null;
    }
  } catch {}
}

/**
 * 4. DOM Mutation Shield
 * Watches for rogue script or iframe tags injected by malicious browser extensions or XSS attempts.
 */
function initDomMutationShield() {
  if (typeof MutationObserver === 'undefined') return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const tagName = node.tagName.toLowerCase();
        if (tagName === 'script' || tagName === 'iframe' || tagName === 'object' || tagName === 'embed') {
          const src = node.getAttribute('src') || '';
          
          if (src) {
            try {
              const url = new URL(src, window.location.origin);
              const host = url.hostname.toLowerCase();
              const isAllowed = TRUSTED_SCRIPT_DOMAINS.some(d => host === d || host.endsWith('.' + d));

              if (!isAllowed) {
                console.warn(`[Security Guard] Blocked unauthorized external element: <${tagName} src="${src}">`);
                node.remove();
              }
            } catch {
              // Invalid URL format
              console.warn(`[Security Guard] Blocked malformed resource element: <${tagName}>`);
              node.remove();
            }
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * 5. High-Security Inspection Traps
 * Activates shortcut locks and passive debugger traps when VITE_NETWORK_GUARD is enabled.
 */
function enableInspectionLockdown() {
  // A. Disable Right-Click Context Menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  }, { passive: false });

  // B. Block Keyboard Shortcuts for DevTools & Source Viewing
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
    // Ctrl+Shift+C / Cmd+Option+C (Inspect Element)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      return;
    }
    // Ctrl+U / Cmd+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault();
      return;
    }
  }, { passive: false });

  // C. Passive Debugger Tripwire
  setInterval(() => {
    const before = Date.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const after = Date.now();
    if (after - before > 120) {
      document.body.innerHTML = '<div style="background:#0F172A;color:#EF4444;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:22px;font-weight:bold;">Security violation detected. Access denied.</div>';
    }
  }, 1000);
}

/**
 * Main Initialization Entry Point
 */
export function initSecurityGuard() {
  // Always-on baseline defenses
  protectAgainstClickjacking();
  displaySelfXssWarning();
  protectWindowOpener();
  initDomMutationShield();

  // Elevated lockdown if explicitly configured in environment
  if (import.meta.env.VITE_NETWORK_GUARD === 'ON') {
    enableInspectionLockdown();
    console.log('🛡️ Full High-Security Inspection Lockdown Active');
  }
}
