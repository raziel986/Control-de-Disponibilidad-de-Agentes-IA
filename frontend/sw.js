/* Service Worker for Agent Availability PWA */
const CACHE_NAME = 'agents-pwa-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/frontend/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/frontend/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((network) => {
        // Cache the new response for future visits
        if (network && network.status === 200) {
          const clone = network.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return network;
      }).catch(() => {
        // Fallback for offline: return a generic offline response for JSON requests
        if (req.headers.get('accept')?.includes('application/json')) {
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
