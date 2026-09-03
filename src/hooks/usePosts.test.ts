/**
 * Tests for usePosts Hook
 * 
 * Verifies optimized posts feed functionality:
 * - Initial load with limit 10 and 18-hour filter
 * - Pagination with startAfter cursor
 * - 60-second caching
 * - Real-time updates for new posts only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePosts } from './usePosts';
import * as firestoreQueryOptimizer from '../utils/firestoreQueryOptimizer';
import * as firestoreListenerManager from '../utils/firestoreListenerManager';

// Mock Firebase
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

// Mock trending score utility
vi.mock('../utils/trendingScore', () => ({
  sortPostsByTrending: vi.fn((posts) => posts),
}));

describe('usePosts Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load initial posts with limit 10 and 18-hour filter', async () => {
    // Mock query optimizer
    const mockPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
      { id: '2', content: 'Post 2', createdAt: Date.now() },
    ];

    const executeQuerySpy = vi.spyOn(
      firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
      'executeQuery'
    ).mockResolvedValue({
      data: mockPosts,
      lastDoc: { id: '2' } as any,
      hasMore: true,
      fromCache: false,
      executionTime: 100,
      documentReads: 2,
    });

    const { result } = renderHook(() => usePosts());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.posts).toEqual([]);

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify query was called with correct parameters
    expect(executeQuerySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        limit: 10,
        orderBy: {
          field: 'createdAt',
          direction: 'desc',
        },
        where: expect.arrayContaining([
          expect.objectContaining({
            field: 'createdAt',
            operator: '>',
          }),
        ]),
        useCache: true,
        cacheTTL: 60000,
      })
    );

    // Verify posts are loaded
    expect(result.current.posts).toEqual(mockPosts);
    expect(result.current.hasMore).toBe(true);
  });

  it('should load more posts with pagination', async () => {
    // Mock initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
      { id: '2', content: 'Post 2', createdAt: Date.now() },
    ];

    const morePosts = [
      { id: '3', content: 'Post 3', createdAt: Date.now() },
      { id: '4', content: 'Post 4', createdAt: Date.now() },
    ];

    const executeQuerySpy = vi
      .spyOn(
        firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
        'executeQuery'
      )
      .mockResolvedValueOnce({
        data: initialPosts,
        lastDoc: { id: '2' } as any,
        hasMore: true,
        fromCache: false,
        executionTime: 100,
        documentReads: 2,
      })
      .mockResolvedValueOnce({
        data: morePosts,
        lastDoc: { id: '4' } as any,
        hasMore: false,
        fromCache: false,
        executionTime: 100,
        documentReads: 2,
      });

    const { result } = renderHook(() => usePosts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.posts).toEqual(initialPosts);

    // Load more
    result.current.loadMore();

    // Wait for load more to complete and posts to combine
    await waitFor(() => {
      expect(result.current.posts.length).toBe(4);
    });

    expect(result.current.loadingMore).toBe(false);

    // Verify pagination query was called with startAfter
    expect(executeQuerySpy).toHaveBeenCalledTimes(2);
    expect(executeQuerySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startAfter: { id: '2' },
        useCache: false,
      })
    );

    // Verify posts are combined
    expect(result.current.hasMore).toBe(false);
  });

  it('should subscribe to new posts after initial load', async () => {
    // Mock initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
    ];

    vi.spyOn(
      firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
      'executeQuery'
    ).mockResolvedValue({
      data: initialPosts,
      lastDoc: { id: '1' } as any,
      hasMore: false,
      fromCache: false,
      executionTime: 100,
      documentReads: 1,
    });

    const subscribeSpy = vi.spyOn(
      firestoreListenerManager.listenerManager,
      'subscribe'
    ).mockReturnValue('listener_123');

    const { result } = renderHook(() => usePosts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait for listener subscription
    await waitFor(() => {
      expect(subscribeSpy).toHaveBeenCalled();
    });

    // Verify listener was subscribed with correct query
    expect(subscribeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        onUpdate: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it('should refresh posts and invalidate cache', async () => {
    // Mock initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
    ];

    const refreshedPosts = [
      { id: '2', content: 'Post 2', createdAt: Date.now() },
    ];

    const executeQuerySpy = vi
      .spyOn(
        firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
        'executeQuery'
      )
      .mockResolvedValueOnce({
        data: initialPosts,
        lastDoc: { id: '1' } as any,
        hasMore: false,
        fromCache: false,
        executionTime: 100,
        documentReads: 1,
      })
      .mockResolvedValueOnce({
        data: refreshedPosts,
        lastDoc: { id: '2' } as any,
        hasMore: false,
        fromCache: false,
        executionTime: 100,
        documentReads: 1,
      });

    const { result } = renderHook(() => usePosts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.posts).toEqual(initialPosts);

    // Refresh
    result.current.refresh();

    // Wait for refresh to complete
    await waitFor(() => {
      expect(result.current.posts).toEqual(refreshedPosts);
    });

    // Verify query was called twice
    expect(executeQuerySpy).toHaveBeenCalledTimes(2);
  });

  it('should not load more when already loading', async () => {
    // Mock initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
    ];

    const executeQuerySpy = vi
      .spyOn(
        firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
        'executeQuery'
      )
      .mockResolvedValue({
        data: initialPosts,
        lastDoc: { id: '1' } as any,
        hasMore: true,
        fromCache: false,
        executionTime: 100,
        documentReads: 1,
      });

    const { result } = renderHook(() => usePosts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Start loading more
    const loadMorePromise1 = result.current.loadMore();
    const loadMorePromise2 = result.current.loadMore();

    await Promise.all([loadMorePromise1, loadMorePromise2]);

    // Verify query was called only twice (initial + one loadMore)
    expect(executeQuerySpy).toHaveBeenCalledTimes(2);
  });

  it('should not load more when hasMore is false', async () => {
    // Mock initial load with no more posts
    const initialPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
    ];

    const executeQuerySpy = vi
      .spyOn(
        firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
        'executeQuery'
      )
      .mockResolvedValue({
        data: initialPosts,
        lastDoc: { id: '1' } as any,
        hasMore: false,
        fromCache: false,
        executionTime: 100,
        documentReads: 1,
      });

    const { result } = renderHook(() => usePosts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);

    // Try to load more
    await result.current.loadMore();

    // Verify query was called only once (initial load)
    expect(executeQuerySpy).toHaveBeenCalledTimes(1);
  });

  it('should handle errors gracefully', async () => {
    // Mock query error
    const executeQuerySpy = vi
      .spyOn(
        firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
        'executeQuery'
      )
      .mockRejectedValue(new Error('Query failed'));

    const { result } = renderHook(() => usePosts());

    // Wait for error
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify error is set
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toBe('Query failed');
    expect(result.current.posts).toEqual([]);
  });

  it('should unsubscribe from listener on unmount', async () => {
    // Mock initial load
    const initialPosts = [
      { id: '1', content: 'Post 1', createdAt: Date.now() },
    ];

    vi.spyOn(
      firestoreQueryOptimizer.FirestoreQueryOptimizer.prototype,
      'executeQuery'
    ).mockResolvedValue({
      data: initialPosts,
      lastDoc: { id: '1' } as any,
      hasMore: false,
      fromCache: false,
      executionTime: 100,
      documentReads: 1,
    });

    const subscribeSpy = vi.spyOn(
      firestoreListenerManager.listenerManager,
      'subscribe'
    ).mockReturnValue('listener_123');

    const unsubscribeSpy = vi.spyOn(
      firestoreListenerManager.listenerManager,
      'unsubscribe'
    );

    const { result, unmount } = renderHook(() => usePosts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait for listener subscription
    await waitFor(() => {
      expect(subscribeSpy).toHaveBeenCalled();
    });

    // Unmount
    unmount();

    // Verify unsubscribe was called
    expect(unsubscribeSpy).toHaveBeenCalledWith('listener_123');
  });
});
