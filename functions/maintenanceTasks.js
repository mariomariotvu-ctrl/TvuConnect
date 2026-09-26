const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getFunctions } = require('firebase-admin/functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');

if (!getApps().length) initializeApp();

// Firestore TTL is the primary cleanup mechanism. This allowlist-backed queue
// is a retryable safety net and also removes expired documents sooner.
const TTL_COLLECTION_GROUPS = [
  'typing',
  'voiceMatchQueue',
  'voiceMatchSessions',
  'calls',
  'activeCallLocks',
  'callerCandidates',
  'calleeCandidates',
  'privateLiveLocations',
  'sharedStudentLocations',
  'studentEncounters',
  'musicStations',
  'fcmTokens',
  'notifications',
  '_notificationEvents',
  '_systemEncounterPairStates',
  '_systemAiRateLimits',
  '_systemPlaceSearchRateLimits',
  '_systemMapRouteRateLimits',
  '_systemStudentRouteRateLimits',
  '_systemTurnCredentialRateLimits',
  '_systemCommentEvents',
];

const ALLOWED_COLLECTIONS = new Set(TTL_COLLECTION_GROUPS);

function isAllowedDocumentPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 6_000) return false;
  const segments = path.split('/');
  if (segments.length < 2 || segments.length % 2 !== 0) return false;
  return ALLOWED_COLLECTIONS.has(segments[segments.length - 2]);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function shouldDeleteExpiredDocument(document, nowMillis = Date.now()) {
  if (!document?.exists) return false;
  const expiresAt = document.data()?.expiresAt;
  const expiresAtMillis = typeof expiresAt?.toMillis === 'function'
    ? expiresAt.toMillis()
    : NaN;
  return Number.isFinite(expiresAtMillis) && expiresAtMillis <= nowMillis;
}

exports.deleteExpiredDocumentsTask = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 60,
      maxBackoffSeconds: 900,
      maxRetrySeconds: 3_600,
    },
    rateLimits: {
      maxConcurrentDispatches: 3,
      maxDispatchesPerSecond: 2,
    },
    memory: '256MiB',
  },
  async (request) => {
    const paths = Array.isArray(request.data?.documentPaths)
      ? [...new Set(request.data.documentPaths)].filter(isAllowedDocumentPath).slice(0, 200)
      : [];
    if (!paths.length) return { deleted: 0 };

    const firestore = getFirestore();
    const references = paths.map((path) => firestore.doc(path));
    const snapshots = await firestore.getAll(...references);
    const nowMillis = Date.now();
    const expiredDocuments = snapshots.filter((document) => (
      shouldDeleteExpiredDocument(document, nowMillis)
    ));
    if (!expiredDocuments.length) {
      return { deleted: 0, skipped: paths.length };
    }

    const batch = firestore.batch();
    expiredDocuments.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    return {
      deleted: expiredDocuments.length,
      skipped: paths.length - expiredDocuments.length,
    };
  },
);

exports.scheduleFirebaseMaintenance = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'Asia/Ho_Chi_Minh',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const firestore = getFirestore();
    const now = Timestamp.now();
    const expiredPaths = [];

    for (const collectionGroup of TTL_COLLECTION_GROUPS) {
      const snapshot = await firestore
        .collectionGroup(collectionGroup)
        .where('expiresAt', '<=', now)
        .limit(200)
        .get();
      snapshot.docs.forEach((document) => expiredPaths.push(document.ref.path));
    }

    if (!expiredPaths.length) return { queued: 0 };

    const queue = getFunctions().taskQueue('deleteExpiredDocumentsTask');
    const groups = chunk(expiredPaths, 100);
    await Promise.all(groups.map((documentPaths) => queue.enqueue({ documentPaths })));
    return { queued: expiredPaths.length, tasks: groups.length };
  },
);

exports.TTL_COLLECTION_GROUPS = TTL_COLLECTION_GROUPS;
exports.isAllowedDocumentPath = isAllowedDocumentPath;
exports.shouldDeleteExpiredDocument = shouldDeleteExpiredDocument;
