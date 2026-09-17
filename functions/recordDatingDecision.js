const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const ALLOWED_ACTIONS = new Set(['like', 'pass']);

function requireDatingRequest(request) {
  const fromUid = request.auth?.uid;
  const toUid = typeof request.data?.toUid === 'string' ? request.data.toUid.trim() : '';
  const action = request.data?.action;

  if (!fromUid) {
    throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để sử dụng hẹn hò.');
  }
  if (!toUid || toUid === fromUid || toUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Hồ sơ được chọn không hợp lệ.');
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new HttpsError('invalid-argument', 'Lựa chọn hẹn hò không hợp lệ.');
  }

  return { fromUid, toUid, action };
}

function isAdultDatingProfile(snapshot) {
  if (!snapshot.exists) return false;
  const profile = snapshot.data() || {};
  return profile.datingEnabled === true
    && typeof profile.age === 'number'
    && profile.age >= 18;
}

exports.recordDatingDecision = onCall(async (request) => {
  const { fromUid, toUid, action } = requireDatingRequest(request);
  const firestore = getFirestore();
  const decisionId = `${fromUid}_${toUid}`;
  const decisionRef = firestore.collection('datingDecisions').doc(decisionId);
  const likeRef = firestore.collection('datingLikes').doc(decisionId);
  const reverseLikeRef = firestore.collection('datingLikes').doc(`${toUid}_${fromUid}`);
  const participantUids = [fromUid, toUid].sort();
  const matchRef = firestore.collection('datingMatches').doc(participantUids.join('_'));

  return firestore.runTransaction(async (transaction) => {
    // All reads deliberately happen before writes. Firestore retries this
    // transaction when another tab changes either participant's decision.
    const [
      fromProfile,
      toProfile,
      blockedByMe,
      blockedByThem,
      currentDecision,
      currentLike,
      reverseLike,
      currentMatch,
    ] = await Promise.all([
      transaction.get(firestore.collection('profiles').doc(fromUid)),
      transaction.get(firestore.collection('profiles').doc(toUid)),
      transaction.get(firestore.collection('blocks').doc(`${fromUid}_${toUid}`)),
      transaction.get(firestore.collection('blocks').doc(`${toUid}_${fromUid}`)),
      transaction.get(decisionRef),
      transaction.get(likeRef),
      transaction.get(reverseLikeRef),
      transaction.get(matchRef),
    ]);

    if (!isAdultDatingProfile(fromProfile)) {
      throw new HttpsError(
        'failed-precondition',
        'Hãy bật hẹn hò và xác nhận bạn từ 18 tuổi trong hồ sơ.',
      );
    }
    if (!isAdultDatingProfile(toProfile)) {
      throw new HttpsError('failed-precondition', 'Hồ sơ này hiện không còn tham gia hẹn hò.');
    }
    if (blockedByMe.exists || blockedByThem.exists) {
      throw new HttpsError('permission-denied', 'Không thể tương tác với hồ sơ này.');
    }

    const now = FieldValue.serverTimestamp();
    transaction.set(decisionRef, {
      fromUid,
      toUid,
      action,
      createdAt: currentDecision.exists
        ? currentDecision.data().createdAt || now
        : now,
      updatedAt: now,
    });

    if (action === 'pass') {
      if (currentLike.exists) transaction.delete(likeRef);
      return { matched: false };
    }

    transaction.set(likeRef, {
      fromUid,
      toUid,
      createdAt: currentLike.exists ? currentLike.data().createdAt || now : now,
      updatedAt: now,
    });

    const matched = reverseLike.exists;
    if (matched && !currentMatch.exists) {
      transaction.set(matchRef, {
        participantUids,
        matchedAt: now,
      });
    }

    return { matched };
  });
});

exports.requireDatingRequest = requireDatingRequest;
exports.isAdultDatingProfile = isAdultDatingProfile;
