import { useState, useCallback } from 'react';
import { 
  collection, 
  query, 
  limit, 
  startAfter, 
  getDocs, 
  QueryDocumentSnapshot, 
  DocumentData,
  Query
} from 'firebase/firestore';
import { db } from '../firebase';
import { Place } from '../types';
import { QUERY_LIMITS, isMobileDevice } from '../config/queryLimits';
import { logger } from '../utils/logger';

/**
 * Pagination state interface
 * Task 2.2: Implement pagination hook for PlaceList
 * Requirements: 2.3, 2.4
 */
export interface PaginationState<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
}

/**
 * Custom hook for paginated places data
 * 
 * Features:
 * - Initial load with device-appropriate limits
 * - Load more with cursor-based pagination
 * - Duplicate prevention
 * - Error handling
 * - Loading states
 * 
 * @param baseQuery - Base Firestore query (without limit)
 * @returns PaginationState with items and control functions
 */
export const usePlacesPagination = (
  baseQuery?: Query<DocumentData>
): PaginationState<Place> => {
  const [items, setItems] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Determine appropriate limit based on device
  const isMobile = isMobileDevice();
  const initialLimit = isMobile ? QUERY_LIMITS.PLACES_MOBILE : QUERY_LIMITS.PLACES_DESKTOP;
  const loadMoreLimit = isMobile ? 20 : 30;

  /**
   * Normalize place data from Firestore document
   */
  const normalizePlace = (doc: QueryDocumentSnapshot<DocumentData>): Place => {
    const data = doc.data();
    
    const normalized: any = {
      id: doc.id,
      name: data.name || data.tên || data['tên'] || 'Chưa có tên',
      category: data.category || data.loại || data['loại'] || 'other',
      rating: data.rating || data['xếp hạng'] || data.xếp_hạng || 0,
      opening_hours: data.opening_hours || data['giờ mở cửa'] || data.giờ_mở_cửa,
      priceRange: data.priceRange || data['phạm vi giá'] || data.phạm_vi_giá || data.price_range,
      description: data.description || data['Sự miêu tả'] || data.Sự_miêu_tả,
      reviewCount: data.reviewCount || 0,
      checkInCount: data.checkInCount || 0,
      currentVisitors: data.currentVisitors || 0,
      createdBy: data.createdBy || '',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
    
    // Handle location data
    let locationData: any = null;
    
    if (data.location && typeof data.location === 'object') {
      const lat = data.location.lat || data.location['vĩ độ'] || data.location.vĩ_độ;
      const lng = data.location.lng;
      const address = data.location.address || data.location['Địa chỉ'] || data.location.Địa_chỉ || data['Địa chỉ'] || '';
      
      if (typeof lat === 'number' && typeof lng === 'number') {
        locationData = { lat, lng, address };
      }
    }
    
    if (!locationData) {
      const lat = data['vĩ độ'] || data.vĩ_độ || data.lat;
      const lng = data.lng;
      const address = data['Địa chỉ'] || data.Địa_chỉ || data.address || '';
      
      if (typeof lat === 'number' && typeof lng === 'number') {
        locationData = { lat, lng, address };
      }
    }
    
    normalized.location = locationData;
    
    return normalized as Place;
  };

  /**
   * Load initial batch of places
   */
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use provided query or default to all places
      const q = baseQuery 
        ? query(baseQuery, limit(initialLimit))
        : query(collection(db, 'places'), limit(initialLimit));
      
      const snapshot = await getDocs(q);
      
      const placesData = snapshot.docs.map(normalizePlace);
      
      setItems(placesData);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === initialLimit);
      
      logger.log(`✅ Loaded ${placesData.length} places (initial, limit: ${initialLimit})`);
    } catch (err: any) {
      console.error('Error loading initial places:', err);
      setError(err.message || 'Không thể tải danh sách địa điểm');
    } finally {
      setLoading(false);
    }
  }, [baseQuery, initialLimit]);

  /**
   * Load more places (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc) return;
    
    setLoadingMore(true);
    setError(null);
    
    try {
      // Use provided query or default to all places
      const q = baseQuery
        ? query(baseQuery, startAfter(lastDoc), limit(loadMoreLimit))
        : query(collection(db, 'places'), startAfter(lastDoc), limit(loadMoreLimit));
      
      const snapshot = await getDocs(q);
      
      const newPlaces = snapshot.docs.map(normalizePlace);
      
      // Prevent duplicates
      setItems(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const uniqueNewPlaces = newPlaces.filter(p => !existingIds.has(p.id));
        return [...prev, ...uniqueNewPlaces];
      });
      
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === loadMoreLimit);
      
      logger.log(`✅ Loaded ${newPlaces.length} more places (limit: ${loadMoreLimit})`);
    } catch (err: any) {
      console.error('Error loading more places:', err);
      setError(err.message || 'Không thể tải thêm địa điểm');
    } finally {
      setLoadingMore(false);
    }
  }, [baseQuery, hasMore, loadingMore, lastDoc, loadMoreLimit]);

  /**
   * Reset pagination state
   */
  const reset = useCallback(() => {
    setItems([]);
    setLoading(false);
    setLoadingMore(false);
    setHasMore(true);
    setError(null);
    setLastDoc(null);
  }, []);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    loadInitial,
    loadMore,
    reset,
  };
};
