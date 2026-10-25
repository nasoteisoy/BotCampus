// Trooper Customizer service worker: cache-first for this game's own files only.
const CACHE = 'trooper-custom-v12';   // v12: stats.js/schema.js ?v=8 (match Conquest); v11: main.js dirty-flag + merge-on-write army save (v10: stats.js MAGS)
const ASSETS = [
  './', './index.html', './css/style.css?v=7', './js/main.js?v=8', './js/trooper.js?v=6', './js/tank.js?v=6', './js/cost.js?v=7', './js/templates.js?v=6',
  './vendor/three.module.min.js?v=6', './vendor/addons/controls/OrbitControls.js?v=6',
  './icon.svg?v=7', './manifest.webmanifest?v=7',
  '../shared/army/stats.js?v=8', '../shared/army/schema.js?v=8',
  './demo.html', './css/demo.css?v=7', './js/demo.js?v=7', './js/demo-rig.js?v=7', './js/demo-fx.js?v=7', './js/demo-actions.js?v=7', './js/army-data.js?v=7',
  './combat.html', './team.html', './css/arena.css?v=7', './js/arena.js?v=7', './js/arena-ui.js?v=7', './js/combat.js?v=7', './js/team.js?v=7',
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
