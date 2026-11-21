/* 용돈 챌린지 — service worker (오프라인 캐시) */
const CACHE = 'allowance-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase 등 외부 요청은 그대로

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((r) => {
          if (r && r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return r;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
