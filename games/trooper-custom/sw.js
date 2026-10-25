// Trooper Customizer service worker: cache-first for this game's own files only.
const CACHE = 'trooper-custom-v16';   // v16: breadcrumb crumbs shrink so the tab name fits on a landscape phone; v15: gear works in Combat/Team (arena-gear.js), taken-out fall in the arenas, labeled HUD; v14: award removed, labeled stats, Back + Done, gear demos, taken-out fall; v13: js/section.js (?section= deep link for Army HQ); v12: stats.js/schema.js ?v=8 (match Conquest); v11: main.js dirty-flag + merge-on-write army save (v10: stats.js MAGS)
const ASSETS = [
  './', './index.html', './css/style.css?v=9', './js/main.js?v=9', './js/section.js?v=1', './js/trooper.js?v=7', './js/tank.js?v=7', './js/cost.js?v=8', './js/templates.js?v=7',
  './vendor/three.module.min.js?v=6', './vendor/addons/controls/OrbitControls.js?v=6',
  './icon.svg?v=7', './manifest.webmanifest?v=7',
  '../shared/army/stats.js?v=9', '../shared/army/schema.js?v=9',
  './demo.html', './css/demo.css?v=8', './js/demo.js?v=8', './js/demo-rig.js?v=8', './js/demo-fx.js?v=8', './js/demo-actions.js?v=8', './js/army-data.js?v=8',
  './combat.html', './team.html', './css/arena.css?v=8', './js/arena.js?v=8', './js/arena-ui.js?v=8', './js/combat.js?v=8', './js/team.js?v=8', './js/arena-gear.js?v=8', './js/page-chrome.js?v=1',
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
