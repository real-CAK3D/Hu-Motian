// Offline support for the installed phone app (GitHub Pages only; the hub and the ESP32 don't register it).
// The dashboard itself is network-first so updates show up right away; three.js and the 3D characters
// never change, so they're cache-first.
const CACHE = 'humotion-v2';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'ghost.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const fixed = u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'static.poly.pizza' || (u.origin === location.origin && u.pathname.includes('/assets/'));
  if (u.origin !== location.origin && !fixed) return;
  const put = res => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; };
  e.respondWith(fixed
    ? caches.match(r).then(m => m || fetch(r).then(put))
    : fetch(r).then(put).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match(r.url.includes('ghost') ? 'ghost.html' : './') : Response.error()))));
});
