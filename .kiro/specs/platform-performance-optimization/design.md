# Thiết Kế Tối Ưu Hiệu Suất TVU Connect

## Kiến Trúc Tổng Quan

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Entry Point                       │
│  index.html → main.tsx → App.tsx (Lazy Loaded Routes)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Performance Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Code Splitting│  │Service Worker│  │ Performance  │     │
│  │  & Lazy Load │  │  & Caching   │  │  Monitoring  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Optimization Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Image Pipeline│  │Bundle Optimizer│ │CSS Optimizer│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Firebase Lazy │  │Listener Mgmt │  │Cache Manager │     │
│  │    Init      │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 1. Code Splitting & Lazy Loading Design

### 1.1 Route-Based Code Splitting

```typescript
// src/routes/lazyRoutes.ts
import { lazy } from 'react';

export const LazyMatching = lazy(() => 
  import(/* webpackChunkName: "matching" */ '../components/Matching')
);

export const LazyChat = lazy(() => 
  import(/* webpackChunkName: "chat" */ '../components/Chat')
);

export const LazyMapView = lazy(() => 
  import(/* webpackChunkName: "map" */ '../components/MapView')
);

export const LazyDocumentRepository = lazy(() => 
  import(/* webpackChunkName: "documents" */ '../components/DocumentRepository')
);

export const LazyPostsList = lazy(() => 
  import(/* webpackChunkName: "posts" */ '../components/PostsList')
);

export const LazySettings = lazy(() => 
  import(/* webpackChunkName: "settings" */ '../components/Settings')
);
```

### 1.2 Suspense Boundaries với Loading States

```typescript
// src/components/RouteLoader.tsx
interface RouteLoaderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RouteLoader({ children, fallback }: RouteLoaderProps) {
  return (
    <Suspense fallback={fallback || <RouteLoadingFallback />}>
      {children}
    </Suspense>
  );
}

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
    </div>
  );
}
```

### 1.3 Preloading Strategy

```typescript
// src/utils/routePreloader.ts
export function preloadRoute(routeName: string) {
  const preloadMap = {
    matching: () => import('../components/Matching'),
    chat: () => import('../components/Chat'),
    map: () => import('../components/MapView'),
    // ...
  };
  
  return preloadMap[routeName]?.();
}

// Usage: Preload on hover/focus
<button 
  onMouseEnter={() => preloadRoute('matching')}
  onFocus={() => preloadRoute('matching')}
>
  Tìm bạn
</button>
```

## 2. Firebase Lazy Initialization Design

### 2.1 Deferred Firebase Init

```typescript
// src/firebase/lazyInit.ts
let firebaseInitialized = false;
let firebaseInitPromise: Promise<void> | null = null;

export async function initializeFirebase() {
  if (firebaseInitialized) return;
  if (firebaseInitPromise) return firebaseInitPromise;
  
  firebaseInitPromise = (async () => {
    // Wait for first paint
    await new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve(null);
      } else {
        window.addEventListener('load', () => resolve(null), { once: true });
      }
    });
    
    // Dynamic import Firebase modules
    const { initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const { getFirestore } = await import('firebase/firestore');
    const { getStorage } = await import('firebase/storage');
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    
    firebaseInitialized = true;
    
    return { app, auth, db, storage };
  })();
  
  return firebaseInitPromise;
}
```

### 2.2 Firebase Module Lazy Loading

```typescript
// src/firebase/modules.ts
export async function getFirebaseAuth() {
  await initializeFirebase();
  return auth;
}

export async function getFirebaseDb() {
  await initializeFirebase();
  return db;
}

export async function getFirebaseStorage() {
  await initializeFirebase();
  return storage;
}
```

## 3. Service Worker & Caching Design

### 3.1 Cache Strategy Matrix

| Resource Type | Strategy | TTL | Priority |
|--------------|----------|-----|----------|
| HTML | Network First | 5min | High |
| CSS/JS | Cache First | 1 day | High |
| Images | Stale While Revalidate | 7 days | Medium |
| API Data | Network First | 1min | High |
| Fonts | Cache First | 30 days | Low |
| Static Assets | Cache First | 30 days | Low |

### 3.2 Service Worker Implementation

```javascript
// public/sw-optimized.js
const CACHE_VERSION = 'v3';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Cache strategies
const strategies = {
  cacheFirst: async (request) => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  },
  
  networkFirst: async (request) => {
    try {
      const response = await fetch(request);
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw error;
    }
  },
  
  staleWhileRevalidate: async (request) => {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request).then(response => {
      cache.put(request, response.clone());
      return response;
    });
    
    return cached || fetchPromise;
  }
};
```

### 3.3 Firestore Query Caching

```typescript
// src/utils/firestoreCache.ts
interface CachedQuery {
  data: any[];
  timestamp: number;
  ttl: number;
}

const queryCache = new Map<string, CachedQuery>();

export function cacheQuery(key: string, data: any[], ttl: number = 60000) {
  queryCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
}

export function getCachedQuery(key: string): any[] | null {
  const cached = queryCache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > cached.ttl) {
    queryCache.delete(key);
    return null;
  }
  
  return cached.data;
}
```

## 4. Image Optimization Pipeline Design

### 4.1 Image Processing Flow

```
Upload → Validate → Compress → Generate Sizes → Convert WebP → Upload to Storage
```

### 4.2 Image Optimization Implementation

```typescript
// src/utils/imageOptimizer.ts
interface ImageSizes {
  thumbnail: Blob;  // 150x150
  medium: Blob;     // 600x600
  large: Blob;      // 1200x1200
  original: Blob;
}

export async function optimizeImage(file: File): Promise<ImageSizes> {
  const img = await loadImage(file);
  
  const sizes = {
    thumbnail: await resizeImage(img, 150, 150, 0.8),
    medium: await resizeImage(img, 600, 600, 0.85),
    large: await resizeImage(img, 1200, 1200, 0.9),
    original: file
  };
  
  // Convert to WebP if supported
  if (supportsWebP()) {
    return {
      thumbnail: await convertToWebP(sizes.thumbnail, 0.8),
      medium: await convertToWebP(sizes.medium, 0.85),
      large: await convertToWebP(sizes.large, 0.9),
      original: sizes.original
    };
  }
  
  return sizes;
}
```

### 4.3 Responsive Image Component

```typescript
// src/components/OptimizedImage.tsx
interface OptimizedImageProps {
  src: string;
  alt: string;
  sizes?: string;
  loading?: 'lazy' | 'eager';
}

export function OptimizedImage({ src, alt, sizes, loading = 'lazy' }: OptimizedImageProps) {
  const srcSet = generateSrcSet(src);
  const placeholder = generateBlurPlaceholder(src);
  
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes || '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
      alt={alt}
      loading={loading}
      style={{ backgroundImage: `url(${placeholder})` }}
      className="blur-placeholder"
    />
  );
}
```

## 5. Firestore Listener Management Design

### 5.1 Global Listener Registry

```typescript
// src/utils/listenerRegistry.ts
interface ListenerEntry {
  id: string;
  unsubscribe: () => void;
  collection: string;
  query: string;
  createdAt: number;
  priority: number;
}

class ListenerRegistry {
  private listeners = new Map<string, ListenerEntry>();
  private maxListeners = 10;
  
  register(entry: ListenerEntry) {
    // Check if identical listener exists
    const existing = this.findDuplicate(entry);
    if (existing) return existing.id;
    
    // Evict low priority listeners if at max
    if (this.listeners.size >= this.maxListeners) {
      this.evictLowestPriority();
    }
    
    this.listeners.set(entry.id, entry);
    return entry.id;
  }
  
  unregister(id: string) {
    const entry = this.listeners.get(id);
    if (entry) {
      entry.unsubscribe();
      this.listeners.delete(id);
    }
  }
  
  cleanup() {
    // Cleanup listeners older than 5 minutes
    const now = Date.now();
    for (const [id, entry] of this.listeners) {
      if (now - entry.createdAt > 300000) {
        this.unregister(id);
      }
    }
  }
}

export const listenerRegistry = new ListenerRegistry();
```

### 5.2 Auto Cleanup Hook

```typescript
// src/hooks/useFirestoreListener.ts
export function useFirestoreListener(
  collection: string,
  query: Query,
  callback: (data: any[]) => void,
  priority: number = 5
) {
  const listenerIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(query, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    listenerIdRef.current = listenerRegistry.register({
      id: generateId(),
      unsubscribe,
      collection,
      query: JSON.stringify(query),
      createdAt: Date.now(),
      priority
    });
    
    return () => {
      if (listenerIdRef.current) {
        listenerRegistry.unregister(listenerIdRef.current);
      }
    };
  }, [collection, query, callback, priority]);
}
```

## 6. Bundle Optimization Design

### 6.1 Vite Config Optimization

```typescript
// vite.config.ts (optimized)
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // Firebase
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase-vendor';
          }
          // UI libraries
          if (id.includes('lucide-react') || id.includes('sonner') || id.includes('react-joyride')) {
            return 'ui-vendor';
          }
          // Map libraries
          if (id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'map-vendor';
          }
          // AI libraries
          if (id.includes('@google/generative-ai')) {
            return 'ai-vendor';
          }
          // Motion library
          if (id.includes('motion')) {
            return 'motion-vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 500,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore']
  }
});
```

### 6.2 Tree Shaking Configuration

```json
// package.json
{
  "sideEffects": [
    "*.css",
    "*.scss",
    "src/index.css",
    "src/firebase.ts"
  ]
}
```

## 7. Performance Monitoring Integration

### 7.1 Performance Tracker

```typescript
// src/utils/performanceTracker.ts
class PerformanceTracker {
  private metrics: Map<string, number> = new Map();
  
  startMeasure(name: string) {
    performance.mark(`${name}-start`);
  }
  
  endMeasure(name: string) {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
    
    const measure = performance.getEntriesByName(name)[0];
    this.metrics.set(name, measure.duration);
    
    // Send to analytics
    this.sendToAnalytics(name, measure.duration);
  }
  
  private sendToAnalytics(name: string, duration: number) {
    // Send to Firebase Analytics or custom endpoint
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
  }
}

export const performanceTracker = new PerformanceTracker();
```

### 7.2 Core Web Vitals Tracking

```typescript
// src/utils/webVitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

export function trackWebVitals() {
  getCLS(metric => sendToAnalytics('CLS', metric.value));
  getFID(metric => sendToAnalytics('FID', metric.value));
  getFCP(metric => sendToAnalytics('FCP', metric.value));
  getLCP(metric => sendToAnalytics('LCP', metric.value));
  getTTFB(metric => sendToAnalytics('TTFB', metric.value));
}
```

## 8. CSS Optimization Design

### 8.1 Tailwind Purge Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {}
  },
  plugins: [],
  // Enable JIT mode for faster builds
  mode: 'jit',
  // Purge unused styles
  purge: {
    enabled: true,
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    options: {
      safelist: ['dark']
    }
  }
};
```

### 8.2 Critical CSS Extraction

```typescript
// scripts/extractCriticalCSS.ts
import { PurgeCSS } from 'purgecss';

async function extractCriticalCSS() {
  const purgeCSSResult = await new PurgeCSS().purge({
    content: ['./index.html', './src/App.tsx', './src/main.tsx'],
    css: ['./src/index.css'],
    safelist: ['dark', 'light']
  });
  
  // Inline critical CSS in index.html
  return purgeCSSResult[0].css;
}
```

## 9. Quota Management Design

### 9.1 Proactive Quota Monitor

```typescript
// src/utils/quotaMonitor.ts
class QuotaMonitor {
  private dailyReads = 0;
  private dailyWrites = 0;
  private readonly READ_LIMIT = 50000;
  private readonly WRITE_LIMIT = 20000;
  
  trackRead(count: number = 1) {
    this.dailyReads += count;
    this.checkThresholds();
  }
  
  trackWrite(count: number = 1) {
    this.dailyWrites += count;
    this.checkThresholds();
  }
  
  private checkThresholds() {
    const readPercentage = (this.dailyReads / this.READ_LIMIT) * 100;
    const writePercentage = (this.dailyWrites / this.WRITE_LIMIT) * 100;
    
    if (readPercentage > 80) {
      this.showWarning('Đang gần đạt giới hạn đọc dữ liệu');
      this.enableAggressiveCaching();
    }
    
    if (writePercentage > 80) {
      this.showWarning('Đang gần đạt giới hạn ghi dữ liệu');
      this.enableBatchWriting();
    }
  }
}

export const quotaMonitor = new QuotaMonitor();
```

## Implementation Priority

### Phase 1 (Week 1): Critical Optimizations
1. Code Splitting & Lazy Loading
2. Firebase Lazy Initialization
3. Service Worker Enable
4. Bundle Size Optimization

### Phase 2 (Week 2): High Priority
5. Image Optimization Pipeline
6. Firestore Listener Management
7. Performance Monitoring Integration
8. Cache-First Strategy Enforcement

### Phase 3 (Week 3): Medium Priority
9. CSS Optimization
10. Quota Management
11. Testing & Validation
12. Documentation

## Testing Strategy

### Performance Testing
- Lighthouse CI integration
- WebPageTest automation
- Real device testing (low-end Android)
- Network throttling tests (3G, 4G)

### Load Testing
- Concurrent user simulation
- Firestore quota stress testing
- Cache hit rate validation
- Memory leak detection

### A/B Testing
- Gradual rollout (10% → 50% → 100%)
- Monitor key metrics
- Rollback plan ready
- User feedback collection
