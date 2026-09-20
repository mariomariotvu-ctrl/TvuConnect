const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { deliverNotification } = require('./notificationHelpers');

if (!getApps().length) initializeApp();

const ALLOWED_ACTIONS = new Set(['send', 'accept', 'decline', 'cancel', 'remove']);

const pairIdFor = (leftUid, rightUid) => [leftUid, rightUid].sort().join('_');

function requireFriendAction(request) {
  const uid = request.auth?.uid;
  const friendUid = typeof request.data?.friendUid === 'string'
    ? request.data.friendUid.trim()
    : '';
  const action = request.data?.action;

  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để kết bạn.');
  if (!friendUid || friendUid === uid || friendUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Tài khoản kết nối không hợp lệ.');
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new HttpsError('invalid-argument', 'Thao tác kết bạn không hợp lệ.');
  }

  return { uid, friendUid, action };
}

exports.manageFriendConnection = onCall(async (request) => {
  const { uid, friendUid, action } = requireFriendAction(request);
  const firestore = getFirestore();
  const pairId = pairIdFor(uid, friendUid);
  const actionEventId = firestore.collection('_notificationEvents').doc().id;
  const friendshipRef = firestore.collection('friendships').doc(pairId);
  const outgoingRequestRef = firestore.collection('friendRequests').doc(`${uid}_${friendUid}`);
  const incomingRequestRef = firestore.collection('friendRequests').doc(`${friendUid}_${uid}`);
  const ownProfileRef = firestore.collection('profiles').doc(uid);
  const friendProfileRef = firestore.collection('profiles').doc(friendUid);
  const blockedByMeRef = firestore.collection('blocks').doc(`${uid}_${friendUid}`);
  const blockedByThemRef = firestore.collection('blocks').doc(`${friendUid}_${uid}`);
  const ownSharedLocationRef = firestore.collection('sharedStudentLocations').doc(uid);
  const friendSharedLocationRef = firestore.collection('sharedStudentLocations').doc(friendUid);

  const outcome = await firestore.runTransaction(async (transaction) => {
    const [
      friendship,
      outgoingRequest,
      incomingRequest,
      ownProfile,
      friendProfile,
      blockedByMe,
      blockedByThem,
      ownSharedLocation,
      friendSharedLocation,
    ] = await Promise.all([
      transaction.get(friendshipRef),
      transaction.get(outgoingRequestRef),
      transaction.get(incomingRequestRef),
      transaction.get(ownProfileRef),
      transaction.get(friendProfileRef),
      transaction.get(blockedByMeRef),
      transaction.get(blockedByThemRef),
      transaction.get(ownSharedLocationRef),
      transaction.get(friendSharedLocationRef),
    ]);

    if (action === 'send' || action === 'accept') {
      if (!ownProfile.exists || !friendProfile.exists) {
        throw new HttpsError('not-found', 'Không tìm thấy hồ sơ sinh viên.');
      }
      if (blockedByMe.exists || blockedByThem.exists) {
        throw new HttpsError('permission-denied', 'Không thể kết nối với tài khoản này.');
      }
    }

    const now = FieldValue.serverTimestamp();
    const connect = () => {
      transaction.set(friendshipRef, {
        participantUids: [uid, friendUid].sort(),
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now,
      }, { merge: true });
      if (ownSharedLocation.exists) {
        transaction.update(ownSharedLocationRef, {
          viewerUids: FieldValue.arrayUnion(friendUid),
          updatedAt: now,
        });
      }
      if (friendSharedLocation.exists) {
        transaction.update(friendSharedLocationRef, {
          viewerUids: FieldValue.arrayUnion(uid),
          updatedAt: now,
        });
      }
    };

    if (action === 'send') {
      if (friendship.exists) return { status: 'accepted', notification: null };

      if (incomingRequest.exists && incomingRequest.data()?.status === 'pending') {
        connect();
        transaction.update(incomingRequestRef, { status: 'accepted', respondedAt: now });
        if (outgoingRequest.exists) transaction.delete(outgoingRequestRef);
        return { status: 'accepted', notification: 'friend_accepted' };
      }

      if (outgoingRequest.exists && outgoingRequest.data()?.status === 'pending') {
        return { status: 'pending', notification: null };
      }

      transaction.set(outgoingRequestRef, {
        fromUid: uid,
        toUid: friendUid,
        participantUids: [uid, friendUid].sort(),
        status: 'pending',
        createdAt: outgoingRequest.exists
          ? outgoingRequest.data()?.createdAt || now
          : now,
        updatedAt: now,
      });
      return { status: 'pending', notification: 'friend_request' };
    }

    if (action === 'accept') {
      if (friendship.exists) return { status: 'accepted', notification: null };
      if (!incomingRequest.exists || incomingRequest.data()?.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Lời mời kết bạn không còn hiệu lực.');
      }
      connect();
      transaction.update(incomingRequestRef, { status: 'accepted', respondedAt: now });
      if (outgoingRequest.exists) transaction.delete(outgoingRequestRef);
      return { status: 'accepted', notification: 'friend_accepted' };
    }

    if (action === 'decline') {
      if (incomingRequest.exists && incomingRequest.data()?.status === 'pending') {
        transaction.update(incomingRequestRef, { status: 'declined', respondedAt: now });
      }
      return { status: 'none', notification: null };
    }

    if (action === 'cancel') {
      if (outgoingRequest.exists && outgoingRequest.data()?.status === 'pending') {
        transaction.delete(outgoingRequestRef);
      }
      return { status: friendship.exists ? 'accepted' : 'none', notification: null };
    }

    if (friendship.exists) transaction.delete(friendshipRef);
    if (outgoingRequest.exists) transaction.delete(outgoingRequestRef);
    if (incomingRequest.exists) transaction.delete(incomingRequestRef);
    if (ownSharedLocation.exists) {
      transaction.update(ownSharedLocationRef, {
        viewerUids: FieldValue.arrayRemove(friendUid),
        updatedAt: now,
      });
    }
    if (friendSharedLocation.exists) {
      transaction.update(friendSharedLocationRef, {
        viewerUids: FieldValue.arrayRemove(uid),
        updatedAt: now,
      });
    }
    return { status: 'none', notification: null };
  });

  if (outcome.notification) {
    try {
      const actorProfile = await ownProfileRef.get();
      const actor = actorProfile.data() || {};
      const actorName = actor.fullName || actor.nickname || 'Một sinh viên TVU';
      const accepted = outcome.notification === 'friend_accepted';
      await deliverNotification(
        friendUid,
        `${outcome.notification}_${pairId}_${actionEventId}`,
        {
          type: outcome.notification,
          title: accepted ? `${actorName} đã đồng ý kết bạn` : `${actorName} muốn kết bạn`,
          body: accepted
            ? 'Hai bạn đã có thể chia sẻ và trò chuyện với nhau.'
            : 'Mở TVU Connect để xem hồ sơ và phản hồi lời mời.',
          actorUid: uid,
          actorName,
          actorPhotoURL: actor.photoURL || null,
          entityId: pairId,
          route: '/friends',
        },
      );
    } catch (error) {
      console.error('Could not deliver friend notification:', error);
    }
  }

  return { status: outcome.status };
});

exports.pairIdFor = pairIdFor;
exports.requireFriendAction = requireFriendAction;
