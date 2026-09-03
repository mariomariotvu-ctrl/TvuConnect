/**
 * useCachedMatching Hook - Cache-First Matching System with Viewed Profiles Cache
 * 
 * This hook implements cache-first strategy for matching system using:
 * - Viewed Profiles Cache with 24h TTL in localStorage
 * - In-memory filtering for already shown UIDs in current session
 * - Batch save match history (10 records/batch)
 * - Integration with existing matchingService
 * 
 * Requirements: Requirement 2 (Cache-First Strategy cho Matching System)
 * Task 4.1: Tạo src/hooks/useCachedMatching.ts
 * Task 4.2: Implement viewed profiles cache với TTL 24h
 * Task 4.3: Implement in-memory filtering cho already shown UIDs
 * Task 4.4: Implement batch save match history (10 records/batch)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { StudentProfile } from '../types';
import { MatchingFilters } from './useMatchingFilters';
import {
  getViewedProfilesFromCache,
  markProfileAsViewedInCache,
  filterViewedProfiles,
  getViewedStatsFromCache,
  clearViewedProfilesCache,
} from '../utils/viewedProfilesCache';
import { fetchMatchingProfiles, loadOneMoreProfile, LoadOneMoreResult } from '../services/matchingService';
import { logger } from '@/utils/logger';
import { ActivityData } from '../utils/activityBooster';

/**
 * Hook result interface
 */
export interface UseCachedMatchingResult {
  profiles: StudentProfile[];
  loading: boolean;
  error: string | null;
  isShowingFallback: boolean;
  viewedStats: { total: number; inCooldown: number; available: number };
  shownUidsInSession: Set<string>;
  startMatching: () => Promise<void>;
  loadOneMore: () => Promise<void>;
  clearViewedCache: () => void;
  invalidateOnBlock: (blockedUid: string) => void;
  activityDataMap: Map<string, ActivityData>;
  isInOnlineBatch: boolean;
}

/**
 * Custom hook for cache-first matching system
 * 
 * Features:
 * - Viewed profiles cache with 24h TTL in localStorage
 * - In-memory Set for already shown UIDs in current session
 * - Batch save match history (handled by matchingService)
 * - Cache invalidation when user blocks someone
 */
export function useCachedMatching(
  currentUserUid: string,
  filters: MatchingFilters,
  blockedSet: Set<string>,
  mode: 'lover' | 'study' | 'quick' | 'hobby',
  currentProfile: StudentProfile | null
): UseCachedMatchingResult {
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isShowingFallback, setIsShowingFallback] = useState(false);
  const [viewedStats, setViewedStats] = useState({ total: 0, inCooldown: 0, available: 0 });
  const [activityDataMap, setActivityDataMap] = useState<Map<string, ActivityData>>(new Map());
  const [isInOnlineBatch, setIsInOnlineBatch] = useState(false);

  const shownUidsInSession = useRef<Set<string>>(new Set());

  /**
   * Update viewed stats on mount
   */
  useEffect(() => {
    const stats = getViewedStatsFromCache(currentUserUid);
    setViewedStats(stats);
  }, [currentUserUid]);

  /**
   * Start matching with cache-first strategy
   */
  const startMatching = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProfiles([]);
    setIsShowingFallback(false);

    // Clear session shown UIDs when starting new matching
    shownUidsInSession.current.clear();

    try {
      // Fetch profiles using matchingService
      const result = await fetchMatchingProfiles(
        currentUserUid,
        filters,
        blockedSet,
        mode,
        currentProfile
      );

      setProfiles(result.profiles);
      setIsShowingFallback(result.isShowingFallback);
      setViewedStats(result.viewedStats);
      setError(result.error);
      setActivityDataMap(result.activityDataMap);
      setIsInOnlineBatch(result.isInOnlineBatch);

      // Task 4.3: Add shown UIDs to session Set
      result.profiles.forEach(profile => {
        shownUidsInSession.current.add(profile.uid);
      });

      // Log cache performance
      logger.log('[useCachedMatching] Matching completed:', {
        profileCount: result.profiles.length,
        isShowingFallback: result.isShowingFallback,
        viewedStats: result.viewedStats,
        shownInSession: shownUidsInSession.current.size,
      });
    } catch (err) {
      console.error('[useCachedMatching] Error in startMatching:', err);
      setError('Đã xảy ra lỗi. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, [currentUserUid, filters, blockedSet, mode, currentProfile]);

  /**
   * Load one more profile with in-memory filtering
   * 
   * Task 4.3: In-memory filtering cho already shown UIDs
   * - Passes shownUidsInSession to loadOneMoreProfile
   * - Ensures no duplicate profiles in current session
   */
  const loadOneMore = useCallback(async () => {
    setLoading(true);

    try {
      // Load one more profile, excluding already shown UIDs
      const result = await loadOneMoreProfile(
        currentUserUid,
        filters,
        blockedSet,
        shownUidsInSession.current,
        mode,
        currentProfile
      );

      if (result) {
        const { profile: newProfile, activityData } = result;
        setProfiles(prev => [...prev, newProfile]);
        
        // Task 4.3: Add to session Set
        shownUidsInSession.current.add(newProfile.uid);

        // Cập nhật activityDataMap nếu có activityData mới
        if (activityData) {
          setActivityDataMap(prev => {
            const updated = new Map(prev);
            updated.set(newProfile.uid, activityData);
            return updated;
          });
        }

        // Update viewed stats
        const stats = getViewedStatsFromCache(currentUserUid);
        setViewedStats(stats);

        logger.log('[useCachedMatching] Loaded one more profile:', {
          profileUid: newProfile.uid,
          totalShown: profiles.length + 1,
          shownInSession: shownUidsInSession.current.size,
        });
      }
    } catch (err) {
      console.error('[useCachedMatching] Error in loadOneMore:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUserUid, filters, blockedSet, mode, currentProfile, profiles.length]);

  /**
   * Clear viewed profiles cache
   * Useful for testing or when user wants to reset viewed profiles
   */
  const clearViewedCache = useCallback(() => {
    clearViewedProfilesCache(currentUserUid);
    shownUidsInSession.current.clear();
    
    const stats = getViewedStatsFromCache(currentUserUid);
    setViewedStats(stats);

    logger.log('[useCachedMatching] Cleared viewed cache');
  }, [currentUserUid]);

  /**
   * Task 4.7: Invalidate cache when user blocks someone
   * 
   * When a user blocks someone:
   * 1. Remove blocked UID from viewed profiles cache
   * 2. Remove from session shown UIDs
   * 3. Remove from current profiles list
   * 4. Update viewed stats
   */
  const invalidateOnBlock = useCallback((blockedUid: string) => {
    // Remove from current profiles
    setProfiles(prev => prev.filter(p => p.uid !== blockedUid));

    // Remove from session shown UIDs
    shownUidsInSession.current.delete(blockedUid);

    // Note: We don't remove from viewed profiles cache because:
    // - The user has already seen this profile
    // - Blocking should prevent future matches, not reset view history
    // - The blockedSet passed to matching functions will filter them out

    logger.log('[useCachedMatching] Invalidated cache for blocked user:', blockedUid);
  }, []);

  return {
    profiles,
    loading,
    error,
    isShowingFallback,
    viewedStats,
    shownUidsInSession: shownUidsInSession.current,
    startMatching,
    loadOneMore,
    clearViewedCache,
    invalidateOnBlock,
    activityDataMap,
    isInOnlineBatch,
  };
}
