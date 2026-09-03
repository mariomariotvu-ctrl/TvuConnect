/**
 * Tests for useCachedMatching Hook
 * 
 * Tests cache-first strategy, in-memory filtering, and cache invalidation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCachedMatching } from './useCachedMatching';
import { StudentProfile } from '../types';
import * as viewedProfilesCache from '../utils/viewedProfilesCache';
import * as matchingService from '../services/matchingService';

// Mock dependencies
vi.mock('../utils/viewedProfilesCache');
vi.mock('../services/matchingService');

describe('useCachedMatching', () => {
  const mockCurrentUserUid = 'user123';
  const mockFilters = {
    gender: 'female',
    major: '',
    academicYear: '',
    interest: '',
    zodiac: '',
    minAge: '18',
    maxAge: '25',
    studyGoals: [],
    seniority: '' as const,
  };
  const mockBlockedSet = new Set<string>();
  const mockMode = 'lover' as const;
  const mockCurrentProfile: any = {
    uid: 'user123',
    fullName: 'Test User',
    gender: 'male',
    major: 'Computer Science',
    academicYear: '2024',
    age: 20,
    description: 'Test bio',
    photoURL: 'https://example.com/photo.jpg',
    interests: ['coding', 'music'],
    hometown: 'Ho Chi Minh',
    mssv: '110121001',
    email: 'test@example.com',
    createdAt: { toMillis: () => Date.now() } as any,
    updatedAt: { toMillis: () => Date.now() } as any,
  };

  const mockProfiles: any[] = [
    {
      uid: 'profile1',
      fullName: 'Profile 1',
      gender: 'female',
      major: 'Computer Science',
      academicYear: '2024',
      age: 20,
      description: 'Bio 1',
      photoURL: 'https://example.com/photo1.jpg',
      interests: ['coding'],
      hometown: 'Ho Chi Minh',
      mssv: '110121002',
      email: 'p1@example.com',
      createdAt: { toMillis: () => Date.now() } as any,
      updatedAt: { toMillis: () => Date.now() } as any,
    },
    {
      uid: 'profile2',
      fullName: 'Profile 2',
      gender: 'female',
      major: 'Business',
      academicYear: '2023',
      age: 21,
      description: 'Bio 2',
      photoURL: 'https://example.com/photo2.jpg',
      interests: ['music'],
      hometown: 'Ha Noi',
      mssv: '110121003',
      email: 'p2@example.com',
      createdAt: { toMillis: () => Date.now() } as any,
      updatedAt: { toMillis: () => Date.now() } as any,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock viewedProfilesCache
    vi.mocked(viewedProfilesCache.getViewedStatsFromCache).mockReturnValue({
      total: 0,
      inCooldown: 0,
      available: 0,
    });
    
    // Mock matchingService
    vi.mocked(matchingService.fetchMatchingProfiles).mockResolvedValue({
      profiles: mockProfiles,
      isShowingFallback: false,
      viewedStats: { total: 2, inCooldown: 2, available: 0 },
      error: null,
      activityDataMap: new Map(),
      isInOnlineBatch: false,
    });
    
    vi.mocked(matchingService.loadOneMoreProfile).mockResolvedValue({ profile: mockProfiles[0] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startMatching', () => {
    it('should fetch profiles and update state', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.profiles).toEqual([]);

      // Start matching
      await result.current.startMatching();

      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      expect(result.current.error).toBeNull();
      expect(matchingService.fetchMatchingProfiles).toHaveBeenCalledWith(
        mockCurrentUserUid,
        mockFilters,
        mockBlockedSet,
        mockMode,
        mockCurrentProfile
      );
    });

    it('should add shown UIDs to session Set', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();

      await waitFor(() => {
        expect(result.current.shownUidsInSession.size).toBe(2);
      });

      expect(result.current.shownUidsInSession.has('profile1')).toBe(true);
      expect(result.current.shownUidsInSession.has('profile2')).toBe(true);
    });

    it('should clear session UIDs when starting new matching', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      // First matching
      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });
      expect(result.current.shownUidsInSession.size).toBe(2);

      // Second matching should clear session UIDs
      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });
      expect(result.current.shownUidsInSession.size).toBe(2); // Re-populated
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(matchingService.fetchMatchingProfiles).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();

      await waitFor(() => {
        expect(result.current.error).toBe('Đã xảy ra lỗi. Vui lòng thử lại sau.');
      });

      expect(result.current.profiles).toEqual([]);
    });
  });

  describe('loadOneMore', () => {
    it('should load one more profile and add to list', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      // Start matching first
      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      const initialCount = result.current.profiles.length;

      // Load one more
      await result.current.loadOneMore();

      await waitFor(() => {
        expect(result.current.profiles.length).toBe(initialCount + 1);
      });
      expect(matchingService.loadOneMoreProfile).toHaveBeenCalled();
    });

    it('should add new profile UID to session Set', async () => {
      const mockNewProfile = { uid: 'profile3', fullName: 'Profile 3' };
      vi.mocked(matchingService.loadOneMoreProfile).mockResolvedValue({ profile: mockNewProfile } as any);

      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      const initialSize = result.current.shownUidsInSession.size;

      await result.current.loadOneMore();
      
      await waitFor(() => {
        expect(result.current.shownUidsInSession.size).toBe(initialSize + 1);
      });
      expect(result.current.shownUidsInSession.has('profile3')).toBe(true);
    });

    it('should handle null response from loadOneMoreProfile', async () => {
      vi.mocked(matchingService.loadOneMoreProfile).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      const initialCount = result.current.profiles.length;

      await result.current.loadOneMore();
      
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.profiles.length).toBe(initialCount);
    });
  });

  describe('clearViewedCache', () => {
    it('should clear viewed cache and session UIDs', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      expect(result.current.shownUidsInSession.size).toBeGreaterThan(0);

      result.current.clearViewedCache();

      expect(viewedProfilesCache.clearViewedProfilesCache).toHaveBeenCalledWith(
        mockCurrentUserUid
      );
      expect(result.current.shownUidsInSession.size).toBe(0);
    });
  });

  describe('invalidateOnBlock', () => {
    it('should remove blocked user from profiles and session UIDs', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      expect(result.current.profiles.length).toBe(2);
      expect(result.current.shownUidsInSession.has('profile1')).toBe(true);

      result.current.invalidateOnBlock('profile1');

      await waitFor(() => {
        expect(result.current.profiles.length).toBe(1);
      });
      expect(result.current.profiles.find(p => p.uid === 'profile1')).toBeUndefined();
      expect(result.current.shownUidsInSession.has('profile1')).toBe(false);
    });

    it('should handle blocking non-existent user gracefully', async () => {
      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      await waitFor(() => {
        expect(result.current.profiles).toEqual(mockProfiles);
      });

      const initialCount = result.current.profiles.length;

      result.current.invalidateOnBlock('nonexistent');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(result.current.profiles.length).toBe(initialCount);
    });
  });

  describe('viewedStats', () => {
    it('should update viewed stats after matching', async () => {
      const mockStats = { total: 5, inCooldown: 3, available: 2 };
      vi.mocked(viewedProfilesCache.getViewedStatsFromCache).mockReturnValue(mockStats);

      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      
      await waitFor(() => {
        expect(result.current.viewedStats.total).toBe(2); // From matchingService response
      });
    });
  });

  describe('isShowingFallback', () => {
    it('should set isShowingFallback when service returns fallback profiles', async () => {
      vi.mocked(matchingService.fetchMatchingProfiles).mockResolvedValue({
        profiles: mockProfiles,
        isShowingFallback: true,
        viewedStats: { total: 10, inCooldown: 10, available: 0 },
        error: null,
        activityDataMap: new Map(),
        isInOnlineBatch: false,
      });

      const { result } = renderHook(() =>
        useCachedMatching(
          mockCurrentUserUid,
          mockFilters,
          mockBlockedSet,
          mockMode,
          mockCurrentProfile
        )
      );

      await result.current.startMatching();
      
      await waitFor(() => {
        expect(result.current.isShowingFallback).toBe(true);
      });
    });
  });
});
