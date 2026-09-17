const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

if (!getApps().length) {
  initializeApp();
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

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

async function activeTokenDocs(userId) {
  const snapshot = await getFirestore()
    .collection('users')
    .doc(userId)
    .collection('fcmTokens')
    .where('deleted', '==', false)
    .get();

  return snapshot.docs.filter((tokenDoc) => typeof tokenDoc.data().token === 'string');
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

module.exports = { sendDataNotification };
