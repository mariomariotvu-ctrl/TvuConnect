import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type {
  LocationPreferences,
  LocationVisibility,
  StudentEncounter,
  VisibleStudentLocation,
} from '../types';
import { requestFreshGeolocation } from '../utils/geolocation';
import { requireRuntimeFeature } from '../config/runtimeConfig';

export interface LiveLocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  visibility: Exclude<LocationVisibility, 'off'>;
  encounterAlertsEnabled: boolean;
  speed?: number | null;
  heading?: number | null;
}

export type StudentRouteMode = 'walking' | 'cycling' | 'driving';

export interface StudentRouteStep {
  type: string;
  modifier: string;
  roadName: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface StudentRoute {
  mode: StudentRouteMode;
  targetUid: string;
  targetUpdatedAt: number;
  generatedAt: number;
  provider: 'OpenStreetMap';
  distanceMeters: number;
  durationSeconds: number;
  path: Array<{ latitude: number; longitude: number }>;
  steps: StudentRouteStep[];
}

export interface MapRoute {
  mode: StudentRouteMode;
  generatedAt: number;
  provider: 'OpenStreetMap';
  distanceMeters: number;
  durationSeconds: number;
  path: Array<{ latitude: number; longitude: number }>;
  steps: StudentRouteStep[];
}

export interface RouteOrigin {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export async function requestPreciseLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
}> {
  const position = await requestFreshGeolocation();
  return {
    latitude: position.lat,
    longitude: position.lng,
    accuracy: position.accuracy,
    speed: position.speed,
    heading: position.heading,
  };
}

export async function updateLiveLocation(input: LiveLocationUpdate) {
  requireRuntimeFeature('mapEnabled', 'Bản đồ đang được bảo trì. Vui lòng thử lại sau.');
  const callable = httpsCallable<LiveLocationUpdate, {
    updatedAt: number;
    expiresAt: number;
    encountersCreated: number;
  }>(functions, 'updateLiveLocation', { timeout: 20_000 });
  const response = await callable(input);
  return response.data;
}

export async function stopLiveLocation() {
  const callable = httpsCallable<Record<string, never>, { stopped: boolean }>(
    functions,
    'stopLiveLocation',
    { timeout: 20_000 },
  );
  const response = await callable({});
  return response.data;
}

export async function getVisibleStudentLocations(focusUid?: string): Promise<VisibleStudentLocation[]> {
  requireRuntimeFeature('mapEnabled', 'Bản đồ đang được bảo trì. Vui lòng thử lại sau.');
  const callable = httpsCallable<{ focusUid?: string }, { locations: VisibleStudentLocation[] }>(
    functions,
    'getVisibleStudentLocations',
    { timeout: 20_000 },
  );
  const response = await callable(focusUid ? { focusUid } : {});
  return response.data.locations;
}

export async function getStudentRoute(
  targetUid: string,
  mode: StudentRouteMode,
  origin?: RouteOrigin,
) {
  requireRuntimeFeature('mapEnabled', 'Chỉ đường đang được bảo trì. Vui lòng thử lại sau.');
  const callable = httpsCallable<
    { targetUid: string; mode: StudentRouteMode; origin?: RouteOrigin },
    StudentRoute
  >(functions, 'getStudentRoute', { timeout: 20_000 });
  const response = await callable({ targetUid, mode, ...(origin ? { origin } : {}) });
  return response.data;
}

export async function getMapRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  mode: StudentRouteMode,
) {
  requireRuntimeFeature('mapEnabled', 'Chỉ đường đang được bảo trì. Vui lòng thử lại sau.');
  const callable = httpsCallable<{
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    mode: StudentRouteMode;
  }, MapRoute>(functions, 'getMapRoute', { timeout: 20_000 });
  const response = await callable({ origin, destination, mode });
  return response.data;
}

export function subscribeLocationPreferences(
  uid: string,
  onChange: (preferences: LocationPreferences) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(doc(db, 'locationPreferences', uid), (snapshot) => {
    const data = snapshot.data();
    onChange({
      uid,
      visibility: data?.visibility || 'off',
      encounterAlertsEnabled: data?.encounterAlertsEnabled === true,
      updatedAt: data?.updatedAt,
    });
  }, (error) => onError?.(error));
}

export function subscribeStudentEncounters(
  uid: string,
  onChange: (encounters: StudentEncounter[]) => void,
  onError?: (error: Error) => void,
) {
  const request = query(
    collection(db, 'studentEncounters'),
    where('participantUids', 'array-contains', uid),
    orderBy('occurredAt', 'desc'),
    limit(20),
  );
  return onSnapshot(request, (snapshot) => {
    onChange(snapshot.docs.map((encounter) => ({
      id: encounter.id,
      ...encounter.data(),
    } as StudentEncounter)));
  }, (error) => onError?.(error));
}
