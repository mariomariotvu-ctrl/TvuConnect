const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const RINGING_TTL_MS = 60 * 1000;
const LOCK_TTL_MS = 2 * 60 * 1000;
const ACTIVE_LOCK_TTL_MS = 12 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['ringing', 'connecting', 'active']);
const TERMINAL_STATUSES = new Set(['declined', 'ended', 'failed']);
const ALLOWED_CALL_SOURCES = new Set(['direct', 'quick_voice', 'dating']);

function normalizeCallContext(data) {
  const source = ALLOWED_CALL_SOURCES.has(data?.source) ? data.source : 'direct';
  const sourceSessionId = typeof data?.sourceSessionId === 'string'
    ? data.sourceSessionId.trim().slice(0, 160)
    : '';

  if (source === 'quick_voice' && !sourceSessionId) {
    throw new HttpsError('failed-precondition', 'Phiên gọi nhanh không còn hợp lệ.');
  }

  return {
    source,
    sourceSessionId,
    privacyMode: source === 'quick_voice' ? 'anonymous' : 'standard',
  };
}

function normalizeOffer(rawOffer) {
  if (
    !rawOffer
    || rawOffer.type !== 'offer'
    || typeof rawOffer.sdp !== 'string'
    || rawOffer.sdp.length === 0
    || rawOffer.sdp.length > 120_000
  ) {
    throw new HttpsError('invalid-argument', 'Dữ liệu kết nối cuộc gọi không hợp lệ.');
  }
  return { type: 'offer', sdp: rawOffer.sdp };
}

function lockStillActive(lockSnapshot, callSnapshot, nowMillis) {
  if (!lockSnapshot?.exists || !callSnapshot?.exists) return false;
  const lock = lockSnapshot.data() || {};
  const call = callSnapshot.data() || {};
  const expiresAt = lock.expiresAt?.toMillis?.() || 0;
  return expiresAt > nowMillis && ACTIVE_STATUSES.has(call.status);
}

exports.createDirectCall = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  const calleeUid = typeof request.data?.calleeUid === 'string'
    ? request.data.calleeUid.trim()
    : '';
  const kind = request.data?.kind;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để thực hiện cuộc gọi.');
  }
  if (!calleeUid || calleeUid === callerUid || calleeUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Người nhận cuộc gọi không hợp lệ.');
  }
  if (kind !== 'audio' && kind !== 'video') {
    throw new HttpsError('invalid-argument', 'Loại cuộc gọi không hợp lệ.');
  }

  const offer = normalizeOffer(request.data?.offer);
  const callContext = normalizeCallContext(request.data);
  const firestore = getFirestore();
  const callRef = firestore.collection('calls').doc();
  const callerLockRef = firestore.collection('activeCallLocks').doc(callerUid);
  const calleeLockRef = firestore.collection('activeCallLocks').doc(calleeUid);
  const callerProfileRef = firestore.collection('profiles').doc(callerUid);
  const calleeProfileRef = firestore.collection('profiles').doc(calleeUid);
  const blockedByCallerRef = firestore.collection('blocks').doc(`${callerUid}_${calleeUid}`);
  const blockedByCalleeRef = firestore.collection('blocks').doc(`${calleeUid}_${callerUid}`);
  const sourceAuthorizationRef = callContext.source === 'quick_voice'
    ? firestore.collection('voiceMatchSessions').doc(callContext.sourceSessionId)
    : callContext.source === 'dating'
      ? firestore.collection('datingMatches').doc([callerUid, calleeUid].sort().join('_'))
      : null;
  const now = Timestamp.now();

  await firestore.runTransaction(async (transaction) => {
    const [
      callerLock,
      calleeLock,
      callerProfile,
      calleeProfile,
      blockedByCaller,
      blockedByCallee,
      sourceAuthorization,
    ] = await Promise.all([
      transaction.get(callerLockRef),
      transaction.get(calleeLockRef),
      transaction.get(callerProfileRef),
      transaction.get(calleeProfileRef),
      transaction.get(blockedByCallerRef),
      transaction.get(blockedByCalleeRef),
      sourceAuthorizationRef ? transaction.get(sourceAuthorizationRef) : Promise.resolve(null),
    ]);

    const occupiedCallIds = [...new Set([
      callerLock.data()?.callId,
      calleeLock.data()?.callId,
    ].filter((value) => typeof value === 'string'))];
    const occupiedCalls = new Map();
    for (const callId of occupiedCallIds) {
      occupiedCalls.set(callId, await transaction.get(firestore.collection('calls').doc(callId)));
    }

    if (!callerProfile.exists || !calleeProfile.exists) {
      throw new HttpsError('not-found', 'Không tìm thấy hồ sơ người tham gia cuộc gọi.');
    }
    if (blockedByCaller.exists || blockedByCallee.exists) {
      throw new HttpsError('permission-denied', 'Không thể gọi cho tài khoản này.');
    }
    if (callContext.source === 'quick_voice') {
      const session = sourceAuthorization?.data() || {};
      const sessionExpiresAt = session.expiresAt?.toMillis?.() || 0;
      if (
        !sourceAuthorization?.exists
        || session.status !== 'matched'
        || session.channel !== 'voice'
        || sessionExpiresAt <= now.toMillis()
        || !Array.isArray(session.participantUids)
        || !session.participantUids.includes(callerUid)
        || !session.participantUids.includes(calleeUid)
      ) {
        throw new HttpsError('permission-denied', 'Phiên gọi ẩn danh không hợp lệ.');
      }
    }
    if (callContext.source === 'dating') {
      const datingMatch = sourceAuthorization?.data() || {};
      if (
        !sourceAuthorization?.exists
        || !Array.isArray(datingMatch.participantUids)
        || !datingMatch.participantUids.includes(callerUid)
        || !datingMatch.participantUids.includes(calleeUid)
      ) {
        throw new HttpsError('permission-denied', 'Hai bạn cần cùng thích nhau trước khi gọi.');
      }
    }

    const callerBusy = lockStillActive(
      callerLock,
      occupiedCalls.get(callerLock.data()?.callId),
      now.toMillis(),
    );
    const calleeBusy = lockStillActive(
      calleeLock,
      occupiedCalls.get(calleeLock.data()?.callId),
      now.toMillis(),
    );

    if (callerBusy) {
      throw new HttpsError('already-exists', 'Bạn đang có một cuộc gọi khác.');
    }
    if (calleeBusy) {
      throw new HttpsError('already-exists', 'Người này đang trong cuộc gọi khác.');
    }

    const callExpiresAt = Timestamp.fromMillis(now.toMillis() + RINGING_TTL_MS);
    const lockExpiresAt = Timestamp.fromMillis(now.toMillis() + LOCK_TTL_MS);
    const participantUids = [callerUid, calleeUid];

    transaction.set(callRef, {
      callerUid,
      calleeUid,
      participantUids,
      kind,
      source: callContext.source,
      privacyMode: callContext.privacyMode,
      ...(callContext.sourceSessionId ? { sourceSessionId: callContext.sourceSessionId } : {}),
      status: 'ringing',
      offer,
      createdAt: now,
      updatedAt: now,
      expiresAt: callExpiresAt,
    });
    transaction.set(callerLockRef, {
      uid: callerUid,
      peerUid: calleeUid,
      callId: callRef.id,
      status: 'ringing',
      expiresAt: lockExpiresAt,
      updatedAt: now,
    });
    transaction.set(calleeLockRef, {
      uid: calleeUid,
      peerUid: callerUid,
      callId: callRef.id,
      status: 'ringing',
      expiresAt: lockExpiresAt,
      updatedAt: now,
    });
  });

  return { callId: callRef.id };
});

/** Keep per-user locks in sync without trusting either browser tab. */
exports.releaseDirectCallLocks = onDocumentUpdated('calls/{callId}', async (event) => {
    const change = event.data;
    if (!change) return null;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (before.status === after.status) return null;
    if (!ACTIVE_STATUSES.has(after.status) && !TERMINAL_STATUSES.has(after.status)) return null;

    const firestore = getFirestore();
    const participantUids = [after.callerUid, after.calleeUid]
      .filter((uid) => typeof uid === 'string');
    if (participantUids.length !== 2) return null;

    return firestore.runTransaction(async (transaction) => {
      const lockRefs = participantUids.map((uid) => firestore.collection('activeCallLocks').doc(uid));
      const lockSnapshots = [];
      for (const lockRef of lockRefs) lockSnapshots.push(await transaction.get(lockRef));

      lockSnapshots.forEach((lockSnapshot, index) => {
        if (!lockSnapshot.exists || lockSnapshot.data()?.callId !== event.params.callId) return;
        if (TERMINAL_STATUSES.has(after.status)) {
          transaction.delete(lockRefs[index]);
          return;
        }
        transaction.update(lockRefs[index], {
          status: after.status,
          expiresAt: Timestamp.fromMillis(Date.now() + ACTIVE_LOCK_TTL_MS),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    });
  });

exports.normalizeOffer = normalizeOffer;
exports.normalizeCallContext = normalizeCallContext;
exports.lockStillActive = lockStillActive;
