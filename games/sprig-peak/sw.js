const CACHE = 'sprig-peak-r4e';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './favicon.png',
  './js/main.js',
  './js/game.js',
  './js/input.js',
  './js/audio.js',
  './js/save.js',
  './js/constants.js',
  './js/particles.js',
  './js/level1.js',
  './art/palette.js',
  './art/sprites.js',
  './art/tiles.js',
  './audio/synth.js',
  './assets/player.png',
  './assets/enemy-walker.png',
  './assets/enemy-flyer.png',
  './assets/enemy-shooter.png',
  './assets/tiles-forest.png',
  './assets/hazards.png',
  './assets/pickups.png',
  './assets/ui-icons.png',
  './assets/ui-icons.json',
  './assets/logo.png',
  './assets/particles.png',
  './assets/critters.png',
  './assets/projectile.png',
  './assets/rotate.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});
