const CACHE_NAME = 'novafetch-shell-v3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip chrome-extension:// or non-HTTP(S) requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // API endpoints: network only, never cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'You are currently offline. Please check your network connection.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  const isStaticAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.includes('/assets/');

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // If a JS/CSS file was cached with invalid text/html content-type, discard bad cache
        const contentType = cachedResponse.headers.get('content-type') || '';
        if (isStaticAsset && contentType.includes('text/html')) {
          console.warn('[SW] Purging corrupted text/html asset cache for:', url.pathname);
          return fetch(event.request);
        }
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
