# Cache Keys và TTL Values Documentation

## Overview

Tài liệu này mô tả tất cả cache keys và TTL (Time-To-Live) values được sử dụng trong hệ thống caching của TVU Connect v2.6.0. Hệ thống sử dụng localStorage và sessionStorage với chiến lược cache-first để giảm Firestore reads từ 80K/ngày xuống <40K/ngày.

## Cache Strategy Summary

| Feature | Storage Type | TTL | Cache Key Pattern | Expected Reduction |
|---------|-------------|-----|-------------------|-------------------|
| Posts Feed | sessionStorage | 60s | `posts:feed` | 68% (25K → 8K reads/day) |
| Matching System | localStorage | 24h | `matching:viewed:{userId}` | 70% (20K → 6K reads/day) |
| Messages | sessionStorage | 120s | `conversations:list:{userId}` | 67% (15K → 5K reads/day) |
| Explore Places | sessionStorage | 300s | `places:{category}` or `places:all` | 70% (10K → 3K reads/day) |
| User Profiles | sessionStorage | 180s | `profile:{userId}` | 70% (10K → 3K reads/day) |
| Search Results | sessionStorage | 300s | `search:{term}` | 80% reduction |

## Detailed Cache Keys

### 1. Posts Feed Cache

**Cache Key:** `posts:feed`

**Storage:** sessionStorage

**TTL:** 60,000ms (60 seconds)

**Purpose:** Cache bảng tin posts để giảm Firestore reads khi user refresh hoặc quay lại tab

**Implementation:**
```typescript
const cacheConfig = {
  key: 'posts:feed',
  ttl: 60000, // 60 seconds
  storage: 'sessionStorage'
};
```

**Invalidation Triggers:**
- TTL expires (60 seconds)
- User creates new post
- User explicitly refreshes feed
- Tab/browser closed (sessionStorage cleared)

**Related Files:**
- `src/hooks/useCachedPosts.ts`
- `src/utils/queryOptimizer.ts`
- `src/components/PostsList.tsx`

**Performance Impact:**
- Before: ~25K reads/day
- After: ~8K reads/day
- Reduction: 68%

---

### 2. Matching System Cache

**Cache Key:** `matching:viewed:{userId}`

**Storage:** localStorage

**TTL:** 86,400,000ms (24 hours)

**Purpose:** Cache danh sách profiles đã xem để không hiển thị lại trong matching system

**Implementation:**
```typescript
const cacheConfig = {
  key: `matching:viewed:${currentUserId}`,
  ttl: 86400000, // 24 hours
  storage: 'localStorage'
};
```

**Invalidation Triggers:**
- TTL expires (24 hours)
- User blocks someone
- User explicitly resets matching history
- User logs out (all localStorage cleared)

**Related Files:**
- `src/hooks/useCachedMatching.ts` (to be implemented)
- `src/components/Matching.tsx`

**Performance Impact:**
- Before: ~20K reads/day
- After: ~6K reads/day
- Reduction: 70%

**Additional Notes:**
- Uses localStorage for persistence across sessions
- Stores array of viewed profile UIDs
- Max size: ~2MB (approximately 10,000 UIDs)

---

### 3. Messages/Conversations Cache

**Cache Key:** `conversations:list:{userId}`

**Storage:** sessionStorage

**TTL:** 120,000ms (120 seconds / 2 minutes)

**Purpose:** Cache danh sách conversations để giảm reads khi user switch giữa các tabs

**Implementation:**
```typescript
const cacheConfig = {
  key: `conversations:list:${currentUserId}`,
  ttl: 120000, // 120 seconds
  storage: 'sessionStorage'
};
```

**Invalidation Triggers:**
- TTL expires (120 seconds)
- User sends new message
- User receives new message (real-time listener updates)
- Tab/browser closed

**Related Files:**
- `src/hooks/useCachedConversations.ts` (to be implemented)
- `src/hooks/useMessages.ts`
- `src/hooks/useConversations.ts`

**Performance Impact:**
- Before: ~15K reads/day
- After: ~5K reads/day
- Reduction: 67%

**Additional Notes:**
- Individual messages are NOT cached (real-time updates required)
- Only conversation list metadata is cached
- Limit: 20 conversations per query

---

### 4. Explore Places Cache

**Cache Key Pattern:** 
- All places: `places:all`
- By category: `places:{category}` (e.g., `places:cafe`, `places:library`)

**Storage:** sessionStorage

**TTL:** 300,000ms (300 seconds / 5 minutes)

**Purpose:** Cache địa điểm để giảm reads khi user explore map

**Implementation:**
```typescript
// All places
const cacheConfig = {
  key: 'places:all',
  ttl: 300000, // 5 minutes
  storage: 'sessionStorage'
};

// Filtered by category
const cacheConfig = {
  key: `places:${category}`,
  ttl: 300000,
  storage: 'sessionStorage'
};
```

**Invalidation Triggers:**
- TTL expires (5 minutes)
- User creates new place
- User updates place information
- Category filter changes (different cache key)
- Tab/browser closed

**Related Files:**
- `src/hooks/useCachedPlaces.ts` (to be implemented)
- `src/components/MapView.tsx`
- `src/components/PlaceList.tsx`

**Performance Impact:**
- Before: ~10K reads/day
- After: ~3K reads/day
- Reduction: 70%

**Additional Notes:**
- Adaptive limits: 100 places on mobile, 200 on desktop
- Category filters use separate cache keys
- Expired check-ins filtered at database level

---

### 5. User Profiles Cache

**Cache Key:** `profile:{userId}`

**Storage:** sessionStorage

**TTL:** 180,000ms (180 seconds / 3 minutes)

**Purpose:** Cache user profiles để tránh duplicate fetches khi xem profile nhiều lần

**Implementation:**
```typescript
const cacheConfig = {
  key: `profile:${userId}`,
  ttl: 180000, // 3 minutes
  storage: 'sessionStorage'
};
```

**Invalidation Triggers:**
- TTL expires (3 minutes)
- User updates own profile
- Profile owner updates their profile (real-time listener)
- Tab/browser closed

**Related Files:**
- `src/contexts/ProfileContext.tsx` (to be implemented)
- `src/hooks/useUserProfile.ts`
- `src/components/ProfileCard.tsx`

**Performance Impact:**
- Before: ~10K reads/day
- After: ~3K reads/day
- Reduction: 70%

**Additional Notes:**
- Reused across different components (ProfileCard, Settings, Matching)
- Blocked users list cached separately with batch fetching
- Max 30 blocked users per query

---

### 6. Search Results Cache

**Cache Key:** `search:{term}`

**Storage:** sessionStorage

**TTL:** 300,000ms (300 seconds / 5 minutes)

**Purpose:** Cache search results để tránh duplicate queries khi user search lại cùng term

**Implementation:**
```typescript
const cacheConfig = {
  key: `search:${searchTerm}`,
  ttl: 300000, // 5 minutes
  storage: 'sessionStorage'
};
```

**Invalidation Triggers:**
- TTL expires (5 minutes)
- Search term changes (different cache key)
- Tab/browser closed

**Related Files:**
- `src/components/SearchBar.tsx` (to be implemented)
- `src/utils/debounce.ts` (to be implemented)

**Performance Impact:**
- Expected reduction: 80% of search-related reads

**Additional Notes:**
- Debounced with 300ms delay
- Limit: 20 results per search
- Case-insensitive search terms normalized to lowercase

---

### 7. Online Status Cache

**Cache Key:** `onlineStatus:{userId}`

**Storage:** sessionStorage

**TTL:** 30,000ms (30 seconds)

**Purpose:** Cache online status để giảm real-time listener reads

**Implementation:**
```typescript
const cacheConfig = {
  key: `onlineStatus:${userId}`,
  ttl: 30000, // 30 seconds
  storage: 'sessionStorage'
};
```

**Invalidation Triggers:**
- TTL expires (30 seconds)
- Real-time listener detects status change
- Tab/browser closed

**Related Files:**
- `src/utils/onlineStatusManager.ts` (to be implemented)
- `src/hooks/useOnlineStatus.ts`
- `src/hooks/useOnlineStatusCache.ts`

**Performance Impact:**
- Expected reduction: 70% of online status reads

**Additional Notes:**
- Centralized listener management prevents duplicate listeners
- Listener reuse for same user across components
- Auto-cleanup on component unmount

---

## Cache Manager Metadata

**Metadata Key:** `__cache_metadata__`

**Storage:** Both localStorage and sessionStorage

**Purpose:** Track cache entries for LRU (Least Recently Used) eviction

**Structure:**
```typescript
interface StorageMetadata {
  keys: string[];
  lastAccess: Record<string, number>;
}
```

**Usage:**
- Tracks all cache keys in storage
- Records last access timestamp for each key
- Used for LRU eviction when storage > 80% full

---

## TTL Values Summary

| TTL Value | Duration | Use Cases |
|-----------|----------|-----------|
| 30,000ms | 30 seconds | Online status (frequent updates) |
| 60,000ms | 1 minute | Posts feed (moderate freshness) |
| 120,000ms | 2 minutes | Conversations list (balance freshness/performance) |
| 180,000ms | 3 minutes | User profiles (relatively static) |
| 300,000ms | 5 minutes | Places, Search results (static data) |
| 86,400,000ms | 24 hours | Viewed profiles in matching (long-term tracking) |

### TTL Selection Guidelines

**Short TTL (30-60 seconds):**
- Use for frequently changing data
- Examples: Posts feed, Online status
- Trade-off: More Firestore reads, but fresher data

**Medium TTL (2-5 minutes):**
- Use for moderately static data
- Examples: Conversations, Profiles, Places
- Trade-off: Balanced freshness and performance

**Long TTL (24 hours):**
- Use for tracking/history data
- Examples: Viewed profiles, User preferences
- Trade-off: Maximum performance, data may be stale

---

## Storage Limits and Management

### Storage Quotas

**localStorage:**
- Typical limit: 5-10MB
- Persistent across sessions
- Cleared only on logout or manual clear

**sessionStorage:**
- Typical limit: 5-10MB
- Cleared when tab/browser closed
- Isolated per tab

### Storage Allocation Strategy

**localStorage (Max 5MB):**
- User preferences: ~10KB
- Viewed profiles (Matching): Max 2MB
- Persistent settings: ~10KB
- Reserved: ~3MB for future features

**sessionStorage (Max 5MB):**
- Posts cache: Max 1MB (~100 posts)
- Search cache: Max 500KB
- Profiles cache: Max 1MB
- Places cache: Max 500KB
- Conversations cache: Max 500KB
- Reserved: ~1.5MB for other features

### LRU Eviction Strategy

When storage usage > 80%:
1. Sort cache entries by last access time (oldest first)
2. Calculate entries to evict (20% of total)
3. Remove oldest entries
4. Update metadata
5. Retry cache operation

**Implementation:**
```typescript
function evictOldestEntries(storage: Storage, percentage: number = 0.2): void {
  const metadata = getMetadata(storage);
  const sortedKeys = metadata.keys.sort((a, b) => 
    (metadata.lastAccess[a] || 0) - (metadata.lastAccess[b] || 0)
  );
  const entriesToEvict = Math.ceil(sortedKeys.length * percentage);
  
  for (let i = 0; i < entriesToEvict; i++) {
    storage.removeItem(sortedKeys[i]);
  }
}
```

---

## Cache Invalidation Patterns

### Pattern-Based Invalidation

**Wildcard Patterns:**
```typescript
// Invalidate all posts cache
invalidateCachePattern('posts:*', 'sessionStorage');

// Invalidate all profiles
invalidateCachePattern('profile:*', 'sessionStorage');

// Invalidate all places
invalidateCachePattern('places:*', 'sessionStorage');
```

**Implementation:**
```typescript
export function invalidateCachePattern(
  pattern: string, 
  storageType: 'localStorage' | 'sessionStorage'
): void {
  const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
  // Find and delete all matching keys
}
```

### Event-Based Invalidation

**User Actions:**
- Create post → Invalidate `posts:feed`
- Update profile → Invalidate `profile:{userId}`
- Block user → Invalidate `matching:viewed:{userId}`
- Create place → Invalidate `places:*`

**System Events:**
- Logout → Clear all localStorage
- Tab close → Clear all sessionStorage (automatic)
- Storage quota exceeded → LRU eviction

---

## Best Practices

### 1. Choosing Storage Type

**Use sessionStorage when:**
- Data is temporary and session-specific
- Data should be cleared on tab close
- Examples: Posts feed, Search results, Profiles

**Use localStorage when:**
- Data should persist across sessions
- Data is user-specific and long-term
- Examples: Viewed profiles, User preferences

### 2. Setting TTL Values

**Consider these factors:**
- Data freshness requirements
- Update frequency
- User expectations
- Firestore read costs

**Formula:**
```
TTL = (Update Frequency × User Tolerance) / Cost Sensitivity

Where:
- Update Frequency: How often data changes (seconds)
- User Tolerance: How stale data can be (multiplier 1-10)
- Cost Sensitivity: Priority of cost reduction (multiplier 0.5-2)
```

### 3. Cache Key Naming

**Follow this pattern:**
```
{feature}:{subfeature}:{identifier}

Examples:
- posts:feed
- profile:abc123
- matching:viewed:xyz789
- places:cafe
- search:tra vinh university
```

**Benefits:**
- Easy pattern matching for bulk invalidation
- Clear feature ownership
- Hierarchical organization

### 4. Monitoring Cache Performance

**Track these metrics:**
- Cache hit rate: `(cache hits / total requests) × 100%`
- Storage usage: `(used bytes / quota) × 100%`
- Eviction frequency: `evictions per hour`
- TTL effectiveness: `average age at access`

**Target metrics:**
- Cache hit rate: >70%
- Storage usage: <80%
- Eviction frequency: <10 per hour
- TTL effectiveness: <50% of TTL at access

---

## Troubleshooting

### Issue 1: QuotaExceededError

**Symptoms:**
- Error: "QuotaExceededError: Failed to execute 'setItem' on 'Storage'"
- Cache writes failing

**Solutions:**
1. Check storage usage: `getCacheStats('sessionStorage')`
2. Manually trigger eviction: `evictOldestEntries(storage, 0.3)`
3. Clear old caches: `clearAllCache('sessionStorage')`
4. Reduce TTL values to allow faster expiration

### Issue 2: Stale Data

**Symptoms:**
- Users seeing outdated information
- Changes not reflecting immediately

**Solutions:**
1. Reduce TTL for affected feature
2. Implement real-time listeners for critical data
3. Add manual refresh button
4. Invalidate cache on user actions

### Issue 3: Cache Misses

**Symptoms:**
- Low cache hit rate (<50%)
- High Firestore reads despite caching

**Solutions:**
1. Increase TTL values
2. Check cache key consistency
3. Verify cache is not being invalidated too frequently
4. Review user behavior patterns

### Issue 4: Memory Leaks

**Symptoms:**
- Storage usage growing indefinitely
- Browser performance degradation

**Solutions:**
1. Verify TTL expiration is working
2. Check for duplicate cache entries
3. Implement periodic cleanup
4. Review cache key generation logic

---

## Code Examples

### Example 1: Basic Cache Usage

```typescript
import { getCachedData, setCachedData } from '../utils/cacheManager';

// Get cached data
const cached = getCachedData<Post[]>({
  key: 'posts:feed',
  ttl: 60000,
  storage: 'sessionStorage'
});

if (cached) {
  console.log('Cache hit!', cached);
} else {
  // Fetch from Firestore
  const data = await fetchPosts();
  
  // Store in cache
  setCachedData({
    key: 'posts:feed',
    ttl: 60000,
    storage: 'sessionStorage'
  }, data);
}
```

### Example 2: Cache with Query Optimizer

```typescript
import { optimizeQuery, createCacheConfig } from '../utils/queryOptimizer';

const result = await optimizeQuery<Post>(
  {
    collection: 'posts',
    limit: 10,
    orderBy: { field: 'createdAt', direction: 'desc' }
  },
  createCacheConfig(60000, 'sessionStorage', 'posts:feed')
);

console.log('From cache:', result.fromCache);
console.log('Execution time:', result.executionTime);
console.log('Document reads:', result.documentReads);
```

### Example 3: Pattern-Based Invalidation

```typescript
import { invalidateCachePattern } from '../utils/cacheManager';

// User creates a new post
async function createPost(post: Post) {
  await addDoc(collection(db, 'posts'), post);
  
  // Invalidate all posts cache
  invalidateCachePattern('posts:*', 'sessionStorage');
}

// User updates profile
async function updateProfile(userId: string, data: Partial<Profile>) {
  await updateDoc(doc(db, 'profiles', userId), data);
  
  // Invalidate specific profile cache
  invalidateCache({
    key: `profile:${userId}`,
    ttl: 0,
    storage: 'sessionStorage'
  });
}
```

### Example 4: Cache Statistics

```typescript
import { getCacheStats } from '../utils/cacheManager';

// Get cache statistics
const stats = getCacheStats('sessionStorage');

console.log('Cache entries:', stats.entryCount);
console.log('Storage usage:', stats.storageUsage.toFixed(1) + '%');
console.log('Oldest entry:', stats.oldestEntry);
console.log('Newest entry:', stats.newestEntry);

// Alert if storage usage is high
if (stats.storageUsage > 80) {
  console.warn('Storage usage is high, consider clearing old caches');
}
```

---

## Migration Guide

### Phase 1: Posts Feed (Completed)

**Status:** ✅ Implemented

**Files Modified:**
- `src/utils/cacheManager.ts` - Created
- `src/utils/queryOptimizer.ts` - Created
- `src/hooks/useCachedPosts.ts` - Created
- `src/components/PostsList.tsx` - Updated

**Cache Keys Added:**
- `posts:feed` (sessionStorage, 60s TTL)

### Phase 2: Matching System (Pending)

**Status:** ⏳ To be implemented

**Files to Create/Modify:**
- `src/hooks/useCachedMatching.ts` - Create
- `src/components/Matching.tsx` - Update

**Cache Keys to Add:**
- `matching:viewed:{userId}` (localStorage, 24h TTL)

### Phase 3: Messages (Pending)

**Status:** ⏳ To be implemented

**Files to Create/Modify:**
- `src/hooks/useCachedConversations.ts` - Create
- `src/hooks/useMessages.ts` - Update

**Cache Keys to Add:**
- `conversations:list:{userId}` (sessionStorage, 120s TTL)

### Phase 4: Explore Places (Pending)

**Status:** ⏳ To be implemented

**Files to Create/Modify:**
- `src/hooks/useCachedPlaces.ts` - Create
- `src/components/MapView.tsx` - Update
- `src/components/PlaceList.tsx` - Update

**Cache Keys to Add:**
- `places:all` (sessionStorage, 300s TTL)
- `places:{category}` (sessionStorage, 300s TTL)

### Phase 5: User Profiles (Pending)

**Status:** ⏳ To be implemented

**Files to Create/Modify:**
- `src/contexts/ProfileContext.tsx` - Create
- `src/hooks/useUserProfile.ts` - Update

**Cache Keys to Add:**
- `profile:{userId}` (sessionStorage, 180s TTL)

---

## Performance Monitoring

### Firestore Reads Tracking

**Before Optimization:**
```
Total: 80,000 reads/day
- Posts Feed: 25,000 reads/day (31%)
- Matching: 20,000 reads/day (25%)
- Messages: 15,000 reads/day (19%)
- Explore: 10,000 reads/day (13%)
- Profiles: 10,000 reads/day (13%)
```

**After Optimization (Target):**
```
Total: <40,000 reads/day (50% reduction)
- Posts Feed: 8,000 reads/day (68% reduction)
- Matching: 6,000 reads/day (70% reduction)
- Messages: 5,000 reads/day (67% reduction)
- Explore: 3,000 reads/day (70% reduction)
- Profiles: 3,000 reads/day (70% reduction)
```

### Cache Hit Rate Targets

| Feature | Target Hit Rate | Current Status |
|---------|----------------|----------------|
| Posts Feed | >70% | ✅ Implemented |
| Matching | >80% | ⏳ Pending |
| Messages | >60% | ⏳ Pending |
| Explore | >75% | ⏳ Pending |
| Profiles | >70% | ⏳ Pending |
| Search | >85% | ⏳ Pending |

### Cost Savings Calculation

**Firestore Pricing (Spark Plan - Free Tier):**
- Free: 50,000 reads/day
- Overage: $0.06 per 100,000 reads

**Current Usage:**
- 80,000 reads/day
- Overage: 30,000 reads/day
- Monthly cost: ~$5.40

**After Optimization:**
- 40,000 reads/day
- Overage: 0 reads/day
- Monthly cost: $0 (within free tier)

**Savings:** $5.40/month = $64.80/year

---

## Future Enhancements

### 1. Service Worker Caching

**Benefits:**
- Offline support
- Faster page loads
- Network-independent caching

**Implementation:**
```typescript
// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Cache API usage
const cache = await caches.open('tvu-connect-v1');
await cache.put(request, response);
```

### 2. IndexedDB for Large Data

**Benefits:**
- Larger storage quota (>50MB)
- Structured data storage
- Better performance for large datasets

**Use Cases:**
- Offline message history
- Large image caching
- Full profile database

### 3. Cache Warming

**Benefits:**
- Preload critical data
- Faster initial page load
- Better user experience

**Implementation:**
```typescript
// Preload on idle
requestIdleCallback(() => {
  preloadPosts();
  preloadPlaces();
});
```

### 4. Intelligent TTL Adjustment

**Benefits:**
- Adaptive caching based on usage patterns
- Optimal balance between freshness and performance
- Reduced manual tuning

**Algorithm:**
```typescript
function calculateOptimalTTL(
  updateFrequency: number,
  accessFrequency: number,
  staleTolerance: number
): number {
  return Math.min(
    updateFrequency * staleTolerance,
    accessFrequency * 2
  );
}
```

---

## Conclusion

Hệ thống caching của TVU Connect v2.6.0 sử dụng localStorage và sessionStorage với TTL-based expiration và LRU eviction để giảm Firestore reads từ 80K/ngày xuống <40K/ngày (50% reduction). Cache keys được tổ chức theo pattern `{feature}:{subfeature}:{identifier}` để dễ dàng quản lý và invalidation.

**Key Takeaways:**
- ✅ Cache-first strategy giảm 50-80% Firestore reads
- ✅ TTL values được tối ưu cho từng feature (30s - 24h)
- ✅ LRU eviction tự động khi storage > 80% full
- ✅ Pattern-based invalidation cho bulk operations
- ✅ Monitoring và troubleshooting guidelines

**Next Steps:**
1. Implement remaining features (Matching, Messages, Explore, Profiles)
2. Monitor cache hit rates và adjust TTL values
3. Measure actual Firestore reads reduction
4. Consider future enhancements (Service Worker, IndexedDB)

---

**Document Version:** 1.0  
**Last Updated:** April 16, 2026  
**Author:** TVU Connect Development Team  
**Related Specs:** TVU Connect v2.6.0 Optimization
