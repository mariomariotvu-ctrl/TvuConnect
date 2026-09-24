const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const MAX_PARTICIPANTS = 8;

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để tham gia phòng học.');
  }
  return uid;
}

function requireRoomId(request) {
  const roomId = typeof request.data?.roomId === 'string' ? request.data.roomId.trim() : '';
  if (!roomId || roomId.length > 160) {
    throw new HttpsError('invalid-argument', 'Mã phòng học không hợp lệ.');
  }
  return roomId;
}

exports.joinStudyRoom = onCall(async (request) => {
  const uid = requireUid(request);
  const roomId = requireRoomId(request);
  const firestore = getFirestore();
  const roomRef = firestore.collection('studyRooms').doc(roomId);
  const participantRef = roomRef.collection('participants').doc(uid);
  const profileSnapshot = await firestore.collection('profiles').doc(uid).get();

  if (!profileSnapshot.exists) {
    throw new HttpsError('failed-precondition', 'Hãy hoàn thiện hồ sơ trước khi vào phòng học.');
  }

  const profile = profileSnapshot.data();
  return firestore.runTransaction(async (transaction) => {
    // Every join reads and updates the same room document. Firestore retries
    // concurrent transactions, so only one caller can claim the final slot.
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) {
      throw new HttpsError('not-found', 'Phòng học không còn tồn tại.');
    }

    const room = roomSnapshot.data();
    if (room.status !== 'open') {
      throw new HttpsError('failed-precondition', 'Phòng học đã đóng.');
    }

    const participantSnapshot = await transaction.get(participantRef);
    if (!participantSnapshot.exists && room.roomLocked === true) {
      throw new HttpsError('permission-denied', 'Chủ phòng đã khóa, chưa thể nhận thêm thành viên.');
    }
    if (!participantSnapshot.exists && Array.isArray(room.removedUids) && room.removedUids.includes(uid)) {
      throw new HttpsError('permission-denied', 'Bạn đã được chủ phòng mời rời khỏi phòng này.');
    }
    const participantsSnapshot = await transaction.get(
      roomRef.collection('participants'),
    );
    const maxParticipants = Math.min(
      MAX_PARTICIPANTS,
      Math.max(1, Number(room.maxParticipants || MAX_PARTICIPANTS)),
    );

    if (!participantSnapshot.exists && participantsSnapshot.size >= maxParticipants) {
      throw new HttpsError(
        'resource-exhausted',
        `Phòng đã đủ ${maxParticipants} người. Hãy chọn phòng khác.`,
      );
    }

    const now = FieldValue.serverTimestamp();
    transaction.set(participantRef, {
      uid,
      displayName: profile.fullName || profile.nickname || 'Sinh viên TVU',
      photoURL: profile.photoURL || null,
      ...(participantSnapshot.exists ? {} : {
        joinedAt: now,
        handRaised: false,
        handRaisedAt: null,
        muted: false,
        cameraOn: false,
        sharingScreen: false,
      }),
      updatedAt: now,
    }, { merge: true });
    transaction.update(roomRef, {
      participantCount: participantSnapshot.exists
        ? participantsSnapshot.size
        : participantsSnapshot.size + 1,
      ...(room.ownerUid === uid ? { ownerLastSeenAt: now } : {}),
    });

    return {
      participantCount: participantSnapshot.exists
        ? participantsSnapshot.size
        : participantsSnapshot.size + 1,
      maxParticipants,
      alreadyJoined: participantSnapshot.exists,
      roomLocked: room.roomLocked === true,
      audioLocked: room.audioLocked === true,
      videoLocked: room.videoLocked === true,
      screenShareLocked: room.screenShareLocked === true,
    };
  });
});

exports.removeStudyRoomParticipant = onCall(async (request) => {
  const uid = requireUid(request);
  const roomId = requireRoomId(request);
  const participantUid = typeof request.data?.participantUid === 'string'
    ? request.data.participantUid.trim()
    : '';
  if (!participantUid || participantUid.length > 160 || participantUid === uid) {
    throw new HttpsError('invalid-argument', 'Thành viên cần mời rời phòng không hợp lệ.');
  }

  const firestore = getFirestore();
  const roomRef = firestore.collection('studyRooms').doc(roomId);
  const participantRef = roomRef.collection('participants').doc(participantUid);

  return firestore.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) throw new HttpsError('not-found', 'Phòng họp không còn tồn tại.');
    const room = roomSnapshot.data();
    if (room.ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'Chỉ chủ phòng mới có thể mời thành viên rời phòng.');
    }

    const participantSnapshot = await transaction.get(participantRef);
    const participantsSnapshot = await transaction.get(roomRef.collection('participants'));
    const nextCount = participantSnapshot.exists
      ? Math.max(1, participantsSnapshot.size - 1)
      : Math.max(1, participantsSnapshot.size);

    if (participantSnapshot.exists) transaction.delete(participantRef);
    transaction.update(roomRef, {
      participantCount: nextCount,
      removedUids: FieldValue.arrayUnion(participantUid),
      controlsUpdatedAt: FieldValue.serverTimestamp(),
    });
    return { participantCount: nextCount };
  });
});

exports.leaveStudyRoom = onCall(async (request) => {
  const uid = requireUid(request);
  const roomId = requireRoomId(request);
  const firestore = getFirestore();
  const roomRef = firestore.collection('studyRooms').doc(roomId);
  const participantRef = roomRef.collection('participants').doc(uid);

  return firestore.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) return { participantCount: 0, closed: true };

    const participantSnapshot = await transaction.get(participantRef);
    const participantsSnapshot = await transaction.get(
      roomRef.collection('participants'),
    );
    const room = roomSnapshot.data();
    const nextCount = participantSnapshot.exists
      ? Math.max(0, participantsSnapshot.size - 1)
      : participantsSnapshot.size;

    if (participantSnapshot.exists) transaction.delete(participantRef);
    transaction.update(roomRef, {
      participantCount: nextCount,
      ...(room.ownerUid === uid ? {
        status: 'closed',
        closedAt: FieldValue.serverTimestamp(),
      } : {}),
    });

    return { participantCount: nextCount, closed: room.ownerUid === uid };
  });
});
