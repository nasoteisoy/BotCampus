// Ship Sandbox service worker: network-first (no-cache), offline fallback to cache.
const CACHE = 'ship-sandbox-v3c';
const PREFIX = 'ship-sandbox-';
const CORE = ['./', 'index.html', 'css/style.css?v=3c', 'js/main.js?v=3c', 'js/config.js?v=3c', 'js/icons.js?v=3c', 'js/particles.js?v=3c', 'js/army.js?v=3c',
  'vendor/three.module.min.js', 'vendor/addons/controls/OrbitControls.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'no-cache' })))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
