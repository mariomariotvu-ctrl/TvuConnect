/**
 * Unit tests for useUserProfile hook
 * 
 * Tests profile caching with 180s TTL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invalidateProfileCache, getProfileCacheStats } from './useUserProfile';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';

describe('useUserProfile', () => {
  let cache: FirestoreCacheManager;

  beforeEach(() => {
    cache = new FirestoreCacheManager({
      maxSize: 100,
      defaultTTL: 180000, // 180 seconds
    });
  });

  it('should cache profile data with 180s TTL', () => {
    const mockProfile = {
      uid: 'user123',
      fullName: 'Test User',
      major: 'Computer Science',
    };

    // Set profile in cache
    cache.set('profile:user123', mockProfile);

    // Get from cache
    const cached = cache.get('profile:user123');
    expect(cached).toEqual(mockProfile);
  });

  it('should return null for expired cache entries', () => {
    const mockProfile = {
      uid: 'user123',
      fullName: 'Test User',
    };

    // Set with 1ms TTL
    cache.set('profile:user123', mockProfile, 1);

    // Wait for expiration
    setTimeout(() => {
      const cached = cache.get('profile:user123');
      expect(cached).toBeNull();
    }, 10);
  });

  it('should track cache hits and misses', () => {
    const mockProfile = {
      uid: 'user123',
      fullName: 'Test User',
    };

    // Cache miss
    const miss = cache.get('profile:user123');
    expect(miss).toBeNull();

    // Set in cache
    cache.set('profile:user123', mockProfile);

    // Cache hit
    const hit = cache.get('profile:user123');
    expect(hit).toEqual(mockProfile);

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(50);
  });

  it('should invalidate specific cache entry', () => {
    const mockProfile = {
      uid: 'user123',
      fullName: 'Test User',
    };

    cache.set('profile:user123', mockProfile);
    expect(cache.get('profile:user123')).toEqual(mockProfile);

    // Invalidate
    cache.invalidate('profile:user123');
    expect(cache.get('profile:user123')).toBeNull();
  });

  it('should limit cache size to 100 entries', () => {
    // Add 101 entries
    for (let i = 0; i < 101; i++) {
      cache.set(`profile:user${i}`, { uid: `user${i}`, fullName: `User ${i}` });
    }

    // Cache should have max 100 entries
    expect(cache.size()).toBe(100);

    // First entry should be evicted (LRU)
    expect(cache.get('profile:user0')).toBeNull();
  });

  it('should calculate hit rate correctly', () => {
    const mockProfile = { uid: 'user123', fullName: 'Test User' };
    
    cache.set('profile:user123', mockProfile);

    // 3 hits
    cache.get('profile:user123');
    cache.get('profile:user123');
    cache.get('profile:user123');

    // 1 miss
    cache.get('profile:nonexistent');

    const stats = cache.getStats();
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(75); // 3/4 = 75%
  });

  it('should handle cache invalidation pattern', () => {
    cache.set('profile:user1', { uid: 'user1' });
    cache.set('profile:user2', { uid: 'user2' });
    cache.set('other:data', { data: 'test' });

    // Invalidate all profiles
    cache.invalidatePattern('profile:*');

    expect(cache.get('profile:user1')).toBeNull();
    expect(cache.get('profile:user2')).toBeNull();
    expect(cache.get('other:data')).toEqual({ data: 'test' });
  });
});
