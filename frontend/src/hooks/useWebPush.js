import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import toast from 'react-hot-toast';

/**
 * Detect platform and browser for device registration metadata.
 */
function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  let platform = 'desktop';
  let browser = 'unknown';

  // Platform detection
  if (/Android/i.test(ua)) {
    platform = window.matchMedia('(display-mode: standalone)').matches
      ? 'android-pwa'
      : 'android-browser';
  } else if (/iPad|iPhone|iPod/i.test(ua)) {
    platform = navigator.standalone ? 'ios-pwa' : 'ios-browser';
  } else if (/Macintosh|Windows|Linux/i.test(ua)) {
    platform = 'desktop';
  }

  // Browser detection
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/CriOS/i.test(ua)) browser = 'Chrome iOS';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return { platform, browser, userAgent: ua };
}

/**
 * Check if the browser is Brave.
 */
async function isBraveBrowser() {
  if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
    try {
      return await navigator.brave.isBrave();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Get or create a stable device ID, persisted in localStorage.
 */
function getDeviceId() {
  const KEY = 'sw_push_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * Convert a VAPID public key from URL-safe base64 to Uint8Array.
 * Strips whitespace, quotes, and applies correct RFC4648 padding.
 */
function urlBase64ToUint8Array(base64String) {
  const clean = String(base64String || '').trim().replace(/[\r\n"']/g, '');
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Race a promise against a timeout.
 */
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

/**
 * useWebPush — Universal Hook for Web Push subscriptions.
 *
 * Robust cross-browser compatibility:
 * - Handles stale / desynchronized subscriptions without throwing push service errors
 * - Automated self-healing retry on service worker or PushManager state mismatch
 * - Comprehensive browser diagnostic guidance (Brave, Chrome, Firefox, Safari iOS)
 */
export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushErrorDetails, setPushErrorDetails] = useState(null);
  const heartbeatSent = useRef(false);

  // Check support and current subscription status on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);

      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setIsSubscribed(true);

            // Sync active subscription and device info once per session
            if (!heartbeatSent.current) {
              heartbeatSent.current = true;
              const deviceId = getDeviceId();
              const deviceInfo = getDeviceInfo();
              apiClient('/api/push/subscribe', {
                method: 'POST',
                body: JSON.stringify({
                  subscription: sub.toJSON(),
                  deviceId,
                  platform: deviceInfo.platform,
                  browser: deviceInfo.browser,
                  userAgent: deviceInfo.userAgent,
                }),
              }).catch(() => {});
            }
          }
        }).catch((err) => console.warn('[WebPush] Error checking subscription:', err));
      }).catch(() => {});
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  /**
   * Universal Subscribe with Self-Healing & Fallback
   */
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error('Web Push is not supported in this browser.');
      return false;
    }

    setLoading(true);
    setPushErrorDetails(null);

    try {
      // ── 1. Check / Request Permission ──────────────────────────────────────
      let perm = Notification.permission;

      if (perm === 'denied') {
        setPermission('denied');
        setPushErrorDetails('PERMISSION_DENIED');
        toast.error(
          'Notifications are blocked by your browser settings. Please click the lock/settings icon in your address bar and set Notifications to "Allow".',
          { duration: 7000 }
        );
        return false;
      }

      if (perm === 'default') {
        perm = await withTimeout(
          Notification.requestPermission(),
          20000,
          'Permission prompt timed out. Please check your browser notification prompt.'
        );
        setPermission(perm);
      }

      if (perm !== 'granted') {
        if (perm === 'denied') {
          setPermission('denied');
          setPushErrorDetails('PERMISSION_DENIED');
          toast.error('Notification permission was blocked. Please allow notifications in site settings.', { duration: 6000 });
        } else {
          toast.error('Notification permission was dismissed.');
        }
        return false;
      }

      // ── 2. Register & Prepare Service Worker ───────────────────────────────
      let registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await registration.update().catch(() => {});
      
      const readyReg = await withTimeout(
        navigator.serviceWorker.ready,
        12000,
        'Service Worker activation timed out. Push notifications might be restricted in Incognito / Private mode.'
      );

      // ── 3. Fetch VAPID Public Key from Backend ─────────────────────────────
      const { publicKey } = await withTimeout(
        apiClient('/api/push/public-key'),
        10000,
        'Network timeout while fetching encryption keys from server.'
      );

      if (!publicKey) {
        throw new Error('VAPID public key not found on server.');
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // ── 4. Check & Clean Existing Subscription ─────────────────────────────
      // If an existing subscription is present, check if we can reuse or clean it up
      let existingSub = null;
      try {
        existingSub = await readyReg.pushManager.getSubscription();
      } catch (subCheckErr) {
        console.warn('[WebPush] Error inspecting existing sub:', subCheckErr);
      }

      let activeSubscription = null;

      if (existingSub) {
        // Try cleaning stale subscription first to prevent push service conflict error
        try {
          await existingSub.unsubscribe();
          console.log('[WebPush] Unsubscribed stale subscription to ensure clean sync');
        } catch (unsubErr) {
          console.warn('[WebPush] Could not unsubscribe existing sub, proceeding to subscribe:', unsubErr);
        }
      }

      // ── 5. Subscribe to PushManager (with Self-Healing Retry) ───────────────
      try {
        activeSubscription = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch (firstSubErr) {
        console.warn('[WebPush] First subscribe attempt failed, initiating self-healing recovery:', firstSubErr.message);

        // Self-Healing Step: Reset service worker registration and retry
        try {
          const allRegistrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of allRegistrations) {
            await reg.unregister().catch(() => {});
          }
          const freshReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          const freshReady = await navigator.serviceWorker.ready;
          activeSubscription = await freshReady.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
          console.log('[WebPush] ✅ Self-healing subscription recovery succeeded!');
        } catch (retryErr) {
          console.error('[WebPush] Self-healing retry failed:', retryErr);
          throw retryErr; // Re-throw to trigger detailed browser diagnostics
        }
      }

      if (!activeSubscription) {
        throw new Error('Browser PushManager returned null subscription.');
      }

      // ── 6. Sync Subscription & Device to Backend ───────────────────────────
      const deviceId = getDeviceId();
      const deviceInfo = getDeviceInfo();

      await apiClient('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: activeSubscription.toJSON(),
          deviceId,
          platform: deviceInfo.platform,
          browser: deviceInfo.browser,
          userAgent: deviceInfo.userAgent,
        }),
      });

      setIsSubscribed(true);
      setPermission('granted');
      toast.success('Push notifications successfully enabled on this device!');
      return true;

    } catch (err) {
      console.error('[WebPush Subscribe Error]', err);
      const errStr = (err?.message || '').toLowerCase();

      // ── Browser-Specific Error Diagnostics ─────────────────────────────────
      const isBrave = await isBraveBrowser();

      if (isBrave || errStr.includes('push service error') || errStr.includes('registration failed')) {
        if (isBrave) {
          setPushErrorDetails('BRAVE_CONFIG_REQUIRED');
          toast.error(
            'Brave Browser detected: Please enable "Use Google services for push messaging" in brave://settings/privacy, then click Sync Subscription.',
            { duration: 9000 }
          );
        } else {
          setPushErrorDetails('PUSH_SERVICE_ERROR');
          toast.error(
            'Push service error: If in Incognito / Private browsing, please switch to a standard window. Also check if VPN / AdBlocker is blocking push services.',
            { duration: 8000 }
          );
        }
      } else {
        toast.error(`Subscription failed: ${err.message || 'Unknown error'}`);
      }

      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  /**
   * Unsubscribe from Push Notifications
   */
  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      const deviceId = getDeviceId();
      await apiClient('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      }).catch((err) => {
        console.warn('Backend unsubscribe warning:', err.message);
      });

      setIsSubscribed(false);
      toast.success('Push notifications disabled for this device.');
      return true;
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
      toast.error('Failed to unsubscribe');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Send a test notification to the current device.
   */
  const sendTest = useCallback(async () => {
    try {
      const deviceId = getDeviceId();
      const result = await apiClient('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      if (result.sent > 0) {
        toast.success('Test notification sent to this device!');
      } else {
        toast.error(`Could not send notification: ${result.error || 'Unknown error'}`);
      }
      return result;
    } catch (err) {
      console.error('Test notification failed:', err);
      toast.error('Failed to send test notification');
      return null;
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    pushErrorDetails,
    subscribe,
    unsubscribe,
    sendTest,
    deviceId: isSupported ? getDeviceId() : null,
  };
}
