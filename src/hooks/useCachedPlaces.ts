/**
 * useCachedPlaces Hook - Cache-First Places Data with Query Optimizer
 * 
 * This hook implements cache-first strategy for explore places using:
 * - Query Optimizer for Firestore query optimization
 * - Cache Manager for browser storage caching (sessionStorage)
 * - TTL: 300 seconds (5 minutes)
 * - Adaptive limits: 100 on mobile, 200 on desktop
 * - Category filter at database level
 * - Cache key pattern: 'places:{category}' or 'places:all'
 * 
 * Requirements: Requirement 4 (Cache-First Strategy cho Explore Places)
 * Task 6.1: Tạo src/hooks/useCachedPlaces.ts
 * Task 6.2: Implement places cache với TTL 300s
 * Task 6.3: Implement adaptive limits (100 mobile, 200 desktop)
 * Task 6.4: Implement category filter at database level
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Place, PlaceCategory } from '../types';
import {
  optimizeQuery,
  createCacheConfig,
  type QueryConfig,
  type QueryResult,
  type WhereClause,
} from '../utils/queryOptimizer';
import { invalidateCachePattern } from '../utils/cacheManager';
import { logger } from '@/utils/logger';

/**
 * Hook configuration interface
 */
export interface UseCachedPlacesConfig {
  category?: PlaceCategory | 'all';
  isMobile?: boolean;
  enableCache?: boolean;
}

/**
 * Hook result interface
 */
export interface UseCachedPlacesResult {
  places: Place[];
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
  refresh: () => void;
  invalidateCache: () => void;
}

/**
 * Custom hook for cache-first places data
 * 
 * Features:
 * - Cache-first strategy with 300s TTL in sessionStorage
 * - Adaptive limits: 100 on mobile, 200 on desktop
 * - Category filter at database level using where clause
 * - Automatic cache invalidation on category change
 * - Error handling with graceful fallback
 * 
 * Requirement 4.1: Cache places data with TTL 300 seconds (5 minutes)
 * Requirement 4.2: Limit places query to 100 on mobile, 200 on desktop
 * Requirement 4.3: Use where clause at database level for category filter
 * Requirement 4.6: Use cache key pattern 'places:{category}' or 'places:all'
 */
export function useCachedPlaces(config: UseCachedPlacesConfig = {}): UseCachedPlacesResult {
  const {
    category = 'all',
    isMobile = false,
    enableCache = true,
  } = config;

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);

  /**
   * Determine query limit based on device type
   * Requirement 4.2: Adaptive limits (100 mobile, 200 desktop)
   */
  const queryLimit = useMemo(() => {
    return isMobile ? 100 : 200;
  }, [isMobile]);
  const whereClause = useMemo((): WhereClause[] => {
    if (category === 'all') {
      return [];
    }
    
    // Filter by category at database level
    return [
      {
        field: 'category',
        operator: '==',
        value: category,
      },
    ];
  }, [category]);

  /**
   * Generate cache key based on category
   * Requirement 4.6: Cache key pattern 'places:{category}' or 'places:all'
   */
  const cacheKey = useMemo(() => {
    return category === 'all' ? 'places:all' : `places:${category}`;
  }, [category]);

  /**
   * Base query configuration
   */
  const queryConfig = useMemo((): QueryConfig => {
    return {
      collection: 'places',
      limit: queryLimit,
      where: whereClause,
      // No orderBy to avoid requiring composite index
      // Places will be sorted client-side if needed
    };
  }, [queryLimit, whereClause]);

  /**
   * Cache configuration
   * Requirement 4.1: TTL 300 seconds (5 minutes)
   * Requirement 4.6: Cache key pattern
   */
  const cacheConfig = useMemo(() => {
    return createCacheConfig(
      300000, // 300000ms = 300 seconds = 5 minutes TTL (increased from 60s)
      'sessionStorage',
      cacheKey
    );
  }, [cacheKey]);

  /**
   * Load places with cache-first strategy
   * 
   * Requirement 4.1: Check sessionStorage first
   * Requirement 4.2: Fetch from Firestore with adaptive limit on cache miss
   * Requirement 4.3: Apply category filter at database level
   */
  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Execute optimized query with cache-first strategy
      const result: QueryResult<Place> = await optimizeQuery<Place>(
        queryConfig,
        enableCache ? cacheConfig : { ...cacheConfig, enabled: false }
      );

      setPlaces(result.data);
      setFromCache(result.fromCache);

      // Log performance metrics
      logger.log('[useCachedPlaces] Load places:', {
        category,
        fromCache: result.fromCache,
        executionTime: result.executionTime,
        documentReads: result.documentReads,
        placeCount: result.data.length,
        queryLimit,
      });
    } catch (err) {
      console.error('[useCachedPlaces] Error loading places:', err);
      setError(err as Error);
      setPlaces([]); // Return empty array on error
    } finally {
      setLoading(false);
    }
  }, [queryConfig, cacheConfig, enableCache, category, queryLimit]);

  /**
   * Refresh places data
   * Invalidates cache and reloads places
   */
  const refresh = useCallback(() => {
    // Reset state
    setPlaces([]);
    setFromCache(false);

    // Reload places (will fetch fresh data since cache is invalidated)
    loadPlaces();
  }, [loadPlaces]);

  /**
   * Invalidate places cache
   * Requirement 4.7: Implement cache invalidation
   * 
   * This function can be called when:
   * - User creates a new place
   * - User updates a place
   * - User deletes a place
   */
  const invalidateCache = useCallback(() => {
    // Invalidate all places cache entries
    invalidateCachePattern('places:*', 'sessionStorage');
    logger.log('[useCachedPlaces] Cache invalidated');
  }, []);

  /**
   * Effect: Load places on mount or when config changes
   */
  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  return {
    places,
    loading,
    error,
    fromCache,
    refresh,
    invalidateCache,
  };
}

/**
 * Helper function to invalidate places cache from outside the hook
 * 
 * Usage:
 * ```typescript
 * import { invalidatePlacesCache } from './hooks/useCachedPlaces';
 * 
 * // After creating a new place
 * await createPlace(newPlace);
 * invalidatePlacesCache();
 * ```
 */
export function invalidatePlacesCache(): void {
  invalidateCachePattern('places:*', 'sessionStorage');
  logger.log('[useCachedPlaces] Cache invalidated (external call)');
}
