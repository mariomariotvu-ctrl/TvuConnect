const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { deliverNotification } = require('./notificationHelpers');

if (!getApps().length) initializeApp();

const MAX_RECIPIENTS = 80;
const MAX_INTEREST_QUERY_VALUES = 10;
const NEW_PROFILE_WINDOW_MS = 6 * 60 * 60 * 1000;

const normalizeInterest = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

function sharedInterests(left = [], right = []) {
  const rightValues = new Set(right.map(normalizeInterest).filter(Boolean));
  return left
    .filter((value) => rightValues.has(normalizeInterest(value)))
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 2);
}

function nearbyCellIds(cell) {
  const [latitudeIndex, longitudeIndex, extra] = String(cell || '').split(':');
  const latitude = Number(latitudeIndex);
  const longitude = Number(longitudeIndex);
  if (extra !== undefined || !Number.isInteger(latitude) || !Number.isInteger(longitude)) {
    return cell ? [String(cell)] : [];
  }

  const cells = [];
  for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
    for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
      cells.push(`${latitude + latitudeOffset}:${longitude + longitudeOffset}`);
    }
  }
  return cells;
}

function candidateReason(newProfile, candidate) {
  const interests = sharedInterests(newProfile.interests, candidate.interests);
  const nearby = newProfile.nearbyOptIn === true
    && candidate.nearbyOptIn === true
    && typeof newProfile.nearbyCell === 'string'
    && nearbyCellIds(newProfile.nearbyCell).includes(candidate.nearbyCell);
  return { interests, nearby };
}

function notificationCopy(name, reason) {
  if (reason.nearby && reason.interests.length) {
    return `${name} vừa tham gia, đang gần khu vực bạn chia sẻ và cũng thích ${reason.interests.join(', ')}.`;
  }
  if (reason.nearby) {
    return `${name} vừa tham gia và đang gần khu vực bạn đã chọn chia sẻ.`;
  }
  return `${name} vừa tham gia và cũng thích ${reason.interests.join(', ')}.`;
}

/**
 * Announce only a newly created, public profile. Nearby discovery requires
 * both sides to opt in and uses the coarse profile cell, never exact live
 * coordinates. Deterministic inbox ids make event retries harmless.
 */
exports.announceNewProfile = onDocumentWritten({
  document: 'profiles/{uid}',
  timeoutSeconds: 120,
  maxInstances: 5,
}, async (event) => {
  const snapshot = event.data?.after;
  if (!snapshot?.exists) return null;

  const uid = event.params.uid;
  const profile = snapshot.data() || {};
  const name = typeof profile.fullName === 'string' ? profile.fullName.trim() : '';
  const interests = Array.isArray(profile.interests)
    ? profile.interests.filter((interest) => typeof interest === 'string' && interest.trim())
    : [];
  const canMatchNearby = profile.nearbyOptIn === true
    && typeof profile.nearbyCell === 'string'
    && profile.nearbyCell.length > 0;

  const createdAtMillis = profile.createdAt?.toMillis?.() || 0;
  const isRecentlyCreated = createdAtMillis > 0
    && Math.abs(Date.now() - createdAtMillis) <= NEW_PROFILE_WINDOW_MS;
  if (!name || !isRecentlyCreated || (!interests.length && !canMatchNearby)) return null;

  const firestore = getFirestore();
  const candidateDocuments = new Map();
  const queries = [];

  if (interests.length) {
    const queryInterests = [...new Set(interests)].slice(0, MAX_INTEREST_QUERY_VALUES);
    queries.push(
      firestore.collection('profiles')
        .where('interests', 'array-contains-any', queryInterests)
        .limit(100)
        .get(),
    );
  }
  if (canMatchNearby) {
    queries.push(
      firestore.collection('profiles')
        .where('nearbyCell', 'in', nearbyCellIds(profile.nearbyCell))
        .limit(100)
        .get(),
    );
  }

  const [candidateSnapshots, blockedByNew, blockedNew] = await Promise.all([
    Promise.all(queries),
    firestore.collection('blocks').where('blockerUid', '==', uid).limit(250).get(),
    firestore.collection('blocks').where('blockedUid', '==', uid).limit(250).get(),
  ]);

  candidateSnapshots.forEach((candidateSnapshot) => {
    candidateSnapshot.docs.forEach((candidateDocument) => {
      if (candidateDocument.id !== uid) candidateDocuments.set(candidateDocument.id, candidateDocument);
    });
  });

  const blockedUids = new Set([
    ...blockedByNew.docs.map((block) => block.data().blockedUid),
    ...blockedNew.docs.map((block) => block.data().blockerUid),
  ]);

  const recipients = [...candidateDocuments.values()]
    .map((candidateDocument) => ({
      uid: candidateDocument.id,
      profile: candidateDocument.data() || {},
    }))
    .filter((candidate) => !blockedUids.has(candidate.uid))
    .map((candidate) => ({
      ...candidate,
      reason: candidateReason(profile, candidate.profile),
    }))
    .filter((candidate) => candidate.reason.nearby || candidate.reason.interests.length)
    .sort((left, right) => (
      Number(right.reason.nearby) - Number(left.reason.nearby)
      || right.reason.interests.length - left.reason.interests.length
    ))
    .slice(0, MAX_RECIPIENTS);

  const results = [];
  // Keep bursts bounded when several students finish registration together.
  // This protects Firestore/FCM quotas without delaying the profile write.
  for (let offset = 0; offset < recipients.length; offset += 10) {
    const recipientGroup = recipients.slice(offset, offset + 10);
    const groupResults = await Promise.allSettled(recipientGroup.map((recipient) => {
      const reasonLabel = [
        recipient.reason.nearby ? 'nearby' : '',
        recipient.reason.interests.length ? 'shared_interests' : '',
      ].filter(Boolean).join(',');

      return deliverNotification(recipient.uid, `new_profile_${uid}`, {
        type: 'new_profile',
        title: 'Có sinh viên mới phù hợp với bạn',
        body: notificationCopy(name, recipient.reason),
        actorUid: uid,
        actorName: name,
        actorPhotoURL: profile.photoURL || null,
        entityId: uid,
        route: '/friends',
        reason: reasonLabel,
        pushData: {
          sharedInterests: recipient.reason.interests.join(', '),
          nearby: recipient.reason.nearby,
        },
      });
    }));
    results.push(...groupResults);
  }

  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length) {
    console.error('Some new-profile notifications failed', {
      uid,
      rejected: rejected.length,
      recipients: recipients.length,
    });
  }

  return null;
});

exports.candidateReason = candidateReason;
exports.normalizeInterest = normalizeInterest;
exports.nearbyCellIds = nearbyCellIds;
exports.notificationCopy = notificationCopy;
exports.sharedInterests = sharedInterests;
