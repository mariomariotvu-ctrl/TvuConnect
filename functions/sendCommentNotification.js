const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { deliverNotification } = require('./notificationHelpers');

if (!getApps().length) initializeApp();

function previewComment(content) {
  const value = String(content || '').trim();
  if (!value) return 'Đã để lại một phản hồi mới.';
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function notificationTarget(comment, parentComment, post) {
  if (comment.parentCommentId) {
    return {
      recipientUid: parentComment?.userId || '',
      type: 'reply',
    };
  }
  return {
    recipientUid: post?.userId || post?.createdBy || '',
    type: 'comment',
  };
}

exports.sendCommentNotification = onDocumentCreated('comments/{commentId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return null;

  const comment = snapshot.data() || {};
  const actorUid = typeof comment.userId === 'string' ? comment.userId : '';
  const postId = typeof comment.postId === 'string' ? comment.postId : '';
  if (!actorUid || !postId) return null;

  try {
    const firestore = getFirestore();
    const [postSnapshot, parentSnapshot, actorSnapshot] = await Promise.all([
      firestore.collection('posts').doc(postId).get(),
      comment.parentCommentId
        ? firestore.collection('comments').doc(comment.parentCommentId).get()
        : Promise.resolve(null),
      firestore.collection('profiles').doc(actorUid).get(),
    ]);
    const target = notificationTarget(
      comment,
      parentSnapshot?.exists ? parentSnapshot.data() : null,
      postSnapshot.exists ? postSnapshot.data() : null,
    );
    if (!target.recipientUid || target.recipientUid === actorUid) return null;

    const actor = actorSnapshot.exists ? actorSnapshot.data() : {};
    const actorName = actor?.fullName || comment.userName || 'Một sinh viên TVU';
    const isReply = target.type === 'reply';
    await deliverNotification(target.recipientUid, `${target.type}_${event.params.commentId}`, {
      type: target.type,
      title: isReply
        ? `${actorName} đã trả lời bình luận của bạn`
        : `${actorName} đã bình luận bài viết của bạn`,
      body: previewComment(comment.content),
      actorUid,
      actorName,
      actorPhotoURL: actor?.photoURL || comment.userAvatar || null,
      entityId: event.params.commentId,
      route: '/community',
      pushData: { postId, commentId: event.params.commentId },
    });
  } catch (error) {
    console.error('Could not deliver comment notification:', error);
  }

  return null;
});

exports.notificationTarget = notificationTarget;
exports.previewComment = previewComment;
