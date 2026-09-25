const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { normalizeRouteResponse, projectedCoordinate } = require('./getStudentRoute');
const { getRuntimeConfig } = require('./runtimeConfig');

if (!getApps().length) initializeApp();

const ROUTE_PROVIDERS = {
  walking: 'routed-foot',
  cycling: 'routed-bike',
  driving: 'routed-car',
};
const MAX_REQUESTS_PER_HOUR = 50;

function validPoint(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  return Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    ? { latitude, longitude }
    : null;
}

function requireMapRouteInput(request) {
  const uid = request.auth?.uid;
  const origin = validPoint(request.data?.origin);
  const destination = validPoint(request.data?.destination);
  const mode = request.data?.mode;
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để xem chỉ đường.');
  if (!origin || !destination) throw new HttpsError('invalid-argument', 'Điểm đầu hoặc điểm đến không hợp lệ.');
  if (!Object.hasOwn(ROUTE_PROVIDERS, mode)) {
    throw new HttpsError('invalid-argument', 'Phương tiện chỉ đường không hợp lệ.');
  }
  return { uid, origin, destination, mode };
}

async function consumeRateLimit(firestore, uid) {
  const reference = firestore.collection('_systemMapRouteRateLimits').doc(uid);
  const now = Date.now();
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data() || {};
    const startedAt = previous.windowStartedAt?.toMillis?.() || 0;
    const withinWindow = now - startedAt < 60 * 60 * 1000;
    const nextCount = withinWindow ? Number(previous.requestCount || 0) + 1 : 1;
    if (nextCount > MAX_REQUESTS_PER_HOUR) {
      throw new HttpsError('resource-exhausted', 'Bạn đã cập nhật tuyến khá nhiều. Hãy chờ một lúc rồi thử lại.');
    }
    transaction.set(reference, {
      requestCount: nextCount,
      windowStartedAt: Timestamp.fromMillis(withinWindow ? startedAt : now),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + 25 * 60 * 60 * 1000),
    }, { merge: true });
  });
}

exports.getMapRoute = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    const runtime = await getRuntimeConfig();
    if (!runtime.mapEnabled) throw new HttpsError('unavailable', 'Chỉ đường đang được bảo trì.');
    const input = requireMapRouteInput(request);
    await consumeRateLimit(getFirestore(), input.uid);

    const originLat = projectedCoordinate(input.origin.latitude);
    const originLng = projectedCoordinate(input.origin.longitude);
    const destinationLat = projectedCoordinate(input.destination.latitude);
    const destinationLng = projectedCoordinate(input.destination.longitude);
    const routeUrl = new URL(
      `https://routing.openstreetmap.de/${ROUTE_PROVIDERS[input.mode]}/route/v1/driving/`
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
      console.error('Map route provider failed:', error);
      throw new HttpsError('unavailable', 'Dịch vụ chỉ đường đang tạm bận.');
    }
    if (!response.ok) {
      console.error('Map route provider rejected request:', response.status);
      throw new HttpsError('unavailable', 'Chưa tìm được tuyến đường phù hợp lúc này.');
    }
    const normalized = normalizeRouteResponse(await response.json());
    if (!normalized) throw new HttpsError('not-found', 'Chưa tìm được tuyến đường phù hợp.');

    return {
      ...normalized,
      mode: input.mode,
      generatedAt: Date.now(),
      provider: 'OpenStreetMap',
    };
  },
);

exports.requireMapRouteInput = requireMapRouteInput;
