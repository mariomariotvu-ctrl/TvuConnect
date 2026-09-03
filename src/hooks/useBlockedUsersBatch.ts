/**
 * Blocked Users Batch Fetch Hook
 * 
 * This hook optimizes blocked users fetching by using batch queries
 * instead of individual queries for each blocked user profile.
 * 
 * Features:
 * - Fetch blocked users in single query using where('uid', 'in', blockedUids)
 * - Limit to 30 blocked users
 * - Cache blocked user profiles
 * 
 * Requirements: 5.3, 5.4
 */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from './useUserProfile';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';

// Cache manager for blocked user profiles
const blockedProfilesCache = new FirestoreCacheManager({
  maxSize: 50,
  defaultTTL: 300000, // 5 minutes
});

export interface UseBlockedUsersBatchReturn {
  blockedProfiles: UserProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to batch fetch blocked user profiles
 * 
 * Requirement 5.3: Fetch blocked users in single query using where('uid', 'in', blockedUids)
 * Requirement 5.4: Limit to 30 blocked users
 * 
 * @param blockedUids - Array of blocked user IDs
 * @returns Blocked user profiles, loading state, error, and refetch function
 */
export function useBlockedUsersBatch(blockedUids: string[]): UseBlockedUsersBatchReturn {
  const [blockedProfiles, setBlockedProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBlockedProfiles = async () => {
    if (!blockedUids || blockedUids.length === 0) {
      setBlockedProfiles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Limit to 30 blocked users (Requirement 5.4)
      const limitedUids = blockedUids.slice(0, 30);

      // Check cache first
      const cacheKey = `blocked-profiles:${limitedUids.sort().join(',')}`;
      const cached = blockedProfilesCache.get<UserProfile[]>(cacheKey);

      if (cached) {
        setBlockedProfiles(cached);
        setLoading(false);
        return;
      }

      // Firestore 'in' operator supports up to 10 values at a time
      // Split into chunks of 10
      const chunks: string[][] = [];
      for (let i = 0; i < limitedUids.length; i += 10) {
        chunks.push(limitedUids.slice(i, i + 10));
      }

      // Fetch all chunks in parallel
      const allProfiles: UserProfile[] = [];

      for (const chunk of chunks) {
        const profilesRef = collection(db, 'profiles');
        const q = query(
          profilesRef,
          where('__name__', 'in', chunk)
        );

        const snapshot = await getDocs(q);
        
        snapshot.docs.forEach(doc => {
          allProfiles.push({
            uid: doc.id,
            ...doc.data(),
          } as UserProfile);
        });
      }

      // Store in cache
      blockedProfilesCache.set(cacheKey, allProfiles);
      setBlockedProfiles(allProfiles);
    } catch (err: any) {
      console.error('[useBlockedUsersBatch] Error fetching blocked profiles:', err);
      setError(err.message || 'Failed to fetch blocked profiles');
      setBlockedProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedProfiles();
  }, [blockedUids.join(',')]); // Re-fetch when blocked UIDs change

  return {
    blockedProfiles,
    loading,
    error,
    refetch: fetchBlockedProfiles,
  };
}

/**
 * Invalidate blocked profiles cache
 */
export function invalidateBlockedProfilesCache(): void {
  blockedProfilesCache.invalidatePattern('blocked-profiles:*');
}

/**
 * Get cache statistics for monitoring
 */
export function getBlockedProfilesCacheStats() {
  return blockedProfilesCache.getStats();
}
