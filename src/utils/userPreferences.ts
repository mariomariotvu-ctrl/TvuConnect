import { db, collection, query, where, getDocs, orderBy, limit, doc, getDoc } from '../firebase';
import { logger } from '@/utils/logger';

/**
 * User Preferences Interface
 */
export interface UserPreferences {
  favoriteCategories: string[]; // Categories user frequently visits
  favoriteKeywords: string[]; // Keywords from check-ins, posts
  favoriteVenues: string[]; // Venue IDs user has checked in
  recentSearches: string[]; // Recent search queries
}

/**
 * Gather user preferences from their activity history
 * @param userId - User ID
 * @returns UserPreferences object
 */
export const getUserPreferences = async (userId: string): Promise<UserPreferences> => {
  try {
    logger.log('🔍 Gathering user preferences for:', userId);

    const preferences: UserPreferences = {
      favoriteCategories: [],
      favoriteKeywords: [],
      favoriteVenues: [],
      recentSearches: []
    };

    // 1. Get favorite venues from check-ins (top 5 most visited)
    const checkInsRef = collection(db, 'checkIns');
    const checkInsQuery = query(
      checkInsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20) // Get recent 20 check-ins
    );

    const checkInsSnapshot = await getDocs(checkInsQuery);
    const venueCount: { [key: string]: number } = {};

    checkInsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const placeId = data.placeId;
      if (placeId) {
        venueCount[placeId] = (venueCount[placeId] || 0) + 1;
      }
    });

    // Sort by frequency and get top 5
    preferences.favoriteVenues = Object.entries(venueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([placeId]) => placeId);

    // 2. Get favorite categories from check-ins
    const categoryCount: { [key: string]: number } = {};
    
    for (const placeId of preferences.favoriteVenues) {
      try {
        const placeDocRef = doc(db, 'places', placeId);
        const placeDoc = await getDoc(placeDocRef);
        if (placeDoc.exists()) {
          const category = placeDoc.data()?.category;
          if (category) {
            categoryCount[category] = (categoryCount[category] || 0) + 1;
          }
        }
      } catch (error) {
        console.error('Error fetching place:', error);
      }
    }

    preferences.favoriteCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);

    // 3. Extract keywords from user's posts (reactions, comments)
    const postsRef = collection(db, 'posts');
    const postsQuery = query(
      postsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const postsSnapshot = await getDocs(postsQuery);
    const keywordSet = new Set<string>();

    postsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const content = data.content || '';
      
      // Extract keywords (simple approach: words > 4 chars)
      const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach((word: string) => {
        if (!['this', 'that', 'with', 'from', 'have', 'been'].includes(word)) {
          keywordSet.add(word);
        }
      });
    });

    preferences.favoriteKeywords = Array.from(keywordSet).slice(0, 10);

    logger.log('✅ User preferences gathered:', preferences);
    return preferences;

  } catch (error) {
    console.error('❌ Error gathering user preferences:', error);
    return {
      favoriteCategories: [],
      favoriteKeywords: [],
      favoriteVenues: [],
      recentSearches: []
    };
  }
};

/**
 * Generate personalized greeting based on preferences
 * @param preferences - User preferences
 * @param category - Search category
 * @returns Personalized greeting string
 */
export const generatePersonalizedGreeting = (
  preferences: UserPreferences,
  category?: string
): string => {
  const greetings = [];

  // If user has favorite categories matching search
  if (category && preferences.favoriteCategories.includes(category)) {
    greetings.push(`Dựa trên sở thích ${getCategoryName(category)} của bạn`);
  }

  // If user has favorite venues
  if (preferences.favoriteVenues.length > 0) {
    greetings.push('Dựa trên những quán bạn thường lui tới');
  }

  // If user has keywords
  if (preferences.favoriteKeywords.length > 0) {
    greetings.push('Dựa trên phong cách của bạn');
  }

  // Default
  if (greetings.length === 0) {
    return 'Tui tìm được';
  }

  return greetings[0] + ', tui tìm được';
};

/**
 * Get category display name
 */
const getCategoryName = (category: string): string => {
  const names: { [key: string]: string } = {
    cafe: 'quán cafe',
    restaurant: 'quán ăn',
    study: 'chỗ học',
    entertainment: 'giải trí',
    vegetarian: 'quán chay',
    pharmacy: 'nhà thuốc',
    flower: 'tiệm hoa',
    printing: 'in ấn',
    clothing: 'quần áo',
    shop: 'cửa hàng',
    bookstore: 'nhà sách',
    sport: 'thể thao'
  };
  return names[category] || category;
};
