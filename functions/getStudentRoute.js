const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();

const ROUTE_PROVIDERS = {
  walking: 'routed-foot',
  cycling: 'routed-bike',
  driving: 'routed-car',
};
const MAX_REQUESTS_PER_HOUR = 30;

function requireRouteInput(request) {
  const uid = request.auth?.uid;
  const targetUid = typeof request.data?.targetUid === 'string'
    ? request.data.targetUid.trim()
    : '';
  const mode = request.data?.mode;

  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để xem chỉ đường.');
  if (!targetUid || targetUid.length > 128 || targetUid === uid) {
    throw new HttpsError('invalid-argument', 'Người nhận chỉ đường không hợp lệ.');
  }
  if (!Object.hasOwn(ROUTE_PROVIDERS, mode)) {
    throw new HttpsError('invalid-argument', 'Phương tiện chỉ đường không hợp lệ.');
  }
  return { uid, targetUid, mode };
}

function projectedCoordinate(value) {
  return Number(Number(value).toFixed(4));
}

function normalizeRouteResponse(payload) {
  const route = payload?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!route || !Array.isArray(coordinates) || coordinates.length < 2) return null;

  const path = coordinates
    .filter((coordinate) => (
      Array.isArray(coordinate)
      && Number.isFinite(Number(coordinate[0]))
      && Number.isFinite(Number(coordinate[1]))
    ))
    .slice(0, 4_000)
    .map(([longitude, latitude]) => ({
      latitude: Number(latitude),
      longitude: Number(longitude),
    }));
  if (path.length < 2) return null;

  const steps = (route.legs || []).flatMap((leg) => leg.steps || [])
    .filter((step) => Number(step?.distance) >= 1)
    .slice(0, 80)
    .map((step) => ({
      type: typeof step?.maneuver?.type === 'string' ? step.maneuver.type : 'continue',
      modifier: typeof step?.maneuver?.modifier === 'string' ? step.maneuver.modifier : '',
      roadName: typeof step?.name === 'string' ? step.name.slice(0, 120) : '',
      distanceMeters: Math.max(0, Math.round(Number(step.distance) || 0)),
      durationSeconds: Math.max(0, Math.round(Number(step.duration) || 0)),
    }));

  return {
    distanceMeters: Math.max(0, Math.round(Number(route.distance) || 0)),
    durationSeconds: Math.max(0, Math.round(Number(route.duration) || 0)),
    path,
    steps,
  };
}

async function consumeRateLimit(firestore, uid) {
  const reference = firestore.collection('_systemStudentRouteRateLimits').doc(uid);
  const now = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data() || {};
    const startedAt = previous.windowStartedAt?.toMillis?.() || 0;
    const withinWindow = now - startedAt < 60 * 60 * 1000;
    const nextCount = withinWindow ? Number(previous.requestCount || 0) + 1 : 1;

    if (nextCount > MAX_REQUESTS_PER_HOUR) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đã cập nhật tuyến đường khá nhiều. Hãy chờ một lúc rồi thử lại.',
      );
    }

    transaction.set(reference, {
      requestCount: nextCount,
      windowStartedAt: Timestamp.fromMillis(withinWindow ? startedAt : now),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

exports.getStudentRoute = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    const input = requireRouteInput(request);
    const firestore = getFirestore();
    const now = Date.now();
    const [currentLocation, targetLocation, friendships, blockedByCurrent, blockedByTarget] = await Promise.all([
      firestore.collection('privateLiveLocations').doc(input.uid).get(),
      firestore.collection('privateLiveLocations').doc(input.targetUid).get(),
      firestore.collection('friendships')
        .where('participantUids', 'array-contains', input.uid)
        .limit(250)
        .get(),
      firestore.collection('blocks').doc(`${input.uid}_${input.targetUid}`).get(),
      firestore.collection('blocks').doc(`${input.targetUid}_${input.uid}`).get(),
    ]);

    const isFriend = friendships.docs.some((friendship) => {
      const data = friendship.data();
      return data.status === 'accepted'
        && Array.isArray(data.participantUids)
        && data.participantUids.includes(input.targetUid);
    });
    if (!isFriend || blockedByCurrent.exists || blockedByTarget.exists) {
      throw new HttpsError(
        'permission-denied',
        'Chỉ có thể chỉ đường đến bạn bè đang đồng ý chia sẻ vị trí.',
      );
    }

    const origin = currentLocation.data();
    const destination = targetLocation.data();
    const originActive = currentLocation.exists && (origin?.expiresAt?.toMillis?.() || 0) > now;
    const destinationActive = targetLocation.exists && (destination?.expiresAt?.toMillis?.() || 0) > now;
    if (!originActive || !destinationActive) {
      throw new HttpsError(
        'failed-precondition',
        'Cả hai người cần đang chia sẻ vị trí để dùng chỉ đường.',
      );
    }

    await consumeRateLimit(firestore, input.uid);

    // The public routing provider receives only the same ~10 m projection a
    // friend can already see, never the original private Firestore point.
    const originLat = projectedCoordinate(origin.latitude);
    const originLng = projectedCoordinate(origin.longitude);
    const destinationLat = projectedCoordinate(destination.latitude);
    const destinationLng = projectedCoordinate(destination.longitude);
    const provider = ROUTE_PROVIDERS[input.mode];
    const routeUrl = new URL(
      `https://routing.openstreetmap.de/${provider}/route/v1/driving/`
      + `${originLng},${originLat};${destinationLng},${destinationLat}`,
    );
    routeUrl.searchParams.set('overview', 'full');
    routeUrl.searchParams.set('geometries', 'geojson');
    routeUrl.searchParams.set('steps', 'true');
    routeUrl.searchParams.set('alternatives', 'false');

    let response;
    try {
      response = await fetch(routeUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TVUConnect/1.0 (https://tvuconnect.vercel.app)',
        },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      console.error('Student route provider failed:', error);
      throw new HttpsError('unavailable', 'Dịch vụ chỉ đường đang tạm bận.');
    }
    if (!response.ok) {
      console.error('Student route provider rejected request:', response.status);
      throw new HttpsError('unavailable', 'Chưa tìm được tuyến đường phù hợp lúc này.');
    }

    const normalized = normalizeRouteResponse(await response.json());
    if (!normalized) {
      throw new HttpsError('not-found', 'Chưa tìm được tuyến đường phù hợp.');
    }

    return {
      ...normalized,
      mode: input.mode,
      targetUid: input.targetUid,
      targetUpdatedAt: destination.updatedAt?.toMillis?.() || 0,
      generatedAt: Date.now(),
      provider: 'OpenStreetMap',
    };
  },
);

exports.normalizeRouteResponse = normalizeRouteResponse;
exports.projectedCoordinate = projectedCoordinate;
exports.requireRouteInput = requireRouteInput;
