/**
 * Legacy cleanup worker.
 *
 * Older TVU Connect builds registered this file at the root scope while the
 * application also registered firebase-messaging-sw.js. Keeping this tiny
 * worker for one release lets existing installations remove stale caches and
 * unregister the obsolete worker instead of continuing to serve an old SPA.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('tvu-'))
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((windowClients) => Promise.all(windowClients.map((client) => (
        typeof client.navigate === 'function'
          ? client.navigate(client.url).catch(() => undefined)
          : undefined
      )))),
  );
});
