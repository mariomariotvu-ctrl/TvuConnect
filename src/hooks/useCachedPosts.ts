/**
 * useCachedPosts Hook - Cache-First Posts Feed with Query Optimizer
 * 
 * This hook implements cache-first strategy for posts feed using:
 * - Query Optimizer for Firestore query optimization
 * - Cache Manager for browser storage caching (sessionStorage)
 * - TTL: 60 seconds
 * - Pagination: limit 10 posts per page
 * - Cache key: 'posts:feed'
 * 
 * Requirements: Requirement 1 (Cache-First Strategy cho Posts Feed)
 * Task 3.1: Tạo src/hooks/useCachedPosts.ts
 * Task 3.2: Implement cache-first với TTL 60s
 * Task 3.3: Implement pagination với limit 10
 */

import { useState, useEffect, useCallback } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import { Post } from '../types';
import { logger } from '@/utils/logger';
import {
  optimizeQuery,
  createCacheConfig,
  createPaginationConfig,
  type QueryConfig,
  type QueryResult,
} from '../utils/queryOptimizer';

/**
 * Hook result interface
 */
export interface UseCachedPostsResult {
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  fromCache: boolean;
  loadMore: () => Promise<void>;
  refresh: () => void;
}

/**
 * Custom hook for cache-first posts feed
 * 
 * Features:
 * - Cache-first strategy with 60s TTL in sessionStorage
 * - Pagination with limit 10 posts per page
 * - Automatic cache invalidation on refresh
 * - Error handling with graceful fallback
 * 
 * Requirement 1.1: Check sessionStorage first before querying Firestore
 * Requirement 1.2: Cache posts feed with TTL 60 seconds
 * Requirement 1.3: Return data instantly on cache hit
 * Requirement 1.4: Fetch from Firestore with limit 10 on cache miss
 * Requirement 1.5: Use pagination with startAfter cursor
 * Requirement 1.7: Store cache key as 'posts:feed' in sessionStorage
 */
export function useCachedPosts(): UseCachedPostsResult {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);

  /**
   * Base query configuration
   */
  const baseQueryConfig: QueryConfig = {
    collection: 'posts',
    limit: 10,
    orderBy: {
      field: 'createdAt',
      direction: 'desc',
    },
  };

  /**
   * Cache configuration
   * Requirement 1.2: TTL 60 seconds
   * Requirement 1.7: Cache key 'posts:feed' in sessionStorage
   */
  const cacheConfig = createCacheConfig(
    60000, // 60 seconds TTL
    'sessionStorage',
    'posts:feed'
  );

  /**
   * Load initial posts with cache-first strategy
   * 
   * Requirement 1.1: Check sessionStorage first
   * Requirement 1.3: Return instantly on cache hit
   * Requirement 1.4: Fetch from Firestore with limit 10 on cache miss
   */
  const loadInitialPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Execute optimized query with cache-first strategy
      const result: QueryResult<Post> = await optimizeQuery<Post>(
        baseQueryConfig,
        cacheConfig
      );

      setPosts(result.data);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
      setFromCache(result.fromCache);

      // Log performance metrics
      logger.log('[useCachedPosts] Initial load:', {
        fromCache: result.fromCache,
        executionTime: result.executionTime,
        documentReads: result.documentReads,
        postCount: result.data.length,
      });
    } catch (err) {
      console.error('[useCachedPosts] Error loading initial posts:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load more posts with pagination
   * 
   * Requirement 1.5: Use pagination with startAfter cursor
   * Requirement 1.4: Fetch with limit 10
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      // Create pagination config with cursor
      const paginationConfig = createPaginationConfig(baseQueryConfig, lastDoc);

      // Execute query without cache (pagination results are dynamic)
      const result: QueryResult<Post> = await optimizeQuery<Post>(
        paginationConfig,
        { ...cacheConfig, enabled: false } // Disable cache for pagination
      );

      // Append new posts to existing posts
      setPosts(prev => [...prev, ...result.data]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);

      // Log performance metrics
      logger.log('[useCachedPosts] Load more:', {
        executionTime: result.executionTime,
        documentReads: result.documentReads,
        newPostCount: result.data.length,
        totalPostCount: posts.length + result.data.length,
      });
    } catch (err) {
      console.error('[useCachedPosts] Error loading more posts:', err);
      setError(err as Error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, lastDoc, posts.length]);

  /**
   * Refresh posts feed
   * Invalidates cache and reloads initial posts
   * FIX: Force immediate UI update by setting loading state
   */
  const refresh = useCallback(() => {
    // Invalidate cache explicitly
    try {
      sessionStorage.removeItem('posts:feed');
      logger.log('[useCachedPosts] Cache invalidated');
    } catch (err) {
      logger.warn('[useCachedPosts] Could not invalidate cache:', err);
    }

    // FIX: Set loading to true to show immediate feedback
    setLoading(true);
    
    // Reset state
    setPosts([]);
    setLastDoc(null);
    setHasMore(true);
    setFromCache(false);

    // Reload initial posts (will fetch fresh data from Firestore)
    loadInitialPosts();
  }, [loadInitialPosts]);

  /**
   * Effect: Load initial posts on mount
   */
  useEffect(() => {
    loadInitialPosts();
  }, [loadInitialPosts]);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    fromCache,
    loadMore,
    refresh,
  };
}
