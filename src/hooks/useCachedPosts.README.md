# useCachedPosts Hook

## Overview

The `useCachedPosts` hook implements a cache-first strategy for loading posts feed with automatic caching, pagination, and performance optimization.

## Features

- **Cache-First Strategy**: Checks sessionStorage before querying Firestore
- **TTL-Based Caching**: 60-second cache with automatic expiration
- **Pagination**: Load 10 posts per page with "Load more" functionality
- **Performance Metrics**: Logs execution time and document reads
- **Error Handling**: Graceful error handling with error state
- **Refresh Support**: Manual refresh with cache invalidation

## Usage

```typescript
import { useCachedPosts } from './hooks/useCachedPosts';

function PostsFeed() {
  const {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    fromCache,
    loadMore,
    refresh,
  } = useCachedPosts();

  if (loading) {
    return <div>Loading posts...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      {fromCache && <div>Loaded from cache</div>}
      
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
      
      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}
      
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

## API

### Return Value

```typescript
interface UseCachedPostsResult {
  posts: Post[];              // Array of posts
  loading: boolean;           // Initial loading state
  loadingMore: boolean;       // Loading more posts state
  hasMore: boolean;           // Whether more posts are available
  error: Error | null;        // Error state
  fromCache: boolean;         // Whether data was loaded from cache
  loadMore: () => Promise<void>;  // Load next page
  refresh: () => void;        // Refresh posts feed
}
```

### Post Interface

```typescript
interface Post {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: number;
  likes?: number;
  comments?: number;
  imageUrl?: string;
  [key: string]: any;
}
```

## Cache Configuration

- **Cache Key**: `posts:feed`
- **Storage**: sessionStorage
- **TTL**: 60 seconds (60000ms)
- **Limit**: 10 posts per page

## Performance Benefits

### Firestore Reads Reduction

**Before Optimization:**
- Every feed load: 10-20 reads
- Frequent refreshes: ~25K reads/day

**After Optimization:**
- Cache hit: 0 reads
- Cache miss: 10 reads
- Expected: ~8K reads/day (68% reduction)

### Load Time Improvement

- **Cache Hit**: <10ms (instant)
- **Cache Miss**: ~100-200ms (Firestore query)
- **Pagination**: ~100-200ms per page

## Implementation Details

### Cache-First Flow

```
1. User requests posts
2. Check sessionStorage for 'posts:feed'
3. If cache hit and TTL valid:
   - Return cached data instantly (0 Firestore reads)
4. If cache miss or expired:
   - Query Firestore with limit 10
   - Store result in sessionStorage with TTL
   - Return fresh data
```

### Pagination Flow

```
1. User clicks "Load More"
2. Use startAfter cursor from last document
3. Query Firestore with limit 10
4. Append new posts to existing posts
5. Update cursor for next page
6. Note: Pagination results are NOT cached (dynamic)
```

### Refresh Flow

```
1. User clicks "Refresh"
2. Reset state (posts, cursor, hasMore)
3. Reload initial posts
4. Fresh data will replace expired cache
```

## Error Handling

The hook handles the following error scenarios:

1. **Firestore Permission Denied**: Sets error state with message
2. **Network Timeout**: Returns error, can retry with refresh
3. **Invalid Data**: Logs error and sets error state
4. **Storage Quota Exceeded**: Handled by cacheManager (auto-eviction)

## Testing

The hook includes comprehensive unit tests:

- ✅ Initial load with cache miss
- ✅ Initial load with cache hit
- ✅ Pagination (load more)
- ✅ Refresh functionality
- ✅ Error handling
- ✅ Cache configuration
- ✅ Pagination cache disabled

Run tests:
```bash
npm test -- src/hooks/useCachedPosts.test.ts
```

## Dependencies

- `firebase/firestore`: Firestore SDK
- `../utils/queryOptimizer`: Query optimization utilities
- `../utils/cacheManager`: Browser storage cache manager

## Related Files

- `src/utils/queryOptimizer.ts`: Query optimization logic
- `src/utils/cacheManager.ts`: Cache management logic
- `src/hooks/usePosts.ts`: Original posts hook (for comparison)

## Migration Guide

### From usePosts to useCachedPosts

**Before:**
```typescript
import { usePosts } from './hooks/usePosts';

function PostsFeed() {
  const { posts, loading, loadMore, hasMore } = usePosts();
  // ...
}
```

**After:**
```typescript
import { useCachedPosts } from './hooks/useCachedPosts';

function PostsFeed() {
  const { 
    posts, 
    loading, 
    loadMore, 
    hasMore,
    fromCache,  // NEW: cache indicator
    refresh     // NEW: refresh function
  } = useCachedPosts();
  // ...
}
```

## Performance Monitoring

The hook logs performance metrics to console:

```typescript
[useCachedPosts] Initial load: {
  fromCache: false,
  executionTime: 120,
  documentReads: 10,
  postCount: 10
}

[useCachedPosts] Load more: {
  executionTime: 110,
  documentReads: 10,
  newPostCount: 10,
  totalPostCount: 20
}
```

## Best Practices

1. **Use refresh sparingly**: Only when user explicitly requests fresh data
2. **Monitor fromCache**: Track cache hit rate for optimization
3. **Handle errors**: Always show error state to user
4. **Loading states**: Show loading indicators for better UX
5. **Pagination**: Load more on scroll or button click

## Troubleshooting

### Cache not working

- Check browser storage quota
- Verify sessionStorage is enabled
- Check TTL configuration (60 seconds)

### Slow initial load

- Check network connection
- Verify Firestore indexes are deployed
- Check Firestore rules for read permissions

### Duplicate posts

- Verify pagination cursor is working
- Check for race conditions in loadMore
- Ensure unique post IDs

## Future Enhancements

- [ ] Real-time updates for new posts
- [ ] Optimistic updates for likes/comments
- [ ] Infinite scroll support
- [ ] Background refresh (stale-while-revalidate)
- [ ] Offline support with IndexedDB
