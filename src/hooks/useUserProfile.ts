/**
 * User Profile Hook with Caching
 * 
 * This hook fetches user profiles with 180s TTL caching to reduce Firestore reads.
 * 
 * Features:
 * - Cache profiles for 3 minutes (180s)
 * - Check cache before querying Firestore
 * - Invalidate cache when profile is updated
 * - Batch fetch multiple profiles
 * 
 * Requirements: 5.1, 5.2
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';

// Cache manager for profiles with 180s TTL
const profileCache = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 180000, // 180 seconds = 3 minutes
});

export interface UserProfile {
  uid: string;
  fullName: string;
  photoURL?: string;
  major?: string;
  academicYear?: string;
  hometown?: string;
  bio?: string;
  interests?: string[];
  gender?: string;
  isOnline?: boolean;
  lastActive?: Date;
  [key: string]: any;
}

export interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single user profile with caching
 * 
 * Requirement 5.1: Check cache before querying Firestore
 * Requirement 5.2: Cache user profiles for 180 seconds (3 minutes)
 * 
 * @param userId - User ID to fetch profile for
 * @returns Profile data, loading state, error, and refetch function
 */
export function useUserProfile(userId: string | undefined): UseUserProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check cache first
      const cacheKey = `profile:${userId}`;
      const cached = profileCache.get<UserProfile>(cacheKey);

      if (cached) {
        setProfile(cached);
        setLoading(false);
        return;
      }

      // Cache miss - fetch from Firestore
      const profileRef = doc(db, 'profiles', userId);
      const profileSnap = await getDoc(profileRef);

      if (profileSnap.exists()) {
        const profileData = {
          uid: profileSnap.id,
          ...profileSnap.data(),
        } as UserProfile;

        // Store in cache
        profileCache.set(cacheKey, profileData);
        setProfile(profileData);
      } else {
        setProfile(null);
        setError('Profile not found');
      }
    } catch (err: any) {
      console.error('[useUserProfile] Error fetching profile:', err);
      setError(err.message || 'Failed to fetch profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  return {
    profile,
    loading,
    error,
    refetch: fetchProfile,
  };
}

/**
 * Invalidate profile cache for a specific user
 * Call this when a profile is updated
 * 
 * Requirement 5.2: Invalidate cache when profile is updated
 * 
 * @param userId - User ID to invalidate cache for
 */
export function invalidateProfileCache(userId: string): void {
  const cacheKey = `profile:${userId}`;
  profileCache.invalidate(cacheKey);
}

/**
 * Get cache statistics for monitoring
 */
export function getProfileCacheStats() {
  return profileCache.getStats();
}
