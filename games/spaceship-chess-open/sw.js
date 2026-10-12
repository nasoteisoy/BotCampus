const PREFIX = 'spaceship-chess-open-';
const CACHE = PREFIX + 'v1';
/* Offline cache. The origin is shared with other apps (incl. games/spaceship-chess): activate deletes ONLY old caches
   that start with PREFIX. RELEASE RULE: bump the version in CACHE on every release. */
const ASSETS = ['./', 'index.html', 'style.css', 'rules.js', 'ai-worker.js', 'app.js', 'three.module.min.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
