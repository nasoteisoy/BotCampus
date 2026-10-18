/* Front Line Defense service worker: offline after the first visit. The origin is shared with the other BotCampus games,
   so activate only ever deletes old caches whose key starts with 'front-line-defense-'.
   Network-first that really goes to the network: GitHub Pages sends max-age=600, so app files and navigations are fetched with
   cache:'no-cache' (always revalidated), and install bypasses the HTTP cache too. */
const CACHE = 'front-line-defense-v1';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'css/style.css', 'css/examiner.css', 'css/fld.css',
  'js/main.js', 'js/config.js', 'js/map.js', 'js/nav.js', 'js/particles.js', 'js/models.js', 'js/icons.js', 'js/badges.js', 'js/examiner.js',
  'vendor/three.module.min.js', 'vendor/addons/controls/MapControls.js', 'vendor/addons/controls/OrbitControls.js', 'vendor/addons/utils/BufferGeometryUtils.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('front-line-defense-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const nav = req.mode === 'navigate', app = nav || /(\/|\.(html|js|mjs|css|json|webmanifest))$/.test(url.pathname);
  const net = nav ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : app ? fetch(req, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(net.then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (nav ? caches.match('./').then((x) => x || caches.match('index.html')) : undefined))));
});
