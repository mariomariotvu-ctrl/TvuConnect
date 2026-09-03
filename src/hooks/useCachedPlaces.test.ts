/**
 * Unit Tests for useCachedPlaces Hook
 * 
 * Tests cache-first strategy, adaptive limits, category filtering,
 * and cache invalidation for places data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCachedPlaces, invalidatePlacesCache } from './useCachedPlaces';
import * as queryOptimizer from '../utils/queryOptimizer';
import * as cacheManager from '../utils/cacheManager';
import { Place } from '../types';

// Mock dependencies
vi.mock('../utils/queryOptimizer');
vi.mock('../utils/cacheManager');

describe('useCachedPlaces', () => {
  const mockPlaces: any[] = [
    {
      id: 'place1',
      name: 'Quán Cà Phê ABC',
      category: 'cafe',
      location: { lat: 10.0, lng: 106.0, address: '123 Main St' },
      rating: 4.5,
      priceRange: '$',
      description: 'Quán cà phê đẹp',
      checkInCount: 10,
      createdBy: 'user1',
      createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) } as any,
      updatedAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) } as any,
    },
    {
      id: 'place2',
      name: 'Nhà Hàng XYZ',
      category: 'restaurant',
      location: { lat: 10.1, lng: 106.1, address: '456 Second St' },
      rating: 4.0,
      priceRange: '$$',
      description: 'Nhà hàng ngon',
      checkInCount: 20,
      createdBy: 'user2',
      createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) } as any,
      updatedAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) } as any,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock optimizeQuery to return mock data
    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
      data: mockPlaces,
      lastDoc: null,
      hasMore: false,
      fromCache: false,
      executionTime: 100,
      documentReads: 2,
    });

    // Mock createCacheConfig
    vi.mocked(queryOptimizer.createCacheConfig).mockReturnValue({
      enabled: true,
      ttl: 300000,
      storage: 'sessionStorage',
      keyPrefix: 'places:all',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should load places on mount', async () => {
      const { result } = renderHook(() => useCachedPlaces());

      // Initially loading
      expect(result.current.loading).toBe(true);
      expect(result.current.places).toEqual([]);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.places).toEqual(mockPlaces);
      expect(result.current.error).toBeNull();
    });

    it('should call optimizeQuery with correct config', async () => {
      renderHook(() => useCachedPlaces({ category: 'all', isMobile: false }));

      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: 'places',
            limit: 200, // Desktop limit
            where: [],
          }),
          expect.objectContaining({
            enabled: true,
            ttl: 300000,
            storage: 'sessionStorage',
          })
        );
      });
    });
  });

  describe('Adaptive Limits (Task 6.3)', () => {
    it('should use limit 100 on mobile', async () => {
      renderHook(() => useCachedPlaces({ isMobile: true }));

      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 100,
          }),
          expect.any(Object)
        );
      });
    });

    it('should use limit 200 on desktop', async () => {
      renderHook(() => useCachedPlaces({ isMobile: false }));

      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 200,
          }),
          expect.any(Object)
        );
      });
    });
  });

  describe('Category Filtering (Task 6.4)', () => {
    it('should filter by category at database level', async () => {
      renderHook(() => useCachedPlaces({ category: 'cafe' }));

      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            where: [
              {
                field: 'category',
                operator: '==',
                value: 'cafe',
              },
            ],
          }),
          expect.any(Object)
        );
      });
    });

    it('should not filter when category is "all"', async () => {
      renderHook(() => useCachedPlaces({ category: 'all' }));

      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            where: [],
          }),
          expect.any(Object)
        );
      });
    });

    it('should use correct cache key for category', async () => {
      renderHook(() => useCachedPlaces({ category: 'restaurant' }));

      await waitFor(() => {
        expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
          300000,
          'sessionStorage',
          'places:restaurant'
        );
      });
    });

    it('should use "places:all" cache key when category is "all"', async () => {
      renderHook(() => useCachedPlaces({ category: 'all' }));

      await waitFor(() => {
        expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
          300000,
          'sessionStorage',
          'places:all'
        );
      });
    });
  });

  describe('Cache Configuration (Task 6.2)', () => {
    it('should use 300 second TTL', async () => {
      renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
          300000, // 300 seconds = 5 minutes
          'sessionStorage',
          expect.any(String)
        );
      });
    });

    it('should use sessionStorage', async () => {
      renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
          expect.any(Number),
          'sessionStorage',
          expect.any(String)
        );
      });
    });

    it('should return cached data when fromCache is true', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockPlaces,
        lastDoc: null,
        hasMore: false,
        fromCache: true,
        executionTime: 5,
        documentReads: 0,
      });

      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.fromCache).toBe(true);
      expect(result.current.places).toEqual(mockPlaces);
    });
  });

  describe('Cache Invalidation (Task 6.7)', () => {
    it('should provide invalidateCache function', async () => {
      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.invalidateCache).toBe('function');
    });

    it('should invalidate cache when invalidateCache is called', async () => {
      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      result.current.invalidateCache();

      expect(cacheManager.invalidateCachePattern).toHaveBeenCalledWith(
        'places:*',
        'sessionStorage'
      );
    });

    it('should invalidate cache with external function', () => {
      invalidatePlacesCache();

      expect(cacheManager.invalidateCachePattern).toHaveBeenCalledWith(
        'places:*',
        'sessionStorage'
      );
    });
  });

  describe('Refresh Functionality', () => {
    it('should provide refresh function', async () => {
      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('should reload data when refresh is called', async () => {
      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear mock calls
      vi.clearAllMocks();

      // Call refresh
      result.current.refresh();

      // Should reload data
      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const error = new Error('Firestore error');
      vi.mocked(queryOptimizer.optimizeQuery).mockRejectedValue(error);

      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual(error);
      expect(result.current.places).toEqual([]);
    });

    it('should return empty array on error', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useCachedPlaces());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.places).toEqual([]);
    });
  });

  describe('Cache Disable Option', () => {
    it('should disable cache when enableCache is false', async () => {
      renderHook(() => useCachedPlaces({ enableCache: false }));

      await waitFor(() => {
        expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            enabled: false,
          })
        );
      });
    });
  });

  describe('Performance Logging', () => {
    it('should log performance metrics', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      renderHook(() => useCachedPlaces({ category: 'cafe', isMobile: true }));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[useCachedPlaces] Load places:',
          expect.objectContaining({
            category: 'cafe',
            fromCache: false,
            placeCount: 2,
            queryLimit: 100,
          })
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
