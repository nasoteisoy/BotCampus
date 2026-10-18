// Trooper Customizer service worker: cache-first for this game's own files only.
const CACHE = 'trooper-custom-v2';
const ASSETS = [
  './', './index.html', './css/style.css?v=2', './js/main.js?v=2', './js/trooper.js?v=2', './js/tank.js?v=2',
  './vendor/three.module.min.js?v=2', './vendor/addons/controls/OrbitControls.js?v=2',
  './icon.svg?v=2', './manifest.webmanifest?v=2',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // only ever remove OUR old caches (other games share this origin)
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('trooper-custom-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && new URL(req.url).pathname.startsWith(new URL(self.registration.scope).pathname)) c.put(req, res.clone());
    return res;
  }))));
});
