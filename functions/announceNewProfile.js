const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { deliverNotification } = require('./notificationHelpers');

if (!getApps().length) initializeApp();

const MAX_RECIPIENTS = 80;
const MAX_INTEREST_QUERY_VALUES = 10;
const NEW_PROFILE_WINDOW_MS = 6 * 60 * 60 * 1000;
const COMMUNITY_FEED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function shouldAnnounceProfile(before, profile, eventMillis = Date.now()) {
  const createdAt = profile?.createdAt?.toMillis?.() || 0;
  const alreadyHadProfile = typeof before?.fullName === 'string' && Boolean(before.fullName.trim() && before.createdAt?.toMillis?.());
  return !alreadyHadProfile && typeof profile?.fullName === 'string' && Boolean(profile.fullName.trim()) && createdAt > 0
    && eventMillis - createdAt >= -60_000
    && eventMillis - createdAt <= NEW_PROFILE_WINDOW_MS;
}

function communityNotification(uid, profile) {
  const name = String(profile.fullName || '').trim().slice(0, 120);
  return {
    type: 'new_profile',
    title: `${name} vừa tham gia TVU Connect`,
    body: 'Cùng chào đón bạn mới! Ghé Tìm bạn để làm quen và gửi lời mời kết bạn.',
    actorUid: uid,
    actorName: name,
    actorPhotoURL: typeof profile.photoURL === 'string' && /^https:\/\//i.test(profile.photoURL)
      ? profile.photoURL.slice(0, 2048) : null,
    entityId: uid,
    route: '/friends?tab=new',
    reason: 'community_joined',
    createdAt: profile.createdAt,
    expiresAt: Timestamp.fromMillis(profile.createdAt.toMillis() + COMMUNITY_FEED_WINDOW_MS),
  };
}

async function publishCommunityNotification(firestore, uid, profile) {
  const reference = firestore.collection('communityNotifications').doc(`new_profile_${uid}`);
  return firestore.runTransaction(async transaction => {
    const [current, existing] = await Promise.all([
      transaction.get(firestore.collection('profiles').doc(uid)),
      transaction.get(reference),
    ]);
    // A delayed/retried event must not resurrect a deleted account or duplicate a notice.
    if (!current.exists || existing.exists) return false;
    transaction.create(reference, communityNotification(uid, profile));
    return true;
  });
}

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
  region: 'asia-southeast1',
  timeoutSeconds: 120,
  maxInstances: 5,
  retry: true,
}, async (event) => {
  const snapshot = event.data?.after;
  const uid = event.params.uid;
  const firestore = getFirestore();
  if (!snapshot?.exists) {
    await firestore.collection('communityNotifications').doc(`new_profile_${uid}`).delete();
    return null;
  }
  const profile = snapshot.data() || {};
  if (!shouldAnnounceProfile(event.data?.before?.data(), profile, Date.parse(event.time) || Date.now())) return null;
  // One shared event, not a write/push to every account. Read state is private.
  await publishCommunityNotification(firestore, uid, profile);
  const name = typeof profile.fullName === 'string' ? profile.fullName.trim() : '';
  const interests = Array.isArray(profile.interests)
    ? profile.interests.filter((interest) => typeof interest === 'string' && interest.trim())
    : [];
  const canMatchNearby = profile.nearbyOptIn === true
    && typeof profile.nearbyCell === 'string'
    && profile.nearbyCell.length > 0;

  if (!interests.length && !canMatchNearby) return null;
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
        route: '/friends?tab=new',
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
exports.shouldAnnounceProfile = shouldAnnounceProfile;
exports.communityNotification = communityNotification;
exports.publishCommunityNotification = publishCommunityNotification;
