/**
 * Unit tests for Firestore Query Optimizer
 * 
 * Tests core functionality:
 * - Query building with limits, orderBy, where clauses
 * - Filter application for different collections
 * - Pagination with startAfter cursors
 * - Cache integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirestoreQueryOptimizer, QueryOptimizerConfig, FilterConfig } from './firestoreQueryOptimizer';
import { FirestoreCacheManager } from './firestoreCacheManager';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ _type: 'collection', name })),
  query: vi.fn((col, ...constraints) => ({ _type: 'query', collection: col, constraints })),
  where: vi.fn((field, op, value) => ({ _type: 'where', field, op, value })),
  orderBy: vi.fn((field, direction) => ({ _type: 'orderBy', field, direction })),
  limit: vi.fn((count) => ({ _type: 'limit', count })),
  startAfter: vi.fn((doc) => ({ _type: 'startAfter', doc })),
  getDocs: vi.fn(),
}));

// Mock firebase
vi.mock('../firebase', () => ({
  db: { _type: 'firestore' },
}));

describe('FirestoreQueryOptimizer', () => {
  let optimizer: FirestoreQueryOptimizer;
  let cacheManager: FirestoreCacheManager;

  beforeEach(() => {
    cacheManager = new FirestoreCacheManager({ maxSize: 50, defaultTTL: 60000 });
    optimizer = new FirestoreQueryOptimizer(cacheManager);
  });

  describe('buildQuery', () => {
    it('should build query with limit only', () => {
      const config: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result).toBeDefined();
      expect(result._type).toBe('query');
      expect(result.constraints).toHaveLength(1);
      expect(result.constraints[0]._type).toBe('limit');
      expect(result.constraints[0].count).toBe(10);
    });

    it('should build query with orderBy and limit', () => {
      const config: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 10,
        orderBy: { field: 'createdAt', direction: 'desc' },
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result.constraints).toHaveLength(2);
      expect(result.constraints[0]._type).toBe('orderBy');
      expect(result.constraints[0].field).toBe('createdAt');
      expect(result.constraints[0].direction).toBe('desc');
      expect(result.constraints[1]._type).toBe('limit');
    });

    it('should build query with where clauses', () => {
      const config: QueryOptimizerConfig = {
        collection: 'profiles',
        limit: 50,
        where: [
          { field: 'gender', operator: '==', value: 'male' },
          { field: 'academicYear', operator: '==', value: 2024 },
        ],
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result.constraints).toHaveLength(3); // 2 where + 1 limit
      expect(result.constraints[0]._type).toBe('where');
      expect(result.constraints[0].field).toBe('gender');
      expect(result.constraints[1]._type).toBe('where');
      expect(result.constraints[1].field).toBe('academicYear');
    });

    it('should build query with pagination cursor', () => {
      const mockDoc = { id: 'doc123' } as any;
      const config: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 10,
        startAfter: mockDoc,
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result.constraints).toHaveLength(2); // startAfter + limit
      expect(result.constraints[0]._type).toBe('startAfter');
      expect(result.constraints[0].doc).toBe(mockDoc);
    });
  });

  describe('applyFilters', () => {
    it('should apply posts age filter', () => {
      const filters: FilterConfig = {
        maxPostAge: 18, // 18 hours
      };

      const whereClauses = optimizer.applyFilters('posts', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('createdAt');
      expect(whereClauses[0].operator).toBe('>');
      expect(typeof whereClauses[0].value).toBe('number');
    });

    it('should apply matching filters for gender', () => {
      const filters: FilterConfig = {
        gender: 'female',
      };

      const whereClauses = optimizer.applyFilters('profiles', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('gender');
      expect(whereClauses[0].operator).toBe('==');
      expect(whereClauses[0].value).toBe('female');
    });

    it('should apply matching filters for major', () => {
      const filters: FilterConfig = {
        major: 'computer-science',
      };

      const whereClauses = optimizer.applyFilters('profiles', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('majorNormalized');
      expect(whereClauses[0].operator).toBe('==');
      expect(whereClauses[0].value).toBe('computer-science');
    });

    it('should apply matching filters for academic year', () => {
      const filters: FilterConfig = {
        academicYear: 2024,
      };

      const whereClauses = optimizer.applyFilters('profiles', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('academicYear');
      expect(whereClauses[0].operator).toBe('==');
      expect(whereClauses[0].value).toBe(2024);
    });

    it('should apply multiple matching filters', () => {
      const filters: FilterConfig = {
        gender: 'male',
        major: 'engineering',
        academicYear: 2023,
      };

      const whereClauses = optimizer.applyFilters('profiles', filters);

      expect(whereClauses).toHaveLength(3);
      expect(whereClauses[0].field).toBe('gender');
      expect(whereClauses[1].field).toBe('majorNormalized');
      expect(whereClauses[2].field).toBe('academicYear');
    });

    it('should apply places category filter', () => {
      const filters: FilterConfig = {
        category: 'cafe',
      };

      const whereClauses = optimizer.applyFilters('places', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('category');
      expect(whereClauses[0].operator).toBe('==');
      expect(whereClauses[0].value).toBe('cafe');
    });

    it('should filter expired check-ins', () => {
      const filters: FilterConfig = {
        includeExpired: false,
      };

      const whereClauses = optimizer.applyFilters('checkIns', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('expiresAt');
      expect(whereClauses[0].operator).toBe('>');
      expect(typeof whereClauses[0].value).toBe('number');
    });

    it('should filter past events', () => {
      const filters: FilterConfig = {
        includePast: false,
      };

      const whereClauses = optimizer.applyFilters('events', filters);

      expect(whereClauses).toHaveLength(1);
      expect(whereClauses[0].field).toBe('startTime');
      expect(whereClauses[0].operator).toBe('>');
      expect(typeof whereClauses[0].value).toBe('number');
    });

    it('should return empty array when no filters apply', () => {
      const filters: FilterConfig = {};

      const whereClauses = optimizer.applyFilters('posts', filters);

      expect(whereClauses).toHaveLength(0);
    });
  });

  describe('applyPagination', () => {
    it('should add cursor to config', () => {
      const mockDoc = { id: 'doc456' } as any;
      const baseConfig: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 10,
      };

      const result = optimizer.applyPagination(baseConfig, mockDoc);

      expect(result.startAfter).toBe(mockDoc);
      expect(result.collection).toBe('posts');
      expect(result.limit).toBe(10);
    });

    it('should preserve existing config properties', () => {
      const mockDoc = { id: 'doc789' } as any;
      const baseConfig: QueryOptimizerConfig = {
        collection: 'profiles',
        limit: 50,
        orderBy: { field: 'createdAt', direction: 'desc' },
        where: [{ field: 'gender', operator: '==', value: 'male' }],
      };

      const result = optimizer.applyPagination(baseConfig, mockDoc);

      expect(result.startAfter).toBe(mockDoc);
      expect(result.orderBy).toEqual(baseConfig.orderBy);
      expect(result.where).toEqual(baseConfig.where);
    });
  });

  describe('cache integration', () => {
    it('should invalidate cache for collection', () => {
      const spy = vi.spyOn(cacheManager, 'invalidatePattern');

      optimizer.invalidateCache('posts');

      expect(spy).toHaveBeenCalledWith('posts|*');
    });

    it('should get cache stats', () => {
      const stats = optimizer.getCacheStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('edge cases', () => {
    it('should handle empty where clauses array', () => {
      const config: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 10,
        where: [],
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result.constraints).toHaveLength(1); // Only limit
    });

    it('should handle zero limit', () => {
      const config: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 0,
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result.constraints[0].count).toBe(0);
    });

    it('should handle large limit', () => {
      const config: QueryOptimizerConfig = {
        collection: 'posts',
        limit: 1000,
      };

      const result = optimizer.buildQuery(config) as any;

      expect(result.constraints[0].count).toBe(1000);
    });
  });
});
