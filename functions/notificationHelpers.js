const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getRuntimeConfig } = require('./runtimeConfig');

if (!getApps().length) {
  initializeApp();
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);
const MESSAGE_CHANNEL_TYPES = new Set(['message', 'call']);
const NOTIFICATION_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
const DELIVERY_EVENT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const PREFERENCE_CATEGORY_BY_TYPE = {
  message: 'messages',
  call: 'calls',
  friend_request: 'connections',
  friend_accepted: 'connections',
  new_profile: 'connections',
  dating_match: 'connections',
  comment: 'activity',
  reply: 'activity',
  encounter: 'nearby',
  study_room_invite: 'rooms',
  music_station: 'stations',
  system: 'system',
};

const shouldStoreInInbox = (data = {}) => (
  data.storeInInbox !== false && !MESSAGE_CHANNEL_TYPES.has(data.type)
);

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const stringData = (data) => Object.fromEntries(
  Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]),
);

const safeText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const safePhotoURL = (value) => {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  return /^https:\/\//i.test(value) ? value : null;
};

async function activeTokenDocs(userId) {
  const snapshot = await getFirestore()
    .collection('users')
    .doc(userId)
    .collection('fcmTokens')
    .where('deleted', '==', false)
    .get();

  const now = Date.now();
  return snapshot.docs.filter((tokenDoc) => {
    const data = tokenDoc.data();
    const expiresAt = data.expiresAt?.toMillis?.();
    return typeof data.token === 'string' && (!expiresAt || expiresAt > now);
  });
}

async function pushIsEnabled(recipientUid, type) {
  const category = PREFERENCE_CATEGORY_BY_TYPE[type] || 'system';
  const snapshot = await getFirestore()
    .collection('users')
    .doc(recipientUid)
    .collection('notificationPreferences')
    .doc('settings')
    .get();
  return snapshot.data()?.[category] !== false;
}

async function removeInvalidTokens(tokenDocs, responses) {
  const invalidDocs = tokenDocs.filter((tokenDoc, index) => (
    INVALID_TOKEN_CODES.has(responses[index]?.error?.code)
  ));

  if (!invalidDocs.length) return;

  const batch = getFirestore().batch();
  invalidDocs.forEach((tokenDoc) => batch.delete(tokenDoc.ref));
  await batch.commit();
}

/** Send data-only messages so the service worker owns the visible notification. */
async function sendDataNotification(recipientUid, data) {
  const runtime = await getRuntimeConfig();
  if (!runtime.notificationsEnabled) {
    return { successCount: 0, failureCount: 0, disabledByRemoteConfig: true };
  }
  if (!await pushIsEnabled(recipientUid, data?.type)) {
    return { successCount: 0, failureCount: 0, disabledByPreference: true };
  }
  const tokenDocs = await activeTokenDocs(recipientUid);
  if (!tokenDocs.length) return { successCount: 0, failureCount: 0 };

  let successCount = 0;
  let failureCount = 0;

  for (const tokenGroup of chunk(tokenDocs, 500)) {
    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenGroup.map((tokenDoc) => tokenDoc.data().token),
      data: stringData(data),
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400',
        },
      },
    });

    successCount += response.successCount;
    failureCount += response.failureCount;
    await removeInvalidTokens(tokenGroup, response.responses);
  }

  return { successCount, failureCount };
}

const cleanNotificationId = (value) => String(value || 'event')
  .replace(/[^A-Za-z0-9_-]/g, '_')
  .slice(0, 180);

/**
 * Store one immutable inbox item before attempting push delivery. Using
 * DocumentReference.create with a deterministic id makes retries safe: only
 * the first invocation writes the item and sends the push notification.
 */
async function createInboxNotification(recipientUid, notificationId, data) {
  const reference = getFirestore()
    .collection('users')
    .doc(recipientUid)
    .collection('notifications')
    .doc(cleanNotificationId(notificationId));

  try {
    await reference.create({
      recipientUid,
      type: data.type || 'system',
      title: safeText(data.title || 'TVU Connect', 160),
      body: safeText(data.body, 600),
      actorUid: data.actorUid || null,
      actorName: data.actorName || null,
      actorPhotoURL: safePhotoURL(data.actorPhotoURL),
      entityId: data.entityId || null,
      route: data.route || '/notifications',
      reason: data.reason || null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + NOTIFICATION_EXPIRY_MS),
    });
    return true;
  } catch (error) {
    // gRPC 6 / ALREADY_EXISTS means another retry already delivered it.
    if (error?.code === 6 || error?.code === 'already-exists') return false;
    throw error;
  }
}

/** Reserve a push-only delivery without adding it to the general activity feed. */
async function claimPushOnlyNotification(recipientUid, notificationId, data) {
  const reference = getFirestore()
    .collection('_notificationEvents')
    .doc(cleanNotificationId(`push_${notificationId}`));

  try {
    await reference.create({
      recipientUid,
      type: data.type || 'system',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + DELIVERY_EVENT_EXPIRY_MS),
    });
    return true;
  } catch (error) {
    if (error?.code === 6 || error?.code === 'already-exists') return false;
    throw error;
  }
}

async function deliverNotification(recipientUid, notificationId, data) {
  const created = shouldStoreInInbox(data)
    ? await createInboxNotification(recipientUid, notificationId, data)
    : await claimPushOnlyNotification(recipientUid, notificationId, data);
  if (!created) return { created: false, successCount: 0, failureCount: 0 };

  const pushResult = await sendDataNotification(recipientUid, {
    type: data.type || 'system',
    title: safeText(data.title || 'TVU Connect', 160),
    body: safeText(data.body, 500),
    actorUid: data.actorUid,
    actorName: data.actorName,
    actorPhotoURL: safePhotoURL(data.actorPhotoURL),
    entityId: data.entityId,
    route: data.route || '/notifications',
    ...data.pushData,
  });
  return { created: true, ...pushResult };
}

module.exports = {
  cleanNotificationId,
  claimPushOnlyNotification,
  createInboxNotification,
  deliverNotification,
  sendDataNotification,
  shouldStoreInInbox,
};
