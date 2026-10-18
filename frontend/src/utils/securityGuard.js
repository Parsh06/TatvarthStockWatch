/**
 * securityGuard.js
 *
 * Enterprise-grade client security guard for StockWatch:
 * 1. Self-XSS console deterrence banner
 * 2. Anti-clickjacking / frame-busting protection
 * 3. DOM mutation shield (detects and removes rogue injected scripts/iframes)
 * 4. Reverse tab-nabbing / window.opener nullification
 * 5. Production Console Lockdown & Anti-Tampering Engine
 * 6. High-security keyboard shortcut & context menu inspection blocker
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
  'googletagmanager.com',
  'www.googletagmanager.com',
  'google-analytics.com',
  'www.google-analytics.com',
  'tagmanager.google.com',
  'analytics.google.com',
];

/**
 * 1. Anti-Clickjacking / Framebuster
 * Prevents unauthorized framing or embedding inside malicious iframes.
 */
function protectAgainstClickjacking() {
  try {
    if (window.self !== window.top) {
      window.top.location = window.self.location;
    }
  } catch (err) {
    document.documentElement.innerHTML = '<div style="background:#0F172A;color:#EF4444;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:20px;font-weight:bold;">Embedding this application in external frames is disabled for security reasons.</div>';
  }
}

/**
 * 2. Reverse Tab-nabbing Protection
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
 * 3. DOM Mutation Shield
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
 * 4. Production Console Lockdown & Anti-Tampering Engine
 * Neutralizes console inputs, execution, and inspection in production.
 */
function lockDownConsole() {
  if (import.meta.env.DEV) return;

  try {
    const noop = () => {};
    const methods = [
      'log', 'info', 'warn', 'error', 'debug', 'dir', 'dirxml',
      'table', 'trace', 'group', 'groupCollapsed', 'groupEnd',
      'time', 'timeLog', 'timeEnd', 'count', 'countReset', 'assert'
    ];

    // Wipe console methods
    methods.forEach((method) => {
      try {
        window.console[method] = noop;
      } catch {}
    });

    // Auto-wipe console so nothing typed or outputted stays visible
    setInterval(() => {
      try {
        window.console.clear();
      } catch {}
    }, 400);

    // Block dynamic code execution via eval
    try {
      window.eval = function() {
        throw new Error('[Security Guard] Console script execution is strictly disabled.');
      };
    } catch {}

    // Freeze console object to prevent unpatching
    try {
      Object.freeze(window.console);
    } catch {}

    // Prevent overriding window.console
    try {
      Object.defineProperty(window, 'console', {
        value: window.console,
        writable: false,
        configurable: false,
      });
    } catch {}
  } catch {}
}

/**
 * 5. Inspection Keyboard Shortcuts & Context Menu Lockdown
 * Blocks F12, Ctrl+Shift+I/J/C, Ctrl+U, and right-click inspection in production.
 */
function enableInspectionLockdown() {
  if (import.meta.env.DEV) return;

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
}

/**
 * Main Initialization Entry Point
 */
export function initSecurityGuard() {
  protectAgainstClickjacking();
  protectWindowOpener();
  initDomMutationShield();
  enableInspectionLockdown();
  lockDownConsole();
}
