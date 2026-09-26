const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categoryForTypes,
  normalizeGooglePlace,
  photoAttributionsFor,
  popularityScore,
  requireSearchInput,
  resolveGooglePhotoUri,
  tagsForTypes,
} = require('./discoverFoodPlaces');

test('food type mapping produces useful Vietnamese discovery groups', () => {
  assert.equal(categoryForTypes(['cafe', 'food']), 'cafe');
  assert.equal(categoryForTypes(['vegetarian_restaurant', 'restaurant']), 'vegetarian');
  assert.deepEqual(tagsForTypes(['dessert_shop', 'ice_cream_shop']), ['Tráng miệng']);
  assert.deepEqual(tagsForTypes(['vietnamese_restaurant', 'noodle_shop']), ['Món Việt', 'Bún, phở & mì']);
});

test('normalizes Google content and includes a resolved provider photo when available', () => {
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
    photos: [{
      name: 'places/google-place-1/photos/photo-1',
      authorAttributions: [{ displayName: 'Người dùng Google', uri: 'https://maps.google.com/profile' }],
    }],
  }, 'https://lh3.googleusercontent.com/place-photo');

  assert.equal(place.id, 'google:google-place-1');
  assert.equal(place.openingDate, '2026-09-01');
  assert.equal(place.category, 'restaurant');
  assert.ok(place.popularityScore > 0);
  assert.deepEqual(place.images, ['https://lh3.googleusercontent.com/place-photo']);
  assert.equal(place.photoAttributions[0].displayName, 'Người dùng Google');
  assert.equal('reviews' in place, false);
  assert.equal('googleMapsUri' in place, false);
});

test('keeps valid photo credits and removes unsafe attribution URLs', () => {
  assert.deepEqual(photoAttributionsFor({
    photos: [{ authorAttributions: [
      { displayName: 'Tác giả A', uri: 'https://example.com/a' },
      { displayName: 'Tác giả B', uri: 'javascript:alert(1)' },
    ] }],
  }), [
    { displayName: 'Tác giả A', uri: 'https://example.com/a' },
    { displayName: 'Tác giả B' },
  ]);
});

test('resolves a short-lived photo URI without exposing the API key in the URL', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(String(url).includes('server-secret'), false);
    assert.equal(options.headers['X-Goog-Api-Key'], 'server-secret');
    return {
      ok: true,
      json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/resolved-photo' }),
    };
  };

  try {
    assert.equal(
      await resolveGooglePhotoUri('places/place-1/photos/photo-1', 'server-secret'),
      'https://lh3.googleusercontent.com/resolved-photo',
    );
  } finally {
    global.fetch = originalFetch;
  }
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
