# Firestore Query Optimization - Testing Checklist

## Overview

This comprehensive testing checklist ensures all Firestore query optimizations are working correctly before and after deployment. Use this checklist for local testing, staging validation, and production verification.

---

## Pre-Deployment Testing (Local/Staging)

### 1. Cache Manager Testing

#### 1.1 Basic Cache Operations

- [ ] **Test: Set and Get**
  ```typescript
  cacheManager.set('test-key', { data: 'test' }, 60000);
  const result = cacheManager.get('test-key');
  // Expected: { data: 'test' }
  ```

- [ ] **Test: TTL Expiration**
  ```typescript
  cacheManager.set('expire-test', { data: 'test' }, 100); // 100ms TTL
  await new Promise(resolve => setTimeout(resolve, 150));
  const result = cacheManager.get('expire-test');
  // Expected: null (expired)
  ```

- [ ] **Test: Cache Invalidation**
  ```typescript
  cacheManager.set('invalidate-test', { data: 'test' });
  cacheManager.invalidate('invalidate-test');
  const result = cacheManager.get('invalidate-test');
  // Expected: null
  ```

- [ ] **Test: Pattern Invalidation**
  ```typescript
  cacheManager.set('posts:user1', { data: 'test1' });
  cacheManager.set('posts:user2', { data: 'test2' });
  cacheManager.invalidatePattern('posts:*');
  // Expected: Both entries removed
  ```

- [ ] **Test: LRU Eviction**
  ```typescript
  // Fill cache to max size
  for (let i = 0; i < 101; i++) {
    cacheManager.set(`key${i}`, { data: i });
  }
  const oldest = cacheManager.get('key0');
  // Expected: null (evicted)
  ```

- [ ] **Test: Cache Statistics**
  ```typescript
  const stats = cacheManager.getStats();
  console.log(stats);
  // Expected: { size, hits, misses, hitRate, evictions }
  ```

**Pass Criteria**: All cache operations work correctly, TTL expires entries, LRU evicts oldest entries

---

### 2. Query Optimizer Testing

#### 2.1 Query Building

- [ ] **Test: Basic Query with Limit**
  ```typescript
  const result = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10,
    orderBy: { field: 'createdAt', direction: 'desc' }
  });
  // Expected: 10 posts, ordered by createdAt DESC
  ```

- [ ] **Test: Query with Where Clause**
  ```typescript
  const result = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10,
    where: [{ field: 'userId', operator: '==', value: 'user123' }]
  });
  // Expected: Only posts from user123
  ```

- [ ] **Test: Query with Pagination**
  ```typescript
  const page1 = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10
  });
  const page2 = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10,
    startAfter: page1.lastDoc
  });
  // Expected: Different posts, no duplicates
  ```

- [ ] **Test: Cache Integration**
  ```typescript
  const result1 = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10,
    useCache: true,
    cacheTTL: 60000
  });
  const result2 = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10,
    useCache: true
  });
  // Expected: result2.fromCache === true
  ```

- [ ] **Test: Execution Time Tracking**
  ```typescript
  const result = await queryOptimizer.executeQuery({
    collection: 'posts',
    limit: 10
  });
  console.log('Execution time:', result.executionTime);
  // Expected: executionTime < 2000ms
  ```

**Pass Criteria**: All queries execute correctly, caching works, pagination works, execution time tracked

---

### 3. Listener Manager Testing

#### 3.1 Listener Lifecycle

- [ ] **Test: Subscribe to Listener**
  ```typescript
  const query = collection(db, 'messages').where('conversationId', '==', 'conv1');
  const subscriberId = listenerManager.subscribe('test-listener', {
    query,
    onUpdate: (data) => console.log('Updated:', data),
    onError: (error) => console.error('Error:', error)
  });
  // Expected: Listener created, subscriberId returned
  ```

- [ ] **Test: Listener Deduplication**
  ```typescript
  const query = collection(db, 'messages').where('conversationId', '==', 'conv1');
  const sub1 = listenerManager.subscribe('listener1', { query, onUpdate: () => {} });
  const sub2 = listenerManager.subscribe('listener2', { query, onUpdate: () => {} });
  const activeListeners = listenerManager.getActiveListeners();
  // Expected: Only 1 active listener (shared)
  ```

- [ ] **Test: Unsubscribe**
  ```typescript
  const query = collection(db, 'messages').where('conversationId', '==', 'conv1');
  const subscriberId = listenerManager.subscribe('test', { query, onUpdate: () => {} });
  listenerManager.unsubscribe(subscriberId);
  const activeListeners = listenerManager.getActiveListeners();
  // Expected: Listener removed
  ```

- [ ] **Test: Cleanup on Last Unsubscribe**
  ```typescript
  const query = collection(db, 'messages').where('conversationId', '==', 'conv1');
  const sub1 = listenerManager.subscribe('test1', { query, onUpdate: () => {} });
  const sub2 = listenerManager.subscribe('test2', { query, onUpdate: () => {} });
  listenerManager.unsubscribe(sub1);
  listenerManager.unsubscribe(sub2);
  const activeListeners = listenerManager.getActiveListeners();
  // Expected: Listener fully removed when last subscriber unsubscribes
  ```

**Pass Criteria**: Listeners created, deduplicated, unsubscribed correctly, no memory leaks

---

### 4. Batch Processor Testing

#### 4.1 Batch Operations

- [ ] **Test: Add Operations to Batch**
  ```typescript
  const ref1 = doc(db, 'matchHistory', 'match1');
  const ref2 = doc(db, 'matchHistory', 'match2');
  batchProcessor.add({ type: 'set', ref: ref1, data: { userId: 'user1' } });
  batchProcessor.add({ type: 'set', ref: ref2, data: { userId: 'user2' } });
  // Expected: Operations queued
  ```

- [ ] **Test: Auto-flush on Batch Size**
  ```typescript
  for (let i = 0; i < 10; i++) {
    const ref = doc(db, 'matchHistory', `match${i}`);
    batchProcessor.add({ type: 'set', ref, data: { userId: `user${i}` } });
  }
  // Expected: Batch auto-flushes at 10 operations
  ```

- [ ] **Test: Manual Flush**
  ```typescript
  const ref = doc(db, 'matchHistory', 'match1');
  batchProcessor.add({ type: 'set', ref, data: { userId: 'user1' } });
  await batchProcessor.flush();
  // Expected: Operations written to Firestore
  ```

- [ ] **Test: Clear Batch**
  ```typescript
  const ref = doc(db, 'matchHistory', 'match1');
  batchProcessor.add({ type: 'set', ref, data: { userId: 'user1' } });
  batchProcessor.clear();
  // Expected: Pending operations cleared
  ```

**Pass Criteria**: Batch operations queue correctly, auto-flush works, manual flush works

---

### 5. Query Monitor Testing

#### 5.1 Metrics Tracking

- [ ] **Test: Log Query Metrics**
  ```typescript
  queryMonitor.logQuery({
    queryId: 'test-query-1',
    collection: 'posts',
    executionTime: 150,
    documentReads: 10,
    fromCache: false,
    timestamp: Date.now()
  });
  // Expected: Metrics logged
  ```

- [ ] **Test: Generate Performance Report**
  ```typescript
  const report = queryMonitor.getReport();
  console.log(report);
  // Expected: { totalQueries, totalReads, averageExecutionTime, cacheHitRate, slowQueries, costEstimate }
  ```

- [ ] **Test: Identify Slow Queries**
  ```typescript
  queryMonitor.logQuery({
    queryId: 'slow-query',
    collection: 'posts',
    executionTime: 3000, // 3 seconds
    documentReads: 100,
    fromCache: false,
    timestamp: Date.now()
  });
  const slowQueries = queryMonitor.getSlowQueries(2000);
  // Expected: slow-query in results
  ```

- [ ] **Test: Cost Estimation**
  ```typescript
  queryMonitor.trackDocumentReads(1000);
  const cost = queryMonitor.getCostEstimate();
  // Expected: Estimated cost based on Firestore pricing
  ```

**Pass Criteria**: Metrics logged correctly, reports generated, slow queries identified, costs estimated

---

## Feature-Specific Testing

### 6. Posts Feed Optimization

#### 6.1 Initial Load

- [ ] **Test: Load 10 Posts**
  - Navigate to Posts feed
  - Check Network tab: Should see query with limit=10
  - Verify 10 posts displayed
  - Check execution time < 2 seconds

- [ ] **Test: Posts Ordered by createdAt DESC**
  - Verify posts are in reverse chronological order
  - Newest posts at top

- [ ] **Test: Filter Posts > 18 Hours**
  - Create a test post with createdAt = 20 hours ago
  - Verify it doesn't appear in feed
  - Check query includes where clause for age filter

#### 6.2 Pagination

- [ ] **Test: Load More Posts**
  - Scroll to bottom of feed
  - Click "Load More" or trigger infinite scroll
  - Verify next 10 posts load
  - Check no duplicate posts

- [ ] **Test: startAfter Cursor**
  - Check Network tab for startAfter parameter
  - Verify cursor points to last document from previous page

#### 6.3 Caching

- [ ] **Test: Cache Hit on Reload**
  - Load posts feed
  - Reload page within 60 seconds
  - Check Network tab: Should see fewer Firestore reads
  - Verify cache hit in Query Monitor

- [ ] **Test: Cache Invalidation on New Post**
  - Load posts feed (cached)
  - Create new post
  - Verify cache invalidated
  - New post appears in feed

#### 6.4 Real-Time Updates

- [ ] **Test: New Posts Appear**
  - Open posts feed
  - Create new post in another tab/device
  - Verify new post appears at top without refresh
  - Check listener is active

**Pass Criteria**: 
- ✅ 10 posts load initially
- ✅ Pagination works without duplicates
- ✅ Cache hit rate > 20%
- ✅ Real-time updates work
- ✅ Load time < 2 seconds

---

### 7. Matching System Optimization

#### 7.1 Initial Load

- [ ] **Test: Load 50 Profiles**
  - Navigate to Matching page
  - Check Network tab: Should see query with limit=50
  - Verify up to 50 profiles loaded
  - Check execution time < 1.5 seconds

#### 7.2 Filters

- [ ] **Test: Gender Filter**
  - Select gender filter (e.g., "Female")
  - Check Network tab: Should see where clause for gender
  - Verify only matching profiles shown

- [ ] **Test: Major Filter**
  - Select major filter (e.g., "Công nghệ thông tin")
  - Check query uses majorNormalized field
  - Verify only matching profiles shown

- [ ] **Test: Academic Year Filter**
  - Select academic year (e.g., "K2023")
  - Check where clause for academicYear
  - Verify only matching profiles shown

- [ ] **Test: Combined Filters**
  - Apply multiple filters (gender + major + year)
  - Verify all filters applied at database level
  - Check composite index is used

#### 7.3 Viewed Profiles Cache

- [ ] **Test: No Duplicate Profiles**
  - View 10 profiles
  - Load more profiles
  - Verify previously viewed profiles don't reappear
  - Check viewed UIDs cached

- [ ] **Test: 24-Hour Cache**
  - View profiles
  - Return after 1 hour
  - Verify same profiles don't show again
  - Cache should persist

#### 7.4 Batch Save

- [ ] **Test: Match History Batching**
  - Swipe through 10 profiles
  - Check Network tab: Should see 1 batch write, not 10 individual writes
  - Verify all match history saved correctly

**Pass Criteria**:
- ✅ 50 profiles load initially
- ✅ Filters work at database level
- ✅ No duplicate profiles shown
- ✅ Batch saves reduce writes by 90%
- ✅ Load time < 1.5 seconds

---

### 8. Messages Optimization

#### 8.1 Conversations List

- [ ] **Test: Load 20 Conversations**
  - Navigate to Messages page
  - Check Network tab: Should see query with limit=20
  - Verify up to 20 conversations displayed
  - Check execution time < 1 second

- [ ] **Test: Conversations Cached**
  - Load conversations
  - Reload page within 120 seconds
  - Verify cache hit
  - Fewer Firestore reads

#### 8.2 Messages in Conversation

- [ ] **Test: Load 30 Messages**
  - Open a conversation
  - Check Network tab: Should see query with limit=30
  - Verify up to 30 messages displayed
  - Messages ordered by createdAt DESC

- [ ] **Test: Load Older Messages**
  - Scroll up in conversation
  - Verify older messages load
  - Check startAfter cursor used
  - No duplicate messages

#### 8.3 Real-Time Listener

- [ ] **Test: Single Active Listener**
  - Open conversation A
  - Check active listeners (should be 1)
  - Switch to conversation B
  - Verify listener for A unsubscribed
  - Only 1 listener active for B

- [ ] **Test: New Messages Appear**
  - Open conversation
  - Send message from another device
  - Verify message appears instantly
  - No page refresh needed

#### 8.4 Composite Index

- [ ] **Test: Messages Query Uses Index**
  - Open conversation
  - Check Firebase Console: No "Index required" errors
  - Verify (conversationId, createdAt DESC) index used

**Pass Criteria**:
- ✅ 20 conversations, 30 messages load
- ✅ Only 1 active listener per conversation
- ✅ Real-time updates work
- ✅ Pagination works
- ✅ Load time < 1 second

---

### 9. Explore Places Optimization

#### 9.1 Adaptive Limits

- [ ] **Test: Mobile Limit (100 places)**
  - Open Explore on mobile device (or resize browser to mobile width)
  - Check Network tab: Should see limit=100
  - Verify up to 100 places displayed

- [ ] **Test: Desktop Limit (200 places)**
  - Open Explore on desktop
  - Check Network tab: Should see limit=200
  - Verify up to 200 places displayed

#### 9.2 Category Filter

- [ ] **Test: Filter by Category**
  - Select category (e.g., "Quán ăn")
  - Check Network tab: Should see where clause for category
  - Verify only matching places shown
  - Filter applied at database level

#### 9.3 Check-ins Optimization

- [ ] **Test: Filter Expired Check-ins**
  - Load check-ins
  - Check query includes where('expiresAt', '>', now)
  - Verify no expired check-ins shown
  - Check composite index used

- [ ] **Test: Adaptive Check-in Limits**
  - Mobile: limit=30
  - Desktop: limit=50
  - Verify correct limit applied

#### 9.4 Events Optimization

- [ ] **Test: Filter Past Events**
  - Load events
  - Check query includes where('startTime', '>', now)
  - Verify no past events shown
  - Check composite index used

- [ ] **Test: Adaptive Event Limits**
  - Mobile: limit=5
  - Desktop: limit=10
  - Verify correct limit applied

#### 9.5 Caching

- [ ] **Test: Places Cached for 5 Minutes**
  - Load places
  - Reload within 5 minutes
  - Verify cache hit
  - Fewer Firestore reads

**Pass Criteria**:
- ✅ Adaptive limits work (mobile vs desktop)
- ✅ Category filters work at database level
- ✅ Expired check-ins and past events filtered
- ✅ Cache hit rate > 25%
- ✅ Load time < 2 seconds

---

### 10. User Profiles Optimization

#### 10.1 Profile Caching

- [ ] **Test: Cache Profile for 3 Minutes**
  - View user profile
  - Reload within 3 minutes
  - Verify cache hit
  - No Firestore read

- [ ] **Test: Cache Invalidation on Update**
  - View profile (cached)
  - Update profile
  - View profile again
  - Verify fresh data loaded (cache invalidated)

#### 10.2 Blocked Users

- [ ] **Test: Batch Fetch Blocked Users**
  - User with 10 blocked users
  - Check Network tab: Should see 1 query with where('uid', 'in', [...])
  - Not 10 individual queries
  - Verify all blocked users fetched

- [ ] **Test: Limit 30 Blocked Users**
  - User with 50 blocked users
  - Verify only 30 fetched
  - Check limit applied

#### 10.3 Favorites Lookup

- [ ] **Test: Composite Index for Favorites**
  - Check if user saved another user
  - Verify query uses (fromUid, toUid) index
  - No "Index required" error
  - Fast lookup (< 100ms)

**Pass Criteria**:
- ✅ Profiles cached for 3 minutes
- ✅ Blocked users fetched in batch
- ✅ Favorites lookup uses index
- ✅ Load time < 500ms

---

### 11. Online Status Optimization

#### 11.1 Status Caching

- [ ] **Test: Cache Status for 30 Seconds**
  - View user's online status
  - Check again within 30 seconds
  - Verify cache hit
  - No Firestore read

#### 11.2 Listener Reuse

- [ ] **Test: Reuse Existing Listener**
  - Component A subscribes to user1's status
  - Component B subscribes to user1's status
  - Verify only 1 listener active
  - Both components receive updates

#### 11.3 Cleanup

- [ ] **Test: Unsubscribe on Unmount**
  - Component subscribes to status
  - Unmount component
  - Verify listener unsubscribed
  - Check active listeners count decreased

#### 11.4 No Duplicate Listeners

- [ ] **Test: Prevent Duplicates**
  - Subscribe to same user multiple times
  - Verify only 1 listener created
  - Check listener registry

**Pass Criteria**:
- ✅ Status cached for 30 seconds
- ✅ Listeners reused (no duplicates)
- ✅ Cleanup on unmount works
- ✅ Update time < 100ms

---

## Performance Testing

### 12. Load Time Benchmarks

- [ ] **Posts Feed**: < 2 seconds
- [ ] **Matching**: < 1.5 seconds
- [ ] **Messages**: < 1 second
- [ ] **Explore Places**: < 2 seconds
- [ ] **User Profile**: < 500ms
- [ ] **Online Status**: < 100ms

### 13. Cache Hit Rate Targets

- [ ] **Posts**: > 20%
- [ ] **Matching**: > 30%
- [ ] **Conversations**: > 25%
- [ ] **Places**: > 25%
- [ ] **Profiles**: > 40%
- [ ] **Online Status**: > 50%

### 14. Document Reads Reduction

- [ ] **Posts**: 40% reduction
- [ ] **Matching**: 50% reduction
- [ ] **Messages**: 60% reduction
- [ ] **Places**: 45% reduction
- [ ] **Profiles**: 55% reduction
- [ ] **Online Status**: 70% reduction
- [ ] **Overall**: 50% reduction

---

## Production Validation

### 15. Post-Deployment Checks

#### Day 1: Immediate Validation

- [ ] All indexes show "Enabled" status in Firebase Console
- [ ] No "Index required" errors in logs
- [ ] Query Monitor shows metrics
- [ ] Cache hit rate > 0%
- [ ] No increase in error rates
- [ ] User-reported issues: 0

#### Week 1: Performance Monitoring

- [ ] Daily document reads reduced by 40%+
- [ ] Cache hit rate stable at 30%+
- [ ] No slow queries (>2s)
- [ ] Cost reduction visible in Firebase Console
- [ ] User feedback positive

#### Week 2-4: Long-term Validation

- [ ] Monthly cost reduced by 50%+
- [ ] Cache performance stable
- [ ] No memory leaks detected
- [ ] Listener cleanup working
- [ ] Batch operations successful

---

## Rollback Testing

### 16. Rollback Scenarios

- [ ] **Test: Disable Query Optimization**
  - Set VITE_ENABLE_QUERY_OPTIMIZATION=false
  - Verify app still works
  - Falls back to original queries

- [ ] **Test: Disable Cache**
  - Set VITE_ENABLE_CACHE_MANAGER=false
  - Verify app still works
  - All queries hit Firestore

- [ ] **Test: Disable Batch Processor**
  - Set VITE_ENABLE_BATCH_PROCESSOR=false
  - Verify writes still work
  - Individual writes instead of batches

- [ ] **Test: Full Rollback**
  - Revert to previous deployment
  - Verify all features work
  - No data loss

---

## Sign-Off Checklist

### Pre-Deployment Sign-Off

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All feature tests passing
- [ ] Performance benchmarks met
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Rollback plan tested

### Post-Deployment Sign-Off

- [ ] All indexes deployed and enabled
- [ ] Performance metrics improved
- [ ] Cost reduction achieved
- [ ] No critical errors
- [ ] User feedback positive
- [ ] Monitoring in place

---

## Testing Tools and Scripts

### Query Monitor Dashboard

```typescript
// Add to browser console for testing
window.__QUERY_STATS__ = queryMonitor.getReport();
console.table(window.__QUERY_STATS__);
```

### Cache Statistics

```typescript
// Check cache performance
window.__CACHE_STATS__ = cacheManager.getStats();
console.log('Cache Hit Rate:', window.__CACHE_STATS__.hitRate);
```

### Active Listeners

```typescript
// Monitor active listeners
window.__ACTIVE_LISTENERS__ = listenerManager.getActiveListeners();
console.log('Active Listeners:', window.__ACTIVE_LISTENERS__.length);
```

### Performance Timing

```typescript
// Measure page load time
performance.mark('page-start');
// ... page loads ...
performance.mark('page-end');
performance.measure('page-load', 'page-start', 'page-end');
const measure = performance.getEntriesByName('page-load')[0];
console.log('Page load time:', measure.duration, 'ms');
```

---

**Last Updated**: April 2026  
**Version**: 1.0  
**Status**: Ready for Testing
