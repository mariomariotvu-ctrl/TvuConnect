importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase web configuration identifies this public app; authorization remains
// in Firebase Auth, Firestore Rules, and server-side Cloud Functions.
firebase.initializeApp({
  apiKey: 'AIzaSyDbs3U6Meu68Oyi6kcz4v4bKi45TaNnqhQ',
  authDomain: 'tvu-connect-1dc97.firebaseapp.com',
  projectId: 'tvu-connect-1dc97',
  storageBucket: 'tvu-connect-1dc97.firebasestorage.app',
  messagingSenderId: '239699222039',
  appId: '1:239699222039:web:7808d2f8b2d97618d4c652',
});

const messaging = firebase.messaging();

const notificationFor = (data = {}) => {
  const isCall = data.type === 'call';
  const isEncounter = data.type === 'encounter';
  const senderName = data.senderName || data.callerName || data.peerName || 'TVU Connect';
  const title = isEncounter
    ? `Bạn vừa chạm mặt ${senderName}`
    : isCall
      ? `${data.kind === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'} từ ${senderName}`
      : senderName;
  const body = isEncounter
    ? 'Hai bạn đều đã bật cảnh báo chạm mặt. Mở bản đồ để xem lại.'
    : isCall
      ? 'Chạm để mở TVU Connect và nhận cuộc gọi.'
      : (data.body || 'Bạn có tin nhắn mới');
  const tag = isEncounter
    ? `encounter:${data.encounterId || data.peerUid || 'nearby'}`
    : isCall
      ? `call:${data.callId || 'incoming'}`
      : `message:${data.conversationId || 'default'}`;
  const url = isCall
    ? '/'
    : isEncounter
      ? '/explore/people'
      : `/messages/${encodeURIComponent(data.senderUid || '')}`;

  return {
    title,
    options: {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag,
      data: { ...data, url },
      requireInteraction: isCall,
      vibrate: isCall ? [200, 100, 200, 100, 200] : isEncounter ? [120, 80, 120] : [200, 100, 200],
      actions: isCall
        ? [{ action: 'open', title: 'Mở TVU Connect' }, { action: 'close', title: 'Đóng' }]
        : isEncounter
          ? [{ action: 'open', title: 'Xem bản đồ' }, { action: 'close', title: 'Đóng' }]
          : [{ action: 'open', title: 'Mở tin nhắn' }, { action: 'close', title: 'Đóng' }],
    },
  };
};

// Cloud Functions sends data-only notifications so this handler is the one
// place that controls background notification copy and click behaviour.
messaging.onBackgroundMessage((payload) => {
  const { title, options } = notificationFor(payload.data || {});
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const data = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
          return undefined;
        }
      }
      return clients.openWindow ? clients.openWindow(data.url || '/') : undefined;
    }),
  );
});

self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys()
    .then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith('tvu-'))
        .map((cacheName) => caches.delete(cacheName)),
    ))
    .then(() => clients.claim()),
));
self.addEventListener('install', () => self.skipWaiting());
