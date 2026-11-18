// Hand-written service worker: caches the app shell so Stock & Foil works offline after the first visit.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'sf-' + VERSION;
const SHELL = ['./', './index.html', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(SHELL);
      // Pre-cache every built chunk (all pages, the scanner worker, styles) listed by the build.
      try {
        const list = await (await fetch('./assets-manifest.json', { cache: 'no-store' })).json();
        await cache.addAll(list);
      } catch (e) { /* the assets are cached on first use instead */ }
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sf-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other origins (AI endpoints etc.)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: url.pathname.endsWith('sw.js') }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
