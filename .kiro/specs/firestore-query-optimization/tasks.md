# Implementation Plan: Firestore Query Optimization

## Overview

This implementation plan focuses on urgent optimizations to reduce Firestore quota usage from 50,000+ reads/day. Tasks are prioritized for immediate impact: caching system, query limits, listener optimization, and pagination. The implementation uses TypeScript and follows the architecture defined in the design document.

## Priority Strategy

Phase 1 (Tasks 1-3): Quick wins with immediate 40-50% reduction in reads
Phase 2 (Tasks 4-6): Core optimization infrastructure  
Phase 3 (Tasks 7-9): Module-specific optimizations
Phase 4 (Tasks 10-11): Monitoring and deployment

## Tasks

- [x] 1. Implement Cache Manager with TTL and LRU eviction
  - [x] 1.1 Create CacheManager class with Map-based storage
    - Implement get(), set(), invalidate(), clear() methods
    - Add timestamp tracking and TTL validation
    - Implement cache entry expiration logic
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 1.2 Implement LRU eviction policy
    - Track access order for cache entries
    - Implement evictOldest() method
    - Add max size limit (100 entries per collection)
    - Evict when cache exceeds max size
    - _Requirements: 8.7_
  
  - [x] 1.3 Add cache statistics tracking
    - Track hits, misses, evictions
    - Calculate hit rate percentage
    - Implement getStats() method
    - _Requirements: 8.4_
  
  - [x] 1.4 Implement pattern-based cache invalidation
    - Add invalidatePattern() method for wildcard invalidation
    - Support invalidation by collection or user ID
    - _Requirements: 8.5_

- [x] 2. Implement Query Optimizer with limits and filters
  - [x] 2.1 Create QueryOptimizer class with core query building
    - Implement buildQuery() method
    - Add support for orderBy, where, limit clauses
    - Integrate with CacheManager for cache checks
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4_
  
  - [x] 2.2 Implement executeQuery() with caching integration
    - Check cache before executing Firestore query
    - Store results in cache with appropriate TTL
    - Return QueryResult with metadata (fromCache, executionTime)
    - _Requirements: 5.1, 5.2_
  
  - [x] 2.3 Add filter application at database level
    - Implement applyFilters() method
    - Support where clauses for age filters (posts > 18 hours)
    - Support gender, major, academic year filters for matching
    - Support category filters for places
    - _Requirements: 1.4, 2.1, 2.2, 2.3, 4.3, 4.5, 4.7_
  
  - [x] 2.4 Implement pagination with startAfter cursors
    - Implement applyPagination() method
    - Store lastDoc reference in QueryResult
    - Add hasMore flag to indicate more data available
    - _Requirements: 1.3, 11.1, 11.2, 11.3_

- [x] 3. Optimize Real-Time Listeners to reduce snapshot reads
  - [x] 3.1 Create ListenerManager class with registry
    - Implement Map-based listener registry
    - Generate unique listener IDs based on query hash
    - Track subscribers per listener
    - _Requirements: 12.2, 12.5_
  
  - [x] 3.2 Implement listener subscription with deduplication
    - Check if listener already exists for query
    - Reuse existing listener if found
    - Add subscriber to existing listener's subscriber set
    - Create new listener only if none exists
    - _Requirements: 6.2, 12.2_
  
  - [x] 3.3 Implement unsubscribe with cleanup
    - Remove subscriber from listener's subscriber set
    - Unsubscribe and remove listener if no subscribers remain
    - Auto-cleanup on component unmount
    - _Requirements: 6.3, 12.1_
  
  - [x] 3.4 Add query limits to listeners
    - Apply limits to all snapshot queries
    - Limit messages listener to 30 messages
    - Limit conversations listener to 20 conversations
    - _Requirements: 3.2, 3.1, 12.3_

- [x] 4. Checkpoint - Test core infrastructure
  - Verify CacheManager stores and retrieves data correctly
  - Verify cache TTL expiration works
  - Verify QueryOptimizer applies limits and filters
  - Verify ListenerManager prevents duplicate listeners
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Optimize Posts Feed queries
  - [x] 5.1 Implement posts query with limit 10 and pagination
    - Create usePosts hook with QueryOptimizer
    - Apply limit 10 for initial load
    - Implement loadMore() with startAfter cursor
    - Filter posts older than 18 hours at database level
    - _Requirements: 1.1, 1.3, 1.4_
  
  - [x] 5.2 Add posts feed caching with 60s TTL
    - Cache posts query results for 60 seconds
    - Invalidate cache when new post is created
    - _Requirements: 1.5_
  
  - [x] 5.3 Optimize real-time listener for new posts only
    - Subscribe to posts created after initial load timestamp
    - Use where('createdAt', '>', initialLoadTime) filter
    - Unsubscribe when component unmounts
    - _Requirements: 1.6_

- [x] 6. Optimize Matching System queries
  - [x] 6.1 Implement matching query with limit 50 and filters
    - Create useMatching hook with QueryOptimizer
    - Apply gender filter at database level
    - Apply majorNormalized filter at database level
    - Apply academicYear filter at database level
    - Limit to 50 profiles per query
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 6.2 Implement viewed profiles cache with 24h TTL
    - Cache viewed profile UIDs in Set
    - Store in CacheManager with 24 hour TTL
    - Filter out already viewed UIDs in-memory before display
    - _Requirements: 2.5, 2.6_
  
  - [x] 6.3 Implement batch save for match history
    - Create BatchProcessor instance for match history
    - Queue match history saves
    - Flush batch every 10 records or 500ms
    - _Requirements: 2.7, 9.1, 9.3_

- [x] 7. Optimize Messages and Conversations queries
  - [x] 7.1 Implement conversations list query with limit 20
    - Create useConversations hook with QueryOptimizer
    - Apply limit 20 for conversations list
    - Cache conversations for 120 seconds
    - _Requirements: 3.1, 3.5_
  
  - [x] 7.2 Implement messages query with limit 30 and pagination
    - Create useMessages hook with QueryOptimizer
    - Apply limit 30 for initial messages load
    - Implement loadOlderMessages() with startAfter cursor
    - Use composite index on (conversationId, createdAt DESC)
    - _Requirements: 3.2, 3.3, 3.4_
  
  - [x] 7.3 Implement single active conversation listener
    - Subscribe to only the active conversation
    - Unsubscribe from previous conversation when switching
    - Use ListenerManager to prevent duplicate listeners
    - _Requirements: 3.6, 3.7_

- [x] 8. Optimize Explore Places queries
  - [x] 8.1 Implement adaptive places query limits
    - Detect mobile vs desktop device
    - Apply limit 100 for mobile, 200 for desktop
    - Apply category filter at database level
    - Cache places for 300 seconds (5 minutes)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 8.2 Optimize check-ins query with expiration filter
    - Filter expired check-ins at database level using where clause
    - Apply limit 30 for mobile, 50 for desktop
    - Use composite index on (expiresAt, createdAt DESC)
    - _Requirements: 4.5, 4.6_
  
  - [x] 8.3 Optimize events query with past events filter
    - Filter past events at database level using where clause
    - Apply limit 5 for mobile, 10 for desktop
    - Use composite index on (startTime, createdAt DESC)
    - _Requirements: 4.7, 4.8_

- [x] 9. Optimize User Profiles and Online Status queries
  - [x] 9.1 Implement profile caching with 180s TTL
    - Cache user profiles for 3 minutes
    - Check cache before querying Firestore
    - Invalidate cache when profile is updated
    - _Requirements: 5.1, 5.2_
  
  - [x] 9.2 Implement batch fetch for blocked users
    - Fetch blocked users in single query using where('uid', 'in', blockedUids)
    - Limit to 30 blocked users
    - _Requirements: 5.3, 5.4_
  
  - [x] 9.3 Optimize online status with 30s cache and listener reuse
    - Cache online status for 30 seconds per user
    - Reuse existing listener if one exists for user
    - Unsubscribe when component unmounts
    - Prevent duplicate listeners for same user
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Implement Query Monitor and performance tracking
  - [x] 10.1 Create QueryMonitor class with metrics logging
    - Implement logQuery() method
    - Track executionTime, documentReads, fromCache
    - Store metrics in array with timestamps
    - _Requirements: 10.1, 10.3_
  
  - [x] 10.2 Implement performance reporting
    - Calculate average execution time
    - Calculate cache hit rate
    - Identify slow queries (>2s)
    - Generate PerformanceReport with all metrics
    - _Requirements: 10.2, 10.4, 10.5, 10.6_
  
  - [x] 10.3 Implement cost tracking and alerts
    - Track total document reads per day
    - Calculate estimated daily cost based on Firestore pricing
    - Alert when daily reads exceed 80% of quota (40,000 reads)
    - Compare with baseline before optimization
    - _Requirements: 14.1, 14.2, 14.3, 14.6_

- [x] 11. Create composite indexes and deployment guide
  - [x] 11.1 Create firestore.indexes.json with all required indexes
    - Add index for posts: (createdAt DESC)
    - Add index for messages: (conversationId, createdAt DESC)
    - Add index for profiles: (gender, majorNormalized, academicYear)
    - Add index for checkIns: (expiresAt, createdAt DESC)
    - Add index for events: (startTime, createdAt DESC)
    - Add index for favorites: (fromUid, toUid)
    - Add index for blocks: (blockerUid, blockedUid)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  
  - [x] 11.2 Create deployment guide and testing checklist
    - Document step-by-step index deployment process
    - Create feature flag for enabling/disabling optimizations
    - Document rollback plan
    - Create testing checklist for all optimized queries
    - Document expected performance improvements
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 12. Final checkpoint - Verify optimization impact
  - Run QueryMonitor to generate performance report
  - Verify at least 50% reduction in document reads
  - Verify cache hit rate is above 30%
  - Verify no queries take longer than 2 seconds
  - Verify daily cost is reduced by at least 50%
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks 1-3 are highest priority for immediate quota reduction
- All caching uses in-memory Map storage (no external dependencies)
- Composite indexes must be deployed before enabling optimized queries
- Feature flags allow gradual rollout and easy rollback
- Query Monitor provides real-time visibility into optimization impact
- Expected overall reduction: 50% in Firestore costs and document reads

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4", "5", "6"] },
    { "id": 4, "tasks": ["7"] },
    { "id": 5, "tasks": ["8", "9"] },
    { "id": 6, "tasks": ["10", "11"] },
    { "id": 7, "tasks": ["12"] }
  ]
}
```
