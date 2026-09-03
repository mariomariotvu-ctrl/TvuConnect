import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '@/utils/logger';

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  major?: string;
  yearOfStudy?: string;
}

interface CachedProfile {
  data: UserProfile;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache with 5-minute TTL
const profileCache = new Map<string, CachedProfile>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Custom hook for fetching and caching uploader profile data
 * @param uploaderId - User UID to fetch profile for
 * @returns Profile data, loading state, and error state
 */
export function useUploaderProfile(uploaderId: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uploaderId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        // TEMPORARILY DISABLE CACHE FOR DEBUGGING
        // Check cache first
        const cached = profileCache.get(uploaderId);
        const now = Date.now();

        // Force refresh - comment out cache check temporarily
        /*
        if (cached && now < cached.expiresAt) {
          // Use cached data
          setProfile(cached.data);
          setLoading(false);
          return;
        }
        */
        
        logger.log('[UploaderProfile] Fetching profile for:', uploaderId);

        // Fetch from Firestore - use 'profiles' collection where user data is actually stored
        const userDoc = await getDoc(doc(db, 'profiles', uploaderId));

        if (!userDoc.exists()) {
          // User profile not found - use fallback
          const fallbackProfile: UserProfile = {
            uid: uploaderId,
            displayName: 'Người dùng không xác định',
            photoURL: undefined
          };
          setProfile(fallbackProfile);
          
          // Cache fallback profile
          profileCache.set(uploaderId, {
            data: fallbackProfile,
            timestamp: now,
            expiresAt: now + CACHE_TTL
          });
        } else {
          const userData = userDoc.data() as any; // Use 'any' to access all possible field names
          
          logger.log('[UploaderProfile] Raw profile data:', userData);
          
          // Determine display name with comprehensive fallback priority:
          // 1. fullName field (primary field in profiles collection)
          // 2. displayName field
          // 3. name field
          // 4. firstName + lastName combination
          // 5. email username (before @)
          // 6. uid as last resort
          let displayName = userData.fullName
            || userData.displayName 
            || userData.name 
            || (userData.firstName && userData.lastName 
                ? `${userData.firstName} ${userData.lastName}`.trim()
                : userData.firstName || userData.lastName);
          
          if (!displayName && userData.email) {
            // Extract username from email (before @)
            displayName = userData.email.split('@')[0];
          }
          
          if (!displayName) {
            // Use UID as absolute last resort
            displayName = `User ${uploaderId.substring(0, 8)}`;
          }
          
          logger.log('[UploaderProfile] Determined display name:', displayName);
          
          const profileData: UserProfile = {
            uid: uploaderId,
            displayName: displayName,
            photoURL: userData.photoURL || userData.avatar || userData.profilePicture,
            email: userData.email,
            major: userData.major,
            yearOfStudy: userData.yearOfStudy
          };

          setProfile(profileData);

          // Cache the profile
          profileCache.set(uploaderId, {
            data: profileData,
            timestamp: now,
            expiresAt: now + CACHE_TTL
          });
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching uploader profile:', err);
        setError(err as Error);
        
        // Set fallback profile on error
        const fallbackProfile: UserProfile = {
          uid: uploaderId,
          displayName: 'Người dùng',
          photoURL: undefined
        };
        setProfile(fallbackProfile);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [uploaderId]);

  return { profile, loading, error };
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache() {
  const now = Date.now();
  for (const [key, cached] of profileCache.entries()) {
    if (now >= cached.expiresAt) {
      profileCache.delete(key);
    }
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache() {
  profileCache.clear();
}
