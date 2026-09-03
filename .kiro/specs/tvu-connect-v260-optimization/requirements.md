# Requirements Document - TVU Connect v2.6.0 Tối ưu hóa toàn diện

## Introduction

TVU Connect v2.6.0 là nền tảng kết nối sinh viên Đại học Trà Vinh với 58 components, bundle size 730KB, và 80K Firestore reads/ngày. Hiện tại chưa nâng cấp lên Firebase Blaze plan, cần tối ưu hóa ngay để chuẩn bị cho việc scale. Tính năng này nhằm giải quyết 4 vấn đề chính: (1) Cắt giảm Firestore Reads xuống <40K/ngày, (2) Giảm Bundle size xuống <500KB, (3) Củng cố bảo mật và tính nhất quán state, (4) Tối ưu trải nghiệm mạng yếu (3G).

## Glossary

- **Cache_Manager**: Hệ thống quản lý cache với localStorage/sessionStorage và TTL
- **Query_Optimizer**: Hệ thống tối ưu Firestore queries với pagination và limits
- **Code_Splitter**: Hệ thống chia nhỏ bundle bằng React.lazy và Suspense
- **Image_Optimizer**: Hệ thống tối ưu ảnh với client-side compression
- **Debouncer**: Hệ thống trì hoãn execution cho search và filter
- **Listener_Manager**: Hệ thống quản lý Firestore real-time listeners
- **TTL**: Time-To-Live, thời gian sống của cached data (milliseconds)
- **LRU**: Least Recently Used, chiến lược eviction cache
- **Bundle_Size**: Kích thước file JavaScript sau khi build
- **Tree_Shaking**: Kỹ thuật loại bỏ code không sử dụng
- **Lazy_Loading**: Kỹ thuật load code/data khi cần thiết
- **Skeleton_Loader**: UI placeholder hiển thị khi đang load data
- **Named_Import**: Import cụ thể từ module (ví dụ: import { Icon } from 'lucide-react')
- **Composite_Index**: Firestore index kết hợp nhiều fields

## Requirements

### Requirement 1: Cache-First Strategy cho Posts Feed

**User Story:** Là một sinh viên, tôi muốn xem bảng tin load nhanh mà không tốn nhiều Firestore reads, để tiết kiệm chi phí và cải thiện trải nghiệm.

#### Acceptance Criteria

1. WHEN loading posts feed, THE Cache_Manager SHALL check sessionStorage first before querying Firestore
2. THE Cache_Manager SHALL cache posts feed with TTL 60 seconds
3. WHEN cache hit, THE system SHALL return data instantly without Firestore read
4. WHEN cache miss or expired, THE Query_Optimizer SHALL fetch from Firestore with limit 10
5. THE Query_Optimizer SHALL use pagination with startAfter cursor for "Load more"
6. THE system SHALL reduce Posts Feed reads from ~25K/day to ~8K/day (68% reduction)
7. THE Cache_Manager SHALL store cache key as 'posts:feed' in sessionStorage


### Requirement 2: Cache-First Strategy cho Matching System

**User Story:** Là một sinh viên, tôi muốn hệ thống ghép đôi không hiển thị lại profiles đã xem, để không lãng phí Firestore reads và cải thiện trải nghiệm.

#### Acceptance Criteria

1. THE Cache_Manager SHALL cache viewed profiles in localStorage with key 'matching:viewed:{userId}'
2. THE Cache_Manager SHALL set TTL 24 hours for viewed profiles cache
3. WHEN loading next profile, THE system SHALL exclude cached viewed UIDs from query
4. THE Query_Optimizer SHALL limit matching query to 50 profiles per request
5. THE Listener_Manager SHALL save match history in batches of 10 instead of individual writes
6. THE system SHALL reduce Matching reads from ~20K/day to ~6K/day (70% reduction)
7. WHEN user blocks someone, THE Cache_Manager SHALL invalidate matching cache

### Requirement 3: Cache-First Strategy cho Messages

**User Story:** Là một sinh viên, tôi muốn danh sách tin nhắn load nhanh, để tôi có thể truy cập hội thoại mà không phải chờ đợi.

#### Acceptance Criteria

1. THE Cache_Manager SHALL cache conversations list with TTL 120 seconds in sessionStorage
2. THE Query_Optimizer SHALL limit conversations query to 20 items
3. THE Query_Optimizer SHALL limit messages query to 30 items per conversation
4. THE Listener_Manager SHALL maintain only 1 active listener per conversation
5. WHEN user switches conversation, THE Listener_Manager SHALL unsubscribe from previous listener
6. THE system SHALL reduce Messages reads from ~15K/day to ~5K/day (67% reduction)
7. THE Cache_Manager SHALL use cache key pattern 'conversations:list:{userId}'

### Requirement 4: Cache-First Strategy cho Explore Places

**User Story:** Là một sinh viên, tôi muốn bản đồ địa điểm load nhanh trên mobile, để tôi có thể khám phá mà không bị lag.

#### Acceptance Criteria

1. THE Cache_Manager SHALL cache places data with TTL 300 seconds (5 minutes) in sessionStorage
2. THE Query_Optimizer SHALL limit places query to 100 on mobile, 200 on desktop
3. WHEN category filter applied, THE Query_Optimizer SHALL use where clause at database level
4. THE Query_Optimizer SHALL filter expired check-ins at database level using where clause
5. THE system SHALL reduce Explore reads from ~10K/day to ~3K/day (70% reduction)
6. THE Cache_Manager SHALL use cache key pattern 'places:{category}' or 'places:all'
7. WHEN user creates new place, THE Cache_Manager SHALL invalidate places cache

### Requirement 5: Cache-First Strategy cho User Profiles

**User Story:** Là một sinh viên, tôi muốn xem profile người khác load nhanh, để tôi có thể quyết định kết nối mà không chờ đợi.

#### Acceptance Criteria

1. THE Cache_Manager SHALL cache user profiles with TTL 180 seconds (3 minutes) in sessionStorage
2. THE Query_Optimizer SHALL batch fetch blocked users in one query using 'where uid in array'
3. THE Query_Optimizer SHALL limit blocked users query to 30 items
4. THE system SHALL reduce Profile reads from ~10K/day to ~3K/day (70% reduction)
5. THE Cache_Manager SHALL use cache key pattern 'profile:{userId}'
6. WHEN user updates own profile, THE Cache_Manager SHALL invalidate that profile cache
7. THE system SHALL reuse cached profile data across different components


### Requirement 6: Debounce cho Search và Filter

**User Story:** Là một sinh viên, tôi muốn search và filter không gây ra quá nhiều Firestore queries, để tiết kiệm chi phí và cải thiện hiệu suất.

#### Acceptance Criteria

1. THE Debouncer SHALL delay search execution by 300ms after user stops typing
2. THE Debouncer SHALL cancel previous pending search when new input received
3. THE Cache_Manager SHALL cache search results with TTL 300 seconds in sessionStorage
4. THE Cache_Manager SHALL use cache key pattern 'search:{term}'
5. THE Debouncer SHALL delay filter execution by 500ms for category/major filters
6. THE Query_Optimizer SHALL limit search results to 20 items
7. THE system SHALL reduce search-related reads by at least 80%

### Requirement 7: Code Splitting cho Heavy Components

**User Story:** Là một sinh viên, tôi muốn app load nhanh lần đầu, để tôi có thể bắt đầu sử dụng ngay mà không phải chờ download toàn bộ code.

#### Acceptance Criteria

1. THE Code_Splitter SHALL use React.lazy for Explore component (contains Leaflet ~150KB)
2. THE Code_Splitter SHALL use React.lazy for ConfessionsTab component
3. THE Code_Splitter SHALL use React.lazy for Matching component
4. THE Code_Splitter SHALL use React.lazy for AIAssistant component
5. THE Code_Splitter SHALL wrap lazy components with Suspense and SkeletonLoader fallback
6. THE system SHALL reduce initial bundle from 730KB to <280KB (62% reduction)
7. THE Code_Splitter SHALL create separate chunks: explore-feature, confessions-feature, matching-feature, ai-feature

### Requirement 8: Tree-shaking cho lucide-react Icons

**User Story:** Là một developer, tôi muốn chỉ bundle các icons thực sự sử dụng, để giảm bundle size và cải thiện load time.

#### Acceptance Criteria

1. THE system SHALL replace `import * as Icons from 'lucide-react'` with named imports
2. THE system SHALL import only used icons: `import { Heart, MessageCircle, Share2 } from 'lucide-react'`
3. THE system SHALL reduce lucide-react bundle from ~80KB to ~20KB (75% reduction)
4. THE system SHALL update all 58 components to use named imports
5. THE build process SHALL verify tree-shaking is working via bundle analysis
6. THE system SHALL document which icons are used in each component
7. THE system SHALL prevent importing unused icons in future development

### Requirement 9: Tree-shaking cho Firebase SDK

**User Story:** Là một developer, tôi muốn chỉ bundle các Firebase modules thực sự sử dụng, để giảm bundle size.

#### Acceptance Criteria

1. THE system SHALL use modular imports: `import { getFirestore } from 'firebase/firestore'`
2. THE system SHALL NOT import entire firebase package
3. THE system SHALL import only: firebase/app, firebase/auth, firebase/firestore, firebase/storage
4. THE system SHALL reduce firebase bundle from ~180KB to ~100KB (44% reduction)
5. THE build process SHALL verify no unused Firebase modules in bundle
6. THE system SHALL document Firebase imports in firebase.ts file
7. THE vite.config.ts SHALL configure firebase-vendor chunk correctly


### Requirement 10: Vite Build Configuration Optimization

**User Story:** Là một developer, tôi muốn Vite build configuration tối ưu, để tạo ra bundle nhỏ nhất có thể.

#### Acceptance Criteria

1. THE vite.config.ts SHALL configure manualChunks for vendor splitting
2. THE vite.config.ts SHALL set chunkSizeWarningLimit to 500KB
3. THE vite.config.ts SHALL enable terser minification with drop_console: true
4. THE vite.config.ts SHALL configure separate chunks for: react-vendor, firebase-vendor, map-vendor, icons-vendor
5. THE vite.config.ts SHALL configure feature chunks for lazy-loaded components
6. THE build process SHALL generate source maps for debugging
7. THE build process SHALL output bundle analysis report

### Requirement 11: Anonymity Audit cho Confessions

**User Story:** Là một developer, tôi muốn đảm bảo hệ thống anonymity hoạt động đúng, để bảo vệ quyền riêng tư sinh viên.

#### Acceptance Criteria

1. THE system SHALL verify anonymityManager.ts uses crypto.randomBytes(32) for salt generation
2. THE system SHALL verify per-confession salt strategy is implemented correctly
3. THE system SHALL verify generateCommentNickname produces consistent nicknames within same confession
4. THE system SHALL verify generateCommentNickname produces different nicknames across different confessions
5. THE system SHALL add unit tests for anonymity properties
6. THE system SHALL document anonymity guarantees in user-facing terms
7. THE system SHALL audit all usages of generateSaltedHash and generateCommentNickname

### Requirement 12: Single Source of Truth cho Profile State

**User Story:** Là một developer, tôi muốn profile state được quản lý tập trung, để tránh duplicate fetches và race conditions.

#### Acceptance Criteria

1. THE system SHALL create ProfileContext for centralized profile state management
2. THE ProfileContext SHALL provide fetchProfile function with built-in caching
3. THE ProfileContext SHALL cache profiles with TTL 180 seconds
4. THE system SHALL refactor all components to use ProfileContext instead of direct Firestore calls
5. THE system SHALL ensure profile updates propagate to all components using context
6. THE system SHALL reduce duplicate profile fetches by at least 60%
7. THE ProfileContext SHALL handle loading and error states consistently

### Requirement 13: Single Source of Truth cho Online Status

**User Story:** Là một developer, tôi muốn online status listeners được quản lý tập trung, để tránh duplicate listeners và memory leaks.

#### Acceptance Criteria

1. THE Listener_Manager SHALL maintain Map of active online status listeners
2. THE Listener_Manager SHALL reuse existing listener if one already exists for a user
3. THE Listener_Manager SHALL cache online status with TTL 30 seconds
4. WHEN component unmounts, THE Listener_Manager SHALL unsubscribe from listener
5. THE system SHALL prevent duplicate listeners for same user
6. THE system SHALL reduce online status reads by at least 70%
7. THE Listener_Manager SHALL provide cleanup function for all listeners


### Requirement 14: Skeleton Loading cho Mobile

**User Story:** Là một sinh viên dùng mạng 3G, tôi muốn thấy skeleton loading thay vì màn hình trắng, để biết app đang load và không bị layout shift.

#### Acceptance Criteria

1. THE system SHALL display SkeletonLoader for ConfessionCard with 200ms delay
2. THE system SHALL display SkeletonLoader for PostCard with 200ms delay
3. THE system SHALL display SkeletonLoader for PlaceList with 300ms delay
4. THE SkeletonLoader SHALL match actual component dimensions to prevent CLS (Cumulative Layout Shift)
5. THE SkeletonLoader SHALL use shimmer animation for better UX
6. THE system SHALL measure and maintain CLS score < 0.1
7. THE SkeletonLoader SHALL be reusable across different components

### Requirement 15: Image Optimization với Client-side Compression

**User Story:** Là một sinh viên, tôi muốn upload ảnh nhanh chóng ngay cả khi mạng yếu, để tôi có thể chia sẻ nội dung mà không bị timeout.

#### Acceptance Criteria

1. THE Image_Optimizer SHALL validate image size < 800KB before upload
2. THE Image_Optimizer SHALL compress images using Canvas API if size > 800KB
3. THE Image_Optimizer SHALL resize images to max 1920x1080 while preserving aspect ratio
4. THE Image_Optimizer SHALL set compression quality to 0.8 for photos
5. THE Image_Optimizer SHALL show clear error message if compression fails
6. THE system SHALL reduce average upload time by at least 50% on 3G
7. THE Image_Optimizer SHALL support JPEG, PNG, and WebP formats

### Requirement 16: Progressive Image Loading

**User Story:** Là một sinh viên dùng mạng 3G, tôi muốn ảnh load dần dần, để tôi có thể xem nội dung text trước khi ảnh load xong.

#### Acceptance Criteria

1. THE system SHALL use Intersection Observer API for lazy image loading
2. THE system SHALL load images only when they enter viewport
3. THE system SHALL show placeholder (blur or skeleton) while image loading
4. THE system SHALL prioritize above-the-fold images
5. THE system SHALL defer below-the-fold images until user scrolls
6. THE system SHALL reduce initial page load time by at least 40%
7. THE system SHALL handle image load errors gracefully with fallback

### Requirement 17: Real-time Listener Optimization

**User Story:** Là một developer, tôi muốn real-time listeners được tối ưu, để giảm snapshot reads và memory usage.

#### Acceptance Criteria

1. THE Listener_Manager SHALL unsubscribe from listeners when component unmounts
2. THE Listener_Manager SHALL prevent duplicate listeners for same query
3. THE Listener_Manager SHALL use query limits to reduce snapshot size
4. THE Listener_Manager SHALL provide listener registry to track active listeners
5. THE system SHALL reduce snapshot reads by at least 50%
6. THE Listener_Manager SHALL log warning if more than 10 active listeners
7. THE Listener_Manager SHALL provide cleanup function to unsubscribe all listeners


### Requirement 18: Cache Manager Implementation

**User Story:** Là một developer, tôi muốn có Cache Manager tổng quát, để dễ dàng implement caching cho mọi feature.

#### Acceptance Criteria

1. THE Cache_Manager SHALL provide getCachedData<T>(config: CacheConfig): T | null function
2. THE Cache_Manager SHALL provide setCachedData<T>(config: CacheConfig, data: T): void function
3. THE Cache_Manager SHALL support both localStorage and sessionStorage
4. THE Cache_Manager SHALL automatically remove expired entries based on TTL
5. THE Cache_Manager SHALL implement LRU eviction when storage > 80% full
6. THE Cache_Manager SHALL provide invalidateCache(pattern: string) for bulk invalidation
7. THE Cache_Manager SHALL handle QuotaExceededError gracefully

### Requirement 19: Query Optimizer Implementation

**User Story:** Là một developer, tôi muốn có Query Optimizer tổng quát, để dễ dàng tối ưu mọi Firestore query.

#### Acceptance Criteria

1. THE Query_Optimizer SHALL provide optimizeQuery(config: QueryConfig): Query function
2. THE Query_Optimizer SHALL apply limit clause to all queries
3. THE Query_Optimizer SHALL apply orderBy clause if specified
4. THE Query_Optimizer SHALL apply where clauses at database level
5. THE Query_Optimizer SHALL support pagination with startAfter cursor
6. THE Query_Optimizer SHALL integrate with Cache_Manager for cache-first strategy
7. THE Query_Optimizer SHALL log query execution time and document reads

### Requirement 20: Performance Monitoring

**User Story:** Là một developer, tôi muốn theo dõi hiệu suất optimization, để đảm bảo đạt được mục tiêu đề ra.

#### Acceptance Criteria

1. THE system SHALL track total Firestore reads per day
2. THE system SHALL track cache hit rate for each collection
3. THE system SHALL track bundle size after each build
4. THE system SHALL track page load time (LCP, FID, CLS)
5. THE system SHALL provide dashboard showing optimization metrics
6. THE system SHALL alert when daily reads exceed 40K
7. THE system SHALL compare metrics before and after optimization

### Requirement 21: Migration và Deployment

**User Story:** Là một developer, tôi muốn có hướng dẫn migration rõ ràng, để deploy optimization lên production an toàn.

#### Acceptance Criteria

1. THE system SHALL provide step-by-step migration guide
2. THE system SHALL provide rollback plan if optimization causes issues
3. THE system SHALL deploy composite indexes before enabling optimized queries
4. THE system SHALL use feature flags to enable/disable optimizations
5. THE system SHALL provide testing checklist for all optimized features
6. THE system SHALL backup Firestore data before migration
7. THE system SHALL monitor error rates during and after deployment

### Requirement 22: Documentation

**User Story:** Là một developer, tôi muốn có documentation đầy đủ, để hiểu và maintain optimization code.

#### Acceptance Criteria

1. THE system SHALL document all cache keys and TTL values
2. THE system SHALL document all lazy-loaded components
3. THE system SHALL document all debounced functions
4. THE system SHALL provide code examples for common optimization patterns
5. THE system SHALL document performance benchmarks before and after
6. THE system SHALL provide troubleshooting guide for common issues
7. THE system SHALL document Firebase cost savings calculations


### Requirement 23: Cost Reduction Targets

**User Story:** Là một product owner, tôi muốn đạt được mục tiêu giảm chi phí cụ thể, để đảm bảo nền tảng hoạt động bền vững.

#### Acceptance Criteria

1. THE system SHALL reduce total Firestore reads from 80K/day to <40K/day (50% reduction)
2. THE system SHALL reduce Posts Feed reads from 25K/day to 8K/day (68% reduction)
3. THE system SHALL reduce Matching reads from 20K/day to 6K/day (70% reduction)
4. THE system SHALL reduce Messages reads from 15K/day to 5K/day (67% reduction)
5. THE system SHALL reduce Explore reads from 10K/day to 3K/day (70% reduction)
6. THE system SHALL reduce Profile reads from 10K/day to 3K/day (70% reduction)
7. THE system SHALL calculate and report estimated monthly cost savings

### Requirement 24: Bundle Size Targets

**User Story:** Là một product owner, tôi muốn đạt được mục tiêu giảm bundle size cụ thể, để cải thiện load time.

#### Acceptance Criteria

1. THE system SHALL reduce initial bundle from 730KB to <280KB (62% reduction)
2. THE system SHALL reduce lucide-react from 80KB to 20KB (75% reduction)
3. THE system SHALL reduce firebase from 180KB to 100KB (44% reduction)
4. THE system SHALL create explore-feature chunk ~150KB (lazy loaded)
5. THE system SHALL create confessions-feature chunk ~40KB (lazy loaded)
6. THE system SHALL create matching-feature chunk ~30KB (lazy loaded)
7. THE system SHALL measure and report First Contentful Paint (FCP) improvement

### Requirement 25: Testing Requirements

**User Story:** Là một developer, tôi muốn có test coverage đầy đủ, để đảm bảo optimization không gây ra bugs.

#### Acceptance Criteria

1. THE system SHALL have unit tests for Cache_Manager (get, set, eviction, TTL)
2. THE system SHALL have unit tests for Query_Optimizer (limits, pagination, filters)
3. THE system SHALL have unit tests for Debouncer (delay, cancellation)
4. THE system SHALL have unit tests for Image_Optimizer (compression, resize)
5. THE system SHALL have property-based tests for cache TTL behavior
6. THE system SHALL have property-based tests for pagination uniqueness
7. THE system SHALL have integration tests for cache-first data flow

### Requirement 26: Error Handling Requirements

**User Story:** Là một sinh viên, tôi muốn app xử lý lỗi gracefully, để tôi vẫn có thể sử dụng app khi có vấn đề.

#### Acceptance Criteria

1. WHEN storage quota exceeded, THE Cache_Manager SHALL evict 20% oldest entries and retry
2. WHEN Firestore permission denied, THE system SHALL show user-friendly error message
3. WHEN network timeout, THE system SHALL return cached data if available (stale-while-revalidate)
4. WHEN lazy component load fails, THE system SHALL show error boundary with retry button
5. WHEN image compression fails, THE system SHALL upload original if size < 800KB
6. THE system SHALL log all errors to monitoring system
7. THE system SHALL provide fallback UI for all error scenarios

