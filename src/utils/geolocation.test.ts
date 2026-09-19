import { describe, expect, it } from 'vitest';
import {
  isUsableGeolocationSample,
  shouldAcceptGeolocationSample,
  type PreciseGeolocation,
} from './geolocation';

const now = 100_000;
const base: PreciseGeolocation = {
  lat: 9.9345,
  lng: 106.3461,
  accuracy: 12,
  observedAt: now - 2_000,
};

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
});
