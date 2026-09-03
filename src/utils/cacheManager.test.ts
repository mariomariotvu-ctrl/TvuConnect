/**
 * Unit tests for Cache Manager
 * 
 * Tests cover:
 * - getCachedData and setCachedData functions
 * - TTL expiration logic
 * - LRU eviction when storage > 80% full
 * - Pattern-based cache invalidation
 * - QuotaExceededError handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  invalidateCachePattern,
  clearAllCache,
  getCacheStats,
  type CacheConfig,
} from './cacheManager';

describe('Cache Manager', () => {
  beforeEach(() => {
    // Clear all storage before each test
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCachedData and setCachedData', () => {
    it('should store and retrieve data correctly', () => {
      const config: CacheConfig = {
        key: 'test:key',
        ttl: 60000,
        storage: 'sessionStorage',
      };

      const testData = { id: 1, name: 'Test' };
      setCachedData(config, testData);

      const retrieved = getCachedData<typeof testData>(config);
      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent key', () => {
      const config: CacheConfig = {
        key: 'nonexistent',
        ttl: 60000,
        storage: 'sessionStorage',
      };

      const retrieved = getCachedData(config);
      expect(retrieved).toBeNull();
    });

    it('should work with both localStorage and sessionStorage', () => {
      const localConfig: CacheConfig = {
        key: 'local:test',
        ttl: 60000,
        storage: 'localStorage',
      };

      const sessionConfig: CacheConfig = {
        key: 'session:test',
        ttl: 60000,
        storage: 'sessionStorage',
      };

      setCachedData(localConfig, 'local data');
      setCachedData(sessionConfig, 'session data');

      expect(getCachedData(localConfig)).toBe('local data');
      expect(getCachedData(sessionConfig)).toBe('session data');
    });
  });

  describe('TTL Expiration', () => {
    it('should return data within TTL', () => {
      const config: CacheConfig = {
        key: 'test:ttl',
        ttl: 5000, // 5 seconds
        storage: 'sessionStorage',
      };

      setCachedData(config, 'test data');

      // Advance time by 4 seconds (within TTL)
      vi.advanceTimersByTime(4000);

      const retrieved = getCachedData(config);
      expect(retrieved).toBe('test data');
    });

    it('should return null after TTL expires', () => {
      const config: CacheConfig = {
        key: 'test:expired',
        ttl: 5000, // 5 seconds
        storage: 'sessionStorage',
      };

      setCachedData(config, 'test data');

      // Advance time by 6 seconds (past TTL)
      vi.advanceTimersByTime(6000);

      const retrieved = getCachedData(config);
      expect(retrieved).toBeNull();
    });

    it('should remove expired entry from storage', () => {
      const config: CacheConfig = {
        key: 'test:cleanup',
        ttl: 1000,
        storage: 'sessionStorage',
      };

      setCachedData(config, 'test data');
      expect(sessionStorage.getItem(config.key)).not.toBeNull();

      // Expire the entry
      vi.advanceTimersByTime(2000);
      getCachedData(config);

      // Entry should be removed
      expect(sessionStorage.getItem(config.key)).toBeNull();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate specific cache entry', () => {
      const config: CacheConfig = {
        key: 'test:invalidate',
        ttl: 60000,
        storage: 'sessionStorage',
      };

      setCachedData(config, 'test data');
      expect(getCachedData(config)).toBe('test data');

      invalidateCache(config);
      expect(getCachedData(config)).toBeNull();
    });

    it('should invalidate cache entries matching pattern', () => {
      // Create multiple cache entries
      setCachedData({ key: 'posts:feed', ttl: 60000, storage: 'sessionStorage' }, 'feed data');
      setCachedData({ key: 'posts:detail:1', ttl: 60000, storage: 'sessionStorage' }, 'post 1');
      setCachedData({ key: 'posts:detail:2', ttl: 60000, storage: 'sessionStorage' }, 'post 2');
      setCachedData({ key: 'profile:user1', ttl: 60000, storage: 'sessionStorage' }, 'user 1');

      // Invalidate all posts
      invalidateCachePattern('posts:*', 'sessionStorage');

      // Posts should be invalidated
      expect(getCachedData({ key: 'posts:feed', ttl: 60000, storage: 'sessionStorage' })).toBeNull();
      expect(getCachedData({ key: 'posts:detail:1', ttl: 60000, storage: 'sessionStorage' })).toBeNull();
      expect(getCachedData({ key: 'posts:detail:2', ttl: 60000, storage: 'sessionStorage' })).toBeNull();

      // Profile should still exist
      expect(getCachedData({ key: 'profile:user1', ttl: 60000, storage: 'sessionStorage' })).toBe('user 1');
    });

    it('should clear all cache entries', () => {
      setCachedData({ key: 'test:1', ttl: 60000, storage: 'sessionStorage' }, 'data 1');
      setCachedData({ key: 'test:2', ttl: 60000, storage: 'sessionStorage' }, 'data 2');
      setCachedData({ key: 'test:3', ttl: 60000, storage: 'sessionStorage' }, 'data 3');

      clearAllCache('sessionStorage');

      expect(getCachedData({ key: 'test:1', ttl: 60000, storage: 'sessionStorage' })).toBeNull();
      expect(getCachedData({ key: 'test:2', ttl: 60000, storage: 'sessionStorage' })).toBeNull();
      expect(getCachedData({ key: 'test:3', ttl: 60000, storage: 'sessionStorage' })).toBeNull();
    });
  });

  describe('LRU Eviction', () => {
    it('should track last access time', () => {
      const config1: CacheConfig = { key: 'test:1', ttl: 60000, storage: 'sessionStorage' };
      const config2: CacheConfig = { key: 'test:2', ttl: 60000, storage: 'sessionStorage' };

      setCachedData(config1, 'data 1');
      vi.advanceTimersByTime(1000);
      setCachedData(config2, 'data 2');

      const stats = getCacheStats('sessionStorage');
      expect(stats.entryCount).toBe(2);
      expect(stats.oldestEntry).toBe('test:1');
      expect(stats.newestEntry).toBe('test:2');
    });

    it('should update last access time on get', () => {
      const config1: CacheConfig = { key: 'test:1', ttl: 60000, storage: 'sessionStorage' };
      const config2: CacheConfig = { key: 'test:2', ttl: 60000, storage: 'sessionStorage' };

      setCachedData(config1, 'data 1');
      vi.advanceTimersByTime(1000);
      setCachedData(config2, 'data 2');

      // Access config1 to make it newer
      vi.advanceTimersByTime(1000);
      getCachedData(config1);

      const stats = getCacheStats('sessionStorage');
      expect(stats.oldestEntry).toBe('test:2');
      expect(stats.newestEntry).toBe('test:1');
    });
  });

  describe('QuotaExceededError Handling', () => {
    it('should handle storage quota exceeded gracefully', () => {
      // Mock storage.setItem to throw QuotaExceededError
      const originalSetItem = Storage.prototype.setItem;
      let callCount = 0;

      Storage.prototype.setItem = vi.fn((key: string, value: string) => {
        callCount++;
        // First call throws, second call succeeds (after eviction)
        if (callCount === 1) {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        originalSetItem.call(sessionStorage, key, value);
      });

      // Add some entries first
      for (let i = 0; i < 5; i++) {
        setCachedData({ key: `old:${i}`, ttl: 60000, storage: 'sessionStorage' }, `data ${i}`);
        vi.advanceTimersByTime(100);
      }

      // Reset call count
      callCount = 0;

      // This should trigger eviction and retry
      expect(() => {
        setCachedData({ key: 'new:entry', ttl: 60000, storage: 'sessionStorage' }, 'new data');
      }).not.toThrow();

      // Restore original setItem
      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('Cache Statistics', () => {
    it('should return correct cache statistics', () => {
      setCachedData({ key: 'test:1', ttl: 60000, storage: 'sessionStorage' }, 'data 1');
      setCachedData({ key: 'test:2', ttl: 60000, storage: 'sessionStorage' }, 'data 2');
      setCachedData({ key: 'test:3', ttl: 60000, storage: 'sessionStorage' }, 'data 3');

      const stats = getCacheStats('sessionStorage');
      expect(stats.entryCount).toBe(3);
      expect(stats.storageUsage).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeTruthy();
      expect(stats.newestEntry).toBeTruthy();
    });

    it('should return empty stats for empty storage', () => {
      const stats = getCacheStats('sessionStorage');
      expect(stats.entryCount).toBe(0);
      expect(stats.storageUsage).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });

  describe('Complex Data Types', () => {
    it('should handle arrays', () => {
      const config: CacheConfig = {
        key: 'test:array',
        ttl: 60000,
        storage: 'sessionStorage',
      };

      const testData = [1, 2, 3, 4, 5];
      setCachedData(config, testData);

      const retrieved = getCachedData<typeof testData>(config);
      expect(retrieved).toEqual(testData);
    });

    it('should handle nested objects', () => {
      const config: CacheConfig = {
        key: 'test:nested',
        ttl: 60000,
        storage: 'sessionStorage',
      };

      const testData = {
        user: {
          id: 1,
          profile: {
            name: 'Test User',
            settings: {
              theme: 'dark',
            },
          },
        },
      };

      setCachedData(config, testData);

      const retrieved = getCachedData<typeof testData>(config);
      expect(retrieved).toEqual(testData);
    });
  });
});
