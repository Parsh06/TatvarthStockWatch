/**
 * Service Worker for Tatvarth Stock Watch
 *
 * Handles:
 * - Push notifications (display, click, actions)
 * - Push subscription change (auto re-subscribe)
 * - Basic offline caching for app shell
 */

const CACHE_NAME = 'sw-cache-v1';
const APP_URL = 'https://tatvarthstockwatch.web.app';

// ── Push Notification Handler ─────────────────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Tatvarth Stock Watch';
    const options = {
      body: data.body || 'You have a new announcement.',
      icon: '/logo2.png',
      badge: '/logo2.png',
      vibrate: [100, 50, 100],
      // Use tag for deduplication — same tag replaces previous notification
      tag: data.tag || 'default',
      renotify: true,  // Vibrate again even if tag matches an existing notification
      requireInteraction: false,
      data: {
        url: data.url || APP_URL,
        timestamp: Date.now(),
      },
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    // Fallback: show a generic notification
    event.waitUntil(
      self.registration.showNotification('Tatvarth Stock Watch', {
        body: 'You have a new notification.',
        icon: '/logo2.png',
        badge: '/logo2.png',
        data: { url: APP_URL },
      })
    );
  }
});

// ── Notification Click Handler ────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // If user clicked "Dismiss", just close
  if (event.action === 'dismiss') return;

  // URL to open (from notification data, or fallback)
  const urlToOpen = event.notification?.data?.url || APP_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Try to focus an existing tab with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Check if we already have a tab on the same origin
        try {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(urlToOpen);
          if (clientUrl.origin === targetUrl.origin && 'focus' in client) {
            // Navigate existing tab to the notification URL
            client.navigate(urlToOpen);
            return client.focus();
          }
        } catch (e) {
          // URL parsing failed, just check equality
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
      }
      // No existing tab — open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ── Notification Close Handler (analytics) ────────────────────────────────────
self.addEventListener('notificationclose', function(event) {
  // Could send analytics here in the future
});

// ── Push Subscription Change Handler ──────────────────────────────────────────
// Fired when the browser automatically refreshes the push subscription.
// We need to re-subscribe and update the backend.
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW] Push subscription changed, re-subscribing...');

  event.waitUntil(
    (async function() {
      try {
        // Get the VAPID public key from the old subscription's options
        const oldSubscription = event.oldSubscription;
        const newSubscription = event.newSubscription;

        if (newSubscription) {
          // Browser already created a new subscription, just need to update backend
          const deviceId = ''; // We can't access localStorage from SW
          // Instead, we'll post a message to the client to handle re-registration
          const allClients = await clients.matchAll({ type: 'window' });
          for (const client of allClients) {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_CHANGED',
              newSubscription: newSubscription.toJSON(),
            });
          }
        } else if (oldSubscription) {
          // Need to re-subscribe with the same applicationServerKey
          const sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: oldSubscription.options.applicationServerKey,
          });

          // Notify clients to update the backend
          const allClients = await clients.matchAll({ type: 'window' });
          for (const client of allClients) {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_CHANGED',
              newSubscription: sub.toJSON(),
            });
          }
        }
      } catch (e) {
        console.error('[SW] Failed to handle subscription change:', e);
      }
    })()
  );
});

// ── Install: Activate immediately ─────────────────────────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  self.skipWaiting(); // Take control immediately
});

// ── Activate: Claim clients and clean old caches ──────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Take control of all open tabs
      // Clean up any old caches
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) { return name !== CACHE_NAME; })
            .map(function(name) { return caches.delete(name); })
        );
      }),
    ])
  );
});
