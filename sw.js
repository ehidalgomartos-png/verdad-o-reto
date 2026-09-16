const CACHE_NAME = 'vr-match-shell-v10';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('vr-match-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/uploads/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  const staticPaths = new Set(APP_SHELL);
  if (staticPaths.has(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok) (await caches.open(CACHE_NAME)).put(req, response.clone());
      return response;
    })());
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title:'V/R Match', body:event.data?.text() || 'Tienes una novedad.' }; }
  const title = payload.title || 'V/R Match';
  const options = {
    body: payload.body || 'Tienes una novedad en V/R Match.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'vr-match',
    renotify: true,
    data: { notificationId:payload.notificationId || '', url:payload.url || '/', payloadData:payload.data || {} }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const info = event.notification.data || {};
  const url = info.url || '/';
  event.waitUntil((async () => {
    const absolute = new URL(url, self.location.origin).href;
    const all = await clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const client of all) {
      if ('focus' in client) {
        if ('navigate' in client && client.url !== absolute) { try { await client.navigate(absolute); } catch {} }
        await client.focus();
        client.postMessage({ type:'VR_NOTIFICATION_CLICK', notificationId:info.notificationId || '' });
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(absolute);
  })());
});
