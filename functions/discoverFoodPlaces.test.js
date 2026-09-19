const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categoryForTypes,
  normalizeGooglePlace,
  popularityScore,
  requireSearchInput,
  tagsForTypes,
} = require('./discoverFoodPlaces');

test('food type mapping produces useful Vietnamese discovery groups', () => {
  assert.equal(categoryForTypes(['cafe', 'food']), 'cafe');
  assert.equal(categoryForTypes(['vegetarian_restaurant', 'restaurant']), 'vegetarian');
  assert.deepEqual(tagsForTypes(['dessert_shop', 'ice_cream_shop']), ['Tráng miệng']);
  assert.deepEqual(tagsForTypes(['vietnamese_restaurant', 'noodle_shop']), ['Món Việt', 'Bún, phở & mì']);
});

test('normalizes Google content without photos, reviews, or external map links', () => {
  const place = normalizeGooglePlace({
    id: 'google-place-1',
    displayName: { text: 'Quán Sinh Viên' },
    formattedAddress: 'Phường 5, Trà Vinh',
    location: { latitude: 9.9419, longitude: 106.33859 },
    primaryType: 'vietnamese_restaurant',
    primaryTypeDisplayName: { text: 'Nhà hàng Việt Nam' },
    types: ['vietnamese_restaurant', 'restaurant'],
    rating: 4.6,
    userRatingCount: 125,
    businessStatus: 'OPERATIONAL',
    openingDate: { year: 2026, month: 9, day: 1 },
  });

  assert.equal(place.id, 'google:google-place-1');
  assert.equal(place.openingDate, '2026-09-01');
  assert.equal(place.category, 'restaurant');
  assert.ok(place.popularityScore > 0);
  assert.equal('images' in place, false);
  assert.equal('reviews' in place, false);
  assert.equal('googleMapsUri' in place, false);
});

test('search input trusts auth uid and accepts valid coordinates worldwide', () => {
  assert.equal(requireSearchInput({
    auth: { uid: 'student-a' },
    data: { uid: 'spoofed', latitude: 9.9419, longitude: 106.33859 },
  }).uid, 'student-a');
  assert.equal(requireSearchInput({
    auth: { uid: 'student-a' },
    data: { latitude: 21.028, longitude: 105.834 },
  }).latitude, 21.028);
  assert.throws(() => requireSearchInput({
    auth: { uid: 'student-a' },
    data: { latitude: 91, longitude: 105.834 },
  }));
});

test('popularity balances rating with rating volume', () => {
  assert.ok(popularityScore(4.5, 500) > popularityScore(5, 1));
});
