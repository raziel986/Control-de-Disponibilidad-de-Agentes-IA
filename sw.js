/* ============================================================
   Service Worker — Agent Availability PWA
   Strategy: Cache-First for assets, Network-First for navigation
   ============================================================ */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `agents-pwa-${CACHE_VERSION}`;

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/api_local.js',
  '/lib/dexie.min.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/logo.png'
];

// --- Install: pre-cache all static assets ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// --- Activate: clean up old caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('agents-pwa-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// --- Fetch: Cache-First with network fallback ---
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Handle favicon.ico gracefully
  if (req.url.endsWith('/favicon.ico')) {
    const svgFavicon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#1e3a5f"/>
  <circle cx="16" cy="16" r="7" fill="white" opacity=".9"/>
  <circle cx="16" cy="16" r="3" fill="#3b82f6"/>
</svg>`;
    event.respondWith(
      new Response(svgFavicon, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' }
      })
    );
    return;
  }

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Only cache http/https requests
  let isHttp = false;
  try {
    const u = new URL(req.url);
    isHttp = u.protocol === 'http:' || u.protocol === 'https:';
  } catch { isHttp = false; }

  if (!isHttp) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (req.headers.get('accept')?.includes('application/json')) {
          return new Response(
            JSON.stringify({ error: 'Sin conexión', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // For navigation requests, try to serve index.html from cache
        if (req.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
