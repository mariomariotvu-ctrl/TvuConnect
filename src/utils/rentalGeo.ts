import { geohashForLocation } from 'geofire-common';
import { RentalPost } from '../types';
import { calculateDistance, Coordinates } from './locationUtils';

export type NearbyRental = RentalPost & { distance: number };

export const createRentalGeohash = (location: Coordinates): string => (
  geohashForLocation([location.lat, location.lng])
);

export function prepareNearbyRentals(
  posts: RentalPost[],
  center: Coordinates,
  radiusKm: number,
): NearbyRental[] {
  const uniquePosts = new Map<string, RentalPost>();
  posts.forEach((post) => {
    if (post.id) uniquePosts.set(post.id, post);
  });

  return [...uniquePosts.values()]
    .filter((post): post is RentalPost & { location: Coordinates } => (
      post.isAvailable !== false
      && Boolean(post.location)
      && Number.isFinite(post.location?.lat)
      && Number.isFinite(post.location?.lng)
    ))
    .map((post) => ({
      ...post,
      distance: calculateDistance(center, post.location),
    }))
    .filter((post) => post.distance <= radiusKm)
    .sort((left, right) => left.distance - right.distance);
}
