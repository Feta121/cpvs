// CPVS service worker.
//
// This intentionally does NOT implement a `push` event handler — true Web
// Push (notifications that arrive even when every tab is fully closed)
// requires a VAPID key pair and a server component that calls the Push API
// on behalf of the app, which is a much larger backend addition. What's
// implemented here covers the requested scope precisely: notifications that
// arrive while the site is open in another tab or minimized, via
// registration.showNotification() called from the page itself (see
// src/utils/pushNotifications.ts) after detecting a new row through Supabase
// Realtime. This file's job is just to make those notifications behave like
// real OS notifications once shown — specifically, handling clicks on them.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a CPVS tab is already open, focus it and tell it where to
      // navigate (the app listens for this message and uses its router,
      // rather than a full page reload).
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', url: targetUrl });
          return client.focus();
        }
      }
      // No tab open at all — open a fresh one directly to the target page.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
