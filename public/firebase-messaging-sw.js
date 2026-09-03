// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config - Updated with actual project config
const firebaseConfig = {
  apiKey: "AIzaSyDbs3U6Meu68Oyi6kcz4v4bKi45TaNnqhQ",
  authDomain: "tvu-connect-1dc97.firebaseapp.com",
  projectId: "tvu-connect-1dc97",
  storageBucket: "tvu-connect-1dc97.firebasestorage.app",
  messagingSenderId: "239699222039",
  appId: "1:239699222039:web:7808d2f8b2d97618d4c652"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const { notification, data } = payload;
  
  const notificationTitle = notification?.title || 'TVU Connect';
  const notificationOptions = {
    body: notification?.body || 'Bạn có tin nhắn mới',
    icon: notification?.icon || '/logo.png',
    badge: '/logo.png',
    tag: data?.conversationId || 'default',
    data: {
      type: data?.type || 'message',
      conversationId: data?.conversationId,
      senderId: data?.senderId,
      messageId: data?.messageId,
      url: `/messages?chat=${data?.conversationId || ''}`
    },
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: 'Mở tin nhắn'
      },
      {
        action: 'close',
        title: 'Đóng'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification);
  
  event.notification.close();
  
  // Handle action buttons
  if (event.action === 'close') {
    return;
  }
  
  const data = event.notification.data;
  const url = data.url || '/messages';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: data
            });
            return;
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Service Worker activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(clients.claim());
});

// Service Worker installation
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});
