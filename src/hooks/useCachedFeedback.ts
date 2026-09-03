/**
 * useCachedFeedback Hook - Cache-First Feedback System
 * 
 * This hook implements cache-first strategy for feedback system using:
 * - Cache Manager for browser storage caching (localStorage)
 * - TTL: 10 minutes (600 seconds)
 * - Cache key: 'feedback:pending:{userId}'
 * 
 * Purpose: Reduce Firestore reads for feedback queries to prevent quota exceeded errors
 */

import { useState, useEffect, useCallback } from 'react';
import { getPendingFeedbackMatches } from '../utils/feedbackManager';
import { logger } from '@/utils/logger';

interface MatchRecord {
  matchId: string;
  matchedUserId: string;
  matchedUserName: string;
  matchedAt: Date;
}

interface CachedFeedbackData {
  matches: MatchRecord[];
  timestamp: number;
}

/**
 * Hook result interface
 */
export interface UseCachedFeedbackResult {
  pendingMatches: MatchRecord[];
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
  refresh: () => void;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY_PREFIX = 'feedback:pending:';

/**
 * Get cached feedback data from localStorage
 */
function getCachedFeedback(userId: string): MatchRecord[] | null {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }

    const data: CachedFeedbackData = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    // Deserialize dates
    const matches = data.matches.map(match => ({
      ...match,
      matchedAt: new Date(match.matchedAt),
    }));

    return matches;
  } catch (error) {
    console.error('[useCachedFeedback] Error reading cache:', error);
    return null;
  }
}

/**
 * Save feedback data to localStorage cache
 */
function setCachedFeedback(userId: string, matches: MatchRecord[]): void {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    const data: CachedFeedbackData = {
      matches,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    console.error('[useCachedFeedback] Error writing cache:', error);
  }
}

/**
 * Custom hook for cache-first feedback system
 * 
 * Features:
 * - Cache-first strategy with 10 minute TTL in localStorage
 * - Automatic cache invalidation on refresh
 * - Error handling with graceful fallback
 * - Reduces Firestore reads significantly
 */
export function useCachedFeedback(userId: string): UseCachedFeedbackResult {
  const [pendingMatches, setPendingMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);

  /**
   * Load pending feedback matches with cache-first strategy
   */
  const loadFeedback = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first (unless explicitly skipping)
      if (!skipCache) {
        const cached = getCachedFeedback(userId);
        if (cached) {
          setPendingMatches(cached);
          setFromCache(true);
          setLoading(false);
          logger.log('[useCachedFeedback] Loaded from cache:', {
            matchCount: cached.length,
          });
          return;
        }
      }

      // Cache miss or refresh - fetch from Firestore
      const matches = await getPendingFeedbackMatches(userId);
      
      setPendingMatches(matches);
      setFromCache(false);
      
      // Save to cache
      setCachedFeedback(userId, matches);

      logger.log('[useCachedFeedback] Loaded from Firestore:', {
        matchCount: matches.length,
      });
    } catch (err) {
      console.error('[useCachedFeedback] Error loading feedback:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /**
   * Refresh feedback data
   * Invalidates cache and reloads from Firestore
   */
  const refresh = useCallback(() => {
    loadFeedback(true);
  }, [loadFeedback]);

  /**
   * Effect: Load feedback on mount
   */
  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  return {
    pendingMatches,
    loading,
    error,
    fromCache,
    refresh,
  };
}
