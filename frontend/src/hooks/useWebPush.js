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
 * Get or create a stable device ID, persisted in localStorage.
 * This ensures the same device always uses the same ID even across sessions.
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
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
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
 * useWebPush — Hook for managing Web Push subscriptions.
 *
 * Supports:
 * - Multi-device registration (each device gets a unique deviceId)
 * - Permission state awareness (granted / denied / default)
 * - Automatic re-subscribe if subscription refreshed by browser
 * - Heartbeat to keep device alive in the backend
 * - Guided UX when permission is denied
 */
export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const heartbeatSent = useRef(false);

  // Check support and current subscription status on mount
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);

      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) {
            setIsSubscribed(true);

            // Send heartbeat once per session to keep device alive
            if (!heartbeatSent.current) {
              heartbeatSent.current = true;
              const deviceId = getDeviceId();
              apiClient('/api/push/heartbeat', {
                method: 'POST',
                body: JSON.stringify({ deviceId }),
              }).catch(() => {}); // best-effort
            }
          }
        }).catch(err => console.error('Error checking subscription:', err));
      });
    }

    // Update permission state if it changes
    setPermission('Notification' in window ? Notification.permission : 'default');
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error('Web Push is not supported in this browser.');
      return false;
    }

    setLoading(true);
    try {
      // 1. Check / Request Permission
      let perm = Notification.permission;

      if (perm === 'denied') {
        toast.error(
          'Notifications are blocked by your browser. Please go to your browser\'s site settings to allow notifications for this site.',
          { duration: 6000 }
        );
        setPermission('denied');
        return false;
      }

      if (perm === 'default') {
        perm = await withTimeout(
          Notification.requestPermission(),
          15000,
          'Permission request timed out. Please check your browser notification settings.'
        );
        setPermission(perm);
        if (perm !== 'granted') {
          if (perm === 'denied') {
            toast.error('Notifications were blocked. You can re-enable them in your browser\'s site settings.', { duration: 6000 });
          } else {
            toast.error('Notification permission was not granted.');
          }
          return false;
        }
      }

      // 2. Register Service Worker
      await navigator.serviceWorker.register('/sw.js');
      const registration = await withTimeout(
        navigator.serviceWorker.ready,
        10000,
        'Service Worker activation timed out. If you are in Private/Incognito mode, push notifications may be blocked.'
      );

      // 3. Get VAPID Public Key from Backend
      const { publicKey } = await withTimeout(
        apiClient('/api/push/public-key'),
        10000,
        'Network timeout while fetching encryption keys.'
      );

      if (!publicKey) {
        throw new Error('VAPID public key not found on server. Push notifications may not be configured on the backend.');
      }

      // 4. Subscribe to PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // 5. Send Subscription + Device Info to Backend
      const deviceId = getDeviceId();
      const deviceInfo = getDeviceInfo();

      await apiClient('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceId,
          platform: deviceInfo.platform,
          browser: deviceInfo.browser,
          userAgent: deviceInfo.userAgent,
        })
      });

      setIsSubscribed(true);
      toast.success('Push notifications enabled for this device!');
      return true;
    } catch (err) {
      console.error('Failed to subscribe to web push:', err);
      toast.error(`Subscription failed: ${err.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Unsubscribe from PushManager
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      // 2. Tell backend to remove this device
      const deviceId = getDeviceId();
      await apiClient('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      }).catch(err => {
        console.error('Backend unsubscribe failed:', err);
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
   * Send a test notification to all devices of the current user.
   */
  const sendTest = useCallback(async () => {
    try {
      const result = await apiClient('/api/push/test', { method: 'POST' });
      if (result.sent > 0) {
        toast.success(`Test notification sent to ${result.sent} device(s)!`);
      } else {
        toast.error('No devices received the test notification. Try re-enabling push.');
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
    subscribe,
    unsubscribe,
    sendTest,
    deviceId: isSupported ? getDeviceId() : null,
  };
}
