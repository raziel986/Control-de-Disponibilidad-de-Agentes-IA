/* Service Worker for Agent Availability PWA */
const CACHE_NAME = 'agents-pwa-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/tailwind-mini.css',
  '/script.js',
  '/manifest.json',
  '/api_local.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
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
  // Handle favicon.ico requests gracefully in offline/dev environments
  if (req.url.endsWith('/favicon.ico')) {
    const svgFavicon = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" fill=\"#2c3e50\"/><circle cx=\"16\" cy=\"16\" r=\"8\" fill=\"#fff\"/></svg>`;
    event.respondWith(new Response(svgFavicon, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }));
    return;
  }
  if (req.method !== 'GET') {
    return;
  }
  // Determine if URL is http/https to avoid caching extension schemes
  let isHttp = false;
  try {
    const u = new URL(req.url);
    isHttp = (u.protocol === 'http:' || u.protocol === 'https:');
  } catch (e) {
    isHttp = false;
  }
  if (!isHttp) {
    // Do not cache non-http(s) requests
    event.respondWith(fetch(req));
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((network) => {
        // Cache the new response for future visits (only for http(s))
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
