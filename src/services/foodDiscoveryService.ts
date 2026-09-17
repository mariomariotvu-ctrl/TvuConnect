import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { Place } from '../types';

interface FoodDiscoveryResponse {
  places: Place[];
  source: 'google_places';
  fetchedAt: number;
  attribution: 'Google Maps';
}

export async function discoverFoodPlaces(latitude: number, longitude: number) {
  const callable = httpsCallable<
    { latitude: number; longitude: number },
    FoodDiscoveryResponse
  >(functions, 'discoverFoodPlaces', { timeout: 20_000 });
  const response = await callable({ latitude, longitude });
  return response.data;
}
