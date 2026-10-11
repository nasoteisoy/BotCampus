/* Dutch Bros · New Shop Opening Tracker service worker: offline after the first visit. The origin is shared with other games,
   so activate only ever deletes old caches whose key starts with 'coffee-opening-'.
   v4/v5: network-first that really goes to the network. GitHub Pages sends max-age=600, so a plain fetch() could be answered from the
   browser's HTTP cache with the OLD app after a deploy. Navigations and app files (html/js/json/manifest) are fetched with
   cache:'no-cache' (always revalidated), and install bypasses the HTTP cache too. Map tiles are third-party and are never cached here. */
const CACHE = 'coffee-opening-v5';
const ASSETS = ['./', 'index.html', 'data.js', 'app.js', 'three.module.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'leaflet/leaflet.js', 'leaflet/leaflet.css', 'traffic-aadt-2024.json', 'existing-dutch-bros.json', 'competitors.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
// v5: a page still on v1–v3 has no update code of its own, and its old sw may have served it stale files from the HTTP cache.
// If an old v0–v3 cache is found, the windows that the OLD worker controlled (listed before claim) are asked for their version;
// a window that does not answer within 700 ms is an old page and is reloaded once by this sw. Pages from v5 on answer (and reload
// themselves on controllerchange); fresh visits have no controller and are left alone.
const ask = (c) => new Promise((res) => { try { const ch = new MessageChannel(); const t = setTimeout(() => res(false), 700); ch.port1.onmessage = () => { clearTimeout(t); res(true); }; c.postMessage({ t: 'co-ver?' }, [ch.port2]); } catch (e) { res(false); } });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => {
  const old = ks.filter((k) => k.startsWith('coffee-opening-') && k !== CACHE), legacy = old.some((k) => /^coffee-opening-v[0-3]$/.test(k));
  return (legacy ? self.clients.matchAll({ type: 'window' }) : Promise.resolve([])).then((was) => Promise.all(old.map((k) => caches.delete(k)))
    .then(() => self.clients.claim()).then(() => Promise.all(was.map((c) => ask(c).then((knows) => (knows || !c.navigate ? null : c))))))
    // navigate() is NOT awaited inside waitUntil: the reload's fetch would wait for this activation to finish (deadlock on some devices).
    .then((stale) => { stale.filter(Boolean).forEach((c) => setTimeout(() => c.navigate(c.url).catch(() => {}), 0)); });
})); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;   // tiles etc.: straight to the network, not cached
  const nav = req.mode === 'navigate', app = nav || /(\/|\.(html|js|mjs|json|webmanifest))$/.test(url.pathname);
  const net = nav ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : app ? fetch(req, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(net.then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (nav ? caches.match('./').then((x) => x || caches.match('index.html')) : undefined))));
});
