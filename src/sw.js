// Makes Wellwise installable, so it can appear in the phone's share menu. Pages load from the network first.
const CACHE = 'wellwise-v4';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/icon.svg', '/manifest.webmanifest']))); self.skipWaiting() });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim() });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && (u.pathname === '/' || u.pathname === '/index.html')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)) } return r }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});
