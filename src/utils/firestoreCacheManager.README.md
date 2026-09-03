# Firestore Cache Manager

A production-ready cache manager designed to reduce Firestore document reads and improve query performance for TVU Connect.

## Features

- **TTL-based Expiration**: Automatic cache invalidation based on configurable Time-To-Live
- **LRU Eviction**: Least Recently Used eviction policy when cache reaches max size
- **Statistics Tracking**: Monitor cache hits, misses, evictions, and hit rate
- **Pattern-based Invalidation**: Bulk invalidation using wildcard patterns
- **Type-safe**: Full TypeScript support with generics

## Installation

The cache manager is already included in the project at `src/utils/firestoreCacheManager.ts`.

## Basic Usage

```typescript
import { FirestoreCacheManager } from '@/src/utils/firestoreCacheManager';

// Create a cache instance
const cache = new FirestoreCacheManager({
  maxSize: 100,        // Maximum 100 entries
  defaultTTL: 60000,   // 60 seconds default TTL
});

// Store data
cache.set('posts:feed:page1', postsData, 60000); // 60s TTL

// Retrieve data
const posts = cache.get('posts:feed:page1');
if (posts) {
  // Use cached data
} else {
  // Cache miss, fetch from Firestore
}

// Invalidate specific entry
cache.invalidate('posts:feed:page1');

// Invalidate by pattern
cache.invalidatePattern('posts:*'); // Invalidates all posts cache

// Get statistics
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);
```

## Configuration

### CacheConfig

```typescript
interface CacheConfig {
  maxSize: number;      // Maximum number of entries (default: 100)
  defaultTTL: number;   // Default TTL in milliseconds (default: 60000)
}
```

## API Reference

### Methods

#### `get<T>(key: string): T | null`

Retrieve data from cache. Returns `null` if key doesn't exist or entry has expired.

```typescript
const data = cache.get<PostData[]>('posts:feed');
```

#### `set<T>(key: string, data: T, ttl?: number): void`

Store data in cache with optional TTL. If TTL is not provided, uses `defaultTTL`.

```typescript
cache.set('posts:feed', postsData, 60000); // 60 seconds
```

#### `invalidate(key: string): void`

Remove a specific cache entry.

```typescript
cache.invalidate('posts:feed:page1');
```

#### `invalidatePattern(pattern: string): void`

Remove all cache entries matching a wildcard pattern.

```typescript
cache.invalidatePattern('posts:*');        // All posts
cache.invalidatePattern('profile:user123:*'); // All cache for user123
```

#### `clear(): void`

Remove all cache entries.

```typescript
cache.clear();
```

#### `getStats(): CacheStats`

Get cache statistics.

```typescript
const stats = cache.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Hit Rate: ${stats.hitRate}%`);
```

#### `size(): number`

Get current number of entries in cache.

```typescript
console.log(`Cache size: ${cache.size()}`);
```

#### `has(key: string): boolean`

Check if a key exists in cache (without affecting stats).

```typescript
if (cache.has('posts:feed')) {
  // Key exists and is not expired
}
```

### Types

#### CacheStats

```typescript
interface CacheStats {
  size: number;       // Current number of entries
  hits: number;       // Total cache hits
  misses: number;     // Total cache misses
  hitRate: number;    // Hit rate percentage (0-100)
  evictions: number;  // Total evictions
}
```

## Recommended TTL Values

Based on the Firestore Query Optimization spec:

| Collection | TTL | Reason |
|------------|-----|--------|
| Posts Feed | 60s | Frequently updated content |
| Conversations | 120s | Moderate update frequency |
| Places | 300s (5min) | Static data, infrequent updates |
| User Profiles | 180s (3min) | Occasionally updated |
| Online Status | 30s | Real-time data |
| Viewed Profiles | 24h | Long-term tracking |

## Cache Key Naming Convention

Use a consistent naming pattern for cache keys:

```typescript
// Format: collection:identifier:subtype
'posts:feed:page1'
'posts:feed:page2'
'profile:user123:basic'
'profile:user123:extended'
'status:user456'
'conversations:list'
'messages:conv789:page1'
```

This allows efficient pattern-based invalidation:

```typescript
// Invalidate all posts cache
cache.invalidatePattern('posts:*');

// Invalidate all cache for a specific user
cache.invalidatePattern('profile:user123:*');

// Invalidate all message pages for a conversation
cache.invalidatePattern('messages:conv789:*');
```

## Real-world Examples

### Posts Feed Caching

```typescript
const postsCache = new FirestoreCacheManager({
  maxSize: 50,
  defaultTTL: 60000, // 60 seconds
});

async function loadPostsFeed(page: number) {
  const cacheKey = `posts:feed:page${page}`;
  
  // Check cache first
  const cached = postsCache.get<Post[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Cache miss, fetch from Firestore
  const posts = await fetchPostsFromFirestore(page);
  
  // Store in cache
  postsCache.set(cacheKey, posts);
  
  return posts;
}

// When a new post is created, invalidate all feed pages
function onNewPostCreated() {
  postsCache.invalidatePattern('posts:feed:*');
}
```

### User Profile Caching

```typescript
const profileCache = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 180000, // 3 minutes
});

async function loadUserProfile(userId: string) {
  const cacheKey = `profile:${userId}`;
  
  const cached = profileCache.get<UserProfile>(cacheKey);
  if (cached) {
    return cached;
  }
  
  const profile = await fetchProfileFromFirestore(userId);
  profileCache.set(cacheKey, profile);
  
  return profile;
}

// When user updates their profile
function onProfileUpdated(userId: string) {
  profileCache.invalidate(`profile:${userId}`);
}
```

### Online Status Caching

```typescript
const statusCache = new FirestoreCacheManager({
  maxSize: 50,
  defaultTTL: 30000, // 30 seconds
});

async function getOnlineStatus(userId: string) {
  const cacheKey = `status:${userId}`;
  
  const cached = statusCache.get<OnlineStatus>(cacheKey);
  if (cached) {
    return cached;
  }
  
  const status = await fetchStatusFromFirestore(userId);
  statusCache.set(cacheKey, status);
  
  return status;
}
```

## Performance Monitoring

Monitor cache performance to ensure optimization is working:

```typescript
// Log stats periodically
setInterval(() => {
  const stats = cache.getStats();
  console.log('Cache Performance:', {
    hitRate: `${stats.hitRate}%`,
    size: stats.size,
    hits: stats.hits,
    misses: stats.misses,
    evictions: stats.evictions,
  });
}, 60000); // Every minute
```

## Best Practices

1. **Use appropriate TTL values**: Balance between freshness and cache efficiency
2. **Invalidate on updates**: Always invalidate cache when data changes
3. **Use pattern invalidation**: Leverage wildcard patterns for bulk invalidation
4. **Monitor hit rate**: Aim for >30% hit rate for effective caching
5. **Set reasonable max size**: Prevent memory issues with appropriate limits
6. **Use consistent key naming**: Makes pattern invalidation easier

## Testing

Run the test suite:

```bash
npm test -- firestoreCacheManager.test.ts --run
```

The test suite covers:
- Basic get/set operations
- TTL expiration
- LRU eviction
- Cache statistics
- Pattern-based invalidation
- Edge cases
- Real-world scenarios

## Requirements Mapping

This implementation satisfies the following requirements from the Firestore Query Optimization spec:

- **Requirement 8.1**: In-memory cache using Map data structure ✓
- **Requirement 8.2**: Store cache entries with timestamp and TTL ✓
- **Requirement 8.3**: Remove expired entries from cache ✓
- **Requirement 8.4**: Provide cache hit rate monitoring ✓
- **Requirement 8.5**: Invalidate related cache entries when data is updated ✓
- **Requirement 8.6**: Limit cache size to maximum entries per collection ✓
- **Requirement 8.7**: Evict oldest entries using LRU algorithm ✓

## Next Steps

This Cache Manager is ready for integration with:
- Query Optimizer (Task 2)
- Real-Time Listener Manager (Task 3)
- Module-specific optimizations (Tasks 5-9)

See the Firestore Query Optimization spec for the complete implementation plan.
