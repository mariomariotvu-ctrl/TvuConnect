const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const WAITING_TTL_MS = 5 * 60 * 1000;
const ALLOWED_PURPOSES = new Set(['casual', 'study']);
const ALLOWED_CHANNELS = new Set(['voice', 'text']);

function normalizeMatchRequest(data) {
  return {
    purpose: ALLOWED_PURPOSES.has(data?.purpose) ? data.purpose : 'casual',
    channel: ALLOWED_CHANNELS.has(data?.channel) ? data.channel : 'voice',
  };
}

exports.matchVoicePartner = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để ghép cuộc trò chuyện.');
  }

  const { purpose, channel } = normalizeMatchRequest(request.data);
  const firestore = getFirestore();
  const queueRef = firestore.collection('voiceMatchQueue').doc(uid);
  const now = Timestamp.now();
  const cutoff = Timestamp.fromMillis(now.toMillis() - WAITING_TTL_MS);

  return firestore.runTransaction(async (transaction) => {
    const currentQueue = await transaction.get(queueRef);
    const currentData = currentQueue.data();
    const currentMatchedAt = currentData?.matchedAt?.toMillis?.() || 0;
    if (
      currentData?.status === 'matched'
      && currentData?.peerUid
      && currentData?.sessionId
      && currentData?.purpose === purpose
      && (currentData?.channel || 'voice') === channel
      && currentMatchedAt > cutoff.toMillis()
    ) {
      return {
        status: 'matched',
        peerUid: currentData.peerUid,
        sessionId: currentData.sessionId,
        initiatorUid: currentData.initiatorUid,
        channel: currentData.channel || 'voice',
      };
    }

    const currentJoinedAt = currentData?.joinedAt?.toMillis?.() || 0;
    if (
      currentData?.status === 'waiting'
      && currentData?.purpose === purpose
      && (currentData?.channel || 'voice') === channel
      && currentJoinedAt > cutoff.toMillis()
    ) {
      return { status: 'waiting' };
    }

    const candidatesQuery = firestore.collection('voiceMatchQueue')
      .where('channel', '==', channel)
      .where('purpose', '==', purpose)
      .where('status', '==', 'waiting')
      .where('joinedAt', '>', cutoff)
      .orderBy('joinedAt', 'asc')
      .limit(12);
    const candidates = await transaction.get(candidatesQuery);

    let selected = null;
    for (const candidate of candidates.docs) {
      if (candidate.id === uid) continue;

      const [blockedByMe, blockedByThem] = await Promise.all([
        transaction.get(firestore.collection('blocks').doc(`${uid}_${candidate.id}`)),
        transaction.get(firestore.collection('blocks').doc(`${candidate.id}_${uid}`)),
      ]);
      if (!blockedByMe.exists && !blockedByThem.exists) {
        selected = candidate;
        break;
      }
    }

    if (!selected) {
      transaction.set(queueRef, {
        userUid: uid,
        purpose,
        channel,
        status: 'waiting',
        joinedAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + WAITING_TTL_MS),
      });
      return { status: 'waiting' };
    }

    const peerUid = selected.id;
    const sessionRef = firestore.collection('voiceMatchSessions').doc();
    const matchData = {
      status: 'matched',
      sessionId: sessionRef.id,
      initiatorUid: uid,
      matchedAt: now,
    };

    transaction.set(queueRef, {
      userUid: uid,
      purpose,
      channel,
      peerUid,
      joinedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + WAITING_TTL_MS),
      ...matchData,
    });
    transaction.update(selected.ref, {
      peerUid: uid,
      ...matchData,
    });
    transaction.set(sessionRef, {
      participantUids: [uid, peerUid],
      purpose,
      channel,
      initiatorUid: uid,
      status: 'matched',
      createdAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + WAITING_TTL_MS),
    });

    return {
      status: 'matched',
      peerUid,
      sessionId: sessionRef.id,
      initiatorUid: uid,
      channel,
    };
  });
});

exports.normalizeMatchRequest = normalizeMatchRequest;
