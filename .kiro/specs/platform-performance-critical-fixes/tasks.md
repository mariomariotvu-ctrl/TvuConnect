# Implementation Plan: Platform Performance Critical Fixes

## Overview

Khắc phục 9 vấn đề hiệu suất CRITICAL của nền tảng TVU Connect để giảm initial load từ 2.5s xuống 1.2s, tăng mobile FPS từ 18 lên 55, giảm memory leak từ 180MB xuống 85MB, và giảm Firestore reads từ 700/day xuống 250/day.

**Implementation Strategy**: Ưu tiên theo thứ tự CRITICAL → HIGH → MEDIUM với checkpoints sau mỗi phase.

**Priority Levels**:
- **CRITICAL (Week 1)**: Memory leak cleanup, Firestore query optimization, Lazy loading
- **HIGH (Week 2)**: Component memoization, Cache TTL increase, Mobile marker limiting
- **MEDIUM (Week 3)**: Virtual scrolling, Composite indexes, Console logs cleanup

## Tasks

### CRITICAL PRIORITY (Week 1)

- [ ] 1. Enhance ListenerRegistry for Memory Leak Prevention
  - [x] 1.1 Enhance ListenerRegistry với component tracking và auto-cleanup
    - Modify `src/utils/listenerRegistry.ts`
    - Add `componentName`, `conversationId`, `userId` fields to `ListenerEntry` interface
    - Implement `unregisterByComponent()` method
    - Implement `unregisterByConversation()` method
    - Implement `findDuplicate()` method for duplicate detection
    - Implement `evictLowestPriority()` method
    - Add auto-cleanup interval (5 minutes) for stale listeners
    - _Requirements: 1.1, 1.2, 1.6, 1.7, 1.8_
  
  - [ ]* 1.2 Write property test for listener cleanup on component unmount
    - **Property 1: Listener Cleanup on Component Unmount**
    - **Validates: Requirements 1.2**
    - Test that all listeners are cleaned up when component unmounts
    - Verify active listener count decreases correctly
  
  - [ ]* 1.3 Write property test for listener deduplication
    - **Property 3: Listener Deduplication**
    - **Validates: Requirements 1.7**
    - Test that duplicate listeners reuse existing instances
    - Verify listener count doesn't increase for duplicates
  
  - [x] 1.4 Integrate ListenerRegistry into Chat component
    - Modify `src/components/Chat.tsx`
    - Replace direct `onSnapshot()` calls with `listenerRegistry.register()`
    - Pass `componentName: 'Chat'` and `conversationId` to registry
    - Ensure cleanup on unmount via `useEffect` cleanup function
    - _Requirements: 1.3_
  
  - [x] 1.5 Integrate ListenerRegistry into MapView component
    - Modify `src/components/MapView.tsx`
    - Register all `onSnapshot()` listeners (places, checkIns, events) through registry
    - Pass `componentName: 'MapView'` to registry
    - Ensure cleanup on unmount
    - _Requirements: 1.4_
  
  - [ ]* 1.6 Write property test for memory stability over 60 minutes
    - **Property 2: Memory Stability Over Time**
    - **Validates: Requirements 1.5**
    - Test memory usage doesn't increase > 10MB over 60 minutes
    - Simulate typical user behavior (navigation, component mounting/unmounting)

- [ ] 2. Optimize Firestore Query Limits and Pagination
  - [x] 2.1 Create QUERY_LIMITS configuration constants
    - Create `src/config/queryLimits.ts`
    - Define limits for places (mobile: 30, desktop: 50)
    - Define limits for messages (initial: 50, load more: 30)
    - Define limits for check-ins, events, profiles, posts
    - Export constants for use across app
    - _Requirements: 2.1, 2.2_
  
  - [x] 2.2 Implement pagination hook for PlaceList
    - Create `src/hooks/usePlacesPagination.ts`
    - Implement `PaginationState<Place>` interface
    - Implement `loadInitial()` with limit from QUERY_LIMITS
    - Implement `loadMore()` with `startAfter` cursor
    - Track `lastDoc`, `hasMore`, `loading`, `loadingMore` states
    - _Requirements: 2.3, 2.4_
  
  - [ ]* 2.3 Write property test for pagination load more behavior
    - **Property 4: Pagination Load More Behavior**
    - **Validates: Requirements 2.3, 2.4**
    - Test that load more appends items without duplicates
    - Verify pagination cursor advances correctly
  
  - [x] 2.4 Apply query limits to MapView places query
    - Modify `src/components/MapView.tsx`
    - Use `QUERY_LIMITS.PLACES_MOBILE` or `PLACES_DESKTOP` based on device
    - Add `limit()` to Firestore query
    - _Requirements: 2.1_
  
  - [x] 2.5 Apply query limits to Chat messages query
    - Modify `src/hooks/useCachedMessages.ts`
    - Use `QUERY_LIMITS.MESSAGES_INITIAL` for initial load
    - Implement load more with `QUERY_LIMITS.MESSAGES_LOAD_MORE`
    - _Requirements: 2.2, 9.2, 9.3_
  
  - [x] 2.6 Implement geospatial filtering for MapView
    - Add `getMapBounds()` utility function to `src/utils/mapUtils.ts`
    - Add `queryPlacesInBounds()` function for client-side filtering
    - Apply bounds filtering in MapView after Firestore query
    - _Requirements: 2.6_
  
  - [ ]* 2.7 Write property test for geospatial query filtering
    - **Property 5: Geospatial Query Filtering**
    - **Validates: Requirements 2.6**
    - Test that all returned places are within map bounds
    - Generate random bounds and verify filtering correctness

- [x] 3. Implement Lazy Loading for Heavy Libraries
  - [x] 3.1 Lazy load Leaflet library for MapView
    - Modify `src/App.tsx` or routing configuration
    - Convert MapView import to `lazy(() => import('./components/MapView'))`
    - Wrap with `<Suspense fallback={<LoadingSpinner />}>`
    - Verify Leaflet only loads when Map tab is opened
    - _Requirements: 4.1_
  
  - [x] 3.2 Lazy load AIAssistant component
    - Convert AIAssistant import to `lazy(() => import('./components/AIAssistant'))`
    - Wrap with `<Suspense fallback={<LoadingSpinner />}>`
    - Verify AI libraries only load when AI tab is opened
    - _Requirements: 4.2_
  
  - [x] 3.3 Lazy load React-Joyride for onboarding
    - Modify `src/components/OnboardingTour.tsx`
    - Check `localStorage.getItem('onboarding_completed')`
    - Only load Joyride if not completed: `import('react-joyride')`
    - Store Joyride component in state after dynamic import
    - _Requirements: 4.3, 4.4_
  
  - [ ]* 3.4 Write property test for lazy loading conditional execution
    - **Property 11: Lazy Loading Conditional Execution**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - Test that heavy libraries only load when needed
    - Verify initial bundle doesn't include lazy-loaded code
  
  - [x] 3.5 Configure route-based code splitting
    - Modify `src/App.tsx`
    - Convert all page imports to lazy imports (Home, Profile, Chat, Explore, Matching)
    - Wrap Routes with Suspense boundary
    - _Requirements: 4.6, 4.7_

- [x] 4. Checkpoint - CRITICAL Phase Complete
  - Verify memory leak fixes: Run app for 30 minutes, check listener count ≤ 10
  - Verify query limits: Check Firestore console for reduced reads
  - Verify lazy loading: Check Network tab for deferred library loads
  - Measure initial load time: Should be < 2.0s (target 1.2s)
  - Ensure all tests pass, ask the user if questions arise.

### HIGH PRIORITY (Week 2)

- [x] 5. Implement Component Memoization
  - [x] 5.1 Memoize MessageItem component in Chat
    - Modify `src/components/Chat.tsx` or create `src/components/MessageItem.tsx`
    - Wrap MessageItem with `React.memo()`
    - Implement custom comparison function for `msg.id`, `msg.text`, `msg.read`
    - _Requirements: 3.1, 9.4_
  
  - [x] 5.2 Memoize PlaceCard component
    - Modify `src/components/PlaceCard.tsx`
    - Wrap with `React.memo()`
    - Implement custom comparison for `place.id`, `place.checkInCount`, `place.currentVisitors`
    - _Requirements: 3.1_
  
  - [x] 5.3 Memoize ProfileCard component in Matching
    - Modify `src/components/matching/ProfileCard.tsx`
    - Wrap with `React.memo()`
    - Implement custom comparison for `profile.uid`
    - _Requirements: 3.1_
  
  - [x] 5.4 Memoize Marker components in MapView
    - Modify `src/components/MapView.tsx`
    - Wrap Marker rendering with `React.memo()`
    - Ensure markers only re-render when places data changes, not on map pan/zoom
    - _Requirements: 3.2, 3.3_
  
  - [ ]* 5.5 Write property test for component memoization
    - **Property 8: Component Memoization Prevents Re-renders**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
    - Test that memoized components don't re-render with unchanged props
    - Use React Testing Library and render count tracking
  
  - [x] 5.6 Add useMemo for AIAssistant message list
    - Modify `src/components/AIAssistant.tsx`
    - Wrap message filtering and sorting with `useMemo()`
    - Dependencies: `[messages]`
    - _Requirements: 3.4_
  
  - [x] 5.7 Add useMemo for MapView filtered places
    - Modify `src/components/MapView.tsx`
    - Wrap category filtering with `useMemo()`
    - Dependencies: `[places, selectedCategory]`
    - _Requirements: 3.3_
  
  - [x] 5.8 Add useCallback for Matching event handlers
    - Modify `src/components/Matching.tsx`
    - Wrap `handleLike` and `handlePass` with `useCallback()`
    - Empty dependencies array for stable references
    - _Requirements: 3.6_
  
  - [ ]* 5.9 Write property test for selective re-render on state change
    - **Property 9: Selective Re-render on State Change**
    - **Validates: Requirements 3.3, 3.6**
    - Test that only affected components re-render when state changes
    - Verify entire component tree doesn't re-render unnecessarily

- [ ] 6. Enhance Caching Strategy with Increased TTL
  - [x] 6.1 Increase cache TTL for places data
    - Modify `src/hooks/useCachedPlaces.ts`
    - Change TTL from 60000ms (60s) to 300000ms (5 minutes)
    - Update cache configuration
    - _Requirements: 6.1_
  
  - [x] 6.2 Implement cache warming on app startup
    - Modify `src/App.tsx`
    - Add `useEffect` to pre-load top 20 places on mount
    - Query: `orderBy('rating', 'desc').limit(20)`
    - Store in sessionStorage with 5-minute TTL
    - _Requirements: 6.2, 6.3_
  
  - [ ]* 6.3 Write property test for cache warming on startup
    - **Property 17: Cache Warming on Startup**
    - **Validates: Requirements 6.2, 6.3**
    - Test that cache is populated before user navigation
    - Verify subsequent requests hit cache
  
  - [x] 6.4 Implement stale-while-revalidate hook
    - Create `src/hooks/useSWRCache.ts`
    - Implement logic: serve stale data immediately, fetch fresh in background
    - Update cache after background fetch completes
    - _Requirements: 6.5, 6.6_
  
  - [ ]* 6.5 Write property test for stale-while-revalidate behavior
    - **Property 18: Stale-While-Revalidate Behavior**
    - **Validates: Requirements 6.5, 6.6**
    - Test that stale data is served instantly
    - Verify fresh data is fetched in background
  
  - [x] 6.6 Move viewed profiles cache to sessionStorage
    - Modify `src/utils/viewedProfilesCache.ts`
    - Replace in-memory Map with sessionStorage
    - Implement get/set/clear methods using sessionStorage API
    - _Requirements: 6.4_
  
  - [x] 6.7 Implement cache hit rate monitoring
    - Create `src/utils/cacheMonitor.ts`
    - Track cache hits and misses
    - Calculate hit rate: `hits / (hits + misses)`
    - Log warning if hit rate < 60%
    - _Requirements: 6.8_
  
  - [ ]* 6.8 Write property test for cache hit rate monitoring
    - **Property 19: Cache Hit Rate Monitoring**
    - **Validates: Requirements 6.8**
    - Test that hit rate is calculated correctly
    - Verify warning is logged when hit rate < 60%

- [x] 7. Optimize Mobile Performance with Marker Limiting
  - [x] 7.1 Implement mobile marker limiting in MapView
    - Modify `src/components/MapView.tsx`
    - Detect mobile device with `useIsMobile()` hook
    - Limit markers to top 30 places by rating on mobile
    - Use `useMemo()` for filtered places: `places.sort(...).slice(0, 30)`
    - _Requirements: 5.1_
  
  - [x] 7.2 Enable Canvas rendering for Leaflet on mobile
    - Modify `src/components/MapView.tsx`
    - Set `preferCanvas={isMobile}` on MapContainer
    - Disable animations on mobile: `zoomAnimation={!isMobile}`
    - _Requirements: 5.2_
  
  - [ ]* 7.3 Write property test for mobile FPS performance
    - **Property 10: Mobile FPS Performance**
    - **Validates: Requirements 3.8, 5.7**
    - Test that mobile FPS is ≥ 54 (300% of baseline 18)
    - Simulate typical mobile interactions (scrolling, navigating)

- [x] 8. Checkpoint - HIGH Phase Complete
  - Verify component memoization: Use React DevTools Profiler, check re-render reduction > 50%
  - Verify cache improvements: Check cache hit rate > 60%
  - Verify mobile optimization: Test on real mobile device, check FPS > 50
  - Measure Firestore reads: Should be < 400/day (target 250/day)
  - Ensure all tests pass, ask the user if questions arise.

### MEDIUM PRIORITY (Week 3)

- [x] 9. Implement Virtual Scrolling for PlaceList
  - [x] 9.1 Install react-window library
    - Run: `npm install react-window @types/react-window`
    - _Requirements: 5.3_
  
  - [x] 9.2 Implement virtual scrolling in PlaceList
    - Modify `src/components/PlaceList.tsx`
    - Import `FixedSizeList` from react-window
    - Wrap PlaceCard rendering in FixedSizeList
    - Set `height={600}`, `itemSize={120}`, `itemCount={places.length}`
    - _Requirements: 5.3, 5.4_
  
  - [ ]* 9.3 Write property test for virtual scrolling DOM efficiency
    - **Property 14: Virtual Scrolling DOM Efficiency**
    - **Validates: Requirements 5.3, 5.4**
    - Test that DOM only contains 10-15 visible items
    - Verify items are dynamically rendered/unmounted on scroll

- [x] 10. Create Firestore Composite Indexes
  - [x] 10.1 Create firestore.indexes.json configuration
    - Create `firestore.indexes.json` in project root
    - Add composite index for messages: `conversationId + participants + createdAt`
    - Add composite index for places: `category + rating`
    - Add composite index for checkIns: `placeId + expiresAt`
    - Add composite index for events: `placeId + startTime + isPublic`
    - Add composite index for profiles: `gender + majorNormalized + academicYear`
    - _Requirements: 2.5, 8.1, 8.2, 8.3, 8.4_
  
  - [x] 10.2 Deploy composite indexes to Firestore
    - Run: `firebase deploy --only firestore:indexes`
    - Wait for indexes to build (may take several minutes)
    - Verify indexes in Firebase Console
    - _Requirements: 2.5, 8.1_
  
  - [ ]* 10.3 Write property test for query latency reduction
    - **Property 25: Query Latency Reduction**
    - **Validates: Requirements 8.8**
    - Test that query latency is < 200ms after index optimization
    - Compare with baseline 500-800ms

- [x] 11. Clean Up Console Logs and Configure Build Optimization
  - [x] 11.1 Create logger utility
    - Create `src/utils/logger.ts`
    - Implement `logger.log()`, `logger.warn()`, `logger.error()`, `logger.debug()`
    - Check `import.meta.env.DEV` to enable/disable logging
    - _Requirements: 7.2, 7.3_
  
  - [ ]* 11.2 Write property test for logger production behavior
    - **Property 20: Logger Production Behavior**
    - **Validates: Requirements 7.3, 7.8**
    - Test that logger.log() and logger.debug() don't output in production
    - Verify logger.error() and logger.warn() still work
  
  - [x] 11.3 Replace console.log with logger utility
    - Search codebase for `console.log` statements
    - Replace with `logger.log()` or `logger.debug()`
    - Keep `console.error` and `console.warn` or replace with `logger.error()` / `logger.warn()`
    - _Requirements: 7.2, 7.7_
  
  - [x] 11.4 Configure Vite terser to remove console logs
    - Modify `vite.config.ts`
    - Add terser configuration with `drop_console: true`
    - Add `pure_funcs: ['console.log', 'console.info', 'console.debug']`
    - Set `passes: 2` for better compression
    - _Requirements: 7.1, 7.6_
  
  - [x] 11.5 Configure Vite code splitting and tree shaking
    - Modify `vite.config.ts`
    - Add `manualChunks` configuration for vendor splitting
    - Separate chunks: react-vendor, firebase-vendor, map-vendor, ai-vendor, ui-vendor
    - Enable `treeshake` with `moduleSideEffects: false`
    - _Requirements: 4.6_
  
  - [ ]* 11.6 Write property test for bundle size reduction
    - **Property 12: Bundle Size Reduction**
    - **Validates: Requirements 4.5**
    - Test that bundle size is < 337.5KB (75% of 450KB baseline)
    - Target: 320KB
  
  - [ ]* 11.7 Write property test for console logs removal impact
    - **Property 21: Console Logs Removal Bundle Impact**
    - **Validates: Requirements 7.5**
    - Test that bundle is ≥ 20KB smaller after console.log removal
    - Compare production builds before and after

- [x] 12. Implement Performance Monitoring
  - [x] 12.1 Create PerformanceMonitor utility
    - Create `src/utils/performanceMonitor.ts`
    - Track metrics: initialLoad, fps, memory, firestoreReads, cacheHitRate
    - Define thresholds for each metric
    - Implement `checkThresholds()` method
    - Implement `sendAlert()` method for warnings
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8_
  
  - [ ]* 12.2 Write property test for performance metric threshold monitoring
    - **Property 29: Performance Metric Threshold Monitoring**
    - **Validates: Requirements 10.1-10.6, 10.8**
    - Test that warnings are logged when metrics exceed thresholds
    - Verify all metric types are monitored correctly
  
  - [x] 12.3 Integrate PerformanceMonitor into App
    - Modify `src/App.tsx`
    - Initialize PerformanceMonitor on mount
    - Track initial load time with `performance.now()`
    - Set up periodic metric checks (every 60 seconds)
    - _Requirements: 10.1_
  
  - [x] 12.4 Add memory monitoring to ListenerRegistry
    - Modify `src/utils/listenerRegistry.ts`
    - Add `startMemoryMonitoring()` method
    - Check `performance.memory.usedJSHeapSize` every minute
    - Log warning if memory > 150MB
    - _Requirements: 10.3_

- [x] 13. Optimize Chat Performance
  - [x] 13.1 Implement typing indicator debouncing
    - Modify `src/components/Chat.tsx`
    - Add debounce utility or use lodash.debounce
    - Debounce typing indicator updates to 2 seconds
    - _Requirements: 9.5_
  
  - [ ]* 13.2 Write property test for typing indicator debouncing
    - **Property 26: Chat Typing Indicator Debouncing**
    - **Validates: Requirements 9.5**
    - Test that rapid typing only sends updates every 2 seconds
    - Verify Firestore writes are reduced
  
  - [x] 13.3 Optimize chat scroll behavior on message delete
    - Modify `src/components/Chat.tsx`
    - Store scroll position before delete
    - Restore scroll position after delete (don't auto-scroll to bottom)
    - _Requirements: 9.7_
  
  - [ ]* 13.4 Write property test for chat scroll preservation
    - **Property 28: Chat Scroll Preservation on Delete**
    - **Validates: Requirements 9.7**
    - Test that scroll position is unchanged after message deletion
    - Verify no auto-scroll to bottom occurs
  
  - [ ]* 13.5 Write property test for chat message send latency
    - **Property 27: Chat Message Send Latency Reduction**
    - **Validates: Requirements 9.6**
    - Test that message send latency is < 162.5ms (25% of 650ms baseline)
    - Target: 150ms

- [x] 14. Implement Additional Mobile Optimizations
  - [x] 14.1 Implement WebP image format detection
    - Create `src/components/OptimizedImage.tsx`
    - Detect WebP support: `canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0`
    - Use WebP if supported, fallback to original format
    - Add `loading="lazy"` and `decoding="async"` attributes
    - _Requirements: 5.5, 5.6_
  
  - [ ]* 14.2 Write property test for WebP format conditional usage
    - **Property 15: WebP Format Conditional Usage**
    - **Validates: Requirements 5.6**
    - Test that WebP is used when browser supports it
    - Verify fallback to JPEG/PNG when not supported
  
  - [x] 14.3 Replace image components with OptimizedImage
    - Search codebase for `<img>` tags
    - Replace with `<OptimizedImage>` component
    - Ensure all images have lazy loading enabled
    - _Requirements: 5.5_

- [ ] 15. Final Checkpoint - All Optimizations Complete
  - Run comprehensive performance audit
  - Verify all success metrics:
    - Initial Load: < 1.5s (target 1.2s)
    - Mobile FPS: ≥ 55
    - Memory Usage: < 95MB (target 85MB)
    - Firestore Reads: < 300/day (target 250/day)
    - Bundle Size: < 320KB
    - Chat Lag: < 200ms (target 150ms)
    - Cache Hit Rate: > 60%
  - Test on real mobile device
  - Test on slow 3G network
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each priority phase
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All code examples use TypeScript as specified in design document
- Focus on CRITICAL tasks first (Week 1) for maximum impact
- HIGH tasks (Week 2) provide significant performance improvements
- MEDIUM tasks (Week 3) polish and complete the optimization effort

## Testing Strategy

- **Unit Tests**: Verify specific implementations (ListenerRegistry methods, cache operations, logger behavior)
- **Property-Based Tests**: Verify universal properties (memory stability, deduplication, pagination, memoization)
- **Integration Tests**: Verify end-to-end flows (chat performance, map rendering, lazy loading)
- **Performance Tests**: Measure metrics (load time, FPS, memory, Firestore reads, bundle size)

## Success Criteria

1. **Initial Load Time**: Giảm từ 2.5s xuống < 1.5s (target 1.2s)
2. **Mobile FPS**: Tăng từ 18 lên ≥ 55
3. **Memory Usage**: Giảm từ 180MB xuống < 95MB (target 85MB)
4. **Firestore Reads**: Giảm từ 700/day xuống < 300/day (target 250/day)
5. **Bundle Size**: Giảm từ 450KB xuống < 320KB
6. **Chat Lag**: Giảm từ 650ms xuống < 200ms (target 150ms)
7. **Cache Hit Rate**: Đạt > 60%
8. **Component Re-renders**: Giảm > 50%
