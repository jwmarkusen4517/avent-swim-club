const CACHE_NAME = 'avent-v1';
const STATIC_ASSETS = [
  '/',
  '/src/css/reset.css',
  '/src/css/tokens.css',
  '/src/css/layout.css',
  '/src/css/chat.css',
  '/src/css/auth.css',
  '/src/css/animations.css',
  '/src/js/app.js',
  '/src/js/session.js',
  '/src/js/auth.js',
  '/src/js/chat.js',
  '/src/js/api.js',
  '/src/js/workout.js',
  '/src/js/storage.js',
  '/src/js/utils.js',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: network-first, no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'No connection.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/'));
    })
  );
});
