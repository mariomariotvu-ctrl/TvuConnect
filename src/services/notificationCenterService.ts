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
import type { AppNotification, AppNotificationType } from '../types';

const MESSAGE_CHANNEL_TYPES = new Set<AppNotificationType>(['message', 'call']);

/** Messages and calls belong to the inbox, not the general activity feed. */
export function isGeneralNotification(notification: Pick<AppNotification, 'type'>) {
  return !MESSAGE_CHANNEL_TYPES.has(notification.type);
}

export function subscribeToNotifications(
  uid: string,
  onChange: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void,
  resultLimit = 80,
) {
  const notificationsQuery = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    // Legacy message/call rows may still exist. Read a wider window so they
    // cannot push genuine activity notifications out of the visible result.
    limit(Math.min(Math.max(resultLimit * 4, 120), 300)),
  );

  return onSnapshot(notificationsQuery, (snapshot) => {
    onChange(snapshot.docs
      .map((notification) => ({
        id: notification.id,
        ...notification.data(),
      } as AppNotification))
      .filter(isGeneralNotification)
      .slice(0, resultLimit));
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
