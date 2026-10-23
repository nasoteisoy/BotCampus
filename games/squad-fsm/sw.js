// Squad FSM service worker: network-first, cache fallback. Only touches caches named squad-fsm-*.
const CACHE = 'squad-fsm-v1';
const CORE = ['./', './index.html', './css/style.css?v=1', './js/main.js?v=1', './js/data.js', './js/sim.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => fetch(new Request(u, { cache: 'no-cache' })).then(r => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('squad-fsm-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); } return r; })
    .catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
