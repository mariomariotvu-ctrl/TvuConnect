# Design Document: Platform Performance Critical Fixes

## Overview

Document này mô tả thiết kế chi tiết cho việc khắc phục 8 vấn đề hiệu suất CRITICAL của nền tảng TVU Connect. Mục tiêu là giảm initial load từ 2.5s xuống 1.2s, tăng mobile FPS từ 18 lên 55, giảm memory leak từ 180MB xuống 85MB, và giảm Firestore reads từ 700/day xuống 250/day.

### Design Goals

1. **Memory Leak Prevention**: Triển khai ListenerRegistry để quản lý tập trung tất cả Firestore listeners, đảm bảo cleanup tự động
2. **Firestore Query Optimization**: Giảm số lượng reads thông qua pagination, caching, và composite indexes
3. **Component Re-render Optimization**: Sử dụng React.memo, useMemo, useCallback để giảm unnecessary re-renders
4. **Bundle Size Reduction**: Lazy loading cho heavy libraries (Leaflet, AIAssistant, React-Joyride)
5. **Mobile Performance**: Virtual scrolling, canvas rendering, và giới hạn markers trên mobile
6. **Caching Strategy**: Tăng TTL, cache warming, stale-while-revalidate
7. **Build Optimization**: Terser configuration để remove console.logs và optimize bundle
8. **Composite Indexes**: Tạo indexes cho tất cả queries phức tạp

### Success Metrics

- Initial Load: 2.5s → 1.2s (52% ⬇️)
- Mobile FPS: 18 → 55 (206% ⬆️)
- Memory Usage: 180MB → 85MB (53% ⬇️)
- Firestore Reads: 700/day → 250/day (64% ⬇️)
- Bundle Size: 450KB → 320KB (29% ⬇️)
- Chat Lag: 650ms → 150ms (77% ⬇️)

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TVU Connect Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   React UI   │  │  Components  │  │   Routing    │          │
│  │   Layer      │  │   (Memoized) │  │  (Lazy Load) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                  │
│                            │                                      │
│         ┌──────────────────▼──────────────────┐                 │
│         │   Performance Optimization Layer     │                 │
│         ├──────────────────────────────────────┤                 │
│         │  • ListenerRegistry (Memory Mgmt)    │                 │
│         │  • CacheManager (Browser Storage)    │                 │
│         │  • QueryOptimizer (Firestore)        │                 │
│         │  • React.memo / useMemo / useCallback│                 │
│         └──────────────────┬──────────────────┘                 │
│                            │                                      │
│         ┌──────────────────▼──────────────────┐                 │
│         │      Data Access Layer               │                 │
│         ├──────────────────────────────────────┤                 │
│         │  • useCachedMessages (Chat)          │                 │
│         │  • useCachedPosts (Feed)             │                 │
│         │  • useCachedPlaces (Map)             │                 │
│         │  • useCachedMatching (Profiles)      │                 │
│         └──────────────────┬──────────────────┘                 │
│                            │                                      │
│         ┌──────────────────▼──────────────────┐                 │
│         │         Firestore Database           │                 │
│         ├──────────────────────────────────────┤                 │
│         │  • Composite Indexes                 │                 │
│         │  • Query Limits (20-50 items)        │                 │
│         │  • Pagination Support                │                 │
│         └──────────────────────────────────────┘                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
User Action (e.g., Open Chat)
         │
         ▼
┌────────────────────┐
│  Chat Component    │
│  (React.memo)      │
└────────┬───────────┘
         │
         ▼
┌────────────────────────────┐
│  useCachedMessages Hook    │
│  • Check sessionStorage    │
│  • Return cached data      │
│  • Subscribe via Registry  │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  ListenerRegistry          │
│  • Check for duplicate     │
│  • Reuse or create new     │
│  • Track active count      │
│  • Auto-cleanup on unmount │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Firestore onSnapshot      │
│  • Limit: 50 messages      │
│  • OrderBy: createdAt desc │
│  • Composite Index         │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Update Cache & UI         │
│  • setCachedData()         │
│  • setState()              │
│  • Re-render (memoized)    │
└────────────────────────────┘
```

## Components and Interfaces

### 1. ListenerRegistry Enhancement

**Purpose**: Quản lý tập trung tất cả Firestore listeners để prevent memory leaks

**Current Implementation** (src/utils/listenerRegistry.ts):
```typescript
class ListenerRegistry {
  private listeners = new Map<string, ListenerEntry>();
  private readonly maxListeners = 10;
  
  register(entry: Omit<ListenerEntry, 'id' | 'createdAt'>): string
  unregister(id: string): void
  getCount(): number
  cleanup(): void
}
```

**Enhancement Design**:

```typescript
interface ListenerEntry {
  id: string;
  unsubscribe: () => void;
  collection: string;
  query: string;
  createdAt: number;
  priority: number;
  componentName?: string;
  conversationId?: string; // For Chat listeners
  userId?: string; // For user-specific listeners
}

class EnhancedListenerRegistry {
  private listeners = new Map<string, ListenerEntry>();
  private readonly maxListeners = 10;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Core Methods
  register(entry: Omit<ListenerEntry, 'id' | 'createdAt'>): string;
  unregister(id: string): void;
  unregisterByComponent(componentName: string): void;
  unregisterByConversation(conversationId: string): void;
  
  // Monitoring
  getActiveListenerCount(): number;
  getListenersByComponent(componentName: string): ListenerEntry[];
  getListenersByCollection(collection: string): ListenerEntry[];
  
  // Cleanup
  cleanup(): void; // Remove stale listeners (>5 min)
  cleanupAll(): void;
  evictLowestPriority(): void;
  
  // Duplicate Detection
  findDuplicate(entry: Omit<ListenerEntry, 'id' | 'createdAt'>): ListenerEntry | null;
  
  // Auto-cleanup
  startAutoCleanup(): void;
  stopAutoCleanup(): void;
}
```

**Integration Points**:
- Chat Component: Register message listeners với conversationId
- MapView Component: Register places/checkIns/events listeners
- Matching Component: Register profiles listeners
- All components: Auto-unregister on unmount

**Memory Leak Prevention Strategy**:
1. **Duplicate Detection**: Reuse existing listeners thay vì tạo mới
2. **Auto-cleanup**: Cleanup listeners cũ hơn 5 phút
3. **Component Tracking**: Track listeners theo component name
4. **Priority-based Eviction**: Evict low-priority listeners khi đạt max (10)
5. **Unmount Cleanup**: Auto-unregister khi component unmount

### 2. Firestore Query Optimization Strategy

**Current State**:
- MapView: Load 100-200 places (quá nhiều)
- Chat: Load tất cả messages (không giới hạn)
- PlaceList: Load tất cả places (không pagination)

**Optimized Strategy**:

```typescript
// Query Limits by Feature
const QUERY_LIMITS = {
  // Map & Places
  PLACES_MOBILE: 30,        // Mobile: 30 places
  PLACES_DESKTOP: 50,       // Desktop: 50 places
  PLACES_PAGINATION: 20,    // Load more: 20 at a time
  
  // Chat
  MESSAGES_INITIAL: 50,     // Initial load: 50 messages
  MESSAGES_LOAD_MORE: 30,   // Load more: 30 messages
  
  // Check-ins & Events
  CHECKINS_MOBILE: 30,      // Mobile: 30 check-ins
  CHECKINS_DESKTOP: 50,     // Desktop: 50 check-ins
  EVENTS_MOBILE: 5,         // Mobile: 5 events
  EVENTS_DESKTOP: 10,       // Desktop: 10 events
  
  // Matching
  PROFILES_PER_BATCH: 10,   // 10 profiles per batch
  
  // Posts Feed
  POSTS_INITIAL: 10,        // Initial: 10 posts
  POSTS_LOAD_MORE: 10,      // Load more: 10 posts
};
```

**Pagination Implementation**:

```typescript
interface PaginationState<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
}

// Example: PlaceList Pagination
const usePlacesPagination = () => {
  const [state, setState] = useState<PaginationState<Place>>({
    items: [],
    lastDoc: null,
    hasMore: true,
    loading: true,
    loadingMore: false,
  });
  
  const loadInitial = async () => {
    const q = query(
      collection(db, 'places'),
      orderBy('rating', 'desc'),
      limit(QUERY_LIMITS.PLACES_MOBILE)
    );
    // ... execute query
  };
  
  const loadMore = async () => {
    if (!state.hasMore || !state.lastDoc) return;
    
    const q = query(
      collection(db, 'places'),
      orderBy('rating', 'desc'),
      startAfter(state.lastDoc),
      limit(QUERY_LIMITS.PLACES_PAGINATION)
    );
    // ... execute query
  };
  
  return { ...state, loadMore };
};
```

**Geohash/Bounding Box for MapView**:

```typescript
// Calculate visible map bounds
const getMapBounds = (map: L.Map) => {
  const bounds = map.getBounds();
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };
};

// Query places within bounds
const queryPlacesInBounds = (bounds: MapBounds) => {
  // Option 1: Simple lat/lng filtering (client-side)
  const filtered = allPlaces.filter(place => 
    place.location.lat >= bounds.south &&
    place.location.lat <= bounds.north &&
    place.location.lng >= bounds.west &&
    place.location.lng <= bounds.east
  );
  
  // Option 2: Geohash (requires geohash field in Firestore)
  // const geohashes = getGeohashesForBounds(bounds);
  // const q = query(
  //   collection(db, 'places'),
  //   where('geohash', 'in', geohashes)
  // );
  
  return filtered;
};
```

### 3. Component Memoization Patterns

**React.memo Usage**:

```typescript
// MessageItem Component
export const MessageItem = memo<MessageItemProps>(({ msg, onDelete }) => {
  // Component logic
}, (prevProps, nextProps) => {
  // Custom comparison
  return prevProps.msg.id === nextProps.msg.id &&
         prevProps.msg.text === nextProps.msg.text &&
         prevProps.msg.read === nextProps.msg.read;
});

// PlaceCard Component
export const PlaceCard = memo<PlaceCardProps>(({ place, onCheckIn }) => {
  // Component logic
}, (prevProps, nextProps) => {
  return prevProps.place.id === nextProps.place.id &&
         prevProps.place.checkInCount === nextProps.place.checkInCount &&
         prevProps.place.currentVisitors === nextProps.place.currentVisitors;
});

// ProfileCard Component (Matching)
export const ProfileCard = memo<ProfileCardProps>(({ profile, onAction }) => {
  // Component logic
}, (prevProps, nextProps) => {
  return prevProps.profile.uid === nextProps.profile.uid;
});
```

**useMemo for Expensive Computations**:

```typescript
// AIAssistant: Memoize message list
const AIAssistant = () => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  
  // Memoize sorted and filtered messages
  const displayMessages = useMemo(() => {
    return messages
      .filter(m => !m.deleted)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);
  
  return (
    <div>
      {displayMessages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
    </div>
  );
};

// MapView: Memoize filtered places
const MapView = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  const filteredPlaces = useMemo(() => {
    if (selectedCategory === 'all') return places;
    return places.filter(p => p.category === selectedCategory);
  }, [places, selectedCategory]);
  
  return <Map places={filteredPlaces} />;
};
```

**useCallback for Event Handlers**:

```typescript
// Matching Component
const Matching = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  
  // Memoize callback to prevent re-renders
  const handleLike = useCallback((profileId: string) => {
    // Handle like logic
  }, []); // Empty deps = stable reference
  
  const handlePass = useCallback((profileId: string) => {
    // Handle pass logic
  }, []);
  
  return (
    <div>
      {profiles.map(profile => (
        <ProfileCard 
          key={profile.uid}
          profile={profile}
          onLike={handleLike}
          onPass={handlePass}
        />
      ))}
    </div>
  );
};
```

### 4. Lazy Loading Strategy

**Dynamic Imports for Heavy Libraries**:

```typescript
// Lazy load Leaflet (Map)
const MapView = lazy(() => import('./components/MapView'));

// Lazy load AIAssistant
const AIAssistant = lazy(() => import('./components/AIAssistant'));

// Lazy load React-Joyride (Onboarding)
const loadJoyride = async () => {
  const { default: Joyride } = await import('react-joyride');
  return Joyride;
};

// Usage in App.tsx
const App = () => {
  const [showMap, setShowMap] = useState(false);
  const [showAI, setShowAI] = useState(false);
  
  return (
    <Suspense fallback={<LoadingSpinner />}>
      {showMap && <MapView />}
      {showAI && <AIAssistant />}
    </Suspense>
  );
};
```

**Conditional Loading Based on User State**:

```typescript
// Only load Joyride if user hasn't completed onboarding
const OnboardingTour = () => {
  const [hasCompletedTour, setHasCompletedTour] = useState(false);
  const [Joyride, setJoyride] = useState<any>(null);
  
  useEffect(() => {
    // Check if user completed tour
    const completed = localStorage.getItem('onboarding_completed');
    setHasCompletedTour(completed === 'true');
    
    // Only load Joyride if not completed
    if (!completed) {
      import('react-joyride').then(module => {
        setJoyride(() => module.default);
      });
    }
  }, []);
  
  if (hasCompletedTour || !Joyride) return null;
  
  return <Joyride steps={tourSteps} />;
};
```

**Route-based Code Splitting**:

```typescript
// App.tsx
const Home = lazy(() => import('./pages/Home'));
const Profile = lazy(() => import('./pages/Profile'));
const Chat = lazy(() => import('./pages/Chat'));
const Explore = lazy(() => import('./pages/Explore'));
const Matching = lazy(() => import('./pages/Matching'));

const App = () => {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/matching" element={<Matching />} />
        </Routes>
      </Suspense>
    </Router>
  );
};
```

### 5. Mobile Optimization Techniques

**Virtual Scrolling for PlaceList**:

```typescript
import { FixedSizeList as List } from 'react-window';

const PlaceList = ({ places }: { places: Place[] }) => {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <PlaceCard place={places[index]} />
    </div>
  );
  
  return (
    <List
      height={600}
      itemCount={places.length}
      itemSize={120} // Height of each PlaceCard
      width="100%"
    >
      {Row}
    </List>
  );
};
```

**Canvas Rendering for MapView (Mobile)**:

```typescript
// MapView.tsx
const MapView = () => {
  const isMobile = useIsMobile();
  
  return (
    <MapContainer
      preferCanvas={isMobile} // Use Canvas on mobile for better performance
      zoomAnimation={!isMobile} // Disable animations on mobile
      fadeAnimation={!isMobile}
      markerZoomAnimation={!isMobile}
    >
      {/* Map content */}
    </MapContainer>
  );
};
```

**Marker Limiting on Mobile**:

```typescript
const MapView = () => {
  const isMobile = useIsMobile();
  const [places, setPlaces] = useState<Place[]>([]);
  
  // Limit markers on mobile
  const displayPlaces = useMemo(() => {
    if (!isMobile) return places;
    
    // Mobile: Show only top 30 places by rating
    return places
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 30);
  }, [places, isMobile]);
  
  return (
    <MapContainer>
      {displayPlaces.map(place => (
        <Marker key={place.id} position={[place.location.lat, place.location.lng]} />
      ))}
    </MapContainer>
  );
};
```

**Image Optimization**:

```typescript
// OptimizedImage Component
const OptimizedImage = ({ src, alt, ...props }: ImageProps) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Check if browser supports WebP
    const supportsWebP = document.createElement('canvas')
      .toDataURL('image/webp')
      .indexOf('data:image/webp') === 0;
    
    // Use WebP if supported, otherwise fallback to original
    const optimizedSrc = supportsWebP && src.includes('.jpg')
      ? src.replace('.jpg', '.webp')
      : src;
    
    setImageSrc(optimizedSrc);
  }, [src]);
  
  return (
    <>
      {isLoading && <ImageSkeleton />}
      <img
        src={imageSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setIsLoading(false)}
        {...props}
      />
    </>
  );
};
```

### 6. Cache Warming & Stale-While-Revalidate

**Cache Warming on App Startup**:

```typescript
// App.tsx
const App = () => {
  useEffect(() => {
    // Warm cache with frequently accessed data
    warmCache();
  }, []);
  
  const warmCache = async () => {
    try {
      // Pre-load top 20 places
      const placesQuery = query(
        collection(db, 'places'),
        orderBy('rating', 'desc'),
        limit(20)
      );
      const placesSnapshot = await getDocs(placesQuery);
      const places = placesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Store in cache
      setCachedData({
        key: 'places:top',
        ttl: 300000, // 5 minutes
        storage: 'sessionStorage',
      }, places);
      
      logger.log('[CacheWarming] Pre-loaded top 20 places');
    } catch (error) {
      logger.warn('[CacheWarming] Failed to warm cache:', error);
    }
  };
  
  return <AppContent />;
};
```

**Stale-While-Revalidate Strategy**:

```typescript
const useSWRCache = <T,>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttl: number = 300000
) => {
  const [data, setData] = useState<T | null>(null);
  const [isStale, setIsStale] = useState(false);
  
  useEffect(() => {
    const loadData = async () => {
      // 1. Check cache
      const cached = getCachedData<T>({
        key: cacheKey,
        ttl,
        storage: 'sessionStorage',
      });
      
      if (cached) {
        // Serve stale data immediately
        setData(cached);
        setIsStale(true);
        
        // Revalidate in background
        try {
          const fresh = await fetchFn();
          setData(fresh);
          setIsStale(false);
          
          // Update cache
          setCachedData({
            key: cacheKey,
            ttl,
            storage: 'sessionStorage',
          }, fresh);
        } catch (error) {
          logger.warn('[SWR] Revalidation failed, serving stale data');
        }
      } else {
        // No cache, fetch fresh
        const fresh = await fetchFn();
        setData(fresh);
        
        // Store in cache
        setCachedData({
          key: cacheKey,
          ttl,
          storage: 'sessionStorage',
        }, fresh);
      }
    };
    
    loadData();
  }, [cacheKey, ttl]);
  
  return { data, isStale };
};
```

### 7. Build Configuration Optimization

**Vite Config Enhancement** (vite.config.ts):

```typescript
export default defineConfig({
  build: {
    target: 'es2020',
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
      output: {
        manualChunks: (id) => {
          // React core - highest priority
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // Firebase - separate chunk
          if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
            return 'firebase-vendor';
          }
          // Map libraries - lazy loaded
          if (id.includes('node_modules/leaflet/') || id.includes('node_modules/react-leaflet/')) {
            return 'map-vendor';
          }
          // AI libraries - lazy loaded
          if (id.includes('node_modules/@google/generative-ai/')) {
            return 'ai-vendor';
          }
          // UI libraries
          if (id.includes('node_modules/lucide-react/') || id.includes('node_modules/sonner/')) {
            return 'ui-vendor';
          }
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,        // Remove console.log
        drop_debugger: true,       // Remove debugger
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        passes: 2,                 // Two compression passes
      },
      mangle: {
        safari10: true,
      },
    },
    cssCodeSplit: true,
    reportCompressedSize: true,
  },
});
```

**Logger Utility** (src/utils/logger.ts):

```typescript
const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors
    console.error(...args);
  },
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
};
```

### 8. Firestore Composite Indexes Design

**Required Composite Indexes**:

```json
{
  "indexes": [
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "conversationId", "order": "ASCENDING" },
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "places",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "rating", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "checkIns",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "placeId", "order": "ASCENDING" },
        { "fieldPath": "expiresAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "placeId", "order": "ASCENDING" },
        { "fieldPath": "startTime", "order": "ASCENDING" },
        { "fieldPath": "isPublic", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "posts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "profiles",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "gender", "order": "ASCENDING" },
        { "fieldPath": "majorNormalized", "order": "ASCENDING" },
        { "fieldPath": "academicYear", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Data Models

### ListenerEntry

```typescript
interface ListenerEntry {
  id: string;                    // Unique listener ID
  unsubscribe: () => void;       // Cleanup function
  collection: string;            // Firestore collection name
  query: string;                 // Query description
  createdAt: number;             // Timestamp
  priority: number;              // Priority (1-10, higher = more important)
  componentName?: string;        // Component that created listener
  conversationId?: string;       // For Chat listeners
  userId?: string;               // For user-specific listeners
}
```

### CacheConfig

```typescript
interface CacheConfig {
  key: string;                   // Cache key
  ttl: number;                   // Time-to-live (milliseconds)
  storage: 'localStorage' | 'sessionStorage';
}
```

### QueryConfig

```typescript
interface QueryConfig {
  collection: string;            // Firestore collection
  limit: number;                 // Query limit (max 100)
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  where?: Array<{
    field: string;
    operator: WhereFilterOp;
    value: any;
  }>;
  startAfter?: DocumentSnapshot; // Pagination cursor
}
```

### PaginationState

```typescript
interface PaginationState<T> {
  items: T[];                    // Current items
  lastDoc: DocumentSnapshot | null; // Last document for pagination
  hasMore: boolean;              // More items available
  loading: boolean;              // Initial loading
  loadingMore: boolean;          // Loading more items
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*



### Acceptance Criteria Testing Prework

**Requirement 1: Memory Leak Prevention System**

1.1 THE ListenerRegistry SHALL quản lý tất cả Firestore listeners trong Platform
  Thoughts: Đây là requirement về kiến trúc hệ thống. Chúng ta có thể test bằng cách verify rằng tất cả listeners được tạo thông qua ListenerRegistry
  Testable: yes - property

1.2 WHEN một component unmount, THE ListenerRegistry SHALL tự động cleanup tất cả listeners của component đó
  Thoughts: Đây là property về lifecycle management. Chúng ta có thể test bằng cách mount/unmount component và verify listener count giảm
  Testable: yes - property

1.3 THE Chat_Component SHALL sử dụng ListenerRegistry để đăng ký tất cả listeners
  Thoughts: Đây là requirement implementation-specific. Chúng ta có thể verify bằng code inspection hoặc integration test
  Testable: yes - example

1.4 THE MapView_Component SHALL sử dụng ListenerRegistry để đăng ký tất cả onSnapshot listeners
  Thoughts: Tương tự 1.3, đây là requirement implementation-specific
  Testable: yes - example

1.5 WHEN Platform chạy trong 60 phút, THE Memory_Usage SHALL không tăng quá 10MB so với baseline
  Thoughts: Đây là performance test. Chúng ta có thể test bằng cách chạy app trong 60 phút và measure memory
  Testable: yes - property

1.6 THE ListenerRegistry SHALL cung cấp method getActiveListenerCount() để monitoring
  Thoughts: Đây là API requirement. Chúng ta có thể test bằng unit test
  Testable: yes - example

1.7 WHEN một listener bị duplicate, THE ListenerRegistry SHALL reuse listener hiện có thay vì tạo mới
  Thoughts: Đây là property về duplicate detection. Chúng ta có thể test bằng cách tạo duplicate listeners và verify count không tăng
  Testable: yes - property

1.8 THE Platform SHALL log warning WHEN số lượng active listeners vượt quá 10
  Thoughts: Đây là logging requirement. Chúng ta có thể test bằng cách mock logger và verify warning được gọi
  Testable: yes - example

**Requirement 2: Firestore Query Optimization**

2.1 THE MapView SHALL giới hạn places query ở 20-30 items thay vì 100-200
  Thoughts: Đây là query limit requirement. Chúng ta có thể test bằng cách verify query limit parameter
  Testable: yes - example

2.2 THE Chat SHALL giới hạn messages query ở 50 messages mới nhất
  Thoughts: Tương tự 2.1, đây là query limit requirement
  Testable: yes - example

2.3 THE PlaceList SHALL implement pagination với 20 items per page
  Thoughts: Đây là pagination requirement. Chúng ta có thể test bằng cách verify pagination behavior
  Testable: yes - property

2.4 WHEN user scroll đến cuối list, THE PlaceList SHALL tự động load thêm 20 items tiếp theo
  Thoughts: Đây là UI interaction test. Chúng ta có thể test bằng cách simulate scroll và verify load more được gọi
  Testable: yes - property

2.5 THE Platform SHALL tạo composite indexes cho tất cả queries phức tạp
  Thoughts: Đây là infrastructure requirement. Chúng ta có thể verify bằng checking firestore.indexes.json
  Testable: yes - example

2.6 THE MapView SHALL sử dụng geohash hoặc bounding box để query places trong khu vực visible
  Thoughts: Đây là optimization technique. Chúng ta có thể test bằng cách verify filtered results chỉ chứa places trong bounds
  Testable: yes - property

2.7 THE Platform SHALL cache Firestore query results với TTL 5 phút
  Thoughts: Đây là caching requirement. Chúng ta có thể test bằng round-trip: query → cache → retrieve
  Testable: yes - property

2.8 WHEN cache hit, THE Platform SHALL không thực hiện Firestore read
  Thoughts: Đây là cache effectiveness test. Chúng ta có thể test bằng cách mock Firestore và verify không có read khi cache hit
  Testable: yes - property

2.9 THE Platform SHALL giảm Firestore reads từ 700/day xuống 250/day
  Thoughts: Đây là performance metric. Chúng ta có thể measure trong 24h period
  Testable: yes - property (metamorphic)

**Requirement 3: Component Re-render Optimization**

3.1 THE Matching_Component SHALL sử dụng React.memo để prevent re-renders khi filters không thay đổi
  Thoughts: Đây là React optimization. Chúng ta có thể test bằng React DevTools Profiler hoặc render count
  Testable: yes - property

3.2 THE MapView SHALL sử dụng React.memo cho marker components
  Thoughts: Tương tự 3.1
  Testable: yes - example

3.3 THE MapView SHALL chỉ re-render markers khi places data thay đổi
  Thoughts: Đây là re-render optimization. Chúng ta có thể test bằng cách change map position và verify markers không re-render
  Testable: yes - property

3.4 THE AIAssistant SHALL sử dụng useMemo để memoize message list
  Thoughts: Đây là React optimization. Chúng ta có thể test bằng checking reference equality
  Testable: yes - example

3.5 THE PlaceList SHALL sử dụng React.memo cho PlaceCard components
  Thoughts: Tương tự 3.1
  Testable: yes - example

3.6 WHEN filters thay đổi, THE Matching_Component SHALL chỉ re-render filtered results
  Thoughts: Đây là selective re-render test. Chúng ta có thể test bằng React DevTools Profiler
  Testable: yes - property

3.7 THE Platform SHALL giảm CPU usage từ 50-70% xuống dưới 30% trên mobile
  Thoughts: Đây là performance metric. Chúng ta có thể measure trên real device
  Testable: yes - property (metamorphic)

3.8 THE Platform SHALL đạt Mobile_FPS từ 55 trở lên
  Thoughts: Đây là performance metric. Chúng ta có thể measure FPS trên mobile
  Testable: yes - property (metamorphic)

**Requirement 4: Bundle Size & Code Splitting Optimization**

4.1 THE Platform SHALL lazy load Leaflet library chỉ khi user mở Map tab
  Thoughts: Đây là lazy loading test. Chúng ta có thể test bằng cách verify Leaflet không load cho đến khi Map tab được mở
  Testable: yes - property

4.2 THE Platform SHALL lazy load AIAssistant component chỉ khi user mở AI tab
  Thoughts: Tương tự 4.1
  Testable: yes - property

4.3 THE Platform SHALL lazy load React_Joyride chỉ khi user chưa hoàn thành onboarding
  Thoughts: Đây là conditional loading. Chúng ta có thể test bằng cách verify Joyride không load khi onboarding completed
  Testable: yes - property

4.4 WHEN user đã hoàn thành onboarding, THE Platform SHALL không load React_Joyride
  Thoughts: Đây là edge case của 4.3
  Testable: edge-case

4.5 THE Platform SHALL giảm Initial_Bundle_Size từ 450KB xuống 320KB
  Thoughts: Đây là build output metric. Chúng ta có thể measure bundle size sau build
  Testable: yes - property (metamorphic)

4.6 THE Platform SHALL implement route-based code splitting cho các pages chính
  Thoughts: Đây là architecture requirement. Chúng ta có thể verify bằng checking build output chunks
  Testable: yes - example

4.7 THE Platform SHALL sử dụng dynamic imports cho tất cả heavy libraries
  Thoughts: Đây là implementation requirement. Chúng ta có thể verify bằng code inspection
  Testable: yes - example

4.8 THE Platform SHALL đạt Initial_Load time dưới 1.5 giây
  Thoughts: Đây là performance metric. Chúng ta có thể measure load time
  Testable: yes - property (metamorphic)

**Requirement 5: Mobile Performance Optimization**

5.1 THE MapView SHALL giới hạn số lượng markers hiển thị ở 30 trên mobile
  Thoughts: Đây là mobile-specific limit. Chúng ta có thể test bằng cách verify marker count trên mobile
  Testable: yes - example

5.2 THE MapView SHALL sử dụng preferCanvas option cho Leaflet trên mobile
  Thoughts: Đây là configuration requirement. Chúng ta có thể verify bằng checking Leaflet config
  Testable: yes - example

5.3 THE PlaceList SHALL implement virtual scrolling để chỉ render 10-15 items visible
  Thoughts: Đây là virtual scrolling requirement. Chúng ta có thể test bằng cách verify DOM chỉ chứa visible items
  Testable: yes - property

5.4 WHEN user scroll, THE PlaceList SHALL dynamically render/unmount items
  Thoughts: Đây là virtual scrolling behavior. Chúng ta có thể test bằng cách simulate scroll và verify DOM changes
  Testable: yes - property

5.5 THE Platform SHALL optimize images với lazy loading và responsive sizes
  Thoughts: Đây là image optimization. Chúng ta có thể test bằng cách verify images có loading="lazy" attribute
  Testable: yes - example

5.6 THE Platform SHALL sử dụng WebP format cho images khi browser hỗ trợ
  Thoughts: Đây là conditional image format. Chúng ta có thể test bằng cách verify WebP được sử dụng khi supported
  Testable: yes - property

5.7 THE Platform SHALL đạt Mobile_FPS từ 55 trở lên
  Thoughts: Duplicate của 3.8
  Testable: yes - property (metamorphic)

5.8 THE Platform SHALL giảm memory usage từ 180MB xuống 85MB trên mobile
  Thoughts: Đây là memory metric. Chúng ta có thể measure trên real device
  Testable: yes - property (metamorphic)

**Requirement 6: Caching Strategy Enhancement**

6.1 THE Platform SHALL tăng Cache_TTL từ 60s lên 300s cho places data
  Thoughts: Đây là configuration change. Chúng ta có thể verify bằng checking cache TTL
  Testable: yes - example

6.2 THE Platform SHALL implement cache warming cho frequently accessed data
  Thoughts: Đây là cache warming test. Chúng ta có thể test bằng cách verify cache được populated on startup
  Testable: yes - property

6.3 WHEN app khởi động, THE Platform SHALL pre-load top 20 places vào cache
  Thoughts: Đây là specific cache warming requirement. Chúng ta có thể test bằng cách verify cache contains top 20 places after startup
  Testable: yes - example

6.4 THE Viewed_Profiles_Cache SHALL persist trong sessionStorage thay vì memory
  Thoughts: Đây là storage location requirement. Chúng ta có thể test bằng cách verify data trong sessionStorage
  Testable: yes - example

6.5 THE Platform SHALL implement stale-while-revalidate strategy cho non-critical data
  Thoughts: Đây là caching strategy. Chúng ta có thể test bằng cách verify stale data được served ngay lập tức và fresh data được fetch ở background
  Testable: yes - property

6.6 WHEN cache expired, THE Platform SHALL serve stale data và fetch fresh data ở background
  Thoughts: Đây là specific behavior của stale-while-revalidate
  Testable: yes - property

6.7 THE Platform SHALL giảm Firestore reads từ 700/day xuống 250/day
  Thoughts: Duplicate của 2.9
  Testable: yes - property (metamorphic)

6.8 THE Platform SHALL track cache hit rate và log khi hit rate < 60%
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock logger và verify warning được gọi
  Testable: yes - property

**Requirement 7: Console Logs & Debug Code Cleanup**

7.1 THE Platform SHALL remove tất cả console.log() statements trong production build
  Thoughts: Đây là build output requirement. Chúng ta có thể verify bằng searching production bundle
  Testable: yes - example

7.2 THE Platform SHALL sử dụng logger utility consistently thay vì console.log()
  Thoughts: Đây là code quality requirement. Chúng ta có thể verify bằng code inspection
  Testable: yes - example

7.3 THE Logger SHALL tự động disable trong production environment
  Thoughts: Đây là logger behavior. Chúng ta có thể test bằng cách verify logger.log() không output trong production
  Testable: yes - property

7.4 THE Platform SHALL remove tất cả debug code và commented code
  Thoughts: Đây là code cleanup requirement. Chúng ta có thể verify bằng code inspection
  Testable: no

7.5 THE Platform SHALL giảm Bundle_Size thêm 20-30KB sau khi cleanup
  Thoughts: Đây là bundle size metric. Chúng ta có thể measure trước và sau cleanup
  Testable: yes - property (metamorphic)

7.6 THE Vite_Config SHALL configure terser để drop_console trong production
  Thoughts: Đây là configuration requirement. Chúng ta có thể verify bằng checking vite.config.ts
  Testable: yes - example

7.7 THE Platform SHALL sử dụng logger.debug() cho debug logs thay vì console.log()
  Thoughts: Đây là code quality requirement. Chúng ta có thể verify bằng code inspection
  Testable: yes - example

7.8 THE Platform SHALL chỉ log errors và warnings trong production
  Thoughts: Đây là logging policy. Chúng ta có thể test bằng cách verify chỉ có error/warn logs trong production
  Testable: yes - property

**Requirement 8: Firestore Rules & Indexes Optimization**

8.1 THE Platform SHALL tạo composite indexes cho tất cả queries với multiple where clauses
  Thoughts: Đây là infrastructure requirement. Chúng ta có thể verify bằng checking firestore.indexes.json
  Testable: yes - example

8.2 THE Platform SHALL tạo composite index cho messages query (conversationId + createdAt)
  Thoughts: Đây là specific index requirement
  Testable: yes - example

8.3 THE Platform SHALL tạo composite index cho places query (category + rating)
  Thoughts: Đây là specific index requirement
  Testable: yes - example

8.4 THE Platform SHALL tạo composite index cho checkIns query (placeId + expiresAt)
  Thoughts: Đây là specific index requirement
  Testable: yes - example

8.5 THE Firestore_Rules SHALL implement rate limiting để prevent abuse
  Thoughts: Đây là security requirement. Chúng ta có thể test bằng cách send rapid requests và verify rate limit
  Testable: yes - property

8.6 THE Firestore_Rules SHALL giới hạn query size ở maximum 100 documents
  Thoughts: Đây là query limit enforcement. Chúng ta có thể test bằng cách attempt query > 100 và verify rejection
  Testable: yes - property

8.7 WHEN query không có proper index, THE Platform SHALL log warning và suggest index
  Thoughts: Đây là developer experience requirement. Chúng ta có thể test bằng cách execute unindexed query và verify warning
  Testable: yes - property

8.8 THE Platform SHALL giảm query latency từ 500-800ms xuống dưới 200ms
  Thoughts: Đây là performance metric. Chúng ta có thể measure query latency
  Testable: yes - property (metamorphic)

**Requirement 9: Chat Performance Optimization**

9.1 THE Chat SHALL sử dụng useCachedMessages hook với single active listener
  Thoughts: Đây là implementation requirement. Chúng ta có thể verify bằng checking listener count
  Testable: yes - example

9.2 THE Chat SHALL implement message pagination với 50 messages per load
  Thoughts: Đây là pagination requirement. Chúng ta có thể verify bằng checking query limit
  Testable: yes - example

9.3 WHEN user scroll lên, THE Chat SHALL tự động load thêm 50 messages cũ hơn
  Thoughts: Đây là pagination behavior. Chúng ta có thể test bằng cách simulate scroll và verify load more
  Testable: yes - property

9.4 THE Chat SHALL sử dụng React.memo cho MessageItem components
  Thoughts: Đây là React optimization. Chúng ta có thể verify bằng code inspection
  Testable: yes - example

9.5 THE Chat SHALL debounce typing indicator updates (2 giây)
  Thoughts: Đây là debounce requirement. Chúng ta có thể test bằng cách rapid typing và verify updates được debounced
  Testable: yes - property

9.6 THE Chat SHALL giảm Chat_Lag từ 650ms xuống 150ms
  Thoughts: Đây là performance metric. Chúng ta có thể measure message send latency
  Testable: yes - property (metamorphic)

9.7 THE Chat SHALL optimize scroll behavior để không scroll khi delete message
  Thoughts: Đây là UI behavior. Chúng ta có thể test bằng cách delete message và verify scroll position unchanged
  Testable: yes - property

9.8 THE Chat SHALL cache conversation list với TTL 5 phút
  Thoughts: Đây là caching requirement. Chúng ta có thể verify bằng checking cache
  Testable: yes - example

**Requirement 10: Performance Monitoring & Metrics**

10.1 THE Platform SHALL track Initial_Load time và log khi > 1.5 giây
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock slow load và verify log
  Testable: yes - property

10.2 THE Platform SHALL track Mobile_FPS và log khi < 50 FPS
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock low FPS và verify log
  Testable: yes - property

10.3 THE Platform SHALL track Memory_Usage và log khi tăng > 100MB
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock high memory và verify log
  Testable: yes - property

10.4 THE Platform SHALL track Firestore_Reads per day và log khi > 300 reads
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock high reads và verify log
  Testable: yes - property

10.5 THE Platform SHALL track Cache_Hit_Rate và log khi < 60%
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock low hit rate và verify log
  Testable: yes - property

10.6 THE Platform SHALL track Component_Render_Count và log khi > 100 renders/second
  Thoughts: Đây là monitoring requirement. Chúng ta có thể test bằng cách mock high render count và verify log
  Testable: yes - property

10.7 THE Platform SHALL expose performance metrics qua /api/metrics endpoint
  Thoughts: Đây là API requirement. Chúng ta có thể test bằng cách call endpoint và verify response
  Testable: yes - example

10.8 THE Platform SHALL send performance alerts khi metrics vượt threshold
  Thoughts: Đây là alerting requirement. Chúng ta có thể test bằng cách mock threshold breach và verify alert
  Testable: yes - property

### Property Reflection

Sau khi review tất cả properties, tôi nhận thấy các redundancies sau:

**Redundant Properties:**
1. **Requirement 2.9 và 6.7**: Cả hai đều test "giảm Firestore reads từ 700/day xuống 250/day" → Combine thành 1 property
2. **Requirement 3.8 và 5.7**: Cả hai đều test "Mobile FPS từ 55 trở lên" → Combine thành 1 property
3. **Requirement 3.1, 3.2, 3.4, 3.5**: Tất cả đều test React.memo/useMemo usage → Combine thành 1 comprehensive property về "Component memoization prevents unnecessary re-renders"
4. **Requirement 4.1, 4.2, 4.3**: Tất cả đều test lazy loading → Combine thành 1 property về "Heavy libraries are lazy loaded only when needed"
5. **Requirement 8.2, 8.3, 8.4**: Tất cả đều test specific composite indexes → Combine thành 1 example test verifying all required indexes exist

**Properties to Keep (After Consolidation):**
- Memory leak prevention (1.2, 1.5, 1.7)
- Firestore query optimization (2.3, 2.4, 2.6, 2.7, 2.8, 2.9)
- Component re-render optimization (3.1 consolidated, 3.3, 3.6, 3.7, 3.8 consolidated)
- Bundle size & lazy loading (4.1 consolidated, 4.5, 4.8)
- Mobile optimization (5.3, 5.4, 5.6, 5.8)
- Caching strategy (6.2, 6.5, 6.6, 6.8)
- Console logs cleanup (7.3, 7.5, 7.8)
- Firestore optimization (8.5, 8.6, 8.7, 8.8)
- Chat optimization (9.3, 9.5, 9.6, 9.7)
- Performance monitoring (10.1-10.6, 10.8)

### Property 1: Listener Cleanup on Component Unmount (Invariant)

*For any* React component that registers Firestore listeners through ListenerRegistry, when the component unmounts, all listeners registered by that component should be automatically cleaned up and the active listener count should decrease accordingly.

**Validates: Requirements 1.2**

### Property 2: Memory Stability Over Time (Invariant)

*For any* 60-minute continuous usage session with typical user behavior (navigating between tabs, opening/closing components), the memory usage increase should not exceed 10MB from the baseline.

**Validates: Requirements 1.5**

### Property 3: Listener Deduplication (Invariant)

*For any* duplicate listener registration attempt (same collection, same query parameters), the ListenerRegistry should reuse the existing listener instead of creating a new one, and the active listener count should remain unchanged.

**Validates: Requirements 1.7**

### Property 4: Pagination Load More Behavior (Round Trip)

*For any* paginated list (PlaceList, Chat messages), when the user scrolls to the end and triggers load more, the system should fetch the next batch of items and append them to the existing list without duplicates.

**Validates: Requirements 2.3, 2.4, 9.3**

### Property 5: Geospatial Query Filtering (Invariant)

*For any* map bounds (north, south, east, west coordinates), all places returned by the geospatial query should have coordinates within those bounds.

**Validates: Requirements 2.6**

### Property 6: Cache-First Strategy Effectiveness (Round Trip)

*For any* Firestore query with caching enabled, the first request should fetch from Firestore and store in cache, and the second request within TTL should return cached data without hitting Firestore.

**Validates: Requirements 2.7, 2.8**

### Property 7: Firestore Reads Reduction (Metamorphic)

*For any* 24-hour measurement period after optimization, the total Firestore reads should be less than 40% of the pre-optimization baseline (700 reads → target < 280 reads).

**Validates: Requirements 2.9, 6.7**

### Property 8: Component Memoization Prevents Re-renders (Invariant)

*For any* memoized component (MessageItem, PlaceCard, ProfileCard, Marker), when props remain unchanged (deep equality), the component should not re-render.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5**

### Property 9: Selective Re-render on State Change (Invariant)

*For any* component with multiple child components, when a specific piece of state changes (e.g., filters in Matching), only the components that depend on that state should re-render, not the entire component tree.

**Validates: Requirements 3.3, 3.6**

### Property 10: Mobile FPS Performance (Metamorphic)

*For any* mobile device running the optimized platform, the average FPS during typical usage (scrolling, navigating, interacting) should be at least 300% of the pre-optimization baseline (18 FPS → target ≥ 54 FPS).

**Validates: Requirements 3.8, 5.7**

### Property 11: Lazy Loading Conditional Execution (Invariant)

*For any* heavy library (Leaflet, AIAssistant, React-Joyride), the library should only be loaded when its corresponding feature is accessed (Map tab opened, AI tab opened, onboarding not completed), and should not be included in the initial bundle.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 12: Bundle Size Reduction (Metamorphic)

*For any* production build after optimization, the initial bundle size should be less than 75% of the pre-optimization baseline (450KB → target < 337.5KB, actual target 320KB).

**Validates: Requirements 4.5**

### Property 13: Initial Load Time Reduction (Metamorphic)

*For any* page load after optimization, the time from navigation to interactive should be less than 60% of the pre-optimization baseline (2.5s → target < 1.5s, actual target 1.2s).

**Validates: Requirements 4.8**

### Property 14: Virtual Scrolling DOM Efficiency (Invariant)

*For any* long list with virtual scrolling enabled (PlaceList), the number of DOM elements rendered should be proportional to the viewport size (10-15 items), not the total list size, regardless of how many items are in the data array.

**Validates: Requirements 5.3, 5.4**

### Property 15: WebP Format Conditional Usage (Invariant)

*For any* image element in the platform, if the browser supports WebP format, the image source should use WebP; otherwise, it should fallback to the original format (JPEG/PNG).

**Validates: Requirements 5.6**

### Property 16: Mobile Memory Usage Reduction (Metamorphic)

*For any* mobile device after 60 minutes of usage, the memory consumption should be less than 50% of the pre-optimization baseline (180MB → target < 90MB, actual target 85MB).

**Validates: Requirements 5.8**

### Property 17: Cache Warming on Startup (Invariant)

*For any* app startup, the cache should be pre-populated with frequently accessed data (top 20 places) before the user navigates to the relevant feature, and subsequent requests should hit the cache.

**Validates: Requirements 6.2, 6.3**

### Property 18: Stale-While-Revalidate Behavior (Round Trip)

*For any* cached data that has expired, the system should immediately serve the stale data to the user, then fetch fresh data in the background and update the cache, ensuring the user sees instant results.

**Validates: Requirements 6.5, 6.6**

### Property 19: Cache Hit Rate Monitoring (Invariant)

*For any* 24-hour measurement period, the cache hit rate (hits / (hits + misses)) should be at least 60%, and the system should log a warning if the hit rate falls below this threshold.

**Validates: Requirements 6.8**

### Property 20: Logger Production Behavior (Invariant)

*For any* production build, logger.log() and logger.debug() calls should not produce any console output, while logger.error() and logger.warn() should still output to the console.

**Validates: Requirements 7.3, 7.8**

### Property 21: Console Logs Removal Bundle Impact (Metamorphic)

*For any* production build after console.log removal, the bundle size should be at least 20KB smaller than a build with console.logs included.

**Validates: Requirements 7.5**

### Property 22: Firestore Query Rate Limiting (Error Condition)

*For any* user attempting to execute more than the allowed number of queries within the rate limit window, the Firestore rules should reject the excess queries with a permission-denied error.

**Validates: Requirements 8.5**

### Property 23: Query Size Limit Enforcement (Error Condition)

*For any* Firestore query attempting to fetch more than 100 documents, the query should either be rejected by Firestore rules or automatically capped at 100 by the query optimizer.

**Validates: Requirements 8.6**

### Property 24: Missing Index Warning (Invariant)

*For any* Firestore query that requires a composite index but doesn't have one, the system should log a warning message suggesting the required index configuration.

**Validates: Requirements 8.7**

### Property 25: Query Latency Reduction (Metamorphic)

*For any* Firestore query after index optimization, the average query latency should be less than 40% of the pre-optimization baseline (500-800ms → target < 320ms, actual target < 200ms).

**Validates: Requirements 8.8**

### Property 26: Chat Typing Indicator Debouncing (Invariant)

*For any* rapid typing sequence in the chat input (multiple keystrokes within 2 seconds), the typing indicator update to Firestore should be debounced and only sent once every 2 seconds, not on every keystroke.

**Validates: Requirements 9.5**

### Property 27: Chat Message Send Latency Reduction (Metamorphic)

*For any* message sent in chat after optimization, the time from send button click to message appearing in the UI should be less than 25% of the pre-optimization baseline (650ms → target < 162.5ms, actual target 150ms).

**Validates: Requirements 9.6**

### Property 28: Chat Scroll Preservation on Delete (Invariant)

*For any* message deletion in chat, the scroll position should remain unchanged (not auto-scroll to bottom), preserving the user's current reading position.

**Validates: Requirements 9.7**

### Property 29: Performance Metric Threshold Monitoring (Invariant)

*For any* performance metric (Initial Load, Mobile FPS, Memory Usage, Firestore Reads, Cache Hit Rate, Component Render Count), when the metric exceeds its defined threshold, the system should log a warning or send an alert.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8**

## Error Handling

### Memory Leak Detection

**Strategy**: Monitor active listener count và memory usage

```typescript
// ListenerRegistry monitoring
class EnhancedListenerRegistry {
  getActiveListenerCount(): number {
    const count = this.listeners.size;
    
    // Warning if exceeds threshold
    if (count > this.maxListeners) {
      logger.warn(`[ListenerRegistry] Active listeners (${count}) exceeds max (${this.maxListeners})`);
    }
    
    return count;
  }
  
  // Periodic memory check
  startMemoryMonitoring() {
    setInterval(() => {
      if (performance.memory) {
        const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
        if (usedMB > 150) {
          logger.warn(`[Memory] High memory usage: ${usedMB.toFixed(2)}MB`);
        }
      }
    }, 60000); // Check every minute
  }
}
```

### Firestore Query Errors

**Strategy**: Graceful degradation với cached data

```typescript
const loadDataWithFallback = async () => {
  try {
    // Try to fetch from Firestore
    const data = await fetchFromFirestore();
    return data;
  } catch (error) {
    logger.error('[Firestore] Query failed:', error);
    
    // Fallback to cached data
    const cached = getCachedData(cacheConfig);
    if (cached) {
      logger.log('[Firestore] Serving stale cached data due to error');
      return cached;
    }
    
    // No cache available
    throw new Error('Unable to load data: Firestore unavailable and no cache');
  }
};
```

### Cache Storage Quota Exceeded

**Strategy**: LRU eviction và graceful degradation

```typescript
const setCachedDataSafe = (config: CacheConfig, data: any) => {
  try {
    setCachedData(config, data);
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      logger.warn('[Cache] Storage quota exceeded, evicting oldest entries');
      
      // Evict 20% oldest entries
      evictOldestEntries(config.storage, 0.2);
      
      // Retry
      try {
        setCachedData(config, data);
      } catch (retryError) {
        logger.error('[Cache] Failed to cache even after eviction');
        // Continue without caching
      }
    }
  }
};
```

### Lazy Loading Failures

**Strategy**: Fallback UI và error boundaries

```typescript
const LazyComponent = lazy(() => 
  import('./HeavyComponent').catch(error => {
    logger.error('[LazyLoad] Failed to load component:', error);
    
    // Return fallback component
    return {
      default: () => (
        <div className="error-fallback">
          <p>Unable to load component. Please refresh the page.</p>
        </div>
      )
    };
  })
);

// Error Boundary wrapper
<ErrorBoundary fallback={<ComponentErrorFallback />}>
  <Suspense fallback={<LoadingSpinner />}>
    <LazyComponent />
  </Suspense>
</ErrorBoundary>
```

### Performance Degradation Detection

**Strategy**: Automatic performance monitoring và alerts

```typescript
class PerformanceMonitor {
  private metrics = {
    initialLoad: 0,
    fps: 0,
    memory: 0,
    firestoreReads: 0,
    cacheHitRate: 0,
  };
  
  private thresholds = {
    initialLoad: 1500,      // 1.5s
    fps: 50,                // 50 FPS
    memory: 100,            // 100MB increase
    firestoreReads: 300,    // 300 reads/day
    cacheHitRate: 0.6,      // 60%
  };
  
  checkThresholds() {
    Object.entries(this.metrics).forEach(([metric, value]) => {
      const threshold = this.thresholds[metric];
      
      if (metric === 'cacheHitRate') {
        if (value < threshold) {
          this.sendAlert(`Cache hit rate (${(value * 100).toFixed(1)}%) below threshold (${(threshold * 100)}%)`);
        }
      } else if (metric === 'fps') {
        if (value < threshold) {
          this.sendAlert(`FPS (${value}) below threshold (${threshold})`);
        }
      } else {
        if (value > threshold) {
          this.sendAlert(`${metric} (${value}) exceeds threshold (${threshold})`);
        }
      }
    });
  }
  
  sendAlert(message: string) {
    logger.warn(`[PerformanceAlert] ${message}`);
    
    // Send to monitoring service (e.g., Sentry, LogRocket)
    if (window.Sentry) {
      window.Sentry.captureMessage(message, 'warning');
    }
  }
}
```

## Testing Strategy

### Dual Testing Approach

Platform performance optimization yêu cầu cả **unit tests** và **property-based tests** để đảm bảo correctness và performance:

**Unit Tests** - Verify specific examples và edge cases:
- ListenerRegistry API methods (register, unregister, getCount)
- Cache Manager operations (get, set, invalidate)
- Query Optimizer limit enforcement
- Logger behavior in dev vs production
- Composite index configuration

**Property-Based Tests** - Verify universal properties:
- Memory stability over time (Property 2)
- Listener deduplication (Property 3)
- Cache-first strategy (Property 6)
- Component memoization (Property 8)
- Virtual scrolling efficiency (Property 14)
- Stale-while-revalidate (Property 18)
- Debouncing behavior (Property 26)

### Property-Based Testing Configuration

**Library**: fast-check (JavaScript/TypeScript property-based testing)

**Configuration**:
```typescript
import fc from 'fast-check';

// Minimum 100 iterations per property test
fc.assert(
  fc.property(
    // Generators
    fc.array(fc.record({ /* ... */ })),
    // Test function
    (data) => {
      // Property assertion
    }
  ),
  { numRuns: 100 } // Minimum 100 iterations
);
```

**Test Tags**: Mỗi property test phải reference design document property

```typescript
/**
 * Feature: platform-performance-critical-fixes
 * Property 3: Listener Deduplication
 * 
 * For any duplicate listener registration attempt, the ListenerRegistry
 * should reuse the existing listener instead of creating a new one.
 */
test('Property 3: Listener deduplication', () => {
  fc.assert(
    fc.property(
      fc.record({
        collection: fc.constantFrom('messages', 'posts', 'places'),
        query: fc.string(),
        componentName: fc.string(),
      }),
      (listenerConfig) => {
        const registry = new ListenerRegistry();
        
        // Register listener twice
        const id1 = registry.register({
          unsubscribe: () => {},
          ...listenerConfig,
          priority: 5,
        });
        
        const id2 = registry.register({
          unsubscribe: () => {},
          ...listenerConfig,
          priority: 5,
        });
        
        // Should return same ID (reused)
        expect(id1).toBe(id2);
        
        // Count should be 1, not 2
        expect(registry.getCount()).toBe(1);
      }
    ),
    { numRuns: 100 }
  );
});
```

### Critical Test Scenarios

1. **Memory Leak Test** (60-minute stress test):
   - Navigate between all tabs repeatedly
   - Open/close components
   - Monitor memory usage every 5 minutes
   - Assert: memory increase < 10MB

2. **Firestore Reads Test** (24-hour monitoring):
   - Track all Firestore reads
   - Categorize by collection
   - Assert: total reads < 300/day

3. **Bundle Size Test** (build verification):
   - Run production build
   - Measure initial bundle size
   - Assert: bundle < 320KB

4. **Mobile Performance Test** (real device):
   - Test on mid-range Android device
   - Measure FPS during scrolling
   - Assert: FPS > 50

5. **Cache Hit Rate Test** (24-hour monitoring):
   - Track cache hits and misses
   - Calculate hit rate
   - Assert: hit rate > 60%

6. **Lazy Loading Test** (network inspection):
   - Load app without opening Map/AI tabs
   - Verify Leaflet/AIAssistant not loaded
   - Open tabs and verify lazy load

7. **Component Re-render Test** (React DevTools Profiler):
   - Profile component renders
   - Change filters in Matching
   - Assert: only filtered components re-render

8. **Chat Performance Test** (latency measurement):
   - Send message
   - Measure time to UI update
   - Assert: latency < 200ms

### Performance Benchmarks

**Baseline (Pre-Optimization)**:
```
Initial Load:     2.5-3.0s
Mobile FPS:       15-20
Memory (60min):   180MB
Firestore Reads:  500-800/day
Bundle Size:      450KB
Chat Lag:         500-800ms
CPU Usage:        50-70%
Active Listeners: 15-25 (memory leak)
```

**Target (Post-Optimization)**:
```
Initial Load:     < 1.5s (target: 1.2s)     [52% ⬇️]
Mobile FPS:       > 50 (target: 55)         [206% ⬆️]
Memory (60min):   < 95MB (target: 85MB)    [53% ⬇️]
Firestore Reads:  < 300/day (target: 250)  [64% ⬇️]
Bundle Size:      < 320KB                   [29% ⬇️]
Chat Lag:         < 200ms (target: 150ms)  [77% ⬇️]
CPU Usage:        < 30%                     [57% ⬇️]
Active Listeners: < 10 (no memory leak)    [60% ⬇️]
```

### Test Execution Strategy

**Phase 1: Unit Tests** (Fast feedback)
- Run on every commit
- Test individual components
- Verify API contracts
- ~5 minutes execution time

**Phase 2: Property-Based Tests** (Comprehensive coverage)
- Run on every PR
- 100+ iterations per property
- Randomized input generation
- ~15 minutes execution time

**Phase 3: Performance Tests** (Real-world validation)
- Run nightly
- Real device testing
- 24-hour monitoring
- Long-running stress tests
- ~24 hours execution time

**Phase 4: Manual QA** (User experience validation)
- Run before release
- Visual regression testing
- Subjective quality assessment
- Cross-browser/device testing

## Implementation Notes

### Priority Order

1. **CRITICAL** (Week 1):
   - ListenerRegistry enhancement
   - Firestore query limits
   - Lazy loading for heavy libraries

2. **HIGH** (Week 2):
   - Component memoization
   - Cache TTL increase
   - Mobile marker limiting

3. **MEDIUM** (Week 3):
   - Virtual scrolling
   - Composite indexes
   - Console logs cleanup

4. **LOW** (Week 4):
   - Performance monitoring
   - Cache warming
   - Stale-while-revalidate

### Migration Strategy

**Backward Compatibility**:
- Existing code continues to work
- Gradual migration to ListenerRegistry
- Feature flags for new optimizations

**Rollout Plan**:
1. Deploy ListenerRegistry (no breaking changes)
2. Migrate Chat component (test thoroughly)
3. Migrate MapView component
4. Migrate remaining components
5. Enable lazy loading
6. Deploy composite indexes
7. Monitor metrics for 1 week

### Monitoring & Rollback

**Metrics to Monitor**:
- Initial load time (target: < 1.5s)
- Mobile FPS (target: > 50)
- Memory usage (target: < 95MB after 60min)
- Firestore reads (target: < 300/day)
- Cache hit rate (target: > 60%)
- Error rate (should not increase)

**Rollback Triggers**:
- Error rate increases > 5%
- Initial load time > 3s
- Mobile FPS < 15
- User complaints about performance

**Rollback Process**:
1. Disable feature flags
2. Revert to previous deployment
3. Investigate root cause
4. Fix and re-deploy

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-15  
**Status**: Ready for Implementation

