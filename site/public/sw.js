'use strict';

const CACHE_VERSION = '114';
const CACHE_NAME = `wheatmagnatebot-v${CACHE_VERSION}`;
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
      .then(cache => Promise.all(APP_SHELL.map(async url => {
        // A versioned URL cannot be satisfied by an older service worker's
        // canonical cache entry. Store the fresh response under its canonical
        // key so normal page requests still resolve instantly.
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${separator}app-shell=${CACHE_VERSION}`, { cache: 'reload' });
        if (!response.ok) throw new Error(`Could not refresh ${url}: HTTP ${response.status}`);
        await cache.put(url, response);
      })))
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
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(client => {
        // Installed PWAs can remain alive in the background for days. Reload
        // each same-origin window once when the new worker takes control.
        const url = new URL(client.url);
        return url.origin === self.location.origin && typeof client.navigate === 'function'
          ? client.navigate(client.url)
          : null;
      })))
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
      caches.match('/index.html').then(cached => {
        const fresh = fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  if (request.method !== 'GET') return;

  if (['script', 'style', 'worker'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fresh = fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        }).catch(() => cached);
        return cached || fresh;
      })
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
  const accountId = url.searchParams.get('accountId') || null;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const sameOriginClients = clients.filter(item => new URL(item.url).origin === self.location.origin);
    const client = sameOriginClients.find(item => item.visibilityState === 'visible') || sameOriginClients[0];
    if (client) {
      await client.focus();
      client.postMessage({ type: 'open_push_destination', destination, player, accountId });
      return;
    }
    return self.clients.openWindow(url.href);
  }));
});
