const CACHE_NAME = 'yavan-trip-v1';
const BASE = new URL('.', self.location.href).href;

const APP_SHELL = [
  '', 'index.html', 'manifest.json', 'icon.svg', 'css/style.css',
  'js/app.js', 'js/util.js', 'js/store.js',
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

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    try {
      const res = await fetch(BASE + 'data/locations.json');
      const data = await res.json();
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const res = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, res.clone());
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
