const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();

const googlePlacesApiKey = defineSecret('GOOGLE_PLACES_API_KEY');
const MAX_REQUESTS_PER_HOUR = 12;
const NEARBY_SEARCH_RADIUS_METERS = 10_000;
const FOOD_TYPES = [
  'restaurant',
  'vietnamese_restaurant',
  'vegetarian_restaurant',
  'vegan_restaurant',
  'cafe',
  'coffee_shop',
  'tea_house',
  'bakery',
  'dessert_shop',
  'ice_cream_shop',
  'juice_shop',
  'snack_bar',
  'fast_food_restaurant',
  'pizza_restaurant',
  'hamburger_restaurant',
  'seafood_restaurant',
  'barbecue_restaurant',
  'breakfast_restaurant',
  'brunch_restaurant',
  'noodle_shop',
  'chicken_restaurant',
  'hot_pot_restaurant',
  'food_court',
];

const TYPE_TAGS = new Map([
  ['cafe', ['Cà phê & học bài']],
  ['coffee_shop', ['Cà phê & học bài']],
  ['tea_house', ['Trà & trò chuyện']],
  ['bakery', ['Bánh & ăn vặt']],
  ['cake_shop', ['Bánh & ăn vặt']],
  ['dessert_shop', ['Tráng miệng']],
  ['dessert_restaurant', ['Tráng miệng']],
  ['ice_cream_shop', ['Tráng miệng']],
  ['juice_shop', ['Nước ép']],
  ['snack_bar', ['Ăn vặt']],
  ['fast_food_restaurant', ['Đồ ăn nhanh']],
  ['pizza_restaurant', ['Pizza & đồ nhanh']],
  ['hamburger_restaurant', ['Burger & đồ nhanh']],
  ['vietnamese_restaurant', ['Món Việt']],
  ['noodle_shop', ['Bún, phở & mì']],
  ['seafood_restaurant', ['Hải sản']],
  ['barbecue_restaurant', ['Đồ nướng']],
  ['hot_pot_restaurant', ['Lẩu']],
  ['chicken_restaurant', ['Món gà']],
  ['breakfast_restaurant', ['Ăn sáng']],
  ['brunch_restaurant', ['Ăn sáng & brunch']],
  ['vegetarian_restaurant', ['Món chay']],
  ['vegan_restaurant', ['Món chay']],
  ['food_court', ['Nhiều lựa chọn']],
  ['restaurant', ['Quán ăn']],
]);

const PRICE_LEVELS = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$',
};

function requireSearchInput(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để tìm địa điểm ăn uống.');
  }

  const latitude = Number(request.data?.latitude);
  const longitude = Number(request.data?.longitude);
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    throw new HttpsError('out-of-range', 'Tọa độ tìm kiếm không hợp lệ.');
  }

  return { uid: request.auth.uid, latitude, longitude };
}

function tagsForTypes(types = []) {
  const tags = new Set();
  types.forEach((type) => (TYPE_TAGS.get(type) || []).forEach((tag) => tags.add(tag)));
  return [...tags].slice(0, 4);
}

function categoryForTypes(types = []) {
  if (types.some((type) => type === 'vegetarian_restaurant' || type === 'vegan_restaurant')) {
    return 'vegetarian';
  }
  if (types.some((type) => ['cafe', 'coffee_shop', 'tea_house', 'juice_shop'].includes(type))) {
    return 'cafe';
  }
  return 'restaurant';
}

function popularityScore(rating, userRatingCount) {
  const safeRating = Number.isFinite(Number(rating)) ? Number(rating) : 0;
  const safeCount = Number.isFinite(Number(userRatingCount)) ? Number(userRatingCount) : 0;
  return Number((safeRating * Math.log10(safeCount + 10)).toFixed(3));
}

function dateToIso(value) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeGooglePlace(place) {
  const latitude = Number(place?.location?.latitude);
  const longitude = Number(place?.location?.longitude);
  const id = typeof place?.id === 'string' ? place.id : '';
  const name = typeof place?.displayName?.text === 'string' ? place.displayName.text.trim() : '';
  if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const types = Array.isArray(place.types)
    ? place.types.filter((type) => typeof type === 'string').slice(0, 12)
    : [];
  const rating = Math.min(5, Math.max(0, Number(place.rating) || 0));
  const reviewCount = Math.max(0, Math.floor(Number(place.userRatingCount) || 0));
  const primaryLabel = typeof place?.primaryTypeDisplayName?.text === 'string'
    ? place.primaryTypeDisplayName.text.trim()
    : '';

  return {
    id: `google:${id}`,
    sourcePlaceId: id,
    name,
    category: categoryForTypes(types),
    location: {
      lat: latitude,
      lng: longitude,
      address: typeof place.formattedAddress === 'string' ? place.formattedAddress : 'Gần vị trí của bạn',
    },
    description: primaryLabel || 'Địa điểm ăn uống gần bạn',
    amenities: [],
    priceRange: PRICE_LEVELS[place.priceLevel] || undefined,
    openHours: typeof place?.currentOpeningHours?.openNow === 'boolean'
      ? (place.currentOpeningHours.openNow ? 'Đang mở cửa' : 'Hiện đang đóng cửa')
      : undefined,
    rating,
    reviewCount,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: 'google_places',
    isVerified: place.businessStatus === 'OPERATIONAL',
    dataSource: 'google_places',
    sourceLabel: 'Google Maps',
    primaryType: typeof place.primaryType === 'string' ? place.primaryType : '',
    foodTags: tagsForTypes(types),
    businessStatus: typeof place.businessStatus === 'string' ? place.businessStatus : '',
    openingDate: dateToIso(place.openingDate),
    isOpenNow: place?.currentOpeningHours?.openNow === true,
    popularityScore: popularityScore(rating, reviewCount),
  };
}

async function consumeRateLimit(uid) {
  const firestore = getFirestore();
  const reference = firestore.collection('_systemPlaceSearchRateLimits').doc(uid);
  const now = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data() || {};
    const startedAt = previous.windowStartedAt instanceof Timestamp
      ? previous.windowStartedAt.toMillis()
      : 0;
    const withinWindow = now - startedAt < 60 * 60 * 1000;
    const nextCount = withinWindow ? Number(previous.requestCount || 0) + 1 : 1;

    if (nextCount > MAX_REQUESTS_PER_HOUR) {
      throw new HttpsError(
        'resource-exhausted',
        'Bạn đã làm mới địa điểm khá nhiều. Hãy dùng kết quả hiện tại và thử lại sau.',
      );
    }

    transaction.set(reference, {
      requestCount: nextCount,
      windowStartedAt: Timestamp.fromMillis(withinWindow ? startedAt : now),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

exports.discoverFoodPlaces = onCall(
  {
    timeoutSeconds: 20,
    memory: '256MiB',
    secrets: [googlePlacesApiKey],
  },
  async (request) => {
    const input = requireSearchInput(request);
    const apiKey = googlePlacesApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Nguồn Google Places chưa được cấu hình.');
    }

    await consumeRateLimit(input.uid);

    let response;
    try {
      response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
            'places.primaryType',
            'places.primaryTypeDisplayName',
            'places.types',
            'places.businessStatus',
            'places.openingDate',
            'places.rating',
            'places.userRatingCount',
            'places.currentOpeningHours.openNow',
            'places.priceLevel',
          ].join(','),
        },
        body: JSON.stringify({
          includedTypes: FOOD_TYPES,
          maxResultCount: 20,
          rankPreference: 'POPULARITY',
          includeFutureOpeningBusinesses: true,
          languageCode: 'vi',
          regionCode: 'VN',
          locationRestriction: {
            circle: {
              center: { latitude: input.latitude, longitude: input.longitude },
              radius: NEARBY_SEARCH_RADIUS_METERS,
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      console.error('Google Places request failed:', error);
      throw new HttpsError('unavailable', 'Nguồn địa điểm đang tạm bận.');
    }

    if (!response.ok) {
      const providerError = await response.text();
      console.error('Google Places rejected request:', response.status, providerError.slice(0, 600));
      if (response.status === 429) {
        throw new HttpsError('resource-exhausted', 'Nguồn địa điểm đang quá tải. Hãy thử lại sau.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new HttpsError('failed-precondition', 'Google Places chưa được cấu hình đúng.');
      }
      throw new HttpsError('unavailable', 'Chưa thể cập nhật địa điểm lúc này.');
    }

    const payload = await response.json();
    const places = (Array.isArray(payload.places) ? payload.places : [])
      .map(normalizeGooglePlace)
      .filter(Boolean);

    return {
      places,
      source: 'google_places',
      fetchedAt: Date.now(),
      attribution: 'Google Maps',
    };
  },
);

exports.categoryForTypes = categoryForTypes;
exports.normalizeGooglePlace = normalizeGooglePlace;
exports.popularityScore = popularityScore;
exports.requireSearchInput = requireSearchInput;
exports.tagsForTypes = tagsForTypes;
