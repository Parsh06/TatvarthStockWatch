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

const CACHE_NAME = 'stockwatch-sw-v2';
const APP_URL = 'https://tatvarthstockwatch.web.app';
const APP_ORIGIN = new URL(APP_URL).origin;

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

    // Only allow URLs belonging to StockWatch.
    if (url.origin !== APP_ORIGIN) {
      return APP_URL;
    }

    return url.href;
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
          action: 'view',
          title: 'View IPO',
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
          action: 'view',
          title: 'View',
        },
        {
          action: 'open-company',
          title: 'Company',
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

  const url = sanitizeUrl(
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

    icon: getNotificationIcon(type),

    badge: '/logo2.png',

    tag: buildNotificationTag(data, type),

    renotify: priorityConfig.renotify,

    requireInteraction: priorityConfig.requireInteraction,

    vibrate: priorityConfig.vibrate,

    timestamp:
      data?.timestamp ||
      data?.createdAt ||
      Date.now(),

    actions: getNotificationActions(type),

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

  let targetUrl = APP_URL;

  switch (event.action) {
    case 'dismiss':
      return;

    case 'open-company':
      targetUrl =
        notificationData.companyUrl ||
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

    case 'view':
    default:
      targetUrl =
        notificationData.url ||
        APP_URL;
      break;
  }

  targetUrl = sanitizeUrl(targetUrl);

  event.waitUntil(
    (async function() {
      try {
        const windowClients = await clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });

        const target = new URL(targetUrl);

        // Prefer an existing StockWatch tab.
        for (const client of windowClients) {
          try {
            const clientUrl = new URL(client.url);

            if (
              clientUrl.origin === APP_ORIGIN &&
              'focus' in client
            ) {
              if ('navigate' in client) {
                await client.navigate(target.href);
              }

              await client.focus();

              return;
            }
          } catch (error) {
            console.warn(
              '[SW] Unable to process existing client:',
              error
            );
          }
        }

        // No existing application window.
        if (clients.openWindow) {
          await clients.openWindow(target.href);
        }
      } catch (error) {
        console.error(
          '[SW] Failed to handle notification click:',
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
