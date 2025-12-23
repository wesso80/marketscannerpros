// MarketScanner Pros Service Worker
// Handles push notifications and caching

const CACHE_NAME = 'msp-v1';

self.addEventListener('install', () => {
  console.log('[SW] Installing service worker');
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  console.log('[SW] Service worker activated');
  self.clients.claim();
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'MarketScanner Alert',
    body: 'You have a new alert',
    icon: '/logo.png',
    badge: '/badge.png',
    tag: 'msp-alert',
    data: {}
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/logo.png',
    badge: data.badge || '/badge.png',
    tag: data.tag || 'msp-alert',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'view', title: '📊 View Alert' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ],
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Default action or 'view' action - open the app
  const urlToOpen = event.notification.data?.url || '/tools/scanner';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes('marketscannerpros.app') && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Open a new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle fetch for offline support (basic)
self.addEventListener('fetch', (event) => {
  // Pass through for API requests
  if (event.request.url.includes('/api/')) {
    return;
  }
});