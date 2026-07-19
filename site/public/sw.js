'use strict';

const CACHE_NAME = 'wheatmagnatebot-v94';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/theme-init.js',
  '/app.js',
  '/manifest.webmanifest',
  '/items/Wheat.png',
  '/items/Writable_Book.png',
  '/items/Icon_Search.png',
  '/items/Sunflower.png',
  '/items/Moon.png',
  '/items/Firework_Rocket.png',
  '/items/Lead.png',
  '/items/Muted.png',
  '/items/Unmuted.png',
  '/logos/namemc_dark.png',
  '/logos/reply.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (request.method !== 'GET') return;

  if (['script', 'style', 'worker'].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
  const title = String(payload.title || 'WheatMagnateBot alert').slice(0, 80);
  const options = {
    body: String(payload.body || 'Open the dashboard for details.').slice(0, 160),
    icon: payload.icon || '/items/Wheat.png',
    badge: payload.badge || '/items/Wheat.png',
    tag: String(payload.tag || 'wheatmagnate-alert').slice(0, 128),
    data: { url: String(payload.data?.url || '/').startsWith('/') ? payload.data.url : '/' },
    requireInteraction: Boolean(payload.requireInteraction)
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  const destination = url.searchParams.get('push') || 'settings';
  const player = url.searchParams.get('player') || null;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const sameOriginClients = clients.filter(item => new URL(item.url).origin === self.location.origin);
    const client = sameOriginClients.find(item => item.visibilityState === 'visible') || sameOriginClients[0];
    if (client) {
      await client.focus();
      client.postMessage({ type: 'open_push_destination', destination, player });
      return;
    }
    return self.clients.openWindow(url.href);
  }));
});
