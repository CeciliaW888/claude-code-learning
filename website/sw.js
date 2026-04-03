const CACHE_VERSION = 3;
const CACHE_NAME = `claude-code-learning-v${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
  './diagrams/agent-loop.svg',
  './diagrams/architecture-overview.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name.startsWith('claude-code-learning-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      return cached || fetchPromise || caches.match(OFFLINE_URL);
    })()
  );
});
