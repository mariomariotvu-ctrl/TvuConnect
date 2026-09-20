const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();

const RECENT_LOGIN_SECONDS = 10 * 60;
const MAX_REASON_LENGTH = 240;

const DIRECT_DOCUMENT_COLLECTIONS = [
  'activeCallLocks',
  'locationPreferences',
  'onlineStatus',
  'privateLiveLocations',
  'profiles',
  'sharedStudentLocations',
  'users',
  'voiceMatchQueue',
];

const querySpecsFor = (uid) => [
  ['blocks', 'blockerUid', '==', uid],
  ['blocks', 'blockedUid', '==', uid],
  ['calls', 'participantUids', 'array-contains', uid],
  ['checkIns', 'userId', '==', uid],
  ['comments', 'userId', '==', uid],
  ['communityReviews', 'userId', '==', uid],
  ['conversations', 'participants', 'array-contains', uid],
  ['datingDecisions', 'fromUid', '==', uid],
  ['datingDecisions', 'toUid', '==', uid],
  ['datingLikes', 'fromUid', '==', uid],
  ['datingLikes', 'toUid', '==', uid],
  ['datingMatches', 'participantUids', 'array-contains', uid],
  ['documentLinks', 'createdBy', '==', uid],
  ['favorites', 'fromUid', '==', uid],
  ['favorites', 'toUid', '==', uid],
  ['fcmTokens', 'userId', '==', uid],
  ['friendRequests', 'participantUids', 'array-contains', uid],
  ['friendships', 'participantUids', 'array-contains', uid],
  ['matchFeedback', 'userId', '==', uid],
  ['matches', 'userUid', '==', uid],
  ['matches', 'matchedUid', '==', uid],
  ['matches', 'userId', '==', uid],
  ['matches', 'matchedUserId', '==', uid],
  ['matching_analytics', 'userId', '==', uid],
  ['messages', 'participants', 'array-contains', uid],
  ['messages', 'senderUid', '==', uid],
  ['messages', 'receiverUid', '==', uid],
  ['places', 'createdBy', '==', uid],
  ['posts', 'userId', '==', uid],
  ['posts', 'createdBy', '==', uid],
  ['rentalPosts', 'createdBy', '==', uid],
  ['studentEncounters', 'participantUids', 'array-contains', uid],
  ['studyRooms', 'ownerUid', '==', uid],
  ['typing', 'userId', '==', uid],
  ['voiceMatchSessions', 'participantUids', 'array-contains', uid],
];

function normalizeDeletionReason(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_REASON_LENGTH) : '';
}

function hasRecentAuthentication(authTime, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Number.isFinite(authTime)
    && authTime > 0
    && nowSeconds - authTime <= RECENT_LOGIN_SECONDS;
}

async function deleteMatchingDocuments(firestore, [collectionName, field, operator, value]) {
  let deleted = 0;
  while (true) {
    const snapshot = await firestore.collection(collectionName)
      .where(field, operator, value)
      .limit(100)
      .get();
    if (snapshot.empty) return deleted;
    await Promise.all(snapshot.docs.map((document) => firestore.recursiveDelete(document.ref)));
    deleted += snapshot.size;
  }
}

async function deleteCollectionGroupDocuments(firestore, groupName, field, uid) {
  let deleted = 0;
  while (true) {
    const snapshot = await firestore.collectionGroup(groupName)
      .where(field, '==', uid)
      .limit(100)
      .get();
    if (snapshot.empty) return deleted;
    await Promise.all(snapshot.docs.map((document) => firestore.recursiveDelete(document.ref)));
    deleted += snapshot.size;
  }
}

async function removeLocationViewerAccess(firestore, uid) {
  const snapshot = await firestore.collection('sharedStudentLocations')
    .where('viewerUids', 'array-contains', uid)
    .limit(250)
    .get();
  if (snapshot.empty) return;
  const batch = firestore.batch();
  snapshot.docs.forEach((document) => batch.update(document.ref, {
    viewerUids: FieldValue.arrayRemove(uid),
  }));
  await batch.commit();
}

exports.deleteStudentAccount = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  const authTime = Number(request.auth?.token?.auth_time || 0);
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để xóa tài khoản.');
  if (!hasRecentAuthentication(authTime)) {
    throw new HttpsError('failed-precondition', 'Vui lòng xác minh lại tài khoản trước khi xóa.');
  }

  const firestore = getFirestore();
  const reason = normalizeDeletionReason(request.data?.reason);

  // Remove references from records owned by other users before deleting the
  // account's own documents. Every operation is safe to retry after a timeout.
  await removeLocationViewerAccess(firestore, uid);
  await Promise.all([
    deleteCollectionGroupDocuments(firestore, 'participants', 'uid', uid),
    deleteCollectionGroupDocuments(firestore, 'signals', 'fromUid', uid),
    deleteCollectionGroupDocuments(firestore, 'signals', 'toUid', uid),
    deleteCollectionGroupDocuments(firestore, 'notifications', 'actorUid', uid),
  ]);

  let deletedDocuments = 0;
  for (const spec of querySpecsFor(uid)) {
    deletedDocuments += await deleteMatchingDocuments(firestore, spec);
  }
  for (const collectionName of DIRECT_DOCUMENT_COLLECTIONS) {
    const reference = firestore.collection(collectionName).doc(uid);
    const snapshot = await reference.get();
    if (snapshot.exists) {
      await firestore.recursiveDelete(reference);
      deletedDocuments += 1;
    }
  }

  if (reason) {
    await firestore.collection('accountDeletionFeedback').add({
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await getAuth().deleteUser(uid);
  return { deleted: true, deletedDocuments };
});

exports.normalizeDeletionReason = normalizeDeletionReason;
exports.hasRecentAuthentication = hasRecentAuthentication;
exports.querySpecsFor = querySpecsFor;
