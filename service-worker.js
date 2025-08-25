console.log('service-worker.js: Loaded');

const VERSION = Date.now();
const CACHE_NAME = `flexgig-${VERSION}`;
const urlsToCache = [
  '/',
  '/frontend/index.html',
  '/frontend/js/main.js',
  '/frontend/styles/main.css',
  '/frontend/pwa/manifest.json',
  '/frontend/pwa/apple-touch-icon-180x180.png',
  '/frontend/pwa/logo-192x192.png',
  '/frontend/pwa/logo-512x512.png',
  '/frontend/pwa/favicon.ico',
  '/frontend/pwa/logo.svg',
  '/frontend/html/dashboard.html',
  '/img/your-image1.png',
  '/img/your-image2.png',
];

self.addEventListener('install', (event) => {
  console.log('service-worker.js: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('service-worker.js: Caching assets:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('service-worker.js: Cache error:', err))
  );
});

self.addEventListener('activate', (event) => {
  console.log('service-worker.js: Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      console.log('service-worker.js: Old caches deleted');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('___vscode_livepreview_injected_script') ||
    event.request.method !== 'GET'
  ) {
    console.log(`service-worker.js: Bypassing cache for: ${url}`);
    event.respondWith(fetch(event.request));
    return;
  }
  console.log('service-worker.js: Fetch event:', url);
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          console.log(`service-worker.js: Serving from cache: ${url}`);
          return response;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
                console.log(`service-worker.js: Cached new resource: ${url}`);
              });
            }
            return networkResponse;
          })
          .catch((err) => {
            console.error('service-worker.js: Fetch error:', err);
            return caches.match('/frontend/index.html');
          })
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});