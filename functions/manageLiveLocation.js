const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { distanceBetween, geohashForLocation, geohashQueryBounds } = require('geofire-common');
const { sendDataNotification } = require('./notificationHelpers');

if (!getApps().length) initializeApp();

const LIVE_TTL_MS = 15 * 60 * 1000;
const RECENT_ENCOUNTER_MS = 2 * 60 * 1000;
const ENCOUNTER_RADIUS_METERS = 35;
const ENCOUNTER_REARM_RADIUS_METERS = 70;
const ENCOUNTER_SEARCH_RADIUS_METERS = 100;
const ENCOUNTER_REARM_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const MAX_ENCOUNTER_ACCURACY_METERS = 80;
const ALLOWED_VISIBILITY = new Set(['friends', 'major', 'tvu']);

const pairIdFor = (leftUid, rightUid) => [leftUid, rightUid].sort().join('_');

function decimalsForVisibility(visibility) {
  if (visibility === 'friends') return 4;
  if (visibility === 'major') return 3;
  return 2;
}

function roundCoordinate(value, visibility) {
  return Number(Number(value).toFixed(decimalsForVisibility(visibility)));
}

function roundEncounterDistance(distanceMeters) {
  return Math.max(5, Math.round(Number(distanceMeters) / 5) * 5);
}

function canDiscoverLocation(ownerLocation, viewerMajor, isFriend) {
  if (ownerLocation.visibility === 'friends') return isFriend;
  if (ownerLocation.visibility === 'major') {
    return isFriend
      || Boolean(ownerLocation.majorNormalized)
        && ownerLocation.majorNormalized === viewerMajor;
  }
  return ownerLocation.visibility === 'tvu';
}

function visibilityForViewer(ownerLocation, viewerMajor, isFriend, isOwn = false) {
  if (isOwn || isFriend) return 'friends';
  if (
    ownerLocation.visibility === 'major'
    && ownerLocation.majorNormalized
    && ownerLocation.majorNormalized === viewerMajor
  ) return 'major';
  return 'tvu';
}

function requireLocationUpdate(request) {
  const uid = request.auth?.uid;
  const latitude = Number(request.data?.latitude);
  const longitude = Number(request.data?.longitude);
  const accuracy = Number(request.data?.accuracy);
  const visibility = request.data?.visibility;
  const encounterAlertsEnabled = request.data?.encounterAlertsEnabled === true;
  const speed = request.data?.speed;
  const heading = request.data?.heading;

  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để chia sẻ vị trí.');
  if (!ALLOWED_VISIBILITY.has(visibility)) {
    throw new HttpsError('invalid-argument', 'Phạm vi chia sẻ vị trí không hợp lệ.');
  }
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude <= -90
    || latitude >= 90
    || longitude < -180
    || longitude > 180
  ) {
    throw new HttpsError('out-of-range', 'Tọa độ vị trí không hợp lệ.');
  }

  return {
    uid,
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 0), 5_000) : 0,
    visibility,
    encounterAlertsEnabled,
    speed: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0
      ? Math.min(speed, 80)
      : null,
    heading: typeof heading === 'number' && Number.isFinite(heading)
      ? ((heading % 360) + 360) % 360
      : null,
  };
}

async function acceptedFriendUids(firestore, uid) {
  const snapshot = await firestore.collection('friendships')
    .where('participantUids', 'array-contains', uid)
    .limit(250)
    .get();

  return snapshot.docs
    .filter((friendship) => friendship.data().status === 'accepted')
    .flatMap((friendship) => friendship.data().participantUids || [])
    .filter((participantUid) => participantUid !== uid && typeof participantUid === 'string');
}

async function nearbyPrivateLocations(firestore, latitude, longitude) {
  const bounds = geohashQueryBounds([latitude, longitude], ENCOUNTER_SEARCH_RADIUS_METERS);
  const snapshots = await Promise.all(bounds.map(([startHash, endHash]) => (
    firestore.collection('privateLiveLocations')
      .orderBy('geohash')
      .startAt(startHash)
      .endAt(endHash)
      .limit(50)
      .get()
  )));

  const locations = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((location) => {
    locations.set(location.id, location.data());
  }));
  return locations;
}

async function createEncounterIfNeeded({ firestore, current, candidate, friendUids, now }) {
  if (!candidate.encounterAlertsEnabled || candidate.uid === current.uid) return null;
  if ((current.accuracy || 0) > MAX_ENCOUNTER_ACCURACY_METERS) return null;
  if ((candidate.accuracy || 0) > MAX_ENCOUNTER_ACCURACY_METERS) return null;

  const updatedAtMillis = candidate.updatedAt?.toMillis?.() || 0;
  const expiresAtMillis = candidate.expiresAt?.toMillis?.() || 0;
  if (updatedAtMillis < now.toMillis() - RECENT_ENCOUNTER_MS || expiresAtMillis <= now.toMillis()) {
    return null;
  }

  const distanceMeters = distanceBetween(
    [current.latitude, current.longitude],
    [candidate.latitude, candidate.longitude],
  ) * 1_000;

  const pairId = pairIdFor(current.uid, candidate.uid);
  const stateRef = firestore.collection('_systemEncounterPairStates').doc(pairId);
  if (distanceMeters >= ENCOUNTER_REARM_RADIUS_METERS) {
    await firestore.runTransaction(async (transaction) => {
      const state = await transaction.get(stateRef);
      if (!state.exists || state.data()?.armed !== false) return;
      transaction.set(stateRef, {
        participantUids: [current.uid, candidate.uid].sort(),
        armed: true,
        rearmedAt: now,
        lastObservedAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000),
      }, { merge: true });
    });
    return null;
  }
  if (distanceMeters > ENCOUNTER_RADIUS_METERS) return null;

  const isFriend = friendUids.has(candidate.uid);
  const mutuallyVisible = canDiscoverLocation(current, candidate.majorNormalized, isFriend)
    && canDiscoverLocation(candidate, current.majorNormalized, isFriend);
  if (!mutuallyVisible) return null;

  const [blockedByCurrent, blockedByCandidate] = await Promise.all([
    firestore.collection('blocks').doc(`${current.uid}_${candidate.uid}`).get(),
    firestore.collection('blocks').doc(`${candidate.uid}_${current.uid}`).get(),
  ]);
  if (blockedByCurrent.exists || blockedByCandidate.exists) return null;

  const encounterRef = firestore.collection('studentEncounters').doc();
  let created = false;

  await firestore.runTransaction(async (transaction) => {
    created = false;
    const state = await transaction.get(stateRef);
    const stateData = state.data() || {};
    const lastTriggeredAt = stateData.lastTriggeredAt?.toMillis?.() || 0;
    const timedOut = lastTriggeredAt > 0
      && now.toMillis() - lastTriggeredAt >= ENCOUNTER_REARM_TIMEOUT_MS;
    if (state.exists && stateData.armed === false && !timedOut) return;

    transaction.create(encounterRef, {
      participantUids: [current.uid, candidate.uid].sort(),
      occurredAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000),
      distanceBand: distanceMeters <= 15 ? 'very-close' : 'nearby',
      distanceMeters: roundEncounterDistance(distanceMeters),
    });
    transaction.set(stateRef, {
      participantUids: [current.uid, candidate.uid].sort(),
      armed: false,
      lastTriggeredAt: now,
      lastObservedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000),
    });
    created = true;
  });

  if (!created) return null;
  return {
    encounterId: encounterRef.id,
    distanceMeters: roundEncounterDistance(distanceMeters),
    candidateUid: candidate.uid,
    candidateName: candidate.displayName || 'Một sinh viên TVU',
    currentName: current.displayName || 'Một sinh viên TVU',
  };
}

exports.updateLiveLocation = onCall(async (request) => {
  const input = requireLocationUpdate(request);
  const firestore = getFirestore();
  const profileRef = firestore.collection('profiles').doc(input.uid);
  const profile = await profileRef.get();
  if (!profile.exists) throw new HttpsError('failed-precondition', 'Bạn cần hoàn thành hồ sơ trước.');

  const profileData = profile.data() || {};
  const majorNormalized = typeof profileData.majorNormalized === 'string'
    ? profileData.majorNormalized
    : '';
  if (input.visibility === 'major' && !majorNormalized) {
    throw new HttpsError('failed-precondition', 'Hãy cập nhật ngành học trước khi chia sẻ cho người cùng ngành.');
  }

  const friendUids = new Set(await acceptedFriendUids(firestore, input.uid));
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + LIVE_TTL_MS);
  const geohash = geohashForLocation([input.latitude, input.longitude]);
  const displayName = profileData.fullName || profileData.nickname || 'Sinh viên TVU';
  const privateLocation = {
    ...input,
    displayName,
    majorNormalized,
    geohash,
    updatedAt: now,
    expiresAt,
  };

  const batch = firestore.batch();
  batch.set(firestore.collection('privateLiveLocations').doc(input.uid), privateLocation);
  batch.set(firestore.collection('sharedStudentLocations').doc(input.uid), {
    uid: input.uid,
    latitude: roundCoordinate(input.latitude, input.visibility),
    longitude: roundCoordinate(input.longitude, input.visibility),
    accuracy: Math.ceil(input.accuracy / 25) * 25,
    visibility: input.visibility,
    viewerUids: [...friendUids],
    majorNormalized,
    updatedAt: now,
    expiresAt,
  });
  batch.set(firestore.collection('locationPreferences').doc(input.uid), {
    uid: input.uid,
    visibility: input.visibility,
    encounterAlertsEnabled: input.encounterAlertsEnabled,
    updatedAt: now,
  }, { merge: true });
  await batch.commit();

  const createdEncounters = [];
  if (input.encounterAlertsEnabled && input.accuracy <= MAX_ENCOUNTER_ACCURACY_METERS) {
    const candidates = await nearbyPrivateLocations(firestore, input.latitude, input.longitude);
      const sortedCandidates = [...candidates.values()]
      .filter((candidate) => candidate.uid !== input.uid)
      .sort((left, right) => (
        distanceBetween([left.latitude, left.longitude], [input.latitude, input.longitude])
        - distanceBetween([right.latitude, right.longitude], [input.latitude, input.longitude])
      ))
      .slice(0, 20);

    for (const candidate of sortedCandidates) {
      const encounter = await createEncounterIfNeeded({
        firestore,
        current: privateLocation,
        candidate,
        friendUids,
        now,
      });
      if (encounter) createdEncounters.push(encounter);
    }
  }

  await Promise.all(createdEncounters.flatMap((encounter) => [
    sendDataNotification(input.uid, {
      type: 'encounter',
      peerUid: encounter.candidateUid,
      peerName: encounter.candidateName,
      encounterId: encounter.encounterId,
      distanceMeters: encounter.distanceMeters,
      body: `Bạn vừa chạm mặt ${encounter.candidateName}.`,
    }),
    sendDataNotification(encounter.candidateUid, {
      type: 'encounter',
      peerUid: input.uid,
      peerName: encounter.currentName,
      encounterId: encounter.encounterId,
      distanceMeters: encounter.distanceMeters,
      body: `Bạn vừa chạm mặt ${encounter.currentName}.`,
    }),
  ])).catch((error) => {
    console.error('Could not send encounter notification:', error);
  });

  return {
    updatedAt: now.toMillis(),
    expiresAt: expiresAt.toMillis(),
    encountersCreated: createdEncounters.length,
  };
});

exports.stopLiveLocation = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để dừng chia sẻ vị trí.');

  const firestore = getFirestore();
  const batch = firestore.batch();
  batch.delete(firestore.collection('privateLiveLocations').doc(uid));
  batch.delete(firestore.collection('sharedStudentLocations').doc(uid));
  batch.set(firestore.collection('locationPreferences').doc(uid), {
    uid,
    visibility: 'off',
    encounterAlertsEnabled: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { stopped: true };
});

exports.getVisibleStudentLocations = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để xem bản đồ bạn bè.');
  const focusUid = typeof request.data?.focusUid === 'string'
    ? request.data.focusUid.trim()
    : '';
  if (focusUid && (focusUid.length > 128 || focusUid === uid)) {
    throw new HttpsError('invalid-argument', 'Vị trí cần theo dõi không hợp lệ.');
  }

  const firestore = getFirestore();
  const [profileSnapshot, preferencesSnapshot, ownPrivateLocation] = await Promise.all([
    firestore.collection('profiles').doc(uid).get(),
    firestore.collection('locationPreferences').doc(uid).get(),
    firestore.collection('privateLiveLocations').doc(uid).get(),
  ]);
  if (!profileSnapshot.exists) {
    throw new HttpsError('failed-precondition', 'Bạn cần hoàn thành hồ sơ trước.');
  }

  const now = Timestamp.now();
  const sharingIsActive = preferencesSnapshot.data()?.visibility !== 'off'
    && ownPrivateLocation.exists
    && (ownPrivateLocation.data()?.expiresAt?.toMillis?.() || 0) > now.toMillis();
  if (!sharingIsActive) return { locations: [] };

  const viewerMajor = profileSnapshot.data()?.majorNormalized || '';
  const friendUids = new Set(await acceptedFriendUids(firestore, uid));
  let candidateLocationDocs;
  let blockedUids;

  if (focusUid) {
    const [focusedLocation, blockedByCurrent, blockedByFocus] = await Promise.all([
      firestore.collection('privateLiveLocations').doc(focusUid).get(),
      firestore.collection('blocks').doc(`${uid}_${focusUid}`).get(),
      firestore.collection('blocks').doc(`${focusUid}_${uid}`).get(),
    ]);
    candidateLocationDocs = [ownPrivateLocation, focusedLocation]
      .filter((location) => location.exists)
      .filter((location) => (location.data()?.expiresAt?.toMillis?.() || 0) > now.toMillis());
    blockedUids = new Set(blockedByCurrent.exists || blockedByFocus.exists ? [focusUid] : []);
  } else {
    const [locationSnapshot, blockedByMeSnapshot, blockedByThemSnapshot] = await Promise.all([
      firestore.collection('privateLiveLocations')
        .where('expiresAt', '>', now)
        .limit(200)
        .get(),
      firestore.collection('blocks').where('blockerUid', '==', uid).limit(250).get(),
      firestore.collection('blocks').where('blockedUid', '==', uid).limit(250).get(),
    ]);
    candidateLocationDocs = locationSnapshot.docs;
    blockedUids = new Set([
      ...blockedByMeSnapshot.docs.map((block) => block.data().blockedUid),
      ...blockedByThemSnapshot.docs.map((block) => block.data().blockerUid),
    ]);
  }

  const visibleLocationDocs = candidateLocationDocs.filter((locationDocument) => {
    const location = locationDocument.data();
    if (location.uid === uid) return true;
    if (blockedUids.has(location.uid)) return false;
    return canDiscoverLocation(location, viewerMajor, friendUids.has(location.uid));
  }).slice(0, 100);

  const profileRefs = visibleLocationDocs.map((location) => (
    firestore.collection('profiles').doc(location.id)
  ));
  const profiles = profileRefs.length ? await firestore.getAll(...profileRefs) : [];
  const profilesByUid = new Map(profiles.map((profile) => [profile.id, profile.data() || {}]));

  return {
    locations: visibleLocationDocs.map((locationDocument) => {
      const location = locationDocument.data();
      const profile = profilesByUid.get(location.uid) || {};
      const isFriend = friendUids.has(location.uid);
      const isOwn = location.uid === uid;
      const viewerPrecision = visibilityForViewer(location, viewerMajor, isFriend, isOwn);
      return {
        uid: location.uid,
        latitude: roundCoordinate(location.latitude, viewerPrecision),
        longitude: roundCoordinate(location.longitude, viewerPrecision),
        accuracy: Math.ceil((location.accuracy || 0) / 25) * 25,
        visibility: location.visibility,
        updatedAt: location.updatedAt?.toMillis?.() || 0,
        expiresAt: location.expiresAt?.toMillis?.() || 0,
        fullName: profile.fullName || profile.nickname || 'Sinh viên TVU',
        photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : null,
        major: typeof profile.major === 'string' ? profile.major : '',
        isFriend,
        isOwn,
        isMoving: (isFriend || isOwn) && Number(location.speed) >= 0.8,
        heading: (isFriend || isOwn) && Number.isFinite(location.heading)
          ? Math.round(location.heading / 15) * 15 % 360
          : null,
      };
    }),
  };
});

exports.deleteExpiredLiveLocations = onSchedule('every 30 minutes', async () => {
  const firestore = getFirestore();
  const now = Timestamp.now();
  const [privateSnapshot, encounterSnapshot, encounterStateSnapshot] = await Promise.all([
    firestore.collection('privateLiveLocations')
      .where('expiresAt', '<=', now)
      .limit(150)
      .get(),
    firestore.collection('studentEncounters')
      .where('expiresAt', '<=', now)
      .limit(150)
      .get(),
    firestore.collection('_systemEncounterPairStates')
      .where('expiresAt', '<=', now)
      .limit(150)
      .get(),
  ]);

  if (privateSnapshot.empty && encounterSnapshot.empty && encounterStateSnapshot.empty) return null;
  const batch = firestore.batch();
  privateSnapshot.docs.forEach((location) => {
    batch.delete(location.ref);
    batch.delete(firestore.collection('sharedStudentLocations').doc(location.id));
  });
  encounterSnapshot.docs.forEach((encounter) => batch.delete(encounter.ref));
  encounterStateSnapshot.docs.forEach((state) => batch.delete(state.ref));
  await batch.commit();
  return null;
});

exports.canDiscoverLocation = canDiscoverLocation;
exports.decimalsForVisibility = decimalsForVisibility;
exports.requireLocationUpdate = requireLocationUpdate;
exports.roundEncounterDistance = roundEncounterDistance;
exports.roundCoordinate = roundCoordinate;
exports.visibilityForViewer = visibilityForViewer;
