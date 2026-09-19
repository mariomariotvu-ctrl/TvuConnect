import { calculateDistanceMeters } from './locationUtils';

export interface LivePositionSample {
  latitude: number;
  longitude: number;
  accuracy: number;
  sentAt: number;
  observedAt?: number;
}

export const NORMAL_LOCATION_INTERVAL_MS = 6_000;
export const ENCOUNTER_LOCATION_INTERVAL_MS = 4_000;
export const LOCATION_KEEP_ALIVE_MS = 45_000;
export const NORMAL_MOVEMENT_METERS = 6;
export const ENCOUNTER_MOVEMENT_METERS = 4;

export function shouldSendLivePosition(
  previous: LivePositionSample | null,
  next: LivePositionSample,
  now: number,
  encounterAlertsEnabled: boolean,
  force = false,
): boolean {
  if (!previous || force) return true;

  const elapsed = now - previous.sentAt;
  const minimumInterval = encounterAlertsEnabled
    ? ENCOUNTER_LOCATION_INTERVAL_MS
    : NORMAL_LOCATION_INTERVAL_MS;
  if (elapsed < minimumInterval) return false;

  const movedMeters = calculateDistanceMeters(
    { lat: previous.latitude, lng: previous.longitude },
    { lat: next.latitude, lng: next.longitude },
  );
  const movementThreshold = encounterAlertsEnabled
    ? ENCOUNTER_MOVEMENT_METERS
    : NORMAL_MOVEMENT_METERS;

  return movedMeters >= movementThreshold || elapsed >= LOCATION_KEEP_ALIVE_MS;
}
