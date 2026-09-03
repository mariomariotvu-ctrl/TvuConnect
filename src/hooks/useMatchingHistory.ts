import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { Match } from '../types';

/**
 * Return type for useMatchingHistory hook
 */
export interface UseMatchingHistoryReturn {
  matchHistory: Match[];
  rawMatches: Match[];
  hasMoreHistory: boolean;
  loadMore: () => void;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook for managing match history with real-time updates
 * 
 * @param {string} userUid - Current user's UID
 * @param {Set<string>} blockedUids - Set of blocked user UIDs to filter out
 * @param {number} initialLimit - Initial number of matches to load (default: 10)
 * @returns {UseMatchingHistoryReturn} Match history state and management functions
 * 
 * @example
 * ```tsx
 * const blockedUids = new Set(['uid1', 'uid2']);
 * const { matchHistory, hasMoreHistory, loadMore } = useMatchingHistory(
 *   currentUser.uid,
 *   blockedUids,
 *   10
 * );
 * 
 * // Load more matches
 * if (hasMoreHistory) {
 *   loadMore();
 * }
 * ```
 */
export const useMatchingHistory = (
  userUid: string,
  blockedUids: Set<string>,
  initialLimit: number = 10
): UseMatchingHistoryReturn => {
  const [rawMatches, setRawMatches] = useState<Match[]>([]);
  const [matchHistory, setMatchHistory] = useState<Match[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(initialLimit);
  const [hasMoreHistory, setHasMoreHistory] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load more matches by increasing the limit
   */
  const loadMore = useCallback(() => {
    setHistoryLimit(prev => prev + 10);
  }, []);

  /**
   * Subscribe to Firestore matches collection
   */
  useEffect(() => {
    if (!userUid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const q = query(
      collection(db, 'matches'),
      where('userUid', '==', userUid),
      orderBy('createdAt', 'desc'),
      limit(historyLimit + 1) // Load one extra to check if there are more
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const matches = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Match[];

        // Filter out documents where matchedProfile is missing/null/undefined
        // This prevents crashes from legacy Firestore data or race conditions during write
        const validMatches = matches.filter(m => m.matchedProfile != null);
        
        setRawMatches(validMatches);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error loading match history:', err);
        setError(err.message || 'Failed to load match history');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userUid, historyLimit]);

  /**
   * Filter and deduplicate matches
   */
  useEffect(() => {
    // Filter out blocked users
    const filteredMatches = rawMatches.filter(m => !blockedUids.has(m.matchedUid));
    
    // Deduplicate by matchedUid (keep most recent)
    const uniqueMatches: Match[] = [];
    const seenUids = new Set<string>();
    
    for (const match of filteredMatches) {
      if (!seenUids.has(match.matchedUid)) {
        seenUids.add(match.matchedUid);
        uniqueMatches.push(match);
      }
    }

    // Check if there are more matches available
    if (uniqueMatches.length > historyLimit) {
      setMatchHistory(uniqueMatches.slice(0, historyLimit));
      setHasMoreHistory(true);
    } else {
      setMatchHistory(uniqueMatches);
      setHasMoreHistory(false);
    }
  }, [rawMatches, blockedUids, historyLimit]);

  return {
    matchHistory,
    rawMatches,
    hasMoreHistory,
    loadMore,
    isLoading,
    error,
  };
};
