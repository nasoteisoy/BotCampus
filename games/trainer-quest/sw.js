/* Trainer Quest service worker: precache the game + the shared Trainers data/engine/wiki it loads. */
const CACHE = 'trainer-quest-v2';
const ASSETS = ['./', 'index.html', 'core.js', 'ui.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  '../trainers/doctrine.js', '../trainers/game.js', '../trainers/wiki.html', '../trainers/wiki.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('trainer-quest-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // network first (fresh after deploys), cache fallback offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
