/**
 * Service Worker for Tatvarth Stock Watch
 *
 * Handles:
 * - Rich push notifications
 * - Notification types, priorities & contextual actions
 * - Secure notification URL routing
 * - Notification click handling
 * - Push subscription changes
 * - Service Worker lifecycle management
 * - Cache version management
 */

const CACHE_NAME = 'stockwatch-sw-v5';
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/logo2.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-dark.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/icon-monochrome.png',
  '/manifest.json',
  '/manifest-dark.json',
];
const APP_ORIGIN = self.location.origin;
const APP_URL = self.location.origin;

// ─────────────────────────────────────────────────────────────────────────────
// Notification Configuration
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFICATION_TYPES = {
  announcement: {
    icon: '/logo2.png',
    defaultTitle: 'Market Announcement',
  },
  result: {
    icon: '/logo2.png',
    defaultTitle: 'Financial Results',
  },
  boardMeeting: {
    icon: '/logo2.png',
    defaultTitle: 'Board Meeting',
  },
  agm: {
    icon: '/logo2.png',
    defaultTitle: 'AGM / EGM Update',
  },
  corporateAction: {
    icon: '/logo2.png',
    defaultTitle: 'Corporate Action',
  },
  insiderTrading: {
    icon: '/logo2.png',
    defaultTitle: 'Insider Trading',
  },
  deal: {
    icon: '/logo2.png',
    defaultTitle: 'Bulk / Block Deal',
  },
  ipo: {
    icon: '/logo2.png',
    defaultTitle: 'IPO Update',
  },
  general: {
    icon: '/logo2.png',
    defaultTitle: 'StockWatch Update',
  },
  'admin-approval': {
    icon: '/logo2.png',
    defaultTitle: 'Admin Approval Request',
  },
};

const PRIORITY_CONFIG = {
  critical: {
    vibrate: [200, 100, 200, 100, 300],
    renotify: true,
    requireInteraction: true,
  },

  high: {
    vibrate: [150, 75, 150],
    renotify: true,
    requireInteraction: false,
  },

  normal: {
    vibrate: [100, 50, 100],
    renotify: false,
    requireInteraction: false,
  },

  low: {
    vibrate: [],
    renotify: false,
    requireInteraction: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parsePushData(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch (jsonError) {
    try {
      return {
        body: event.data.text(),
      };
    } catch (textError) {
      console.error('[SW] Unable to parse push payload:', textError);
      return {};
    }
  }
}

function normalizePriority(priority) {
  const value = String(priority || 'normal').toLowerCase();

  return PRIORITY_CONFIG[value]
    ? value
    : 'normal';
}

function getNotificationType(data) {
  const type = String(data?.type || 'announcement');

  return NOTIFICATION_TYPES[type]
    ? type
    : 'announcement';
}

function getNotificationIcon(type) {
  return NOTIFICATION_TYPES[type]?.icon || '/logo2.png';
}

function sanitizeUrl(rawUrl) {
  if (!rawUrl) return APP_URL;

  try {
    const url = new URL(rawUrl, APP_URL);

    // Allow all valid HTTP and HTTPS document/page URLs (including external PDF links e.g. BSE/NSE)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }

    return APP_URL;
  } catch (error) {
    return APP_URL;
  }
}

function buildNotificationTag(data, type) {
  if (data?.tag) {
    return String(data.tag);
  }

  const announcementId =
    data?.announcementId ||
    data?.announcement?.id;

  const companyCode =
    data?.company?.bseCode ||
    data?.company?.code ||
    data?.companyCode;

  if (announcementId) {
    return `${type}-${announcementId}`;
  }

  if (companyCode) {
    return `${type}-${companyCode}`;
  }

  return `${type}-${Date.now()}`;
}

function getNotificationTitle(data, type) {
  if (data?.title) {
    return String(data.title);
  }

  const companyName =
    data?.company?.name ||
    data?.companyName;

  const exchange =
    data?.company?.exchange ||
    data?.exchange;

  const category =
    data?.announcement?.subCategory ||
    data?.announcement?.category ||
    data?.category;

  if (companyName && category && exchange) {
    return `${companyName} • ${exchange} • ${category}`;
  }

  if (companyName && category) {
    return `${companyName} • ${category}`;
  }

  if (companyName && exchange) {
    return `${companyName} • ${exchange}`;
  }

  if (companyName) {
    return companyName;
  }

  return NOTIFICATION_TYPES[type]?.defaultTitle || 'Tatvarth Stock Watch';
}

function getNotificationBody(data) {
  if (data?.body) {
    return String(data.body);
  }

  if (data?.announcement?.summary) {
    return String(data.announcement.summary);
  }

  if (data?.summary) {
    return String(data.summary);
  }

  if (data?.announcement?.subject) {
    return String(data.announcement.subject);
  }

  return 'You have a new market update.';
}

function getNotificationActions(type) {
  switch (type) {
    case 'ipo':
      return [
        {
          action: 'check-ipo',
          title: 'Check Allotment',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ];

    case 'admin-approval':
      return [
        {
          action: 'review-user',
          title: 'Review & Approve',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ];

    case 'announcement':
    case 'result':
    case 'boardMeeting':
    case 'agm':
    case 'corporateAction':
    case 'insiderTrading':
    case 'deal':
      return [
        {
          action: 'view-pdf',
          title: 'Open Document',
        },
        {
          action: 'view',
          title: 'View',
        },
      ];

    default:
      return [
        {
          action: 'view',
          title: 'View',
        },
      ];
  }
}

function buildNotification(data) {
  const type = getNotificationType(data);
  const priority = normalizePriority(data?.priority);
  const priorityConfig = PRIORITY_CONFIG[priority];

  const pdfUrl = data?.pdfUrl || data?.announcement?.pdfUrl || data?.announcement?.pdf_url || null;

  const url = sanitizeUrl(
    pdfUrl ||
    data?.url ||
    data?.announcement?.url ||
    '/'
  );

  const companyUrl = sanitizeUrl(
    data?.company?.url ||
    data?.companyUrl ||
    url
  );

  const ipoUrl = sanitizeUrl(
    data?.ipoUrl ||
    '/ipo-verification'
  );

  return {
    title: getNotificationTitle(data, type),

    body: getNotificationBody(data),

    icon: data?.icon || getNotificationIcon(type) || '/logo2.png',

    badge: '/logo2.png',

    tag: buildNotificationTag(data, type),

    renotify: priorityConfig.renotify,

    requireInteraction: priorityConfig.requireInteraction,

    vibrate: priorityConfig.vibrate,

    timestamp:
      data?.timestamp ||
      data?.createdAt ||
      Date.now(),

    actions: data?.actions || getNotificationActions(type),

    data: {
      version: data?.version || 2,

      type,

      priority,

      notificationId:
        data?.notificationId ||
        null,

      announcementId:
        data?.announcementId ||
        data?.announcement?.id ||
        null,

      companyCode:
        data?.company?.bseCode ||
        data?.company?.code ||
        data?.companyCode ||
        null,

      companyName:
        data?.company?.name ||
        data?.companyName ||
        null,

      symbol:
        data?.company?.symbol ||
        data?.symbol ||
        null,

      exchange:
        data?.company?.exchange ||
        data?.exchange ||
        null,

      category:
        data?.announcement?.category ||
        data?.category ||
        null,

      subCategory:
        data?.announcement?.subCategory ||
        data?.subCategory ||
        null,

      pdfUrl: pdfUrl ? sanitizeUrl(pdfUrl) : null,

      url,

      companyUrl,

      ipoUrl,

      timestamp: Date.now(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Push Notification Handler
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('push', function(event) {
  event.waitUntil(
    (async function() {
      try {
        const data = parsePushData(event);

        // Ignore completely empty push messages.
        if (!data || Object.keys(data).length === 0) {
          return;
        }

        const notification = buildNotification(data);

        await self.registration.showNotification(
          notification.title,
          notification
        );
      } catch (error) {
        console.error(
          '[SW] Error displaying push notification:',
          error
        );

        try {
          await self.registration.showNotification(
            'Tatvarth Stock Watch',
            {
              body: 'You have a new notification.',
              icon: '/logo2.png',
              badge: '/logo2.png',
              tag: `stockwatch-fallback-${Date.now()}`,
              data: {
                version: 2,
                url: APP_URL,
                timestamp: Date.now(),
              },
              actions: [
                {
                  action: 'view',
                  title: 'View',
                },
              ],
            }
          );
        } catch (fallbackError) {
          console.error(
            '[SW] Failed to display fallback notification:',
            fallbackError
          );
        }
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification Click Handler
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const notificationData =
    event.notification?.data || {};

  if (event.action === 'dismiss') {
    return;
  }

  // Priority 1: pdfUrl if present, otherwise url
  let targetUrl = notificationData.pdfUrl || notificationData.url || APP_URL;

  switch (event.action) {
    case 'open-company':
      targetUrl =
        notificationData.companyUrl ||
        notificationData.pdfUrl ||
        notificationData.url ||
        APP_URL;
      break;

    case 'check-ipo':
    case 'view_ipo':
      targetUrl =
        notificationData.ipoUrl ||
        notificationData.url ||
        '/ipo-verification';
      break;

    case 'review-user':
      targetUrl =
        notificationData.url ||
        '/admin?tab=users&filter=pending';
      break;

    case 'view-pdf':
    case 'view':
    default:
      targetUrl =
        notificationData.pdfUrl ||
        notificationData.url ||
        APP_URL;
      break;
  }

  targetUrl = sanitizeUrl(targetUrl);

  event.waitUntil(
    (async function() {
      try {
        // Open the document / target URL directly in a new tab
        if (clients.openWindow) {
          await clients.openWindow(targetUrl);
        }
      } catch (error) {
        console.error(
          '[SW] Failed to open notification PDF/URL in new tab:',
          error
        );

        if (clients.openWindow) {
          await clients.openWindow(APP_URL);
        }
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification Close Handler
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('notificationclose', function(event) {
  try {
    const data = event.notification?.data || {};

    console.log(
      '[SW] Notification closed:',
      data.notificationId || data.announcementId || 'unknown'
    );

    // Analytics can be added here later.
    // Do not perform blocking network requests.
  } catch (error) {
    console.error(
      '[SW] Notification close handler error:',
      error
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Push Subscription Change Handler
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('pushsubscriptionchange', function(event) {
  console.log(
    '[SW] Push subscription changed, synchronizing...'
  );

  event.waitUntil(
    (async function() {
      try {
        const oldSubscription =
          event.oldSubscription;

        const newSubscription =
          event.newSubscription;

        let subscription =
          newSubscription;

        // Some browsers provide the new subscription automatically.
        if (!subscription && oldSubscription) {
          const applicationServerKey =
            oldSubscription.options?.applicationServerKey;

          if (!applicationServerKey) {
            console.warn(
              '[SW] Missing applicationServerKey; client re-registration required.'
            );
          } else {
            subscription =
              await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
              });
          }
        }

        if (!subscription) {
          console.warn(
            '[SW] No new subscription available.'
          );
          return;
        }

        const subscriptionJson =
          subscription.toJSON();

        const allClients =
          await clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });

        // Notify every open StockWatch client.
        for (const client of allClients) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            newSubscription: subscriptionJson,
          });
        }

        console.log(
          '[SW] Subscription change sent to',
          allClients.length,
          'client(s).'
        );
      } catch (error) {
        console.error(
          '[SW] Failed to handle subscription change:',
          error
        );
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Install
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('install', function(event) {
  console.log('[SW] Installing:', CACHE_NAME);

  event.waitUntil(
    (async function() {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL_ASSETS);
      } catch (err) {
        console.warn('[SW] App shell precache notice:', err.message);
      }
      self.skipWaiting();
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating:', CACHE_NAME);

  event.waitUntil(
    (async function() {
      try {
        await self.clients.claim();

        const cacheNames =
          await caches.keys();

        await Promise.all(
          cacheNames
            .filter(function(name) {
              return name !== CACHE_NAME;
            })
            .map(function(name) {
              return caches.delete(name);
            })
        );

        console.log(
          '[SW] Activated successfully:',
          CACHE_NAME
        );
      } catch (error) {
        console.error(
          '[SW] Activation error:',
          error
        );
      }
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Fetch — Offline Shell & Stale-While-Revalidate for Static Assets
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Strict Bypass: NEVER intercept API calls, Firebase/Google auth, or non-GET requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken')
  ) {
    return;
  }

  // 2. Navigation Requests: Network-First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async function() {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          throw err;
        }
      })()
    );
    return;
  }

  // 3. Static Assets (Scripts, Styles, Fonts, Icons): Stale-While-Revalidate
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
     url.pathname.endsWith('.js') ||
     url.pathname.endsWith('.css') ||
     url.pathname.endsWith('.png') ||
     url.pathname.endsWith('.svg') ||
     url.pathname.endsWith('.woff2'))
  ) {
    event.respondWith(
      (async function() {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(function() {
          // Silent swallow on fetch fail if we have cached response
        });

        return cachedResponse || fetchPromise;
      })()
    );
    return;
  }
});
