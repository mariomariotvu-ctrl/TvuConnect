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
}

export function requestPreciseLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
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

export async function getVisibleStudentLocations(): Promise<VisibleStudentLocation[]> {
  const callable = httpsCallable<Record<string, never>, { locations: VisibleStudentLocation[] }>(
    functions,
    'getVisibleStudentLocations',
    { timeout: 20_000 },
  );
  const response = await callable({});
  return response.data.locations;
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
