import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AppNotification, AppNotificationType } from '../types';

const MESSAGE_CHANNEL_TYPES = new Set<AppNotificationType>(['message', 'call']);

export type NotificationPreferenceKey =
  | 'messages'
  | 'calls'
  | 'connections'
  | 'activity'
  | 'nearby'
  | 'rooms'
  | 'stations'
  | 'system';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: true,
  calls: true,
  connections: true,
  activity: true,
  nearby: true,
  rooms: true,
  stations: true,
  system: true,
};

const normalizePreferences = (value?: Record<string, unknown>): NotificationPreferences => (
  Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [
    key,
    typeof value?.[key] === 'boolean' ? value[key] : fallback,
  ])) as NotificationPreferences
);

export function subscribeNotificationPreferences(
  uid: string,
  onChange: (preferences: NotificationPreferences) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid, 'notificationPreferences', 'settings'),
    (snapshot) => onChange(normalizePreferences(snapshot.data())),
    (error) => onError?.(error),
  );
}

export async function updateNotificationPreference(
  uid: string,
  key: NotificationPreferenceKey,
  enabled: boolean,
) {
  await setDoc(doc(db, 'users', uid, 'notificationPreferences', 'settings'), {
    [key]: enabled,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Messages and calls belong to the inbox, not the general activity feed. */
export function isGeneralNotification(notification: Pick<AppNotification, 'type'>) {
  return !MESSAGE_CHANNEL_TYPES.has(notification.type);
}

export function mergeNotificationFeed(
  personal: AppNotification[], community: AppNotification[],
  reads: Map<string, Timestamp>, blocked: Set<string>, uid: string, resultLimit = 80,
  now = Date.now(),
) {
  const merged = new Map<string, AppNotification>();
  for (const notification of [...community, ...personal]) {
    if (!isGeneralNotification(notification) || notification.actorUid === uid
      || (notification.actorUid && blocked.has(notification.actorUid))
      || (notification.expiresAt?.toMillis?.() ?? Infinity) <= now) continue;
    merged.set(notification.id, {
      ...notification,
      readAt: reads.get(notification.id) || notification.readAt || merged.get(notification.id)?.readAt || null,
    });
  }
  return [...merged.values()].sort((a, b) =>
    (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
  ).slice(0, resultLimit);
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

  let personal: AppNotification[] = [];
  let community: AppNotification[] = [];
  let reads = new Map<string, Timestamp>();
  let blockedByMe = new Set<string>();
  let blockedByOthers = new Set<string>();
  const ready = new Set<string>();
  const emit = (key: string) => {
    ready.add(key);
    if (ready.size < 5) return;
    onChange(mergeNotificationFeed(personal, community, reads,
      new Set([...blockedByMe, ...blockedByOthers]), uid, resultLimit));
  };
  const failed = (key: string, error: Error) => {
    // Never expose possibly blocked profiles if a privacy listener fails.
    if (key === 'blocksMe' || key === 'blocksOthers') {
      ready.delete(key);
      onChange([]);
    } else emit(key);
    onError?.(error);
  };
  const unsubscribes = [
    onSnapshot(notificationsQuery, snapshot => {
      personal = snapshot.docs.map(notification => ({ ...notification.data(), id: notification.id, source: 'personal' } as AppNotification));
      emit('personal');
    }, error => failed('personal', error)),
    onSnapshot(query(collection(db, 'communityNotifications'), orderBy('createdAt', 'desc'), limit(80)), snapshot => {
      community = snapshot.docs.map(notification => ({ ...notification.data(), id: notification.id, recipientUid: uid, source: 'community' } as AppNotification));
      emit('community');
    }, error => failed('community', error)),
    onSnapshot(query(collection(db, 'users', uid, 'communityNotificationReads'), orderBy('readAt', 'desc'), limit(300)), snapshot => {
      reads = new Map(snapshot.docs.map(receipt => [receipt.id, receipt.data().readAt]));
      emit('reads');
    }, error => failed('reads', error)),
    onSnapshot(query(collection(db, 'blocks'), where('blockerUid', '==', uid)), snapshot => {
      blockedByMe = new Set(snapshot.docs.map(block => block.data().blockedUid));
      emit('blocksMe');
    }, error => failed('blocksMe', error)),
    onSnapshot(query(collection(db, 'blocks'), where('blockedUid', '==', uid)), snapshot => {
      blockedByOthers = new Set(snapshot.docs.map(block => block.data().blockerUid));
      emit('blocksOthers');
    }, error => failed('blocksOthers', error)),
  ];
  return () => unsubscribes.forEach(unsubscribe => unsubscribe());
}

export async function markNotificationRead(uid: string, notificationId: string, type?: AppNotificationType, source: AppNotification['source'] = 'personal') {
  if (type === 'new_profile') {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'communityNotificationReads', notificationId), { readAt: serverTimestamp() });
    if (source !== 'community') batch.update(doc(db, 'users', uid, 'notifications', notificationId), { readAt: serverTimestamp() });
    await batch.commit();
    return;
  }
  await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
    readAt: serverTimestamp(),
  });
}

export async function markNotificationsRead(uid: string, notifications: AppNotification[]) {
  const unread = notifications.filter((notification) => !notification.readAt);
  if (!unread.length) return;

  const batch = writeBatch(db);
  unread.forEach((notification) => {
    if (notification.type === 'new_profile') {
      batch.set(doc(db, 'users', uid, 'communityNotificationReads', notification.id), { readAt: serverTimestamp() });
    }
    if (notification.source !== 'community') {
      batch.update(doc(db, 'users', uid, 'notifications', notification.id), { readAt: serverTimestamp() });
    }
  });
  await batch.commit();
}

const ALLOWED_NOTIFICATION_ROUTES = [
  /^\/messages(?:\/[^/]+)?$/,
  /^\/friends(?:\?tab=(?:new|friends|requests))?$/,
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
