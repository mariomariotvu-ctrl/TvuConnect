const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { cleanNotificationId } = require('./notificationHelpers');

if (!getApps().length) initializeApp();

function counterDelta(beforeExists, afterExists) {
  if (!beforeExists && afterExists) return 1;
  if (beforeExists && !afterExists) return -1;
  return 0;
}

function validDocumentId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 1_500
    && !value.includes('/');
}

function commentCounterTarget(comment) {
  if (validDocumentId(comment?.parentCommentId)) {
    return {
      collection: 'comments',
      id: comment.parentCommentId,
      field: 'replyCount',
    };
  }
  if (validDocumentId(comment?.postId)) {
    return {
      collection: 'posts',
      id: comment.postId,
      field: 'commentCount',
    };
  }
  return null;
}

exports.syncCommentCounters = onDocumentWritten({
  document: 'comments/{commentId}',
  region: 'asia-southeast1',
  retry: true,
  maxInstances: 10,
}, async (event) => {
  const beforeExists = event.data?.before?.exists === true;
  const afterExists = event.data?.after?.exists === true;
  const delta = counterDelta(beforeExists, afterExists);
  if (!delta) return null;

  const comment = (afterExists ? event.data.after.data() : event.data.before.data()) || {};
  const target = commentCounterTarget(comment);
  if (!target) return null;

  const firestore = getFirestore();
  const targetRef = firestore.collection(target.collection).doc(target.id);
  const eventRef = firestore.collection('_systemCommentEvents')
    .doc(`counter_${cleanNotificationId(event.id)}`);

  try {
    await firestore.runTransaction(async (transaction) => {
      const [eventSnapshot, targetSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(targetRef),
      ]);
      if (eventSnapshot.exists) return;

      transaction.create(eventRef, {
        eventId: event.id,
        commentId: event.params.commentId,
        delta,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      if (!targetSnapshot.exists) return;

      const currentCount = Number(targetSnapshot.data()?.[target.field]) || 0;
      transaction.update(targetRef, {
        [target.field]: Math.max(0, currentCount + delta),
      });
    });
  } catch (error) {
    console.error('Could not synchronize comment counter:', error);
    throw error;
  }

  return null;
});

exports.commentCounterTarget = commentCounterTarget;
exports.counterDelta = counterDelta;
