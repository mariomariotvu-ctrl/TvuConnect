import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AppNotification } from '../types';

export function subscribeToNotifications(
  uid: string,
  onChange: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void,
  resultLimit = 80,
) {
  const notificationsQuery = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(resultLimit),
  );

  return onSnapshot(notificationsQuery, (snapshot) => {
    onChange(snapshot.docs.map((notification) => ({
      id: notification.id,
      ...notification.data(),
    } as AppNotification)));
  }, (error) => onError?.(error));
}

export async function markNotificationRead(uid: string, notificationId: string) {
  await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
    readAt: serverTimestamp(),
  });
}

export async function markNotificationsRead(uid: string, notifications: AppNotification[]) {
  const unread = notifications.filter((notification) => !notification.readAt);
  if (!unread.length) return;

  const batch = writeBatch(db);
  unread.forEach((notification) => {
    batch.update(doc(db, 'users', uid, 'notifications', notification.id), {
      readAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

const ALLOWED_NOTIFICATION_ROUTES = [
  /^\/messages(?:\/[^/]+)?$/,
  /^\/friends$/,
  /^\/connect\/lover$/,
  /^\/explore\/people$/,
  /^\/notifications$/,
  /^\/community$/,
];

export function safeNotificationRoute(route?: string | null) {
  if (!route || route.startsWith('//')) return '/notifications';
  return ALLOWED_NOTIFICATION_ROUTES.some((pattern) => pattern.test(route))
    ? route
    : '/notifications';
}
