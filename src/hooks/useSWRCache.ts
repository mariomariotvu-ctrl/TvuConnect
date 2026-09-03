/**
 * useSWRCache Hook - Stale-While-Revalidate Strategy
 * 
 * This hook implements the stale-while-revalidate (SWR) caching strategy:
 * 1. Immediately return stale cached data (if available)
 * 2. Fetch fresh data in the background
 * 3. Update cache and UI when fresh data arrives
 * 
 * Benefits:
 * - Instant UI response (serve stale data immediately)
 * - Always fresh data (background revalidation)
 * - Reduced perceived latency
 * - Better UX for slow connections
 * 
 * Task 6.4: Implement stale-while-revalidate hook
 * Requirements: 6.5, 6.6
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';

export interface SWRConfig {
  key: string;
  ttl: number; // Time-to-live in milliseconds
  storage: 'localStorage' | 'sessionStorage';
  revalidateOnMount?: boolean; // Default: true
  revalidateOnFocus?: boolean; // Default: false
  dedupingInterval?: number; // Default: 2000ms
}

export interface SWRResult<T> {
  data: T | null;
  isLoading: boolean;
  isValidating: boolean; // true when fetching fresh data in background
  isStale: boolean; // true when serving stale data
  error: Error | null;
  mutate: (newData: T) => void; // Manually update cache
  revalidate: () => Promise<void>; // Manually trigger revalidation
}

interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Custom hook for stale-while-revalidate caching strategy
 * 
 * @param config - SWR configuration
 * @param fetcher - Async function to fetch fresh data
 * @returns SWR result with data, loading states, and control functions
 * 
 * @example
 * ```typescript
 * const { data, isStale, isValidating } = useSWRCache(
 *   {
 *     key: 'places:all',
 *     ttl: 300000, // 5 minutes
 *     storage: 'sessionStorage',
 *   },
 *   async () => {
 *     const snapshot = await getDocs(query(collection(db, 'places')));
 *     return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
 *   }
 * );
 * ```
 */
export function useSWRCache<T>(
  config: SWRConfig,
  fetcher: () => Promise<T>
): SWRResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const {
    key,
    ttl,
    storage,
    revalidateOnMount = true,
    revalidateOnFocus = false,
    dedupingInterval = 2000,
  } = config;
  
  // Track last fetch time to prevent duplicate fetches
  const lastFetchRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  
  /**
   * Get cached data from storage
   */
  const getCachedData = useCallback((): { data: T; isStale: boolean } | null => {
    try {
      const storageObj = storage === 'localStorage' ? localStorage : sessionStorage;
      const cached = storageObj.getItem(key);
      
      if (!cached) {
        return null;
      }
      
      const parsed: CachedData<T> = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;
      const isCacheStale = age > parsed.ttl;
      
      return {
        data: parsed.data,
        isStale: isCacheStale,
      };
    } catch (error) {
      logger.warn('[useSWRCache] Error reading cache:', error);
      return null;
    }
  }, [key, storage]);
  
  /**
   * Set cached data to storage
   */
  const setCachedData = useCallback((newData: T) => {
    try {
      const storageObj = storage === 'localStorage' ? localStorage : sessionStorage;
      const cached: CachedData<T> = {
        data: newData,
        timestamp: Date.now(),
        ttl,
      };
      
      storageObj.setItem(key, JSON.stringify(cached));
    } catch (error) {
      logger.warn('[useSWRCache] Error writing cache:', error);
    }
  }, [key, storage, ttl]);
  
  /**
   * Fetch fresh data and update cache
   * 
   * Requirements: 6.5, 6.6
   * - Serve stale data immediately
   * - Fetch fresh data in background
   * - Update cache after fetch completes
   */
  const revalidate = useCallback(async () => {
    const now = Date.now();
    
    // Deduplication: prevent duplicate fetches within dedupingInterval
    if (isFetchingRef.current || (now - lastFetchRef.current) < dedupingInterval) {
      logger.log('[useSWRCache] Skipping duplicate fetch (deduping)', { key });
      return;
    }
    
    isFetchingRef.current = true;
    lastFetchRef.current = now;
    setIsValidating(true);
    setError(null);
    
    try {
      // Fetch fresh data
      const freshData = await fetcher();
      
      // Update state
      setData(freshData);
      setIsStale(false);
      
      // Update cache
      setCachedData(freshData);
      
      logger.log('[useSWRCache] Revalidation complete', {
        key,
        executionTime: Date.now() - now,
      });
    } catch (err) {
      const error = err as Error;
      setError(error);
      
      logger.warn('[useSWRCache] Revalidation failed, serving stale data', {
        key,
        error: error.message,
      });
    } finally {
      setIsValidating(false);
      isFetchingRef.current = false;
    }
  }, [fetcher, key, dedupingInterval, setCachedData]);
  
  /**
   * Manually update cache (optimistic update)
   */
  const mutate = useCallback((newData: T) => {
    setData(newData);
    setIsStale(false);
    setCachedData(newData);
    
    logger.log('[useSWRCache] Manual mutation', { key });
  }, [key, setCachedData]);
  
  /**
   * Initial load: serve stale data immediately, then revalidate
   * 
   * Requirement 6.5, 6.6: Stale-while-revalidate behavior
   */
  useEffect(() => {
    const loadData = async () => {
      // 1. Check cache first
      const cached = getCachedData();
      
      if (cached) {
        // Serve stale data immediately
        setData(cached.data);
        setIsStale(cached.isStale);
        setIsLoading(false);
        
        logger.log('[useSWRCache] Serving cached data', {
          key,
          isStale: cached.isStale,
        });
        
        // If stale and revalidateOnMount, fetch fresh in background
        if (cached.isStale && revalidateOnMount) {
          await revalidate();
        }
      } else {
        // No cache, fetch fresh (this is the initial loading state)
        setIsLoading(true);
        await revalidate();
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [key, getCachedData, revalidate, revalidateOnMount]);
  
  /**
   * Revalidate on window focus (optional)
   */
  useEffect(() => {
    if (!revalidateOnFocus) return;
    
    const handleFocus = () => {
      logger.log('[useSWRCache] Window focus, revalidating', { key });
      revalidate();
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [key, revalidate, revalidateOnFocus]);
  
  return {
    data,
    isLoading,
    isValidating,
    isStale,
    error,
    mutate,
    revalidate,
  };
}

/**
 * Convenience hook for places data with SWR
 * 
 * @example
 * ```typescript
 * const { data: places, isStale } = useSWRPlaces();
 * ```
 */
export function useSWRPlaces() {
  // This is a placeholder - actual implementation would import getDocs from firebase
  return useSWRCache<any[]>(
    {
      key: 'places:all',
      ttl: 300000, // 5 minutes
      storage: 'sessionStorage',
      revalidateOnMount: true,
      revalidateOnFocus: false,
    },
    async () => {
      // Placeholder - actual implementation would fetch from Firestore
      return [];
    }
  );
}
