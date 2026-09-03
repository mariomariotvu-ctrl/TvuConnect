import { db, collection, query, where, getDocs, limit, orderBy } from '../firebase';
import { Place } from '../types';
import { getUserPreferences, generatePersonalizedGreeting } from './userPreferences';
import { logger } from '@/utils/logger';

/**
 * Search venues from Firestore based on category and keywords with personalization
 * Implements smart fallback logic to maximize results
 * @param category - Category filter (cafe, restaurant, study, etc.)
 * @param keywords - Keywords to search in name, description, address
 * @param maxResults - Maximum number of results to return (default: 5)
 * @param userId - Optional user ID for personalization
 * @returns Array of matching places
 */
export const searchVenues = async (
  category?: string,
  keywords?: string,
  maxResults: number = 5,
  userId?: string
): Promise<Place[]> => {
  try {
    logger.log('🔍 Searching venues:', { category, keywords, maxResults, userId });

    // Get user preferences if userId provided
    let preferences = null;
    if (userId) {
      preferences = await getUserPreferences(userId);
      logger.log('👤 User preferences:', preferences);
    }

    // Normalize keywords to lowercase
    const normalizedKeywords = keywords?.toLowerCase().trim() || '';

    // ATTEMPT 1: Search with exact category and keywords
    let places = await searchWithFilters(category, normalizedKeywords, maxResults, preferences);
    
    if (places.length > 0) {
      logger.log(`✅ Found ${places.length} venues (exact match)`);
      return places;
    }

    // ATTEMPT 2: Fallback - Search with category only (no keywords filter)
    if (normalizedKeywords && category && category !== 'all') {
      logger.log('🔄 Fallback: Searching without keywords filter...');
      places = await searchWithFilters(category, '', maxResults, preferences);
      
      if (places.length > 0) {
        logger.log(`✅ Found ${places.length} venues (category only)`);
        return places;
      }
    }

    // ATTEMPT 3: Fallback - Search similar categories
    if (category && category !== 'all') {
      const similarCategories = getSimilarCategories(category);
      logger.log(`🔄 Fallback: Trying similar categories: ${similarCategories.join(', ')}`);
      
      for (const similarCat of similarCategories) {
        places = await searchWithFilters(similarCat, '', maxResults, preferences);
        if (places.length > 0) {
          logger.log(`✅ Found ${places.length} venues (similar category: ${similarCat})`);
          return places;
        }
      }
    }

    // ATTEMPT 4: Last resort - Get any places (top rated)
    logger.log('🔄 Fallback: Getting top rated places...');
    places = await searchWithFilters('all', '', maxResults, preferences);
    
    logger.log(`✅ Found ${places.length} venues (fallback: top rated)`);
    return places;

  } catch (error) {
    console.error('❌ Error searching venues:', error);
    return [];
  }
};

/**
 * Internal function to search with specific filters
 */
async function searchWithFilters(
  category: string | undefined,
  keywords: string,
  maxResults: number,
  preferences: any
): Promise<Place[]> {
  const placesRef = collection(db, 'places');
  let q = query(placesRef);

  // Filter by category if provided
  if (category && category !== 'all') {
    q = query(q, where('category', '==', category));
  }

  // Order by rating (descending) and limit results
  q = query(q, orderBy('rating', 'desc'), limit(maxResults * 3));

  const snapshot = await getDocs(q);
  let places: Place[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    places.push({
      id: doc.id,
      name: data.name || '',
      category: data.category || 'other',
      location: data.location || { lat: 0, lng: 0, address: '' },
      description: data.description || '',
      rating: data.rating || 0,
      reviewCount: data.reviewCount || 0,
      priceRange: data.priceRange || '',
      openHours: data.openHours || data.opening_hours || '',
      checkInCount: data.checkInCount || 0,
      currentVisitors: data.currentVisitors || 0,
      createdBy: data.createdBy || '',
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date()
    });
  });

  // Merge keywords from preferences
  let mergedKeywords = keywords;
  if (preferences && preferences.favoriteKeywords.length > 0) {
    mergedKeywords = `${keywords} ${preferences.favoriteKeywords.join(' ')}`.trim();
    logger.log('🔗 Merged keywords:', mergedKeywords);
  }

  // Filter by keywords if provided
  if (mergedKeywords) {
    const keywordLower = mergedKeywords.toLowerCase();
    places = places.filter(place => {
      const searchText = `${place.name} ${place.description} ${place.location?.address}`.toLowerCase();
      return searchText.includes(keywordLower);
    });
  }

  // Personalized ranking: Prioritize favorite venues
  if (preferences && preferences.favoriteVenues.length > 0) {
    places.sort((a, b) => {
      const aIsFavorite = preferences.favoriteVenues.includes(a.id);
      const bIsFavorite = preferences.favoriteVenues.includes(b.id);
      
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      
      return (b.rating || 0) - (a.rating || 0);
    });
  }

  // Wildcard logic: Always include 1 new venue (not in favorites)
  if (preferences && preferences.favoriteVenues.length > 0 && places.length > maxResults) {
    const favoriteResults = places.filter(p => preferences.favoriteVenues.includes(p.id)).slice(0, maxResults - 1);
    const newResults = places.filter(p => !preferences.favoriteVenues.includes(p.id)).slice(0, 1);
    places = [...favoriteResults, ...newResults];
    logger.log('🎲 Wildcard applied: Added 1 new venue');
  } else {
    places = places.slice(0, maxResults);
  }

  return places;
}

/**
 * Get similar categories for fallback search
 * STRICT RULES: Only suggest truly related categories
 */
function getSimilarCategories(category: string): string[] {
  const similarMap: { [key: string]: string[] } = {
    'cafe': ['study', 'bookstore'],  // Chỗ yên tĩnh tương tự
    'study': ['cafe', 'bookstore'],  // Cùng mục đích học tập
    'restaurant': ['vegetarian'],    // Cùng là ăn uống
    'vegetarian': ['restaurant'],    // Cùng là ăn uống
    'entertainment': [],             // KHÔNG fallback (quá khác biệt)
    'sport': [],                     // KHÔNG fallback (quá khác biệt)
    'pharmacy': [],                  // KHÔNG fallback (y tế riêng biệt)
    'flower': ['shop'],              // Cùng là mua sắm
    'printing': ['shop'],            // Cùng là dịch vụ
    'clothing': ['shop'],            // Cùng là mua sắm
    'shop': ['clothing', 'flower'],  // Cùng là mua sắm
    'bookstore': ['cafe', 'study']   // Cùng không gian yên tĩnh
  };
  
  return similarMap[category] || [];
}

/**
 * Format venue data for AI response with personalized greeting
 * @param places - Array of places
 * @param preferences - Optional user preferences for personalized greeting
 * @param category - Search category
 * @param wasKeywordSearch - Whether this was a keyword search (for fallback messaging)
 * @returns Formatted string for AI
 */
export const formatVenuesForAI = (
  places: Place[], 
  preferences?: { favoriteCategories: string[]; favoriteKeywords: string[]; favoriteVenues: string[]; recentSearches: string[] } | null,
  category?: string,
  wasKeywordSearch?: boolean
): string => {
  if (places.length === 0) {
    return 'Không tìm thấy địa điểm nào phù hợp trong database.';
  }

  // Generate personalized greeting if preferences available
  let greeting = '';
  if (preferences && preferences.favoriteVenues.length > 0) {
    greeting = generatePersonalizedGreeting(preferences, category) + ':\n\n';
  } else if (wasKeywordSearch) {
    // Fallback message when keyword search returned no exact match
    greeting = 'Hiện database chưa có quán nào tag chính xác với từ khóa đó, nhưng tui tìm thấy mấy quán chill này, ông/bà xem thử có ưng không nhé:\n\n';
  } else {
    greeting = 'Tui tìm được:\n\n';
  }

  const venuesList = places.map((place, index) => {
    return `${index + 1}. ${place.name}
   - Địa chỉ: ${place.location?.address || 'Chưa có địa chỉ'}
   - Đánh giá: ${place.rating ? place.rating.toFixed(1) : 'N/A'} ⭐
   - Giờ mở cửa: ${place.openHours || 'Chưa có thông tin'}
   - Giá: ${place.priceRange || 'Chưa có thông tin'}
   - Mô tả: ${place.description || 'Chưa có mô tả'}`;
  }).join('\n\n');

  return greeting + venuesList;
};
