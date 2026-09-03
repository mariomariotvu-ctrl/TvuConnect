/**
 * Property-Based Tests for Cache Manager
 * 
 * Uses fast-check to test cache properties with randomly generated inputs
 * 
 * Properties tested:
 * - Cache consistency: Data stored equals data retrieved (within TTL)
 * - TTL expiration: Data returns null after TTL expires
 * - Pattern matching: Pattern invalidation works correctly
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  getCachedData,
  setCachedData,
  invalidateCachePattern,
  clearAllCache,
  type CacheConfig,
} from './cacheManager';

describe('Cache Manager - Property-Based Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAllCache('localStorage');
    clearAllCache('sessionStorage');
  });

  describe('Property: Cache Consistency', () => {
    it('should return the same data that was stored (within TTL)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // key
          fc.jsonValue(), // data
          fc.integer({ min: 1000, max: 60000 }), // ttl
          fc.constantFrom('localStorage', 'sessionStorage'), // storage
          (key, data, ttl, storage) => {
            const config: CacheConfig = {
              key: `test:${key}`,
              ttl,
              storage: storage as 'localStorage' | 'sessionStorage',
            };

            // Store data
            setCachedData(config, data);

            // Retrieve immediately (within TTL)
            const retrieved = getCachedData(config);

            // Should return the same data
            expect(retrieved).toEqual(JSON.parse(JSON.stringify(data)));

            // Cleanup
            clearAllCache(storage as 'localStorage' | 'sessionStorage');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: TTL Expiration', () => {
    it('should return null after TTL expires', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // key
          fc.jsonValue(), // data
          fc.integer({ min: 100, max: 5000 }), // ttl
          fc.constantFrom('localStorage', 'sessionStorage'), // storage
          (key, data, ttl, storage) => {
            const config: CacheConfig = {
              key: `test:${key}`,
              ttl,
              storage: storage as 'localStorage' | 'sessionStorage',
            };

            // Store data
            setCachedData(config, data);

            // Immediately should return data
            expect(getCachedData(config)).toEqual(JSON.parse(JSON.stringify(data)));

            // Advance time past TTL
            vi.advanceTimersByTime(ttl + 1);

            // Should return null
            expect(getCachedData(config)).toBeNull();

            // Cleanup
            clearAllCache(storage as 'localStorage' | 'sessionStorage');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return data at any time before TTL expires', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }), // key
          fc.jsonValue(), // data
          fc.integer({ min: 1000, max: 10000 }), // ttl
          fc.integer({ min: 0, max: 999 }), // time to advance (less than TTL)
          fc.constantFrom('localStorage', 'sessionStorage'), // storage
          (key, data, ttl, timeAdvance, storage) => {
            const config: CacheConfig = {
              key: `test:${key}`,
              ttl,
              storage: storage as 'localStorage' | 'sessionStorage',
            };

            // Store data
            setCachedData(config, data);

            // Advance time (but stay within TTL)
            vi.advanceTimersByTime(timeAdvance);

            // Should still return data
            expect(getCachedData(config)).toEqual(JSON.parse(JSON.stringify(data)));

            // Cleanup
            clearAllCache(storage as 'localStorage' | 'sessionStorage');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Pattern Matching', () => {
    it('should invalidate all entries matching pattern', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }), // prefix
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }), // suffixes
          fc.jsonValue(), // data
          fc.constantFrom('localStorage', 'sessionStorage'), // storage
          (prefix, suffixes, data, storage) => {
            const storageType = storage as 'localStorage' | 'sessionStorage';

            // Create multiple entries with same prefix
            suffixes.forEach(suffix => {
              const config: CacheConfig = {
                key: `${prefix}:${suffix}`,
                ttl: 60000,
                storage: storageType,
              };
              setCachedData(config, data);
            });

            // Verify all entries exist
            suffixes.forEach(suffix => {
              const config: CacheConfig = {
                key: `${prefix}:${suffix}`,
                ttl: 60000,
                storage: storageType,
              };
              expect(getCachedData(config)).toEqual(JSON.parse(JSON.stringify(data)));
            });

            // Invalidate all entries with pattern
            invalidateCachePattern(`${prefix}:*`, storageType);

            // Verify all entries are invalidated
            suffixes.forEach(suffix => {
              const config: CacheConfig = {
                key: `${prefix}:${suffix}`,
                ttl: 60000,
                storage: storageType,
              };
              expect(getCachedData(config)).toBeNull();
            });

            // Cleanup
            clearAllCache(storageType);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not invalidate entries that do not match pattern', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }), // prefix
          fc.string({ minLength: 1, maxLength: 20 }), // prefix2
          fc.jsonValue(), // data
          fc.constantFrom('localStorage', 'sessionStorage'), // storage
          (prefix1, prefix2, data, storage) => {
            // Skip if prefixes are the same
            if (prefix1 === prefix2) return;

            // Skip if prefix1 contains wildcard characters - a '*' prefix would
            // create pattern "*:*" which is a global wildcard matching all keys
            if (prefix1.includes('*')) return;

            const storageType = storage as 'localStorage' | 'sessionStorage';

            // Create entries with different prefixes
            const config1: CacheConfig = {
              key: `${prefix1}:test`,
              ttl: 60000,
              storage: storageType,
            };
            const config2: CacheConfig = {
              key: `${prefix2}:test`,
              ttl: 60000,
              storage: storageType,
            };

            setCachedData(config1, data);
            setCachedData(config2, data);

            // Invalidate only prefix1
            invalidateCachePattern(`${prefix1}:*`, storageType);

            // prefix1 should be invalidated
            expect(getCachedData(config1)).toBeNull();

            // prefix2 should still exist
            expect(getCachedData(config2)).toEqual(JSON.parse(JSON.stringify(data)));

            // Cleanup
            clearAllCache(storageType);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Data Type Preservation', () => {
    it('should preserve data types for primitives', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.double(),
            fc.boolean(),
            fc.constant(null)
          ),
          fc.constantFrom('localStorage', 'sessionStorage'),
          (data, storage) => {
            const config: CacheConfig = {
              key: 'test:primitive',
              ttl: 60000,
              storage: storage as 'localStorage' | 'sessionStorage',
            };

            setCachedData(config, data);
            const retrieved = getCachedData(config);

            const expected = JSON.parse(JSON.stringify(data));
            expect(retrieved).toEqual(expected);
            expect(typeof retrieved).toBe(typeof expected);

            // Cleanup
            clearAllCache(storage as 'localStorage' | 'sessionStorage');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve data types for complex objects', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer(),
            name: fc.string(),
            active: fc.boolean(),
            tags: fc.array(fc.string()),
            metadata: fc.record({
              created: fc.integer(),
              updated: fc.integer(),
            }),
          }),
          fc.constantFrom('localStorage', 'sessionStorage'),
          (data, storage) => {
            const config: CacheConfig = {
              key: 'test:complex',
              ttl: 60000,
              storage: storage as 'localStorage' | 'sessionStorage',
            };

            setCachedData(config, data);
            const retrieved = getCachedData(config);

            expect(retrieved).toEqual(JSON.parse(JSON.stringify(data)));

            // Cleanup
            clearAllCache(storage as 'localStorage' | 'sessionStorage');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Multiple Concurrent Operations', () => {
    it('should handle multiple set/get operations correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 20 }),
              data: fc.jsonValue(),
              ttl: fc.integer({ min: 1000, max: 60000 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.constantFrom('localStorage', 'sessionStorage'),
          (operations, storage) => {
            const storageType = storage as 'localStorage' | 'sessionStorage';

            // Perform all set operations
            operations.forEach((op, i) => {
              const config: CacheConfig = {
                key: `test:${op.key}:${i}`,
                ttl: op.ttl,
                storage: storageType,
              };
              setCachedData(config, op.data);
            });

            // Verify all get operations
            operations.forEach((op, i) => {
              const config: CacheConfig = {
                key: `test:${op.key}:${i}`,
                ttl: op.ttl,
                storage: storageType,
              };
              const retrieved = getCachedData(config);
              expect(retrieved).toEqual(JSON.parse(JSON.stringify(op.data)));
            });

            // Cleanup
            clearAllCache(storageType);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: TTL Monotonicity', () => {
    it('should respect TTL ordering - shorter TTL expires first', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1000 }), // shortTTL
          fc.integer({ min: 1001, max: 5000 }), // longTTL
          fc.jsonValue(), // data
          fc.constantFrom('localStorage', 'sessionStorage'), // storage
          (shortTTL, longTTL, data, storage) => {
            const storageType = storage as 'localStorage' | 'sessionStorage';

            const shortConfig: CacheConfig = {
              key: 'test:short',
              ttl: shortTTL,
              storage: storageType,
            };

            const longConfig: CacheConfig = {
              key: 'test:long',
              ttl: longTTL,
              storage: storageType,
            };

            // Set both entries
            setCachedData(shortConfig, data);
            setCachedData(longConfig, data);

            // Advance time past short TTL but before long TTL
            vi.advanceTimersByTime(shortTTL + 1);

            // Short should be expired
            expect(getCachedData(shortConfig)).toBeNull();

            // Long should still exist
            expect(getCachedData(longConfig)).toEqual(JSON.parse(JSON.stringify(data)));

            // Cleanup
            clearAllCache(storageType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
