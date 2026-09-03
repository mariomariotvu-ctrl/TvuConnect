/**
 * Example usage of Firestore Query Optimizer
 * 
 * This file demonstrates how to use the QueryOptimizer to reduce
 * Firestore document reads and improve query performance.
 */

import { FirestoreQueryOptimizer, QueryOptimizerConfig } from './firestoreQueryOptimizer';
import { FirestoreCacheManager } from './firestoreCacheManager';
import { logger } from './logger';

// Initialize cache manager and optimizer
const cacheManager = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 60000, // 60 seconds
});

const optimizer = new FirestoreQueryOptimizer(cacheManager);

// ============================================================================
// Example 1: Posts Feed with Pagination
// ============================================================================

async function loadPostsFeed() {
  // Initial load: 10 posts, ordered by createdAt DESC, filter posts > 18 hours
  const config: QueryOptimizerConfig = {
    collection: 'posts',
    limit: 10,
    orderBy: { field: 'createdAt', direction: 'desc' },
    where: optimizer.applyFilters('posts', { maxPostAge: 18 }),
    useCache: true,
    cacheTTL: 60000, // Cache for 60 seconds
  };

  const result = await optimizer.executeQuery(config);

  logger.log('Posts loaded:', result.data.length);
  logger.log('From cache:', result.fromCache);
  logger.log('Has more:', result.hasMore);
  logger.log('Execution time:', result.executionTime, 'ms');

  return result;
}

async function loadMorePosts(lastDoc: any) {
  // Load next page using cursor
  const config: QueryOptimizerConfig = {
    collection: 'posts',
    limit: 10,
    orderBy: { field: 'createdAt', direction: 'desc' },
    where: optimizer.applyFilters('posts', { maxPostAge: 18 }),
    startAfter: lastDoc,
    useCache: true,
  };

  const result = await optimizer.executeQuery(config);
  return result;
}

// ============================================================================
// Example 2: Matching System with Filters
// ============================================================================

async function loadMatchingProfiles() {
  // Load 50 profiles with gender, major, and academic year filters
  const filters = optimizer.applyFilters('profiles', {
    gender: 'female',
    major: 'computer-science',
    academicYear: 2024,
  });

  const config: QueryOptimizerConfig = {
    collection: 'profiles',
    limit: 50,
    where: filters,
    useCache: true,
    cacheTTL: 180000, // Cache for 3 minutes
  };

  const result = await optimizer.executeQuery(config);

  logger.log('Profiles loaded:', result.data.length);
  logger.log('Document reads:', result.documentReads);

  return result;
}

// ============================================================================
// Example 3: Messages with Pagination
// ============================================================================

async function loadConversationMessages(conversationId: string) {
  // Load 30 most recent messages
  const config: QueryOptimizerConfig = {
    collection: 'messages',
    limit: 30,
    orderBy: { field: 'createdAt', direction: 'desc' },
    where: [
      { field: 'conversationId', operator: '==', value: conversationId },
    ],
    useCache: false, // Don't cache messages (real-time)
  };

  const result = await optimizer.executeQuery(config);
  return result;
}

async function loadOlderMessages(conversationId: string, lastDoc: any) {
  // Load older messages using cursor
  const config: QueryOptimizerConfig = {
    collection: 'messages',
    limit: 30,
    orderBy: { field: 'createdAt', direction: 'desc' },
    where: [
      { field: 'conversationId', operator: '==', value: conversationId },
    ],
    startAfter: lastDoc,
    useCache: false,
  };

  const result = await optimizer.executeQuery(config);
  return result;
}

// ============================================================================
// Example 4: Explore Places with Category Filter
// ============================================================================

async function loadPlaces(category?: string, isMobile: boolean = false) {
  // Adaptive limit based on device
  const limit = isMobile ? 100 : 200;

  const filters = category 
    ? optimizer.applyFilters('places', { category })
    : [];

  const config: QueryOptimizerConfig = {
    collection: 'places',
    limit,
    where: filters,
    useCache: true,
    cacheTTL: 300000, // Cache for 5 minutes
  };

  const result = await optimizer.executeQuery(config);

  logger.log('Places loaded:', result.data.length);
  logger.log('From cache:', result.fromCache);

  return result;
}

// ============================================================================
// Example 5: Check-ins with Expiration Filter
// ============================================================================

async function loadActiveCheckIns(isMobile: boolean = false) {
  // Filter expired check-ins at database level
  const filters = optimizer.applyFilters('checkIns', { includeExpired: false });
  const limit = isMobile ? 30 : 50;

  const config: QueryOptimizerConfig = {
    collection: 'checkIns',
    limit,
    orderBy: { field: 'createdAt', direction: 'desc' },
    where: filters,
    useCache: true,
    cacheTTL: 120000, // Cache for 2 minutes
  };

  const result = await optimizer.executeQuery(config);
  return result;
}

// ============================================================================
// Example 6: Events with Past Events Filter
// ============================================================================

async function loadUpcomingEvents(isMobile: boolean = false) {
  // Filter past events at database level
  const filters = optimizer.applyFilters('events', { includePast: false });
  const limit = isMobile ? 5 : 10;

  const config: QueryOptimizerConfig = {
    collection: 'events',
    limit,
    orderBy: { field: 'startTime', direction: 'asc' },
    where: filters,
    useCache: true,
    cacheTTL: 180000, // Cache for 3 minutes
  };

  const result = await optimizer.executeQuery(config);
  return result;
}

// ============================================================================
// Example 7: User Profile with Cache
// ============================================================================

async function loadUserProfile(userId: string) {
  const config: QueryOptimizerConfig = {
    collection: 'profiles',
    limit: 1,
    where: [
      { field: 'uid', operator: '==', value: userId },
    ],
    useCache: true,
    cacheTTL: 180000, // Cache for 3 minutes
  };

  const result = await optimizer.executeQuery(config);
  return result.data[0] || null;
}

// ============================================================================
// Example 8: Cache Management
// ============================================================================

function manageCaches() {
  // Get cache statistics
  const stats = optimizer.getCacheStats();
  logger.log('Cache stats:', stats);
  logger.log('Hit rate:', stats.hitRate.toFixed(2) + '%');

  // Invalidate cache when data is updated
  optimizer.invalidateCache('posts'); // Invalidate all posts cache

  // Clear all caches
  cacheManager.clear();
}

// ============================================================================
// Example 9: Custom Hook Pattern
// ============================================================================

// Example of how to use QueryOptimizer in a React hook
/*
import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';

function usePosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadInitialPosts();
  }, []);

  async function loadInitialPosts() {
    setLoading(true);
    const result = await loadPostsFeed();
    setPosts(result.data);
    setLastDoc(result.lastDoc);
    setHasMore(result.hasMore);
    setLoading(false);
  }

  async function loadMore() {
    if (!hasMore || loading) return;
    
    setLoading(true);
    const result = await loadMorePosts(lastDoc);
    setPosts(prev => [...prev, ...result.data]);
    setLastDoc(result.lastDoc);
    setHasMore(result.hasMore);
    setLoading(false);
  }

  return { posts, loading, hasMore, loadMore };
}
*/

// Export examples
export {
  loadPostsFeed,
  loadMorePosts,
  loadMatchingProfiles,
  loadConversationMessages,
  loadOlderMessages,
  loadPlaces,
  loadActiveCheckIns,
  loadUpcomingEvents,
  loadUserProfile,
  manageCaches,
};
