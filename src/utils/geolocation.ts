import { calculateDistanceMeters, type Coordinates } from './locationUtils';

export interface PreciseGeolocation extends Coordinates {
  accuracy: number;
  observedAt: number;
  speed?: number | null;
  heading?: number | null;
}

const MAX_ACCEPTED_ACCURACY_METERS = 250;
const MAX_SAMPLE_AGE_MS = 30_000;
const ROUTE_ORIGIN_MAX_AGE_MS = 15_000;
const ROUTE_ORIGIN_MAX_ACCURACY_METERS = 150;
const FAST_ROUTE_FIX_ACCURACY_METERS = 120;
const FAST_ROUTE_FIX_WAIT_MS = 3_500;

export function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Bạn chưa cấp quyền vị trí. Hãy bật Vị trí chính xác cho trình duyệt rồi thử lại.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Định vị mất quá nhiều thời gian. Hãy bật GPS, Wi-Fi hoặc dữ liệu di động rồi thử lại.';
  }
  return 'Chưa lấy được vị trí hiện tại. Hãy thử lại ở nơi có tín hiệu tốt hơn.';
}

export function geolocationSample(position: GeolocationPosition): PreciseGeolocation {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    observedAt: position.timestamp || Date.now(),
    speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
    heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
  };
}

export function isUsableGeolocationSample(
  next: PreciseGeolocation,
  now = Date.now(),
): boolean {
  return Number.isFinite(next.lat)
    && next.lat >= -90
    && next.lat <= 90
    && Number.isFinite(next.lng)
    && next.lng >= -180
    && next.lng <= 180
    && Number.isFinite(next.accuracy)
    && next.accuracy > 0
    && next.accuracy <= MAX_ACCEPTED_ACCURACY_METERS
    && now - next.observedAt <= MAX_SAMPLE_AGE_MS;
}

/**
 * Ignore stale, very inaccurate and physically implausible GPS jumps. This is
 * intentionally conservative: a rejected sample is followed by the next
 * browser watch sample instead of moving the marker to a wrong street.
 */
export function shouldAcceptGeolocationSample(
  previous: PreciseGeolocation | null,
  next: PreciseGeolocation,
  now = Date.now(),
): boolean {
  if (!isUsableGeolocationSample(next, now)) return false;
  if (!previous || !isUsableGeolocationSample(previous, now)) return true;
  if (next.observedAt < previous.observedAt) return false;
  if (next.observedAt === previous.observedAt
    && next.lat === previous.lat
    && next.lng === previous.lng
    && next.accuracy === previous.accuracy) return false;

  const elapsedSeconds = Math.max(1, (next.observedAt - previous.observedAt) / 1_000);
  const distanceMeters = calculateDistanceMeters(previous, next);
  const uncertaintyMeters = previous.accuracy + next.accuracy;
  const plausibleDistanceMeters = uncertaintyMeters + elapsedSeconds * 70;
  if (distanceMeters > Math.max(150, plausibleDistanceMeters)) return false;

  const previousIsRecent = now - previous.observedAt < 15_000;
  const muchLessAccurate = next.accuracy > Math.max(80, previous.accuracy * 3);
  return !(previousIsRecent && muchLessAccurate && distanceMeters <= next.accuracy);
}

/** Reuse a recent on-device fix instead of making every route request wait for GPS again. */
export function isRecentRouteOrigin(sample: PreciseGeolocation | null, now = Date.now()): sample is PreciseGeolocation {
  return Boolean(sample
    && isUsableGeolocationSample(sample, now)
    && now >= sample.observedAt
    && now - sample.observedAt <= ROUTE_ORIGIN_MAX_AGE_MS
    && sample.accuracy <= ROUTE_ORIGIN_MAX_ACCURACY_METERS);
}

/** Show a recent cached fix quickly, then keep refining it with high-accuracy GPS. */
export function watchResponsiveGeolocation(
  onPosition: (position: GeolocationPosition) => void,
  onError?: (error: GeolocationPositionError) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => undefined;
  let active = true;
  const receive = (position: GeolocationPosition) => {
    if (active) onPosition(position);
  };
  navigator.geolocation.getCurrentPosition(receive, () => undefined, {
    enableHighAccuracy: false,
    maximumAge: 20_000,
    timeout: 2_500,
  });
  const watchId = navigator.geolocation.watchPosition(receive, (error) => {
    if (active) onError?.(error);
  }, {
    enableHighAccuracy: true,
    maximumAge: 1_500,
    timeout: 8_000,
  });
  return () => {
    active = false;
    navigator.geolocation.clearWatch(watchId);
  };
}

export function requestFreshGeolocation(timeoutMs = 10_000): Promise<PreciseGeolocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Thiết bị này không hỗ trợ định vị.'));
  }

  return new Promise((resolve, reject) => {
    let best: PreciseGeolocation | null = null;
    let settled = false;
    let watchId = 0;

    const finish = (sample?: PreciseGeolocation, error?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      window.clearTimeout(fastFixTimer);
      if (sample) resolve(sample);
      else reject(new Error(error ? geolocationErrorMessage(error) : 'Chưa lấy được vị trí đủ chính xác. Hãy thử lại.'));
    };

    const timer = window.setTimeout(() => finish(best || undefined), timeoutMs);
    const fastFixTimer = window.setTimeout(() => {
      if (best && best.accuracy <= ROUTE_ORIGIN_MAX_ACCURACY_METERS) finish(best);
    }, Math.min(FAST_ROUTE_FIX_WAIT_MS, timeoutMs));
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const sample = geolocationSample(position);
        if (!isUsableGeolocationSample(sample)) return;
        if (!best || sample.accuracy < best.accuracy || sample.observedAt > best.observedAt + 2_000) {
          best = sample;
        }
        if (sample.accuracy <= FAST_ROUTE_FIX_ACCURACY_METERS) finish(sample);
      },
      (error) => finish(best || undefined, error),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      },
    );
  });
}
