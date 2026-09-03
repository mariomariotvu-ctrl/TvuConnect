# Tasks - TVU Connect v2.6.0 Tối ưu hóa toàn diện

## Phase 1: Firestore Reads Optimization (Ưu tiên cao nhất)

### 1. Cache Manager Implementation
- [x] 1.1 Tạo src/utils/cacheManager.ts với getCachedData và setCachedData functions
- [x] 1.2 Implement TTL expiration logic
- [x] 1.3 Implement LRU eviction khi storage > 80% full
- [x] 1.4 Implement invalidateCache với pattern matching
- [x] 1.5 Handle QuotaExceededError với auto-eviction
- [x] 1.6 Viết unit tests cho Cache Manager
- [x] 1.7 Viết property-based tests cho TTL behavior

### 2. Query Optimizer Implementation
- [x] 2.1 Tạo src/utils/queryOptimizer.ts với optimizeQuery function
- [x] 2.2 Implement limit enforcement (max 100)
- [x] 2.3 Implement pagination với startAfter cursor
- [x] 2.4 Implement where clause application
- [x] 2.5 Integrate với Cache Manager cho cache-first strategy
- [x] 2.6 Viết unit tests cho Query Optimizer
- [x] 2.7 Viết property-based tests cho pagination uniqueness

### 3. Posts Feed Optimization
- [x] 3.1 Tạo src/hooks/useCachedPosts.ts
- [x] 3.2 Implement cache-first với TTL 60s
- [x] 3.3 Implement pagination với limit 10
- [x] 3.4 Replace existing usePosts với useCachedPosts
- [x] 3.5 Update PostsList component để sử dụng cached hook
- [x] 3.6 Test và verify reads giảm từ 25K → 8K/day
- [x] 3.7 Document cache keys và TTL values

### 4. Matching System Optimization
- [x] 4.1 Tạo src/hooks/useCachedMatching.ts
- [x] 4.2 Implement viewed profiles cache với TTL 24h
- [x] 4.3 Implement in-memory filtering cho already shown UIDs
- [x] 4.4 Implement batch save match history (10 records/batch)
- [x] 4.5 Update Matching component để sử dụng cached hook
- [ ] 4.6 Test và verify reads giảm từ 20K → 6K/day
- [x] 4.7 Implement cache invalidation khi user blocks someone

### 5. Messages Optimization
- [x] 5.1 Tạo src/hooks/useCachedConversations.ts
- [x] 5.2 Implement conversations cache với TTL 120s
- [x] 5.3 Implement single active listener per conversation
- [x] 5.4 Implement auto-unsubscribe khi switch conversation
- [x] 5.5 Update Chat component để sử dụng cached hook
- [x] 5.6 Test và verify reads giảm từ 15K → 5K/day
- [x] 5.7 Implement listener cleanup on unmount


### 6. Explore Places Optimization
- [x] 6.1 Tạo src/hooks/useCachedPlaces.ts
- [x] 6.2 Implement places cache với TTL 300s
- [x] 6.3 Implement adaptive limits (100 mobile, 200 desktop)
- [x] 6.4 Implement category filter at database level
- [ ] 6.5 Update MapView và PlaceList components
- [ ] 6.6 Test và verify reads giảm từ 10K → 3K/day
- [ ] 6.7 Implement cache invalidation khi user creates new place

### 7. User Profiles Optimization
- [ ] 7.1 Tạo src/contexts/ProfileContext.tsx
- [ ] 7.2 Implement centralized profile state management
- [ ] 7.3 Implement profile cache với TTL 180s
- [ ] 7.4 Implement batch fetch blocked users
- [ ] 7.5 Refactor all components để sử dụng ProfileContext
- [ ] 7.6 Test và verify reads giảm từ 10K → 3K/day
- [ ] 7.7 Implement cache invalidation khi user updates profile

### 8. Online Status Optimization
- [ ] 8.1 Tạo src/utils/onlineStatusManager.ts
- [ ] 8.2 Implement centralized listener management với Map
- [ ] 8.3 Implement listener reuse cho same user
- [ ] 8.4 Implement online status cache với TTL 30s
- [ ] 8.5 Update useOnlineStatus hook để sử dụng manager
- [ ] 8.6 Test và verify reads giảm 70%
- [ ] 8.7 Implement cleanup function cho all listeners

### 9. Debounce Implementation
- [ ] 9.1 Tạo src/utils/debounce.ts với debounce function
- [ ] 9.2 Implement search debounce với 300ms delay
- [ ] 9.3 Implement filter debounce với 500ms delay
- [ ] 9.4 Update SearchBar component với debounced search
- [ ] 9.5 Update filter components với debounced filters
- [ ] 9.6 Implement search results cache với TTL 300s
- [ ] 9.7 Test và verify search reads giảm 80%

## Phase 2: Bundle Size Optimization

### 10. Code Splitting Setup
- [ ] 10.1 Update src/App.tsx để import React.lazy và Suspense
- [ ] 10.2 Tạo SkeletonLoader component nếu chưa có
- [ ] 10.3 Wrap lazy components với Suspense và SkeletonLoader
- [ ] 10.4 Test lazy loading hoạt động đúng
- [ ] 10.5 Measure initial bundle size trước và sau
- [ ] 10.6 Document lazy-loaded components
- [ ] 10.7 Setup error boundaries cho lazy components

### 11. Lazy Load Explore Component
- [ ] 11.1 Convert Explore import thành React.lazy
- [ ] 11.2 Wrap với Suspense và SkeletonLoader
- [ ] 11.3 Test Explore loads correctly khi navigate
- [ ] 11.4 Verify explore-feature chunk được tạo (~150KB)
- [ ] 11.5 Test error boundary khi chunk load fails
- [ ] 11.6 Implement preload on idle nếu cần
- [ ] 11.7 Document Explore lazy loading

### 12. Lazy Load Confessions Component
- [x]* 12.1 Convert ConfessionsTab import thành React.lazy (N/A - Feature removed)
- [x]* 12.2 Wrap với Suspense và SkeletonLoader (N/A - Feature removed)
- [x]* 12.3 Test Confessions loads correctly (N/A - Feature removed)
- [x]* 12.4 Verify confessions-feature chunk được tạo (~40KB) (N/A - Feature removed)
- [x]* 12.5 Test error boundary (N/A - Feature removed)
- [x]* 12.6 Implement preload on idle nếu cần (N/A - Feature removed)
- [x]* 12.7 Document Confessions lazy loading (N/A - Feature removed)


### 13. Lazy Load Matching Component
- [ ] 13.1 Convert Matching import thành React.lazy
- [ ] 13.2 Wrap với Suspense và SkeletonLoader
- [ ] 13.3 Test Matching loads correctly
- [ ] 13.4 Verify matching-feature chunk được tạo (~30KB)
- [ ] 13.5 Test error boundary
- [ ] 13.6 Implement preload on idle nếu cần
- [ ] 13.7 Document Matching lazy loading

### 14. Lazy Load AI Assistant Component
- [ ] 14.1 Convert AIAssistant import thành React.lazy
- [ ] 14.2 Wrap với Suspense và SkeletonLoader
- [ ] 14.3 Test AI Assistant loads correctly
- [ ] 14.4 Verify ai-feature chunk được tạo (~50KB)
- [ ] 14.5 Test error boundary
- [ ] 14.6 Implement preload on idle nếu cần
- [ ] 14.7 Document AI Assistant lazy loading

### 15. Tree-shaking lucide-react Icons
- [ ] 15.1 Audit all components để tìm icon imports
- [ ] 15.2 Replace `import * as Icons` với named imports
- [ ] 15.3 Update tất cả 58 components với named imports
- [ ] 15.4 Remove unused icon imports
- [ ] 15.5 Verify bundle size giảm từ 80KB → 20KB
- [ ] 15.6 Document which icons are used in each component
- [ ] 15.7 Add ESLint rule để prevent wildcard imports

### 16. Tree-shaking Firebase SDK
- [ ] 16.1 Audit src/firebase.ts để tìm Firebase imports
- [ ] 16.2 Replace với modular imports (firebase/app, firebase/auth, etc.)
- [ ] 16.3 Remove unused Firebase modules
- [ ] 16.4 Update all components sử dụng Firebase
- [ ] 16.5 Verify bundle size giảm từ 180KB → 100KB
- [ ] 16.6 Document Firebase imports in firebase.ts
- [ ] 16.7 Test Firebase functionality vẫn hoạt động đúng

### 17. Vite Build Configuration
- [ ] 17.1 Update vite.config.ts với manualChunks function
- [ ] 17.2 Configure vendor chunks: react-vendor, firebase-vendor, map-vendor, icons-vendor
- [ ] 17.3 Configure feature chunks: explore-feature, matching-feature, ai-feature
- [ ] 17.4 Set chunkSizeWarningLimit to 500KB
- [ ] 17.5 Enable terser minification với drop_console: true
- [ ] 17.6 Generate bundle analysis report
- [ ] 17.7 Document Vite configuration changes

## Phase 3: Security & State Management

### 18. Anonymity Audit
- [x]* 18.1 Review src/utils/anonymityManager.ts implementation (N/A - Feature removed)
- [x]* 18.2 Verify crypto.randomBytes(32) is used for salt generation (N/A - Feature removed)
- [x]* 18.3 Verify per-confession salt strategy is correct (N/A - Feature removed)
- [x]* 18.4 Audit all usages of generateSaltedHash (N/A - Feature removed)
- [x]* 18.5 Audit all usages of generateCommentNickname (N/A - Feature removed)
- [x]* 18.6 Add unit tests for anonymity properties (N/A - Feature removed)
- [x]* 18.7 Document anonymity guarantees (N/A - Feature removed)

### 19. Profile State Refactoring
- [ ] 19.1 Tạo src/contexts/ProfileContext.tsx (nếu chưa có từ task 7.1)
- [ ] 19.2 Implement ProfileProvider với centralized state
- [ ] 19.3 Implement fetchProfile với built-in caching
- [ ] 19.4 Refactor ProfileCard component để sử dụng context
- [ ] 19.5 Refactor ProfileForm component để sử dụng context
- [ ] 19.6 Refactor Settings component để sử dụng context
- [ ] 19.7 Test profile updates propagate correctly


### 20. Online Status State Refactoring
- [ ] 20.1 Review existing src/hooks/useOnlineStatusCache.ts
- [ ] 20.2 Enhance với centralized listener Map (nếu chưa có)
- [ ] 20.3 Implement listener reuse logic
- [ ] 20.4 Implement auto-cleanup on unmount
- [ ] 20.5 Update all components sử dụng useOnlineStatus
- [ ] 20.6 Test listener deduplication hoạt động đúng
- [ ] 20.7 Document online status management

## Phase 4: Mobile & Network Optimization

### 21. Skeleton Loading Implementation
- [ ] 21.1 Review existing src/components/SkeletonLoader.tsx
- [ ] 21.2 Tạo SkeletonPostCard component
- [ ] 21.3 Tạo SkeletonPlaceList component
- [ ] 21.4 Update components để hiển thị skeleton với 200-300ms delay
- [ ] 21.5 Test skeleton dimensions match actual components (prevent CLS)
- [ ] 21.6 Measure và verify CLS score < 0.1

### 22. Image Optimization Implementation
- [ ] 22.1 Review existing src/utils/imageOptimization.ts
- [ ] 22.2 Enhance compressImage function nếu cần
- [ ] 22.3 Implement client-side validation (<800KB)
- [ ] 22.4 Implement canvas resize (max 1920x1080)
- [ ] 22.5 Update CreatePost component với image optimization
- [ ] 22.6 Test compression hoạt động đúng trên mobile

### 23. Progressive Image Loading
- [ ] 23.1 Tạo src/components/LazyImage.tsx với Intersection Observer
- [ ] 23.2 Implement placeholder (blur hoặc skeleton) while loading
- [ ] 23.3 Implement error handling với fallback image
- [ ] 23.4 Update PostCard để sử dụng LazyImage
- [ ] 23.5 Test lazy loading hoạt động đúng
- [ ] 23.6 Measure page load time improvement

### 24. Listener Manager Enhancement
- [ ] 24.1 Review existing src/utils/firestoreListenerManager.ts
- [ ] 24.2 Enhance với listener registry tracking
- [ ] 24.3 Implement warning khi > 10 active listeners
- [ ] 24.4 Implement cleanup function để unsubscribe all
- [ ] 24.5 Update all hooks sử dụng listeners
- [ ] 24.6 Test listener cleanup hoạt động đúng
- [ ] 24.7 Document listener management best practices

## Phase 5: Testing & Monitoring

### 25. Unit Tests
- [ ] 25.1 Viết tests cho Cache Manager (get, set, eviction, TTL)
- [ ] 25.2 Viết tests cho Query Optimizer (limits, pagination, filters)
- [ ] 25.3 Viết tests cho Debouncer (delay, cancellation)
- [ ] 25.4 Viết tests cho Image Optimizer (compression, resize)
- [ ] 25.5 Viết tests cho Anonymity Manager (salt, hash, nicknames)
- [ ] 25.6 Viết tests cho ProfileContext
- [ ] 25.7 Viết tests cho Listener Manager

### 26. Property-Based Tests
- [ ] 26.1 Viết PBT cho cache TTL behavior (fast-check)
- [ ] 26.2 Viết PBT cho pagination uniqueness
- [ ] 26.3 Viết PBT cho image compression size constraint
- [ ] 26.4 Viết PBT cho debounce cancellation
- [ ] 26.5 Viết PBT cho anonymity properties
- [ ] 26.6 Run all PBTs với 100+ test cases
- [ ] 26.7 Document PBT results


### 27. Integration Tests
- [ ] 27.1 Test cache-first data flow end-to-end
- [ ] 27.2 Test lazy component loading và error boundaries
- [ ] 27.3 Test pagination across multiple pages
- [ ] 27.4 Test debounced search với real Firestore
- [ ] 27.5 Test image upload với compression
- [ ] 27.6 Test offline → online transition
- [ ] 27.7 Measure performance metrics (LCP, FID, CLS)

### 28. Performance Monitoring Setup
- [ ] 28.1 Tạo src/utils/performanceMonitor.ts
- [ ] 28.2 Implement Firestore reads tracking
- [ ] 28.3 Implement cache hit rate tracking
- [ ] 28.4 Implement bundle size tracking
- [ ] 28.5 Implement page load metrics (LCP, FID, CLS)
- [ ] 28.6 Tạo dashboard hiển thị metrics
- [ ] 28.7 Setup alerts khi reads > 40K/day

### 29. Firestore Indexes Deployment
- [ ] 29.1 Review existing firestore.indexes.json
- [ ] 29.2 Add composite index cho posts (createdAt DESC)
- [ ] 29.3 Add composite index cho messages (conversationId, createdAt DESC)
- [ ] 29.4 Deploy indexes lên Firebase Console
- [ ] 29.5 Verify indexes are built successfully
- [ ] 29.6 Document index deployment process

## Phase 6: Documentation & Deployment

### 30. Code Documentation
- [ ] 30.1 Document all cache keys và TTL values
- [ ] 30.2 Document all lazy-loaded components
- [ ] 30.3 Document all debounced functions
- [ ] 30.4 Document Firebase cost savings calculations
- [ ] 30.5 Tạo OPTIMIZATION_GUIDE.md với code examples
- [ ] 30.6 Tạo TROUBLESHOOTING.md cho common issues
- [ ] 30.7 Update README.md với optimization info

### 31. Performance Benchmarks
- [ ] 31.1 Measure Firestore reads before optimization (baseline)
- [ ] 31.2 Measure bundle size before optimization (baseline)
- [ ] 31.3 Measure page load time before optimization (baseline)
- [ ] 31.4 Run optimization và measure after
- [ ] 31.5 Calculate reduction percentages
- [ ] 31.6 Tạo performance comparison report
- [ ] 31.7 Document benchmarks in PERFORMANCE_REPORT.md

### 32. Migration Guide
- [ ] 32.1 Tạo MIGRATION_GUIDE.md
- [ ] 32.2 Document step-by-step migration process
- [ ] 32.3 Document rollback plan
- [ ] 32.4 Document feature flags usage
- [ ] 32.5 Tạo testing checklist
- [ ] 32.6 Document backup và restore procedures
- [ ] 32.7 Document monitoring during deployment

### 33. Pre-Deployment Testing
- [ ] 33.1 Run all unit tests và verify pass
- [ ] 33.2 Run all property-based tests và verify pass
- [ ] 33.3 Run all integration tests và verify pass
- [ ] 33.4 Test trên mobile devices (iOS, Android)
- [ ] 33.5 Test trên different network conditions (3G, 4G, WiFi)
- [ ] 33.6 Test error scenarios (offline, quota exceeded, etc.)
- [ ] 33.7 Review code với team

### 34. Production Deployment
- [ ] 34.1 Backup Firestore data
- [ ] 34.2 Deploy Firestore indexes
- [ ] 34.3 Deploy optimized code lên staging
- [ ] 34.4 Test staging environment thoroughly
- [ ] 34.5 Deploy lên production với feature flags
- [ ] 34.6 Monitor error rates và performance metrics
- [ ] 34.7 Gradually enable optimizations for all users

### 35. Post-Deployment Monitoring
- [ ] 35.1 Monitor Firestore reads daily for 1 week
- [ ] 35.2 Monitor cache hit rates
- [ ] 35.3 Monitor page load times
- [ ] 35.4 Monitor error rates
- [ ] 35.5 Collect user feedback
- [ ] 35.6 Tạo post-deployment report
- [ ] 35.7 Plan next optimization iteration nếu cần

## Summary

**Total Tasks:** 245 tasks across 35 major sections
**Estimated Timeline:** 6-8 weeks
**Priority Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

**Key Milestones:**
- Week 2: Phase 1 complete (Firestore optimization)
- Week 4: Phase 2 complete (Bundle size optimization)
- Week 5: Phase 3-4 complete (Security & Mobile optimization)
- Week 6: Phase 5 complete (Testing)
- Week 7-8: Phase 6 complete (Documentation & Deployment)

**Success Criteria:**
- ✅ Firestore reads < 40K/day (50% reduction)
- ✅ Bundle size < 500KB (32% reduction)
- ✅ All tests passing
- ✅ Zero production errors
- ✅ User satisfaction maintained or improved
