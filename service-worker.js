const CACHE_NAME = 'yavan-trip-v6';
const BASE = new URL('.', self.location.href).href;

const APP_SHELL = [
  '', 'index.html', 'migrate.html', 'manifest.json', 'icon.svg', 'css/style.css',
  'js/vendor/qrcode.js',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/default-itinerary.js',
  'js/views/home.js', 'js/views/map.js', 'js/views/distances.js',
  'js/views/location.js', 'js/views/itinerary.js',
  'data/locations.json', 'data/travel-times.json',
].map((p) => BASE + p);

function collectImageUrls(node, out) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectImageUrls(n, out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'heroImage' && typeof value === 'string') out.push(value);
      if (key === 'images' && Array.isArray(value)) {
        value.forEach((u) => { if (typeof u === 'string') out.push(u); });
      }
      collectImageUrls(value, out);
    }
  }
}

// { cache: 'reload' } forces a real network round-trip, bypassing the browser's ordinary HTTP
// cache — without it, re-populating our own Cache Storage on install could silently pull in
// whatever GitHub Pages already had sitting in the HTTP cache from a previous visit.
function freshFetch(url) {
  return fetch(new Request(url, { cache: 'reload' }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (url) => {
      const res = await freshFetch(url);
      await cache.put(url, res);
    }));

    try {
      const res = await freshFetch(BASE + 'data/locations.json');
      const data = await res.clone().json();
      const imageUrls = [];
      collectImageUrls(data, imageUrls);
      await Promise.allSettled(imageUrls.map(async (url) => {
        try {
          const imgRes = await fetch(url, { mode: 'no-cors' });
          await cache.put(url, imgRes);
        } catch (e) { /* image unreachable, skip */ }
      }));
    } catch (e) { /* locations.json missing, skip image precache */ }

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

// HTML pages: network-first (bypassing HTTP cache too), so a redeployed page is picked up
// immediately while online; falls back to our cache so the app still opens offline.
// Everything else (JS/CSS/JSON/images) is cache-first, since those rarely change and offline
// speed matters more there. All cache reads/writes go through our own named cache explicitly
// (never the global caches.match) so a leftover older-named cache can never be served by mistake.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isDocument) {
      try {
        const res = await freshFetch(event.request.url);
        cache.put(event.request, res.clone());
        return res;
      } catch (e) {
        const cached = await cache.match(event.request);
        return cached || Response.error();
      }
    }

    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      cache.put(event.request, res.clone());
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
