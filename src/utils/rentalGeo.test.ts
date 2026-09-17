import { describe, expect, it } from 'vitest';
import { RentalPost } from '../types';
import { createRentalGeohash, prepareNearbyRentals } from './rentalGeo';

const rental = (id: string, lat: number, lng: number, isAvailable = true): RentalPost => ({
  id,
  title: id,
  type: 'nha-tro',
  price: 1_500_000,
  address: 'Trà Vinh',
  location: { lat, lng },
  description: '',
  amenities: [],
  contactName: 'Sinh viên TVU',
  contactPhone: '0900000000',
  isAvailable,
  createdBy: 'owner',
  createdAt: {} as RentalPost['createdAt'],
});

describe('rental geohash search', () => {
  it('creates a stable geohash for a valid Trà Vinh coordinate', () => {
    const location = { lat: 9.9345, lng: 106.3461 };
    expect(createRentalGeohash(location)).toBe(createRentalGeohash(location));
    expect(createRentalGeohash(location)).toMatch(/^[0-9b-hjkmnp-z]+$/);
  });

  it('deduplicates, removes false positives and sorts nearest first', () => {
    const center = { lat: 9.9345, lng: 106.3461 };
    const near = rental('near', 9.935, 106.3461);
    const farther = rental('farther', 9.95, 106.3461);
    const outside = rental('outside', 10.1, 106.3461);
    const unavailable = rental('closed', 9.9346, 106.3461, false);

    const results = prepareNearbyRentals(
      [farther, near, near, outside, unavailable],
      center,
      5,
    );

    expect(results.map((post) => post.id)).toEqual(['near', 'farther']);
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });
});
