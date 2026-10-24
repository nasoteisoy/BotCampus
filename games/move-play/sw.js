// Move & Play hub service worker. Cache "move-play-v5" holds ONLY files under this folder's URL prefix
// (games/move-play/); it never touches requests for other games or other sites. Network first, cache as offline fallback.
const CACHE = 'move-play-v5';
const PREFIX = new URL('./', self.location.href).href;
const SHELL = ['./', 'index.html', 'hub.css?v=3', 'hub.js?v=2', 'hubcam.js?v=3', 'js/body.js', 'js/multi.js', 'js/track.js', 'js/lockui.js', 'js/cam.js', 'js/view.js', 'js/dwell.js', 'js/hands.js', 'js/menu.js', 'js/demo.js', 'js/draw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new URL(u, PREFIX).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // only clean up our own older caches (move-play-*), never anyone else's
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('move-play-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(PREFIX)) return; // prefix-only
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match(new URL('./', PREFIX).href)))
  );
});
