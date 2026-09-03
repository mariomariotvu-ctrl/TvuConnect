import type { Map, LatLngBounds } from 'leaflet';
import { Place } from '../types';

export function queryPlacesInBounds(places: Place[], bounds: LatLngBounds | null): Place[] {
  if (!bounds) return places;
  
  return places.filter(place => {
    if (!place.location || typeof place.location.lat !== 'number' || typeof place.location.lng !== 'number') {
      return false;
    }
    const { lat, lng } = place.location;
    return (
      lat >= bounds.getSouthWest().lat &&
      lat <= bounds.getNorthEast().lat &&
      lng >= bounds.getSouthWest().lng &&
      lng <= bounds.getNorthEast().lng
    );
  });
}
