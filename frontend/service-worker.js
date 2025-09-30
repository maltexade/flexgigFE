console.log('service-worker.js: Loaded');

const CACHE_NAME = 'flexgig-v1'; // 🚀 BUMP THIS ON EACH DEPLOY (e.g., v2, v3)
const APP_VERSION = '1.0.0'; // Match in dashboard.js

const urlsToCache = [
  '/',
  'frontend/index.html',
  `frontend/js/main.js?v=${APP_VERSION}`, // Versioned for busting
  `frontend/styles/main.css?v=${APP_VERSION}`,
  `frontend/pwa/manifest.json?v=${APP_VERSION}`,
  'frontend/pwa/apple-touch-icon-180x180.png',
  'frontend/pwa/logo-192x192.png',
  'frontend/pwa/logo-512x512.png',
  'frontend/pwa/favicon.ico',
  'frontend/pwa/logo.svg',
  `frontend/html/dashboard.html?v=${APP_VERSION}`,
  // Add dashboard.js/CSS if needed: `dashboard.js?v=${APP_VERSION}`
];

self.addEventListener('install', (event) => {
  console.log('service-worker.js: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('service-worker.js: Caching assets with version', APP_VERSION);
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('service-worker.js: Cache error:', err))
  );
  // Force immediate activation
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('service-worker.js: Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('service-worker.js: Deleting old cache', name); // 🚀 Logs cache bust
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('service-worker.js: Old caches deleted - ready for new version');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Skip caching for auth routes and external scripts
  if (url.pathname.startsWith('/auth/') || url.pathname.includes('___vscode_livepreview_injected_script')) {
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
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache); // 🚀 Cache new version in bg
            });
            return networkResponse;
          })
          .catch((err) => {
            console.error('service-worker.js: Fetch error:', err);
            return caches.match('/index.html'); // Fallback to index.html for offline
          })
      })
  );
});

// Optional: Push notifications for urgent updates (e.g., downtime alerts)
// self.addEventListener('push', (event) => {
//   const options = { body: event.data ? event.data.text() : 'FlexGig Update Available', icon: '/frontend/pwa/logo-192x192.png' };
//   event.waitUntil(self.registration.showNotification('FlexGig Update', options));
// });