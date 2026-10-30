const SHELL_CACHE = 'sudal-shell-v2';
const CDN_CACHE = 'sudal-cdn-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './images/logo_transparent-192.png',
  './images/logo_transparent-512.png'
];
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com/',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shellCache = await caches.open(SHELL_CACHE);
    await shellCache.addAll(SHELL_FILES);

    const cdnCache = await caches.open(CDN_CACHE);
    await Promise.all(CDN_ASSETS.map(async (assetUrl) => {
      try {
        const response = await fetch(assetUrl, { mode: 'no-cors' });
        await cdnCache.put(assetUrl, response);
      } catch {
        // CDN assets can still be fetched and cached on the first online visit.
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('sudal-') && name !== SHELL_CACHE && name !== CDN_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const workerUrl = new URL(self.location.href);

  if (requestUrl.origin === workerUrl.origin) {
    if (request.mode === 'navigate') {
      event.respondWith((async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(new URL('./index.html', self.registration.scope), response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(new URL('./index.html', self.registration.scope))) || Response.error();
        }
      })());
      return;
    }

    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  if (CDN_ASSETS.includes(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      await cache.put(request, response.clone());
      return response;
    })());
  }
});