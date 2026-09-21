import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isUsableGeolocationSample,
  isRecentRouteOrigin,
  shouldAcceptGeolocationSample,
  watchResponsiveGeolocation,
  type PreciseGeolocation,
} from './geolocation';

const now = 100_000;
const base: PreciseGeolocation = {
  lat: 9.9345,
  lng: 106.3461,
  accuracy: 12,
  observedAt: now - 2_000,
};

afterEach(() => vi.unstubAllGlobals());

describe('GPS sample quality', () => {
  it('rejects stale or very inaccurate samples', () => {
    expect(isUsableGeolocationSample({ ...base, observedAt: now - 31_000 }, now)).toBe(false);
    expect(isUsableGeolocationSample({ ...base, accuracy: 400 }, now)).toBe(false);
  });

  it('accepts a fresh nearby movement', () => {
    expect(shouldAcceptGeolocationSample(base, {
      ...base,
      lat: base.lat + 0.00005,
      observedAt: now,
    }, now)).toBe(true);
  });

  it('does not redraw the map for a duplicate cached fix', () => {
    expect(shouldAcceptGeolocationSample(base, { ...base }, now)).toBe(false);
  });

  it('rejects an impossible jump and a much worse duplicate', () => {
    expect(shouldAcceptGeolocationSample(base, {
      ...base,
      lat: base.lat + 0.1,
      observedAt: now,
    }, now)).toBe(false);
    expect(shouldAcceptGeolocationSample(base, {
      ...base,
      accuracy: 120,
      observedAt: now,
    }, now)).toBe(false);
  });

  it('reuses only a recent, reasonably accurate fix for routing', () => {
    expect(isRecentRouteOrigin(base, now)).toBe(true);
    expect(isRecentRouteOrigin({ ...base, observedAt: now - 16_000 }, now)).toBe(false);
    expect(isRecentRouteOrigin({ ...base, accuracy: 180 }, now)).toBe(false);
    expect(isRecentRouteOrigin({ ...base, observedAt: now + 1_000 }, now)).toBe(false);
  });

  it('shows a cached fix before GPS refinement and stops callbacks after cleanup', () => {
    let cachedSuccess: PositionCallback = () => undefined;
    let watchSuccess: PositionCallback = () => undefined;
    const getCurrentPosition = vi.fn((success: PositionCallback) => { cachedSuccess = success; });
    const watchPosition = vi.fn((success: PositionCallback) => { watchSuccess = success; return 42; });
    const clearWatch = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition, watchPosition, clearWatch } });
    const onPosition = vi.fn();
    const stop = watchResponsiveGeolocation(onPosition);
    const position = { coords: {}, timestamp: now } as GeolocationPosition;

    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ maximumAge: 20_000 }));
    cachedSuccess(position);
    watchSuccess(position);
    expect(onPosition).toHaveBeenCalledTimes(2);
    stop();
    watchSuccess(position);
    expect(onPosition).toHaveBeenCalledTimes(2);
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
