self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title:'V/R Match', body:event.data?.text() || 'Tienes una novedad.' }; }
  const title = payload.title || 'V/R Match';
  const options = {
    body: payload.body || 'Tienes una novedad en V/R Match.',
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
    const all = await clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type:'VR_NOTIFICATION_CLICK', notificationId:info.notificationId || '' });
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
