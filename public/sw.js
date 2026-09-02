// Service Worker para las notificaciones push de Fantasy Liga Femenina.
// Este archivo debe vivir en la carpeta "public" del proyecto (public/sw.js)
// para que se sirva tal cual en https://tu-app.vercel.app/sw.js

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Fantasy Liga Femenina', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Fantasy Liga Femenina';
  const options = {
    body: data.body || '',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
