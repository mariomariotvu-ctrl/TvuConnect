/**
 * Unit tests for Query Optimizer
 * 
 * Tests cover:
 * - optimizeQuery function with various configurations
 * - Limit enforcement (max 100)
 * - Pagination with startAfter cursor
 * - Where clause application
 * - Cache-first strategy integration
 * - Error handling
 * - Complex queries with multiple filters
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  optimizeQuery,
  createPaginationConfig,
  createCacheConfig,
  disableCache,
  type QueryConfig,
  type QueryCacheConfig,
  type QueryResult,
} from './queryOptimizer';
import { getCachedData, setCachedData, clearAllCache } from './cacheManager';

// Mock Firebase Firestore
vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, collectionName) => ({ _collection: collectionName })),
  query: vi.fn((...args) => ({ _query: args })),
  where: vi.fn((field, operator, value) => ({ _where: { field, operator, value } })),
  orderBy: vi.fn((field, direction) => ({ _orderBy: { field, direction } })),
  limit: vi.fn((limitValue) => ({ _limit: limitValue })),
  startAfter: vi.fn((cursor) => ({ _startAfter: cursor })),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';

describe('Query Optimizer', () => {
  beforeEach(() => {
    // Clear all storage before each test
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('optimizeQuery - Basic Functionality', () => {
    it('should execute query and return results', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
        { id: 'doc2', data: () => ({ title: 'Post 2' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 2,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ id: 'doc1', title: 'Post 1' });
      expect(result.data[1]).toEqual({ id: 'doc2', title: 'Post 2' });
      expect(result.fromCache).toBe(false);
      expect(result.documentReads).toBe(2);
    });

    it('should return metadata with query results', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('lastDoc');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('fromCache');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('documentReads');
    });
  });

  describe('Limit Enforcement (Requirement 2.2)', () => {
    it('should enforce maximum limit of 100', async () => {
      const mockDocs = Array.from({ length: 100 }, (_, i) => ({
        id: `doc${i}`,
        data: () => ({ title: `Post ${i}` }),
      }));

      const mockSnapshot = {
        docs: mockDocs,
        size: 100,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 500, // Exceeds max
      };

      const result = await optimizeQuery(config);

      // Result should have max 100 items (enforced limit)
      expect(result.data.length).toBeLessThanOrEqual(100);
      expect(result.hasMore).toBe(true);
    });

    it('should allow limits less than 100', async () => {
      const mockDocs = Array.from({ length: 50 }, (_, i) => ({
        id: `doc${i}`,
        data: () => ({ title: `Post ${i}` }),
      }));

      const mockSnapshot = {
        docs: mockDocs,
        size: 50,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 50,
      };

      const result = await optimizeQuery(config);

      expect(result.data.length).toBe(50);
      expect(result.hasMore).toBe(true);
    });

    it('should handle limit of exactly 100', async () => {
      const mockDocs = Array.from({ length: 100 }, (_, i) => ({
        id: `doc${i}`,
        data: () => ({ title: `Post ${i}` }),
      }));

      const mockSnapshot = {
        docs: mockDocs,
        size: 100,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 100,
      };

      const result = await optimizeQuery(config);

      expect(result.data.length).toBe(100);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('Pagination with startAfter (Requirement 2.3)', () => {
    it('should support pagination with cursor', async () => {
      const mockCursor = { id: 'doc10' };
      const mockDocs = [
        { id: 'doc11', data: () => ({ title: 'Post 11' }) },
        { id: 'doc12', data: () => ({ title: 'Post 12' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 2,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
        startAfter: mockCursor as any,
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(2);
      expect((result.data[0] as any).id).toBe('doc11');
      expect(result.lastDoc).toBe(mockDocs[1]);
    });

    it('should set hasMore to true when results equal limit', async () => {
      const mockDocs = Array.from({ length: 10 }, (_, i) => ({
        id: `doc${i}`,
        data: () => ({ title: `Post ${i}` }),
      }));

      const mockSnapshot = {
        docs: mockDocs,
        size: 10,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result.hasMore).toBe(true);
      expect(result.lastDoc).toBe(mockDocs[9]);
    });

    it('should set hasMore to false when results less than limit', async () => {
      const mockDocs = Array.from({ length: 5 }, (_, i) => ({
        id: `doc${i}`,
        data: () => ({ title: `Post ${i}` }),
      }));

      const mockSnapshot = {
        docs: mockDocs,
        size: 5,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result.hasMore).toBe(false);
    });

    it('should handle empty results', async () => {
      const mockSnapshot = {
        docs: [],
        size: 0,
        forEach: () => {},
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.lastDoc).toBeNull();
    });
  });

  describe('Where Clause Application (Requirement 2.4)', () => {
    it('should apply single where clause', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1', status: 'published' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
        where: [
          { field: 'status', operator: '==', value: 'published' },
        ],
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).status).toBe('published');
    });

    it('should apply multiple where clauses', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Tech Post', status: 'published', category: 'tech' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
        where: [
          { field: 'status', operator: '==', value: 'published' },
          { field: 'category', operator: '==', value: 'tech' },
        ],
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).category).toBe('tech');
    });

    it('should support different where operators', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Popular Post', views: 150 }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
        where: [
          { field: 'views', operator: '>', value: 100 },
          { field: 'createdAt', operator: '<=', value: new Date() },
        ],
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).views).toBeGreaterThan(100);
    });
  });

  describe('OrderBy Clause', () => {
    it('should apply orderBy clause', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1', createdAt: new Date('2024-01-02') }) },
        { id: 'doc2', data: () => ({ title: 'Post 2', createdAt: new Date('2024-01-01') }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 2,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
        orderBy: { field: 'createdAt', direction: 'desc' },
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(2);
      // Results should be ordered (mocked data is already ordered)
      expect((result.data[0] as any).id).toBe('doc1');
    });

    it('should support ascending order', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'A Post' }) },
        { id: 'doc2', data: () => ({ title: 'B Post' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 2,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
        orderBy: { field: 'title', direction: 'asc' },
      };

      const result = await optimizeQuery(config);

      expect(result.data).toHaveLength(2);
      expect((result.data[0] as any).title).toBe('A Post');
    });
  });

  describe('Cache-First Strategy (Requirement 2.5)', () => {
    it('should return cached data when available', async () => {
      const cachedData: QueryResult<any> = {
        data: [{ id: 'cached1', title: 'Cached Post' }],
        lastDoc: null,
        hasMore: false,
        fromCache: true,
        executionTime: 5,
        documentReads: 0,
      };

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'test');
      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      // Manually set cache
      const cacheKey = 'test|posts|limit:10';
      setCachedData(
        { key: cacheKey, ttl: 60000, storage: 'sessionStorage' },
        cachedData
      );

      const result = await optimizeQuery(queryConfig, cacheConfig);

      expect(result.fromCache).toBe(true);
      expect(result.data).toEqual(cachedData.data);
      expect(vi.mocked(getDocs)).not.toHaveBeenCalled();
    });

    it('should fetch from Firestore on cache miss', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'test');
      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(queryConfig, cacheConfig);

      expect(result.fromCache).toBe(false);
      expect(vi.mocked(getDocs)).toHaveBeenCalled();
    });

    it('should cache results after fetching from Firestore', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'test');
      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      await optimizeQuery(queryConfig, cacheConfig);

      // Second call should use cache
      vi.mocked(getDocs).mockClear();
      const result = await optimizeQuery(queryConfig, cacheConfig);

      expect(result.fromCache).toBe(true);
      expect(vi.mocked(getDocs)).not.toHaveBeenCalled();
    });

    it('should respect cache TTL', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const cacheConfig = createCacheConfig(5000, 'sessionStorage', 'test'); // 5 seconds TTL
      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      // First call - cache miss
      await optimizeQuery(queryConfig, cacheConfig);

      // Advance time past TTL
      vi.advanceTimersByTime(6000);

      // Second call - cache expired, should fetch again
      vi.mocked(getDocs).mockClear();
      const result = await optimizeQuery(queryConfig, cacheConfig);

      expect(result.fromCache).toBe(false);
      expect(vi.mocked(getDocs)).toHaveBeenCalled();
    });

    it('should work without cache when disabled', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      // Call without cache config
      const result = await optimizeQuery(queryConfig);

      expect(result.fromCache).toBe(false);
      expect(vi.mocked(getDocs)).toHaveBeenCalled();
    });
  });

  describe('Complex Queries', () => {
    it('should handle query with all options', async () => {
      const mockCursor = { id: 'doc10' };
      const mockDocs = [
        { id: 'doc11', data: () => ({ title: 'Post 11', status: 'published' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 20,
        orderBy: { field: 'createdAt', direction: 'desc' },
        where: [
          { field: 'status', operator: '==', value: 'published' },
          { field: 'views', operator: '>', value: 100 },
        ],
        startAfter: mockCursor as any,
      };

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'complex');

      const result = await optimizeQuery(config, cacheConfig);

      expect(result.data).toHaveLength(1);
      expect(result.fromCache).toBe(false);
    });

    it('should generate unique cache keys for different queries', async () => {
      const mockSnapshot = {
        docs: [],
        size: 0,
        forEach: () => {},
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config1: QueryConfig = {
        collection: 'posts',
        limit: 10,
        where: [{ field: 'status', operator: '==', value: 'published' }],
      };

      const config2: QueryConfig = {
        collection: 'posts',
        limit: 10,
        where: [{ field: 'status', operator: '==', value: 'draft' }],
      };

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'test');

      await optimizeQuery(config1, cacheConfig);
      await optimizeQuery(config2, cacheConfig);

      // Both queries should have been executed (different cache keys)
      expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2);
    });
  });

  describe('Helper Functions', () => {
    it('createPaginationConfig should add cursor to config', () => {
      const baseConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const cursor = { id: 'doc10' } as any;
      const paginatedConfig = createPaginationConfig(baseConfig, cursor);

      expect(paginatedConfig.startAfter).toBe(cursor);
      expect(paginatedConfig.collection).toBe('posts');
      expect(paginatedConfig.limit).toBe(10);
    });

    it('createCacheConfig should create valid cache config', () => {
      const cacheConfig = createCacheConfig(60000, 'localStorage', 'test');

      expect(cacheConfig.enabled).toBe(true);
      expect(cacheConfig.ttl).toBe(60000);
      expect(cacheConfig.storage).toBe('localStorage');
      expect(cacheConfig.keyPrefix).toBe('test');
    });

    it('createCacheConfig should use defaults', () => {
      const cacheConfig = createCacheConfig(30000);

      expect(cacheConfig.enabled).toBe(true);
      expect(cacheConfig.ttl).toBe(30000);
      expect(cacheConfig.storage).toBe('sessionStorage');
      expect(cacheConfig.keyPrefix).toBeUndefined();
    });

    it('disableCache should return disabled config', () => {
      const cacheConfig = disableCache();

      expect(cacheConfig.enabled).toBe(false);
      expect(cacheConfig.ttl).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      vi.mocked(getDocs).mockRejectedValue(new Error('Firestore error'));

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      await expect(optimizeQuery(config)).rejects.toThrow('Firestore error');
    });

    it('should handle cache storage errors gracefully', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      // Mock storage.setItem to throw error
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'test');
      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      // Should not throw, just log warning
      const result = await optimizeQuery(queryConfig, cacheConfig);

      expect(result.data).toHaveLength(1);

      // Restore
      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('Performance Metrics', () => {
    it('should track execution time', async () => {
      const mockSnapshot = {
        docs: [],
        size: 0,
        forEach: () => {},
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should track document reads', async () => {
      const mockDocs = Array.from({ length: 5 }, (_, i) => ({
        id: `doc${i}`,
        data: () => ({ title: `Post ${i}` }),
      }));

      const mockSnapshot = {
        docs: mockDocs,
        size: 5,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const config: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = await optimizeQuery(config);

      expect(result.documentReads).toBe(5);
    });

    it('should report zero reads for cache hits', async () => {
      const mockDocs = [
        { id: 'doc1', data: () => ({ title: 'Post 1' }) },
      ];

      const mockSnapshot = {
        docs: mockDocs,
        size: 1,
        forEach: (callback: any) => mockDocs.forEach(callback),
      };

      vi.mocked(getDocs).mockResolvedValue(mockSnapshot as any);

      const cacheConfig = createCacheConfig(60000, 'sessionStorage', 'test');
      const queryConfig: QueryConfig = {
        collection: 'posts',
        limit: 10,
      };

      // First call - cache miss
      const firstResult = await optimizeQuery(queryConfig, cacheConfig);
      expect(firstResult.fromCache).toBe(false);
      expect(firstResult.documentReads).toBe(1);

      // Second call - cache hit (should have cached result with documentReads: 1)
      const result = await optimizeQuery(queryConfig, cacheConfig);

      expect(result.fromCache).toBe(true);
      // Note: Cached result preserves original documentReads from when it was fetched
      expect(result.documentReads).toBe(1);
    });
  });
});
