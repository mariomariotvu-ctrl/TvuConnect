/**
 * usePosts Hook - Optimized Posts Feed
 * 
 * This hook implements optimized posts feed loading with:
 * - Limit 10 posts per page with pagination
 * - 18-hour filter at database level
 * - 60-second caching
 * - Real-time listener for new posts only
 * - Trending score sorting
 * 
 * Requirements: 1.1, 1.3, 1.4, 1.5, 1.6
 * Task 5: Optimize Posts Feed queries
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  Unsubscribe,
  DocumentSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { Post } from '../types';
import { FirestoreQueryOptimizer } from '../utils/firestoreQueryOptimizer';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';
import { listenerManager } from '../utils/firestoreListenerManager';
import { sortPostsByTrending } from '../utils/trendingScore';

const POSTS_PER_PAGE = 10;
const CACHE_TTL = 60000; // 60 seconds
const POST_MAX_AGE_HOURS = 18;

interface UsePostsResult {
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refresh: () => void;
}

// Singleton instances
const queryOptimizer = new FirestoreQueryOptimizer();
const cacheManager = new FirestoreCacheManager({
  maxSize: 50,
  defaultTTL: CACHE_TTL,
});

/**
 * Custom hook for optimized posts feed
 * 
 * Features:
 * - Initial load with limit 10 and 18-hour filter
 * - Pagination with startAfter cursor
 * - 60-second caching
 * - Real-time updates for new posts only
 * - Trending score sorting
 */
export function usePosts(): UsePostsResult {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [initialLoadTime, setInitialLoadTime] = useState<number>(Date.now());
  
  const subscriberId = useRef(`posts_${Date.now()}_${Math.random()}`);
  const newPostsListenerId = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);

  /**
   * Load initial posts with optimization
   * 
   * Requirement 1.1: Limit initial query to 10 documents
   * Requirement 1.4: Filter posts older than 18 hours at database level
   * Requirement 1.5: Cache query results for 60 seconds
   */
  const loadInitialPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate cutoff time for 18-hour filter
      const cutoffTime = Date.now() - (POST_MAX_AGE_HOURS * 60 * 60 * 1000);

      // Execute optimized query with caching
      const result = await queryOptimizer.executeQuery<Post>({
        collection: 'posts',
        limit: POSTS_PER_PAGE,
        orderBy: {
          field: 'createdAt',
          direction: 'desc',
        },
        where: [
          {
            field: 'createdAt',
            operator: '>',
            value: Timestamp.fromMillis(cutoffTime),
          },
        ],
        useCache: true,
        cacheTTL: CACHE_TTL,
      });

      // Sort by trending score
      const trendingPosts = sortPostsByTrending(result.data);

      setPosts(trendingPosts);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
      setInitialLoadTime(Date.now());
    } catch (err) {
      console.error('Error loading initial posts:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load more posts with pagination
   * 
   * Requirement 1.3: Load next posts using startAfter cursor
   * Requirement 1.4: Filter posts older than 18 hours at database level
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      // Calculate cutoff time for 18-hour filter
      const cutoffTime = Date.now() - (POST_MAX_AGE_HOURS * 60 * 60 * 1000);

      // Execute optimized query with pagination
      const result = await queryOptimizer.executeQuery<Post>({
        collection: 'posts',
        limit: POSTS_PER_PAGE,
        orderBy: {
          field: 'createdAt',
          direction: 'desc',
        },
        where: [
          {
            field: 'createdAt',
            operator: '>',
            value: Timestamp.fromMillis(cutoffTime),
          },
        ],
        startAfter: lastDoc,
        useCache: false, // Don't cache paginated results
      });

      // Sort new posts by trending score
      const trendingNewPosts = sortPostsByTrending(result.data);

      // Combine and re-sort all posts
      setPosts(prev => {
        const allPosts = [...prev, ...trendingNewPosts];
        return sortPostsByTrending(allPosts);
      });

      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Error loading more posts:', err);
      setError(err as Error);
    } finally {
      setLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  }, [hasMore, loadingMore, lastDoc]);

  /**
   * Subscribe to new posts created after initial load
   * 
   * Requirement 1.6: Subscribe to posts created after initial load timestamp
   * Uses where('createdAt', '>', initialLoadTime) filter
   * Unsubscribes when component unmounts
   */
  const subscribeToNewPosts = useCallback(() => {
    // Unsubscribe from previous listener if exists
    if (newPostsListenerId.current) {
      listenerManager.unsubscribe(newPostsListenerId.current);
    }

    // Create query for new posts only — dùng Timestamp để so sánh đúng với Firestore
    const newPostsQuery = query(
      collection(db, 'posts'),
      where('createdAt', '>', Timestamp.fromMillis(initialLoadTime)),
      orderBy('createdAt', 'desc'),
      limit(20) // Limit to prevent large snapshots
    );

    // Subscribe using listener manager
    const listenerId = listenerManager.subscribe<Post>(
      subscriberId.current,
      {
        query: newPostsQuery,
        onUpdate: (newPosts) => {
          if (newPosts.length > 0) {
            // Add new posts to the beginning and re-sort
            setPosts(prev => {
              const allPosts = [...newPosts, ...prev];
              // Remove duplicates by ID
              const uniquePosts = allPosts.filter(
                (post, index, self) => 
                  index === self.findIndex(p => p.id === post.id)
              );
              return sortPostsByTrending(uniquePosts);
            });

            // Invalidate cache when new posts arrive
            cacheManager.invalidatePattern('posts|*');
          }
        },
        onError: (err) => {
          console.error('Error in new posts listener:', err);
        },
      }
    );

    newPostsListenerId.current = listenerId;
  }, [initialLoadTime]);

  /**
   * Refresh posts feed
   * Invalidates cache and reloads initial posts
   */
  const refresh = useCallback(() => {
    // Invalidate cache
    cacheManager.invalidatePattern('posts|*');
    
    // Reload initial posts
    loadInitialPosts();
  }, [loadInitialPosts]);

  /**
   * Effect: Load initial posts on mount
   */
  useEffect(() => {
    loadInitialPosts();
  }, [loadInitialPosts]);

  /**
   * Effect: Subscribe to new posts after initial load
   */
  useEffect(() => {
    if (!loading && initialLoadTime > 0) {
      subscribeToNewPosts();
    }

    // Cleanup: Unsubscribe on unmount
    return () => {
      if (newPostsListenerId.current) {
        listenerManager.unsubscribe(newPostsListenerId.current);
      }
    };
  }, [loading, initialLoadTime, subscribeToNewPosts]);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
