const CACHE = 'seraphina-forest-v1';
const ASSETS = [
  './', './index.html', './style.css', './favicon.png', './manifest.webmanifest',
  './js/main.js', './js/game.js', './js/input.js', './js/audio.js', './js/save.js',
  './js/constants.js', './js/sprites.js', './js/map.js', './js/particles.js', './js/font.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
