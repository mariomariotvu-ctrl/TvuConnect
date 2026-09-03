/**
 * Unit tests for FirestoreCacheManager
 * 
 * Tests cover:
 * - Basic get/set operations
 * - TTL expiration
 * - LRU eviction
 * - Cache statistics
 * - Pattern-based invalidation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FirestoreCacheManager } from './firestoreCacheManager';

describe('FirestoreCacheManager', () => {
  let cache: FirestoreCacheManager;

  beforeEach(() => {
    cache = new FirestoreCacheManager({
      maxSize: 3,
      defaultTTL: 1000, // 1 second for testing
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Operations (Sub-task 1.1)', () => {
    it('should store and retrieve data', () => {
      cache.set('key1', { value: 'test' });
      const result = cache.get('key1');
      
      expect(result).toEqual({ value: 'test' });
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should update existing key', () => {
      cache.set('key1', { value: 'old' });
      cache.set('key1', { value: 'new' });
      
      const result = cache.get('key1');
      expect(result).toEqual({ value: 'new' });
    });

    it('should invalidate specific key', () => {
      cache.set('key1', { value: 'test' });
      cache.invalidate('key1');
      
      const result = cache.get('key1');
      expect(result).toBeNull();
    });

    it('should clear all entries', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', { value: 'test' });
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('TTL Expiration (Sub-task 1.1)', () => {
    it('should expire entry after TTL', () => {
      cache.set('key1', { value: 'test' }, 1000);
      
      // Before expiration
      expect(cache.get('key1')).toEqual({ value: 'test' });
      
      // After expiration
      vi.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();
    });

    it('should use default TTL when not specified', () => {
      cache.set('key1', { value: 'test' });
      
      // Before default TTL (1000ms)
      vi.advanceTimersByTime(999);
      expect(cache.get('key1')).toEqual({ value: 'test' });
      
      // After default TTL
      vi.advanceTimersByTime(2);
      expect(cache.get('key1')).toBeNull();
    });

    it('should use custom TTL when specified', () => {
      cache.set('key1', { value: 'test' }, 500);
      
      // Before custom TTL
      vi.advanceTimersByTime(499);
      expect(cache.get('key1')).toEqual({ value: 'test' });
      
      // After custom TTL
      vi.advanceTimersByTime(2);
      expect(cache.get('key1')).toBeNull();
    });

    it('should remove expired entry from cache', () => {
      cache.set('key1', { value: 'test' }, 1000);
      
      vi.advanceTimersByTime(1001);
      cache.get('key1'); // Triggers expiration check
      
      expect(cache.size()).toBe(0);
    });

    it('should handle has() with expired entries', () => {
      cache.set('key1', { value: 'test' }, 1000);
      
      expect(cache.has('key1')).toBe(true);
      
      vi.advanceTimersByTime(1001);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('LRU Eviction (Sub-task 1.2)', () => {
    it('should evict oldest entry when cache is full', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.set('key3', { value: 'test3' });
      
      // Cache is full (maxSize: 3), adding 4th entry should evict key1
      cache.set('key4', { value: 'test4' });
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toEqual({ value: 'test2' });
      expect(cache.get('key3')).toEqual({ value: 'test3' });
      expect(cache.get('key4')).toEqual({ value: 'test4' });
    });

    it('should update LRU order on access', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.set('key3', { value: 'test3' });
      
      // Access key1, making it most recently used
      cache.get('key1');
      
      // Add key4, should evict key2 (now oldest)
      cache.set('key4', { value: 'test4' });
      
      expect(cache.get('key1')).toEqual({ value: 'test1' });
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toEqual({ value: 'test3' });
      expect(cache.get('key4')).toEqual({ value: 'test4' });
    });

    it('should respect maxSize limit', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.set('key3', { value: 'test3' });
      cache.set('key4', { value: 'test4' });
      cache.set('key5', { value: 'test5' });
      
      expect(cache.size()).toBe(3);
    });

    it('should track evictions in stats', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.set('key3', { value: 'test3' });
      cache.set('key4', { value: 'test4' }); // Evicts key1
      cache.set('key5', { value: 'test5' }); // Evicts key2
      
      const stats = cache.getStats();
      expect(stats.evictions).toBe(2);
    });

    it('should not evict when updating existing key', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.set('key3', { value: 'test3' });
      
      // Update key1 (should not trigger eviction)
      cache.set('key1', { value: 'updated' });
      
      expect(cache.size()).toBe(3);
      expect(cache.getStats().evictions).toBe(0);
    });
  });

  describe('Cache Statistics (Sub-task 1.3)', () => {
    it('should track cache hits', () => {
      cache.set('key1', { value: 'test' });
      cache.get('key1');
      cache.get('key1');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.get('nonexistent1');
      cache.get('nonexistent2');
      
      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key1', { value: 'test' });
      
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key3'); // miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(50); // 2/4 = 50%
    });

    it('should handle zero requests for hit rate', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should track cache size', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });

    it('should count expired entries as misses', () => {
      cache.set('key1', { value: 'test' }, 1000);
      
      vi.advanceTimersByTime(1001);
      cache.get('key1'); // Should be a miss
      
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it('should round hit rate to 2 decimal places', () => {
      cache.set('key1', { value: 'test' });
      
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key3'); // miss
      
      const stats = cache.getStats();
      // 1/3 = 33.333...%
      expect(stats.hitRate).toBe(33.33);
    });
  });

  describe('Pattern-based Invalidation (Sub-task 1.4)', () => {
    it('should invalidate entries matching wildcard pattern', () => {
      cache.set('posts:1', { value: 'post1' });
      cache.set('posts:2', { value: 'post2' });
      cache.set('users:1', { value: 'user1' });
      
      cache.invalidatePattern('posts:*');
      
      expect(cache.get('posts:1')).toBeNull();
      expect(cache.get('posts:2')).toBeNull();
      expect(cache.get('users:1')).toEqual({ value: 'user1' });
    });

    it('should invalidate entries with nested patterns', () => {
      cache.set('profile:user123:basic', { value: 'basic' });
      cache.set('profile:user123:extended', { value: 'extended' });
      cache.set('profile:user456:basic', { value: 'other' });
      
      cache.invalidatePattern('profile:user123:*');
      
      expect(cache.get('profile:user123:basic')).toBeNull();
      expect(cache.get('profile:user123:extended')).toBeNull();
      expect(cache.get('profile:user456:basic')).toEqual({ value: 'other' });
    });

    it('should handle exact match without wildcard', () => {
      cache.set('exact:key', { value: 'test' });
      cache.set('exact:key2', { value: 'test2' });
      
      cache.invalidatePattern('exact:key');
      
      expect(cache.get('exact:key')).toBeNull();
      expect(cache.get('exact:key2')).toEqual({ value: 'test2' });
    });

    it('should handle multiple wildcards', () => {
      cache.set('a:b:c', { value: '1' });
      cache.set('a:x:c', { value: '2' });
      cache.set('a:b:d', { value: '3' });
      
      cache.invalidatePattern('a:*:c');
      
      expect(cache.get('a:b:c')).toBeNull();
      expect(cache.get('a:x:c')).toBeNull();
      expect(cache.get('a:b:d')).toEqual({ value: '3' });
    });

    it('should handle pattern with no matches', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      
      cache.invalidatePattern('nomatch:*');
      
      expect(cache.size()).toBe(2);
      expect(cache.get('key1')).toEqual({ value: 'test1' });
      expect(cache.get('key2')).toEqual({ value: 'test2' });
    });

    it('should escape special regex characters in pattern', () => {
      cache.set('key.with.dots', { value: 'test1' });
      cache.set('key+with+plus', { value: 'test2' });
      cache.set('other', { value: 'test3' });
      
      cache.invalidatePattern('key.with.dots');
      
      expect(cache.get('key.with.dots')).toBeNull();
      expect(cache.get('key+with+plus')).toEqual({ value: 'test2' });
    });

    it('should invalidate all entries with * pattern', () => {
      cache.set('key1', { value: 'test1' });
      cache.set('key2', { value: 'test2' });
      cache.set('key3', { value: 'test3' });
      
      cache.invalidatePattern('*');
      
      expect(cache.size()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty cache operations', () => {
      expect(cache.get('key')).toBeNull();
      expect(cache.size()).toBe(0);
      cache.invalidate('key');
      cache.invalidatePattern('*');
      expect(cache.size()).toBe(0);
    });

    it('should handle different data types', () => {
      // Create a larger cache for this test
      const largeCache = new FirestoreCacheManager({
        maxSize: 10,
        defaultTTL: 1000,
      });
      
      largeCache.set('string', 'test');
      largeCache.set('number', 123);
      largeCache.set('boolean', true);
      largeCache.set('object', { a: 1, b: 2 });
      largeCache.set('array', [1, 2, 3]);
      largeCache.set('undefined', undefined);
      
      expect(largeCache.get('string')).toBe('test');
      expect(largeCache.get('number')).toBe(123);
      expect(largeCache.get('boolean')).toBe(true);
      expect(largeCache.get('object')).toEqual({ a: 1, b: 2 });
      expect(largeCache.get('array')).toEqual([1, 2, 3]);
      expect(largeCache.get('undefined')).toBeUndefined();
    });

    it('should handle rapid successive operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, { value: i });
      }
      
      expect(cache.size()).toBe(3); // maxSize is 3
    });

    it('should maintain stats across clear operations', () => {
      cache.set('key1', { value: 'test' });
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      
      cache.clear();
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle posts feed caching scenario', () => {
      const postsCache = new FirestoreCacheManager({
        maxSize: 50,
        defaultTTL: 60000, // 60 seconds
      });

      // Cache posts feed
      postsCache.set('posts:feed:page1', [
        { id: '1', content: 'Post 1' },
        { id: '2', content: 'Post 2' },
      ]);

      // Retrieve from cache
      const posts = postsCache.get('posts:feed:page1');
      expect(posts).toHaveLength(2);

      // Invalidate when new post is created
      postsCache.invalidatePattern('posts:feed:*');
      expect(postsCache.get('posts:feed:page1')).toBeNull();
    });

    it('should handle user profile caching scenario', () => {
      const profileCache = new FirestoreCacheManager({
        maxSize: 100,
        defaultTTL: 180000, // 3 minutes
      });

      // Cache multiple user profiles
      profileCache.set('profile:user123', { name: 'John', age: 20 });
      profileCache.set('profile:user456', { name: 'Jane', age: 21 });

      // Update user123's profile
      profileCache.invalidate('profile:user123');
      
      expect(profileCache.get('profile:user123')).toBeNull();
      expect(profileCache.get('profile:user456')).toEqual({ name: 'Jane', age: 21 });
    });

    it('should handle online status caching scenario', () => {
      const statusCache = new FirestoreCacheManager({
        maxSize: 50,
        defaultTTL: 30000, // 30 seconds
      });

      // Cache online status
      statusCache.set('status:user123', { online: true, lastSeen: Date.now() });

      // Check cache hit rate
      statusCache.get('status:user123'); // hit
      statusCache.get('status:user456'); // miss
      
      const stats = statusCache.getStats();
      expect(stats.hitRate).toBe(50);
    });
  });
});
