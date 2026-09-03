/**
 * Viewed Profiles Cache with sessionStorage
 * 
 * Task 6.6: Move viewed profiles cache from memory (Map) to sessionStorage
 * 
 * This module provides caching for viewed profiles using sessionStorage
 * with 24-hour TTL to reduce Firestore reads and improve matching performance.
 * 
 * Features:
 * - Cache viewed profile UIDs with 24h TTL in sessionStorage
 * - In-memory filtering of already viewed profiles
 * - Persistent across page reloads within the same session
 * - Automatic cleanup of old entries
 * 
 * Requirements: 6.4
 */

import { logger } from '@/utils/logger';

export interface ViewedProfile {
  uid: string;
  viewedAt: number;
  viewCount: number;
}

const VIEWED_PROFILES_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = 'viewed_profiles:';

/**
 * Get viewed profiles for a user from sessionStorage
 * 
 * Requirement 6.4: Store in sessionStorage instead of memory
 */
export const getViewedProfilesFromCache = (userUid: string): ViewedProfile[] => {
  const cacheKey = `${CACHE_KEY_PREFIX}${userUid}`;
  
  try {
    // Read from sessionStorage
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      const profiles: ViewedProfile[] = JSON.parse(cached);
      
      // Clean up expired entries (older than 24 hours)
      const now = Date.now();
      const cleaned = profiles.filter(p => (now - p.viewedAt) < VIEWED_PROFILES_TTL);
      
      // Update sessionStorage if we cleaned anything
      if (cleaned.length !== profiles.length) {
        sessionStorage.setItem(cacheKey, JSON.stringify(cleaned));
        logger.log('[ViewedProfilesCache] Cleaned expired entries from sessionStorage', {
          before: profiles.length,
          after: cleaned.length,
        });
      }
      
      return cleaned;
    }
    
    // Migration: Check localStorage for legacy data
    const localStorageKey = `tvu_viewed_profiles_${userUid}`;
    const legacyData = localStorage.getItem(localStorageKey);
    
    if (legacyData) {
      const profiles: ViewedProfile[] = JSON.parse(legacyData);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const cleaned = profiles.filter(p => p.viewedAt > thirtyDaysAgo);
      
      // Migrate to sessionStorage
      sessionStorage.setItem(cacheKey, JSON.stringify(cleaned));
      
      logger.log('[ViewedProfilesCache] Migrated from localStorage to sessionStorage', {
        profiles: cleaned.length,
      });
      
      return cleaned;
    }
  } catch (error) {
    logger.warn('[ViewedProfilesCache] Error reading from sessionStorage:', error);
  }
  
  return [];
};

/**
 * Mark a profile as viewed and update sessionStorage
 * 
 * Requirement 6.4: Store in sessionStorage instead of memory
 */
export const markProfileAsViewedInCache = (userUid: string, profileUid: string): void => {
  const cacheKey = `${CACHE_KEY_PREFIX}${userUid}`;
  const viewed = getViewedProfilesFromCache(userUid);
  
  const existingIndex = viewed.findIndex(p => p.uid === profileUid);
  
  if (existingIndex >= 0) {
    // Update existing entry
    viewed[existingIndex] = {
      uid: profileUid,
      viewedAt: Date.now(),
      viewCount: viewed[existingIndex].viewCount + 1,
    };
  } else {
    // Add new entry
    viewed.push({
      uid: profileUid,
      viewedAt: Date.now(),
      viewCount: 1,
    });
  }
  
  // Update sessionStorage
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(viewed));
    
    logger.log('[ViewedProfilesCache] Marked profile as viewed in sessionStorage', {
      profileUid,
      totalViewed: viewed.length,
    });
  } catch (error) {
    logger.warn('[ViewedProfilesCache] Error writing to sessionStorage:', error);
    
    // If quota exceeded, try to clean up old entries
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      const cleaned = viewed.slice(-50); // Keep only last 50 entries
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cleaned));
        logger.log('[ViewedProfilesCache] Cleaned sessionStorage after quota exceeded');
      } catch (retryError) {
        logger.error('[ViewedProfilesCache] Failed to write even after cleanup');
      }
    }
  }
};

/**
 * Filter out already viewed profiles
 * 
 * Requirement 6.4: Filter using sessionStorage data
 */
export const filterViewedProfiles = <T extends { uid: string }>(
  profiles: T[],
  userUid: string
): T[] => {
  const viewed = getViewedProfilesFromCache(userUid);
  const viewedUids = new Set(viewed.map(v => v.uid));
  
  return profiles.filter(profile => !viewedUids.has(profile.uid));
};

/**
 * Check if a profile is in cooldown period (24 hours)
 */
export const isInCooldown = (viewedProfile: ViewedProfile): boolean => {
  const timeSinceView = Date.now() - viewedProfile.viewedAt;
  return timeSinceView < VIEWED_PROFILES_TTL;
};

/**
 * Get statistics about viewed profiles from sessionStorage
 */
export const getViewedStatsFromCache = (userUid: string) => {
  const viewed = getViewedProfilesFromCache(userUid);
  const inCooldown = viewed.filter(isInCooldown).length;
  
  return {
    total: viewed.length,
    inCooldown,
    available: viewed.length - inCooldown,
  };
};

/**
 * Clear viewed profiles cache in sessionStorage
 */
export const clearViewedProfilesCache = (userUid: string): void => {
  const cacheKey = `${CACHE_KEY_PREFIX}${userUid}`;
  
  try {
    sessionStorage.removeItem(cacheKey);
    logger.log('[ViewedProfilesCache] Cleared sessionStorage cache');
  } catch (error) {
    logger.warn('[ViewedProfilesCache] Error clearing sessionStorage:', error);
  }
  
  // Also clear legacy localStorage
  try {
    const localStorageKey = `tvu_viewed_profiles_${userUid}`;
    localStorage.removeItem(localStorageKey);
  } catch (error) {
    logger.warn('[ViewedProfilesCache] Error clearing localStorage:', error);
  }
};

/**
 * Get cache statistics (sessionStorage usage)
 */
export const getViewedProfilesCacheStats = (userUid: string) => {
  const cacheKey = `${CACHE_KEY_PREFIX}${userUid}`;
  
  try {
    const cached = sessionStorage.getItem(cacheKey);
    const sizeBytes = cached ? new Blob([cached]).size : 0;
    const profiles = getViewedProfilesFromCache(userUid);
    
    return {
      profiles: profiles.length,
      sizeBytes,
      sizeKB: (sizeBytes / 1024).toFixed(2),
      storage: 'sessionStorage' as const,
    };
  } catch (error) {
    logger.warn('[ViewedProfilesCache] Error getting cache stats:', error);
    return {
      profiles: 0,
      sizeBytes: 0,
      sizeKB: '0',
      storage: 'sessionStorage' as const,
    };
  }
};

