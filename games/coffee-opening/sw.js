/* Dutch Bros · New Shop Opening Tracker service worker: offline after the first visit. The origin is shared with other games,
   so activate only ever deletes old caches whose key starts with 'coffee-opening-'.
   v4: network-first that really goes to the network. GitHub Pages sends max-age=600, so a plain fetch() could be answered from the
   browser's HTTP cache with the OLD app after a deploy. Navigations and app files (html/js/json/manifest) are fetched with
   cache:'no-cache' (always revalidated), and install bypasses the HTTP cache too. Map tiles are third-party and are never cached here. */
const CACHE = 'coffee-opening-v4';
const ASSETS = ['./', 'index.html', 'data.js', 'app.js', 'three.module.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'leaflet/leaflet.js', 'leaflet/leaflet.css', 'traffic-aadt-2024.json', 'existing-dutch-bros.json', 'competitors.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('coffee-opening-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;   // tiles etc.: straight to the network, not cached
  const nav = req.mode === 'navigate', app = nav || /(\/|\.(html|js|mjs|json|webmanifest))$/.test(url.pathname);
  const net = nav ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : app ? fetch(req, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(net.then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (nav ? caches.match('./').then((x) => x || caches.match('index.html')) : undefined))));
});
