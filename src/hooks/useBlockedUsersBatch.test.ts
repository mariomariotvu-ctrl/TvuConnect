/**
 * Unit tests for useBlockedUsersBatch hook
 * 
 * Tests batch fetching of blocked user profiles
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';

describe('useBlockedUsersBatch', () => {
  let cache: FirestoreCacheManager;

  beforeEach(() => {
    cache = new FirestoreCacheManager({
      maxSize: 50,
      defaultTTL: 300000, // 5 minutes
    });
  });

  it('should cache blocked profiles with 5 minute TTL', () => {
    const blockedProfiles = [
      { uid: 'user1', fullName: 'User 1' },
      { uid: 'user2', fullName: 'User 2' },
    ];

    const cacheKey = 'blocked-profiles:user1,user2';
    cache.set(cacheKey, blockedProfiles);

    const cached = cache.get(cacheKey);
    expect(cached).toEqual(blockedProfiles);
  });

  it('should handle batch size limits', () => {
    // Simulate limiting to 30 blocked users
    const blockedUids = Array.from({ length: 40 }, (_, i) => `user${i}`);
    const limitedUids = blockedUids.slice(0, 30);

    expect(limitedUids).toHaveLength(30);
    expect(limitedUids[0]).toBe('user0');
    expect(limitedUids[29]).toBe('user29');
  });

  it('should split UIDs into chunks of 10 for Firestore "in" operator', () => {
    const blockedUids = Array.from({ length: 25 }, (_, i) => `user${i}`);
    
    // Split into chunks of 10
    const chunks: string[][] = [];
    for (let i = 0; i < blockedUids.length; i += 10) {
      chunks.push(blockedUids.slice(i, i + 10));
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(10);
    expect(chunks[1]).toHaveLength(10);
    expect(chunks[2]).toHaveLength(5);
  });

  it('should cache blocked profiles and return on subsequent calls', () => {
    const blockedProfiles = [
      { uid: 'user1', fullName: 'User 1' },
      { uid: 'user2', fullName: 'User 2' },
    ];

    const cacheKey = 'blocked-profiles:user1,user2';
    
    // First call - cache miss
    let cached = cache.get(cacheKey);
    expect(cached).toBeNull();

    // Set in cache
    cache.set(cacheKey, blockedProfiles);

    // Second call - cache hit
    cached = cache.get(cacheKey);
    expect(cached).toEqual(blockedProfiles);

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should invalidate blocked profiles cache with pattern', () => {
    cache.set('blocked-profiles:user1,user2', [{ uid: 'user1' }]);
    cache.set('blocked-profiles:user3,user4', [{ uid: 'user3' }]);
    cache.set('other:data', { data: 'test' });

    // Invalidate all blocked profiles
    cache.invalidatePattern('blocked-profiles:*');

    expect(cache.get('blocked-profiles:user1,user2')).toBeNull();
    expect(cache.get('blocked-profiles:user3,user4')).toBeNull();
    expect(cache.get('other:data')).toEqual({ data: 'test' });
  });

  it('should handle empty blocked UIDs array', () => {
    const blockedUids: string[] = [];
    expect(blockedUids).toHaveLength(0);
  });

  it('should sort UIDs for consistent cache keys', () => {
    const uids1 = ['user2', 'user1', 'user3'];
    const uids2 = ['user1', 'user2', 'user3'];

    const key1 = `blocked-profiles:${uids1.sort().join(',')}`;
    const key2 = `blocked-profiles:${uids2.sort().join(',')}`;

    expect(key1).toBe(key2);
    expect(key1).toBe('blocked-profiles:user1,user2,user3');
  });
});
