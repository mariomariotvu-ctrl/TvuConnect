# useCachedPlaces Hook

## Overview

`useCachedPlaces` is a custom React hook that implements cache-first strategy for loading places data in the Explore feature. It uses sessionStorage caching with 300-second TTL, adaptive query limits based on device type, and database-level category filtering.

## Features

- ✅ **Cache-First Strategy**: Checks sessionStorage before querying Firestore
- ✅ **300s TTL**: Caches places data for 5 minutes
- ✅ **Adaptive Limits**: 100 places on mobile, 200 on desktop
- ✅ **Category Filtering**: Filters at database level using Firestore where clause
- ✅ **Cache Invalidation**: Invalidates cache when places are created/updated
- ✅ **Error Handling**: Graceful fallback with empty array on errors
- ✅ **Performance Logging**: Logs cache hits, execution time, and document reads

## Requirements

Implements **Requirement 4: Cache-First Strategy cho Explore Places**

- 4.1: Cache places data with TTL 300 seconds
- 4.2: Adaptive limits (100 mobile, 200 desktop)
- 4.3: Category filter at database level
- 4.6: Cache key pattern 'places:{category}' or 'places:all'
- 4.7: Cache invalidation when user creates new place

## Usage

### Basic Usage

```typescript
import { useCachedPlaces } from '../hooks/useCachedPlaces';

function ExploreComponent() {
  const { places, loading, error, fromCache } = useCachedPlaces();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>Loaded {places.length} places {fromCache ? '(from cache)' : '(from Firestore)'}</p>
      {places.map(place => (
        <PlaceCard key={place.id} place={place} />
      ))}
    </div>
  );
}
```

### With Category Filter

```typescript
import { useCachedPlaces } from '../hooks/useCachedPlaces';

function CafeList() {
  const { places, loading } = useCachedPlaces({
    category: 'cafe', // Filter by category at database level
    isMobile: window.innerWidth < 768,
  });

  return (
    <div>
      {loading ? <Skeleton /> : <PlaceList places={places} />}
    </div>
  );
}
```

### With Mobile Detection

```typescript
import { useCachedPlaces } from '../hooks/useCachedPlaces';
import { useState, useEffect } from 'react';

function MapView() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { places, loading } = useCachedPlaces({
    category: 'all',
    isMobile, // 100 places on mobile, 200 on desktop
  });

  return <Map places={places} loading={loading} />;
}
```

### Cache Invalidation

```typescript
import { useCachedPlaces, invalidatePlacesCache } from '../hooks/useCachedPlaces';

function CreatePlaceForm() {
  const { refresh } = useCachedPlaces();

  const handleSubmit = async (newPlace) => {
    await createPlace(newPlace);
    
    // Option 1: Invalidate cache globally
    invalidatePlacesCache();
    
    // Option 2: Refresh current hook instance
    refresh();
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Manual Refresh

```typescript
import { useCachedPlaces } from '../hooks/useCachedPlaces';

function PlacesList() {
  const { places, loading, refresh } = useCachedPlaces();

  return (
    <div>
      <button onClick={refresh}>Refresh Places</button>
      {loading ? <Skeleton /> : <PlaceList places={places} />}
    </div>
  );
}
```

## API Reference

### Hook Signature

```typescript
function useCachedPlaces(config?: UseCachedPlacesConfig): UseCachedPlacesResult
```

### Configuration Options

```typescript
interface UseCachedPlacesConfig {
  category?: PlaceCategory | 'all';  // Filter by category (default: 'all')
  isMobile?: boolean;                // Device type for adaptive limits (default: false)
  enableCache?: boolean;             // Enable/disable caching (default: true)
}
```

### Return Value

```typescript
interface UseCachedPlacesResult {
  places: Place[];           // Array of places
  loading: boolean;          // Loading state
  error: Error | null;       // Error state
  fromCache: boolean;        // Whether data came from cache
  refresh: () => void;       // Refresh data (invalidates cache)
  invalidateCache: () => void; // Invalidate cache without reloading
}
```

### Helper Functions

```typescript
// Invalidate places cache from anywhere in the app
function invalidatePlacesCache(): void
```

## Cache Behavior

### Cache Keys

- **All categories**: `places:all`
- **Specific category**: `places:cafe`, `places:restaurant`, etc.

### Cache TTL

- **Duration**: 300 seconds (5 minutes)
- **Storage**: sessionStorage (cleared on tab close)

### Cache Invalidation

Cache is automatically invalidated when:
- User creates a new place
- User updates a place
- User deletes a place
- `refresh()` is called
- `invalidateCache()` is called
- `invalidatePlacesCache()` is called

## Performance Optimization

### Adaptive Limits

| Device  | Limit | Reason                          |
|---------|-------|---------------------------------|
| Mobile  | 100   | Reduce memory usage and lag     |
| Desktop | 200   | Better UX with more data        |

### Database-Level Filtering

Category filtering is done at the database level using Firestore `where` clause:

```typescript
// ✅ Good: Filter at database level
query(collection(db, 'places'), where('category', '==', 'cafe'), limit(100))

// ❌ Bad: Filter client-side (fetches all places)
const allPlaces = await getDocs(collection(db, 'places'));
const cafes = allPlaces.filter(p => p.category === 'cafe');
```

### Cache-First Strategy

```
User Request → Check sessionStorage → Cache Hit? → Return instantly
                                    ↓ Cache Miss
                              Query Firestore → Store in cache → Return data
```

## Expected Performance Impact

### Before Optimization

- **Reads**: ~10K/day
- **Cache**: None
- **Load Time**: 500-1000ms per load

### After Optimization (Task 6.6)

- **Reads**: ~3K/day (70% reduction)
- **Cache Hit Rate**: ~70%
- **Load Time**: 5-10ms on cache hit, 500-1000ms on cache miss

## Testing

Run unit tests:

```bash
npm run test src/hooks/useCachedPlaces.test.ts
```

Test coverage:
- ✅ Basic functionality
- ✅ Adaptive limits (mobile/desktop)
- ✅ Category filtering
- ✅ Cache configuration
- ✅ Cache invalidation
- ✅ Refresh functionality
- ✅ Error handling
- ✅ Performance logging

## Integration with MapView and PlaceList

### MapView Integration

```typescript
// Before
useEffect(() => {
  const q = query(collection(db, 'places'), limit(200));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    setPlaces(snapshot.docs.map(doc => doc.data()));
  });
  return unsubscribe;
}, []);

// After
const { places, loading } = useCachedPlaces({
  category: selectedCategory,
  isMobile: window.innerWidth < 768,
});
```

### PlaceList Integration

```typescript
// Before
<PlaceList places={allPlaces} ... />

// After
const { places, loading, fromCache } = useCachedPlaces({
  category: selectedCategory,
  isMobile,
});

<PlaceList places={places} loading={loading} ... />
```

## Troubleshooting

### Cache Not Working

1. Check browser console for errors
2. Verify sessionStorage is not full
3. Check TTL hasn't expired (300s)
4. Ensure `enableCache` is not set to `false`

### Too Many Firestore Reads

1. Verify cache hit rate in console logs
2. Check if cache is being invalidated too frequently
3. Ensure TTL is appropriate (300s)
4. Monitor `fromCache` flag

### Category Filter Not Working

1. Verify category value is correct
2. Check Firestore data has `category` field
3. Ensure category matches PlaceCategory type
4. Check console logs for query configuration

## Related Files

- `src/utils/queryOptimizer.ts` - Query optimization logic
- `src/utils/cacheManager.ts` - Cache management logic
- `src/components/MapView.tsx` - Map component using this hook
- `src/components/PlaceList.tsx` - Place list component using this hook
- `src/types/index.ts` - Place and PlaceCategory types

## Migration Guide

See `.kiro/specs/tvu-connect-v260-optimization/TASK_6_MIGRATION_GUIDE.md` for step-by-step migration instructions.
