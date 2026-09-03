/**
 * Unit tests for useCachedPosts hook
 * 
 * Tests:
 * - Initial load with cache miss
 * - Initial load with cache hit
 * - Pagination (load more)
 * - Refresh functionality
 * - Error handling
 * - Cache TTL behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCachedPosts } from './useCachedPosts';
import * as queryOptimizer from '../utils/queryOptimizer';

// Mock queryOptimizer
vi.mock('../utils/queryOptimizer', () => ({
  optimizeQuery: vi.fn(),
  createCacheConfig: vi.fn((ttl, storage, keyPrefix) => ({
    enabled: true,
    ttl,
    storage,
    keyPrefix,
  })),
  createPaginationConfig: vi.fn((baseConfig, cursor) => ({
    ...baseConfig,
    startAfter: cursor,
  })),
}));

describe('useCachedPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queryOptimizer.optimizeQuery).mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load initial posts with cache miss', async () => {
    // Mock optimizeQuery to return posts
    const mockPosts = [
      { id: '1', content: 'Post 1', authorId: 'user1', authorName: 'User 1', createdAt: Date.now() },
      { id: '2', content: 'Post 2', authorId: 'user2', authorName: 'User 2', createdAt: Date.now() },
    ];

    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
      data: mockPosts,
      lastDoc: { id: '2' } as any,
      hasMore: true,
      fromCache: false,
      executionTime: 100,
      documentReads: 2,
    });

    const { result } = renderHook(() => useCachedPosts());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.posts).toEqual([]);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check results
    expect(result.current.posts).toEqual(mockPosts);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.error).toBeNull();

    // Verify optimizeQuery was called with correct config
    expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
      {
        collection: 'posts',
        limit: 10,
        orderBy: {
          field: 'createdAt',
          direction: 'desc',
        },
      },
      {
        enabled: true,
        ttl: 60000,
        storage: 'sessionStorage',
        keyPrefix: 'posts:feed',
      }
    );
  });

  it('should load initial posts with cache hit', async () => {
    // Mock optimizeQuery to return cached posts
    const mockPosts = [
      { id: '1', content: 'Cached Post 1', authorId: 'user1', authorName: 'User 1', createdAt: Date.now() },
    ];

    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
      data: mockPosts,
      lastDoc: { id: '1' } as any,
      hasMore: false,
      fromCache: true, // Cache hit
      executionTime: 5,
      documentReads: 0, // No Firestore reads
    });

    const { result } = renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check results
    expect(result.current.posts).toEqual(mockPosts);
    expect(result.current.fromCache).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should load more posts with pagination', async () => {
    // Initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', authorId: 'user1', authorName: 'User 1', createdAt: Date.now() },
      { id: '2', content: 'Post 2', authorId: 'user2', authorName: 'User 2', createdAt: Date.now() },
    ];

    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
      data: initialPosts,
      lastDoc: { id: '2' } as any,
      hasMore: true,
      fromCache: false,
      executionTime: 100,
      documentReads: 2,
    });

    const { result } = renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Load more
    const morePosts = [
      { id: '3', content: 'Post 3', authorId: 'user3', authorName: 'User 3', createdAt: Date.now() },
      { id: '4', content: 'Post 4', authorId: 'user4', authorName: 'User 4', createdAt: Date.now() },
    ];

    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
      data: morePosts,
      lastDoc: { id: '4' } as any,
      hasMore: true,
      fromCache: false,
      executionTime: 100,
      documentReads: 2,
    });

    // Call loadMore
    await result.current.loadMore();

    // Wait for posts to be updated
    await waitFor(() => {
      expect(result.current.posts.length).toBe(4);
    });

    // Check results
    expect(result.current.posts).toEqual([...initialPosts, ...morePosts]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loadingMore).toBe(false);

    // Verify pagination config was used
    expect(queryOptimizer.createPaginationConfig).toHaveBeenCalled();
  });

  it('should not load more when hasMore is false', async () => {
    // Initial load with hasMore = false
    const mockPosts = [
      { id: '1', content: 'Post 1', authorId: 'user1', authorName: 'User 1', createdAt: Date.now() },
    ];

    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
      data: mockPosts,
      lastDoc: { id: '1' } as any,
      hasMore: false,
      fromCache: false,
      executionTime: 100,
      documentReads: 1,
    });

    const { result } = renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Try to load more
    const callCount = vi.mocked(queryOptimizer.optimizeQuery).mock.calls.length;
    await result.current.loadMore();

    // Should not call optimizeQuery again
    expect(vi.mocked(queryOptimizer.optimizeQuery).mock.calls.length).toBe(callCount);
  });

  it('should handle errors gracefully', async () => {
    // Mock optimizeQuery to throw error
    const mockError = new Error('Firestore error');
    vi.mocked(queryOptimizer.optimizeQuery).mockRejectedValue(mockError);

    const { result } = renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check error state
    expect(result.current.error).toEqual(mockError);
    expect(result.current.posts).toEqual([]);
  });

  it('should refresh posts and invalidate cache', async () => {
    // Initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', authorId: 'user1', authorName: 'User 1', createdAt: Date.now() },
    ];

    const refreshedPosts = [
      { id: '2', content: 'New Post', authorId: 'user2', authorName: 'User 2', createdAt: Date.now() },
    ];

    let isRefreshed = false;
    vi.mocked(queryOptimizer.optimizeQuery).mockImplementation(async () => {
      if (isRefreshed) {
        return {
          data: refreshedPosts,
          lastDoc: { id: '2' } as any,
          hasMore: false,
          fromCache: false,
          executionTime: 100,
          documentReads: 1,
        };
      }
      return {
        data: initialPosts,
        lastDoc: { id: '1' } as any,
        hasMore: false,
        fromCache: false,
        executionTime: 100,
        documentReads: 1,
      };
    });

    const { result } = renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      isRefreshed = true;
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check refreshed data
    expect(result.current.posts).toEqual(refreshedPosts);
  });

  it('should use correct cache configuration', async () => {
    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
      data: [],
      lastDoc: null,
      hasMore: false,
      fromCache: false,
      executionTime: 100,
      documentReads: 0,
    });

    renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
        60000, // 60 seconds TTL
        'sessionStorage',
        'posts:feed'
      );
    });
  });

  it('should disable cache for pagination', async () => {
    // Initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', authorId: 'user1', authorName: 'User 1', createdAt: Date.now() },
    ];

    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
      data: initialPosts,
      lastDoc: { id: '1' } as any,
      hasMore: true,
      fromCache: false,
      executionTime: 100,
      documentReads: 1,
    });

    const { result } = renderHook(() => useCachedPosts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Load more
    vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
      data: [],
      lastDoc: null,
      hasMore: false,
      fromCache: false,
      executionTime: 100,
      documentReads: 0,
    });

    await result.current.loadMore();

    // Verify cache was disabled for pagination
    const lastCall = vi.mocked(queryOptimizer.optimizeQuery).mock.calls[1];
    expect(lastCall[1]).toMatchObject({
      enabled: false,
    });
  });
});
