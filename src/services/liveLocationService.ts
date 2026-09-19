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

export function requestPreciseLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
}> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Thiết bị này không hỗ trợ định vị.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
      }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED
        ? 'Bạn chưa cấp quyền vị trí. Hãy bật quyền rồi thử lại.'
        : 'Chưa lấy được vị trí. Hãy thử lại ở nơi có tín hiệu tốt hơn.')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  });
}

export async function updateLiveLocation(input: LiveLocationUpdate) {
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
  const callable = httpsCallable<{ focusUid?: string }, { locations: VisibleStudentLocation[] }>(
    functions,
    'getVisibleStudentLocations',
    { timeout: 20_000 },
  );
  const response = await callable(focusUid ? { focusUid } : {});
  return response.data.locations;
}

export async function getStudentRoute(targetUid: string, mode: StudentRouteMode) {
  const callable = httpsCallable<
    { targetUid: string; mode: StudentRouteMode },
    StudentRoute
  >(functions, 'getStudentRoute', { timeout: 20_000 });
  const response = await callable({ targetUid, mode });
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
