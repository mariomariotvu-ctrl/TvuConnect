import {
  collection,
  endAt,
  onSnapshot,
  orderBy,
  query,
  startAt,
} from 'firebase/firestore';
import { geohashQueryBounds } from 'geofire-common';
import { db } from '../firebase';
import { RentalPost } from '../types';
import { Coordinates } from '../utils/locationUtils';
import { prepareNearbyRentals } from '../utils/rentalGeo';

/**
 * Subscribe to all geohash ranges intersecting the requested circle.
 * GeoFire may return overlapping ranges and rectangular false positives, so
 * documents are deduplicated by id and filtered again with Haversine distance.
 */
export function subscribeToNearbyRentals(
  center: Coordinates,
  radiusKm: number,
  onChange: (posts: RentalPost[]) => void,
  onError: (error: Error) => void,
) {
  const bounds = geohashQueryBounds([center.lat, center.lng], radiusKm * 1000);
  const snapshotsByBound = new Map<number, Map<string, RentalPost>>();
  const readyBounds = new Set<number>();
  let stopped = false;

  const emit = () => {
    if (stopped || readyBounds.size !== bounds.length) return;

    const uniquePosts = new Map<string, RentalPost>();
    snapshotsByBound.forEach((posts) => {
      posts.forEach((post, id) => uniquePosts.set(id, post));
    });

    onChange(prepareNearbyRentals([...uniquePosts.values()], center, radiusKm));
  };

  const unsubscribers = bounds.map(([startHash, endHash], index) => onSnapshot(
    query(
      collection(db, 'rentalPosts'),
      orderBy('geohash'),
      startAt(startHash),
      endAt(endHash),
    ),
    (snapshot) => {
      snapshotsByBound.set(index, new Map(snapshot.docs.map((rentalDocument) => [
        rentalDocument.id,
        { id: rentalDocument.id, ...rentalDocument.data() } as RentalPost,
      ])));
      readyBounds.add(index);
      emit();
    },
    (error) => {
      if (!stopped) onError(error);
    },
  ));

  return () => {
    stopped = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
