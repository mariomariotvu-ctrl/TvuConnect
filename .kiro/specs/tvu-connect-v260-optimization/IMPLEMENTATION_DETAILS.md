# Implementation Details - TVU Connect v2.6.0 Optimization

## Chi tiết các file cần sửa và Code Samples

### Phase 1: Firestore Reads Optimization

#### 1. Cache Manager (NEW FILE)

**File:** `src/utils/cacheManager.ts`

```typescript
/**
 * Cache Manager với TTL và LRU eviction
 * Giảm Firestore reads bằng cách cache data trong localStorage/sessionStorage
 */

export interface CacheConfig {
  key: string;
  ttl: number; // milliseconds
  storage: 'localStorage' | 'sessionStorage';
}

interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Get cached data
 * Returns null nếu cache miss hoặc TTL expired
 */
export function getCachedData<T>(config: CacheConfig): T | null {
  try {
    const storage = config.storage === 'localStorage' ? localStorage : sessionStorage;
    const cached = storage.getItem(config.key);
    
    if (!cached) return null;
    
    const parsed: CachedData<T> = JSON.parse(cached);
    const now = Date.now();
    
    // Check TTL
    if (now - parsed.timestamp > parsed.ttl) {
      storage.removeItem(config.key);
      return null;
    }
    
    return parsed.data;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set cached data với TTL
 * Tự động evict oldest entries nếu storage full
 */
export function setCachedData<T>(config: CacheConfig, data: T): void {
  try {
    const storage = config.storage === 'localStorage' ? localStorage : sessionStorage;
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl
    };
    
    storage.setItem(config.key, JSON.stringify(cached));
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      // Storage full - evict 20% oldest entries
      evictOldestEntries(config.storage, 0.2);
      // Retry
      const storage = config.storage === 'localStorage' ? localStorage : sessionStorage;
      storage.setItem(config.key, JSON.stringify({
        data,
        timestamp: Date.now(),
        ttl: config.ttl
      }));
    } else {
      console.error('Cache set error:', error);
    }
  }
}

/**
 * Invalidate cache by pattern
 * Example: invalidateCache('posts:*', 'sessionStorage')
 */
export function invalidateCache(pattern: string, storageType: 'localStorage' | 'sessionStorage'): void {
  const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  
  const keysToDelete: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && regex.test(key)) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => storage.removeItem(key));
}

/**
 * Evict oldest cache entries
 */
function evictOldestEntries(storageType: 'localStorage' | 'sessionStorage', percentage: number): void {
  const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
  const entries: Array<{ key: string; timestamp: number }> = [];
  
  // Collect all entries with timestamps
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) {
      try {
        const cached = JSON.parse(storage.getItem(key)!);
        if (cached.timestamp) {
          entries.push({ key, timestamp: cached.timestamp });
        }
      } catch {}
    }
  }
  
  // Sort by timestamp (oldest first)
  entries.sort((a, b) => a.timestamp - b.timestamp);
  
  // Remove oldest percentage
  const toRemove = Math.ceil(entries.length * percentage);
  for (let i = 0; i < toRemove; i++) {
    storage.removeItem(entries[i].key);
  }
}

/**
 * Clear all cache
 */
export function clearAllCache(storageType: 'localStorage' | 'sessionStorage'): void {
  const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
  storage.clear();
}
```

**Tại sao giúp tiết kiệm chi phí:**
- Cache data trong browser → không cần query Firestore mỗi lần
- TTL đảm bảo data không quá cũ
- LRU eviction tự động quản lý storage space
- Giảm 50-70% Firestore reads tùy theo TTL


#### 2. Query Optimizer (NEW FILE)

**File:** `src/utils/queryOptimizer.ts`

```typescript
/**
 * Query Optimizer cho Firestore
 * Tự động apply limits, pagination, và caching
 */

import { 
  Query, 
  query, 
  collection, 
  limit, 
  orderBy, 
  where, 
  startAfter,
  getDocs,
  DocumentSnapshot,
  WhereFilterOp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getCachedData, setCachedData, CacheConfig } from './cacheManager';

export interface QueryConfig {
  collection: string;
  limit: number;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  where?: Array<{ field: string; operator: WhereFilterOp; value: any }>;
  startAfter?: DocumentSnapshot;
}

export interface QueryResult<T> {
  data: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
  fromCache: boolean;
}

/**
 * Execute optimized query với caching
 */
export async function executeOptimizedQuery<T>(
  queryConfig: QueryConfig,
  cacheConfig?: CacheConfig
): Promise<QueryResult<T>> {
  // Check cache first
  if (cacheConfig) {
    const cached = getCachedData<QueryResult<T>>(cacheConfig);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }
  
  // Build query
  let q: Query = collection(db, queryConfig.collection);
  
  // Apply where clauses
  if (queryConfig.where) {
    queryConfig.where.forEach(w => {
      q = where(q, w.field, w.operator, w.value);
    });
  }
  
  // Apply orderBy
  if (queryConfig.orderBy) {
    q = orderBy(q, queryConfig.orderBy.field, queryConfig.orderBy.direction);
  }
  
  // Apply pagination
  if (queryConfig.startAfter) {
    q = startAfter(q, queryConfig.startAfter);
  }
  
  // Apply limit (max 100)
  const limitValue = Math.min(queryConfig.limit, 100);
  q = limit(q, limitValue);
  
  // Execute query
  const snapshot = await getDocs(q);
  
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as T[];
  
  const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
  const hasMore = snapshot.docs.length === limitValue;
  
  const result: QueryResult<T> = {
    data,
    lastDoc,
    hasMore,
    fromCache: false
  };
  
  // Cache result
  if (cacheConfig) {
    setCachedData(cacheConfig, result);
  }
  
  return result;
}

/**
 * Helper: Build cache key từ query config
 */
export function buildCacheKey(queryConfig: QueryConfig): string {
  const parts = [
    queryConfig.collection,
    queryConfig.limit,
    queryConfig.orderBy?.field,
    queryConfig.orderBy?.direction,
    ...queryConfig.where?.map(w => `${w.field}:${w.value}`) || []
  ];
  return parts.filter(Boolean).join(':');
}
```

**Tại sao giúp tiết kiệm chi phí:**
- Enforce limit ≤ 100 → không over-fetch
- Cache-first strategy → giảm duplicate queries
- Pagination với startAfter → chỉ load khi cần
- Where clauses at database level → filter trước khi fetch


#### 3. Posts Feed Optimization (MODIFY EXISTING)

**File:** `src/hooks/useCachedPosts.ts` (NEW)

```typescript
/**
 * Cached Posts Hook
 * Giảm reads từ 25K/day → 8K/day (68% reduction)
 */

import { useState, useEffect, useCallback } from 'react';
import { executeOptimizedQuery, QueryResult } from '../utils/queryOptimizer';
import { DocumentSnapshot } from 'firebase/firestore';

export interface Post {
  id: string;
  content: string;
  authorUid: string;
  createdAt: any;
  imageUrl?: string;
  // ... other fields
}

export function useCachedPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  // Load initial posts
  const loadInitialPosts = useCallback(async () => {
    setLoading(true);
    
    const result = await executeOptimizedQuery<Post>(
      {
        collection: 'posts',
        limit: 10,
        orderBy: { field: 'createdAt', direction: 'desc' },
        where: [
          { 
            field: 'createdAt', 
            operator: '>', 
            value: new Date(Date.now() - 18 * 60 * 60 * 1000) // 18 hours ago
          }
        ]
      },
      {
        key: 'posts:feed',
        ttl: 60000, // 60 seconds
        storage: 'sessionStorage'
      }
    );
    
    setPosts(result.data);
    setLastDoc(result.lastDoc);
    setHasMore(result.hasMore);
    setLoading(false);
  }, []);
  
  // Load more posts (pagination)
  const loadMore = useCallback(async () => {
    if (!hasMore || !lastDoc) return;
    
    const result = await executeOptimizedQuery<Post>(
      {
        collection: 'posts',
        limit: 10,
        orderBy: { field: 'createdAt', direction: 'desc' },
        startAfter: lastDoc
      }
      // No cache for pagination
    );
    
    setPosts(prev => [...prev, ...result.data]);
    setLastDoc(result.lastDoc);
    setHasMore(result.hasMore);
  }, [hasMore, lastDoc]);
  
  useEffect(() => {
    loadInitialPosts();
  }, [loadInitialPosts]);
  
  return { posts, loading, hasMore, loadMore, refresh: loadInitialPosts };
}
```

**File cần update:** `src/components/PostsList.tsx`

```typescript
// BEFORE
import { usePosts } from '../hooks/usePosts';

// AFTER
import { useCachedPosts } from '../hooks/useCachedPosts';

function PostsList() {
  // BEFORE
  // const { posts, loading, hasMore, loadMore } = usePosts();
  
  // AFTER
  const { posts, loading, hasMore, loadMore } = useCachedPosts();
  
  // Rest of component stays the same
}
```

**Tại sao giúp tiết kiệm chi phí:**
- Cache 60s → mỗi user chỉ fetch 1 lần/phút thay vì mỗi lần refresh
- Limit 10 → chỉ load 10 posts thay vì tất cả
- Filter 18h at database → không fetch old posts
- Pagination → chỉ load khi user scroll xuống
- **Ước tính:** 25K reads/day → 8K reads/day = **tiết kiệm 17K reads/day**


#### 4. Matching System Optimization (MODIFY EXISTING)

**File:** `src/hooks/useCachedMatching.ts` (NEW)

```typescript
/**
 * Cached Matching Hook
 * Giảm reads từ 20K/day → 6K/day (70% reduction)
 */

import { useState, useEffect, useCallback } from 'react';
import { executeOptimizedQuery } from '../utils/queryOptimizer';
import { getCachedData, setCachedData } from '../utils/cacheManager';
import { auth } from '../firebase';

export interface Profile {
  uid: string;
  displayName: string;
  major: string;
  academicYear: number;
  // ... other fields
}

export function useCachedMatching() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewedUids, setViewedUids] = useState<Set<string>>(new Set());
  
  const userId = auth.currentUser?.uid;
  
  // Load viewed profiles from cache
  useEffect(() => {
    if (!userId) return;
    
    const cached = getCachedData<string[]>({
      key: `matching:viewed:${userId}`,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      storage: 'localStorage'
    });
    
    if (cached) {
      setViewedUids(new Set(cached));
    }
  }, [userId]);
  
  // Load next profile
  const loadNextProfile = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    
    // Fetch 50 profiles at once
    const result = await executeOptimizedQuery<Profile>(
      {
        collection: 'profiles',
        limit: 50,
        where: [
          { field: 'uid', operator: '!=', value: userId }
        ]
      },
      {
        key: `matching:pool:${userId}`,
        ttl: 300000, // 5 minutes
        storage: 'sessionStorage'
      }
    );
    
    // Filter out viewed profiles in-memory
    const unviewedProfiles = result.data.filter(p => !viewedUids.has(p.uid));
    
    if (unviewedProfiles.length > 0) {
      setProfile(unviewedProfiles[0]);
    } else {
      setProfile(null);
    }
    
    setLoading(false);
  }, [userId, viewedUids]);
  
  // Mark profile as viewed
  const markAsViewed = useCallback((uid: string) => {
    const newViewed = new Set(viewedUids);
    newViewed.add(uid);
    setViewedUids(newViewed);
    
    // Save to cache
    setCachedData(
      {
        key: `matching:viewed:${userId}`,
        ttl: 24 * 60 * 60 * 1000,
        storage: 'localStorage'
      },
      Array.from(newViewed)
    );
  }, [userId, viewedUids]);
  
  useEffect(() => {
    loadNextProfile();
  }, [loadNextProfile]);
  
  return { profile, loading, loadNextProfile, markAsViewed };
}
```

**Tại sao giúp tiết kiệm chi phí:**
- Cache viewed profiles 24h → không re-fetch profiles đã xem
- Fetch 50 profiles at once, filter in-memory → giảm số lần query
- Cache pool 5 minutes → reuse cho multiple "next" clicks
- **Ước tính:** 20K reads/day → 6K reads/day = **tiết kiệm 14K reads/day**


#### 5. Debounce Implementation (NEW FILE)

**File:** `src/utils/debounce.ts`

```typescript
/**
 * Debounce function
 * Giảm 80% search-related reads
 */

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * Throttle function
 * Giới hạn execution frequency
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  
  return function(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}
```

**File cần update:** `src/components/SearchBar.tsx` (example)

```typescript
import { useState, useCallback } from 'react';
import { debounce } from '../utils/debounce';
import { executeOptimizedQuery } from '../utils/queryOptimizer';

function SearchBar() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (term: string) => {
      if (!term) {
        setResults([]);
        return;
      }
      
      setLoading(true);
      
      const result = await executeOptimizedQuery(
        {
          collection: 'profiles',
          limit: 20,
          where: [
            { field: 'displayName', operator: '>=', value: term },
            { field: 'displayName', operator: '<=', value: term + '\uf8ff' }
          ]
        },
        {
          key: `search:${term}`,
          ttl: 300000, // 5 minutes
          storage: 'sessionStorage'
        }
      );
      
      setResults(result.data);
      setLoading(false);
    }, 300), // 300ms delay
    []
  );
  
  return (
    <input
      type="text"
      onChange={(e) => debouncedSearch(e.target.value)}
      placeholder="Tìm kiếm..."
    />
  );
}
```

**Tại sao giúp tiết kiệm chi phí:**
- 300ms delay → chỉ search khi user ngừng gõ
- Cancel previous searches → không waste queries
- Cache results 5 minutes → reuse cho same search term
- **Ước tính:** Giảm 80% search queries

---

### Phase 2: Bundle Size Optimization

#### 6. Code Splitting Setup (MODIFY EXISTING)

**File:** `src/App.tsx`

```typescript
// BEFORE
import Explore from './components/Explore';
import Matching from './components/Matching';
import AIAssistant from './components/AIAssistant';

// AFTER
import React, { Suspense, lazy } from 'react';
import SkeletonLoader from './components/SkeletonLoader';

// Lazy load heavy components
const Explore = lazy(() => import('./components/Explore'));
const Matching = lazy(() => import('./components/Matching'));
const AIAssistant = lazy(() => import('./components/AIAssistant'));

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SkeletonLoader />}>
        <Routes>
          <Route path="/explore" element={<Explore />} />
          <Route path="/matching" element={<Matching />} />
          <Route path="/ai" element={<AIAssistant />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
```

**Tại sao giúp giảm bundle size:**
- Explore (150KB với Leaflet) → lazy loaded
- Matching (30KB) → lazy loaded
- AI Assistant (50KB) → lazy loaded
- **Total:** 230KB moved to lazy chunks
- **Initial bundle:** 730KB → 500KB


#### 7. Tree-shaking lucide-react (MODIFY ALL COMPONENTS)

**Example File:** `src/components/PostCard.tsx`

```typescript
// BEFORE (imports all icons ~80KB)
import * as Icons from 'lucide-react';

function PostCard() {
  return (
    <div>
      <Icons.Heart />
      <Icons.MessageCircle />
      <Icons.Share2 />
    </div>
  );
}

// AFTER (imports only used icons ~2KB)
import { Heart, MessageCircle, Share2 } from 'lucide-react';

function PostCard() {
  return (
    <div>
      <Heart />
      <MessageCircle />
      <Share2 />
    </div>
  );
}
```

**Files cần update (57 components):**
- src/components/PostCard.tsx
- src/components/ProfileCard.tsx
- src/components/Chat.tsx
- src/components/Settings.tsx
- ... (all 57 components)

**Script để tìm và replace:**

```bash
# Find all wildcard imports
grep -r "import \* as Icons from 'lucide-react'" src/components/

# Replace với named imports (manual hoặc script)
```

**Tại sao giúp giảm bundle size:**
- Wildcard import → bundle toàn bộ library (80KB)
- Named imports → chỉ bundle icons sử dụng (~20KB)
- **Savings:** 60KB (75% reduction)

#### 8. Tree-shaking Firebase SDK (MODIFY EXISTING)

**File:** `src/firebase.ts`

```typescript
// BEFORE (imports entire firebase package ~180KB)
import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/storage';

// AFTER (modular imports ~100KB)
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  // ... config
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

**Tại sao giúp giảm bundle size:**
- Compat API → bundle toàn bộ Firebase (180KB)
- Modular API → chỉ bundle modules sử dụng (100KB)
- **Savings:** 80KB (44% reduction)

#### 9. Vite Build Configuration (MODIFY EXISTING)

**File:** `vite.config.ts`

```typescript
// AFTER (optimized)
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            if (id.includes('leaflet')) {
              return 'map-vendor'; // Lazy loaded with Explore
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            return 'vendor';
          }
          
          // Feature chunks (lazy loaded)
          if (id.includes('components/Explore') || id.includes('components/MapView')) {
            return 'explore-feature';
          }
          if (id.includes('components/Matching')) {
            return 'matching-feature';
          }
          if (id.includes('components/AIAssistant')) {
            return 'ai-feature';
          }
        }
      }
    },
    chunkSizeWarningLimit: 500, // Lower threshold
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    }
  }
});
```

**Tại sao giúp giảm bundle size:**
- Manual chunks → better code splitting
- Terser minification → smaller file sizes
- drop_console → remove debug code
- **Result:** Initial bundle 730KB → <280KB

---

### Phase 3: Security & State Management

#### 10. Profile State Refactoring (NEW FILE)

**File:** `src/contexts/ProfileContext.tsx`

```typescript
/**
 * Centralized Profile State Management
 * Single Source of Truth cho profile data
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getCachedData, setCachedData } from '../utils/cacheManager';

interface Profile {
  uid: string;
  displayName: string;
  major: string;
  academicYear: number;
  // ... other fields
}

interface ProfileContextType {
  profiles: Map<string, Profile>;
  loading: Map<string, boolean>;
  fetchProfile: (uid: string) => Promise<Profile | null>;
  invalidateProfile: (uid: string) => void;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState<Map<string, boolean>>(new Map());
  
  const fetchProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    // Check in-memory cache first
    if (profiles.has(uid)) {
      return profiles.get(uid)!;
    }
    
    // Check storage cache
    const cached = getCachedData<Profile>({
      key: `profile:${uid}`,
      ttl: 180000, // 3 minutes
      storage: 'sessionStorage'
    });
    
    if (cached) {
      setProfiles(prev => new Map(prev).set(uid, cached));
      return cached;
    }
    
    // Fetch from Firestore
    setLoading(prev => new Map(prev).set(uid, true));
    
    try {
      const docRef = doc(db, 'profiles', uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const profile = { uid, ...docSnap.data() } as Profile;
        
        // Update in-memory cache
        setProfiles(prev => new Map(prev).set(uid, profile));
        
        // Update storage cache
        setCachedData(
          { key: `profile:${uid}`, ttl: 180000, storage: 'sessionStorage' },
          profile
        );
        
        return profile;
      }
      
      return null;
    } finally {
      setLoading(prev => new Map(prev).set(uid, false));
    }
  }, [profiles]);
  
  const invalidateProfile = useCallback((uid: string) => {
    setProfiles(prev => {
      const newMap = new Map(prev);
      newMap.delete(uid);
      return newMap;
    });
    
    // Clear storage cache
    sessionStorage.removeItem(`profile:${uid}`);
  }, []);
  
  return (
    <ProfileContext.Provider value={{ profiles, loading, fetchProfile, invalidateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(uid: string | undefined) {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  
  const { profiles, loading, fetchProfile } = context;
  
  React.useEffect(() => {
    if (uid) {
      fetchProfile(uid);
    }
  }, [uid, fetchProfile]);
  
  return {
    profile: uid ? profiles.get(uid) : null,
    loading: uid ? loading.get(uid) || false : false
  };
}
```

**Tại sao giúp tiết kiệm chi phí:**
- Single source of truth → không duplicate fetches
- In-memory + storage cache → 2-layer caching
- Reuse across components → fetch once, use everywhere
- **Ước tính:** Giảm 60% duplicate profile fetches

---

### Phase 4: Mobile & Network Optimization

#### 12. Skeleton Loading (ENHANCE EXISTING)

**File:** `src/components/SkeletonLoader.tsx` (ENHANCE)

```typescript
/**
 * Skeleton Loader cho mobile
 * Prevent CLS (Cumulative Layout Shift)
 */

interface SkeletonProps {
  type: 'post' | 'confession' | 'place' | 'profile';
  count?: number;
}

export function SkeletonLoader({ type, count = 1 }: SkeletonProps) {
  const skeletons = Array.from({ length: count }, (_, i) => i);
  
  return (
    <div className="space-y-4">
      {skeletons.map(i => (
        <div key={i} className="animate-pulse">
          {type === 'post' && <SkeletonPost />}
          {type === 'confession' && <SkeletonConfession />}
          {type === 'place' && <SkeletonPlace />}
          {type === 'profile' && <SkeletonProfile />}
        </div>
      ))}
    </div>
  );
}

function SkeletonPost() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/4" />
        </div>
      </div>
      
      {/* Content */}
      <div className="space-y-2">
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6" />
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-4/6" />
      </div>
      
      {/* Image placeholder */}
      <div className="h-64 bg-gray-300 dark:bg-gray-700 rounded" />
      
      {/* Actions */}
      <div className="flex space-x-4">
        <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-20" />
        <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-20" />
        <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-20" />
      </div>
    </div>
  );
}

// Similar for SkeletonPlace, SkeletonProfile
```

**Tại sao giúp cải thiện UX:**
- Match exact dimensions → prevent CLS
- Shimmer animation → better perceived performance
- Show immediately → no blank screen
- **Result:** CLS score < 0.1


#### 13. Image Optimization (ENHANCE EXISTING)

**File:** `src/utils/imageOptimization.ts` (ENHANCE)

```typescript
/**
 * Client-side Image Compression
 * Giảm upload time 50% trên 3G
 */

export interface ImageOptimizationConfig {
  maxSizeKB: number;
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

/**
 * Compress image using Canvas API
 */
export async function compressImage(
  file: File,
  config: ImageOptimizationConfig
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      reject(new Error('File không phải là ảnh'));
      return;
    }
    
    // Validate file size
    if (file.size > config.maxSizeKB * 1024) {
      // Need compression
    } else {
      // File already small enough
      resolve(file);
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (preserve aspect ratio)
        let { width, height } = img;
        
        if (width > config.maxWidth || height > config.maxHeight) {
          const ratio = Math.min(
            config.maxWidth / width,
            config.maxHeight / height
          );
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context không khả dụng'));
          return;
        }
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Check if compressed size is acceptable
              if (blob.size <= config.maxSizeKB * 1024) {
                resolve(blob);
              } else {
                // Try lower quality
                canvas.toBlob(
                  (blob2) => {
                    resolve(blob2 || blob);
                  },
                  'image/jpeg',
                  config.quality - 0.1
                );
              }
            } else {
              reject(new Error('Compression failed'));
            }
          },
          'image/jpeg',
          config.quality
        );
      };
      
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate image before upload
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File không phải là ảnh' };
  }
  
  // Check file size (max 800KB)
  if (file.size > 800 * 1024) {
    return { valid: false, error: 'Ảnh quá lớn (>800KB). Vui lòng chọn ảnh nhỏ hơn.' };
  }
  
  return { valid: true };
}
```

**File cần update:** `src/components/CreatePost.tsx`

```typescript
import { compressImage, validateImage } from '../utils/imageOptimization';

function CreatePost() {
  const handleImageUpload = async (file: File) => {
    // Validate
    const validation = validateImage(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    
    try {
      // Compress if needed
      const compressed = await compressImage(file, {
        maxSizeKB: 800,
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.8
      });
      
      // Upload compressed image
      await uploadToStorage(compressed);
      toast.success('Ảnh đã được tải lên');
    } catch (error) {
      toast.error('Không thể tải ảnh lên');
    }
  };
  
  return (
    <input
      type="file"
      accept="image/*"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleImageUpload(file);
      }}
    />
  );
}
```

**Tại sao giúp cải thiện UX:**
- Client-side compression → giảm upload time
- Validation → prevent upload failures
- Preserve aspect ratio → maintain image quality
- **Result:** 50% faster uploads on 3G

---

## Summary: Expected Results

### Firestore Reads Reduction

| Module | Before | After | Reduction |
|--------|--------|-------|-----------|
| Posts Feed | 25K/day | 8K/day | 68% |
| Matching | 20K/day | 6K/day | 70% |
| Messages | 15K/day | 5K/day | 67% |
| Explore | 10K/day | 3K/day | 70% |
| Profiles | 10K/day | 3K/day | 70% |
| **TOTAL** | **80K/day** | **25K/day** | **69%** |

**Cost Savings:**
- Spark Plan: Free tier 50K reads/day → Đủ dùng
- Blaze Plan: $0.06 per 100K reads → Save $0.033/day = $1/month

### Bundle Size Reduction

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Initial Bundle | 730KB | 280KB | 62% |
| lucide-react | 80KB | 20KB | 75% |
| firebase | 180KB | 100KB | 44% |
| Lazy Chunks | 0KB | 270KB | N/A |

**Performance Improvement:**
- First Contentful Paint (FCP): 2.5s → 1.2s (52% faster)
- Time to Interactive (TTI): 4.0s → 2.0s (50% faster)
- Lighthouse Score: 75 → 92 (+17 points)

### Files to Modify

**New Files (10):**
1. src/utils/cacheManager.ts
2. src/utils/queryOptimizer.ts
3. src/utils/debounce.ts
4. src/hooks/useCachedPosts.ts
5. src/hooks/useCachedMatching.ts
6. src/hooks/useCachedConversations.ts
7. src/hooks/useCachedPlaces.ts
8. src/contexts/ProfileContext.tsx
9. src/components/LazyImage.tsx
10. src/utils/performanceMonitor.ts

**Modified Files (62):**
- src/App.tsx (code splitting)
- src/firebase.ts (modular imports)
- vite.config.ts (build optimization)
- All 58 components (lucide-react named imports)
- src/components/PostsList.tsx (use cached hook)
- src/components/Matching.tsx (use cached hook)
- src/components/Chat.tsx (use cached hook)

**Total:** 72 files

