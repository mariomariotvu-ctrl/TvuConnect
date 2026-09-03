# Requirements Document: Platform Performance Critical Fixes

## Introduction

Nền tảng TVU Connect (mạng xã hội sinh viên) đang gặp các vấn đề hiệu suất nghiêm trọng ảnh hưởng trực tiếp đến trải nghiệm người dùng. Document này định nghĩa các yêu cầu để khắc phục 8 vấn đề CRITICAL, giảm initial load từ 2.5s xuống 1.2s, tăng mobile FPS từ 18 lên 55, giảm memory leak từ 180MB xuống 85MB, và giảm Firestore reads từ 700/day xuống 250/day.

## Glossary

- **Platform**: Nền tảng TVU Connect (mạng xã hội sinh viên)
- **Memory_Leak**: Rò rỉ bộ nhớ do event listeners không được cleanup
- **Firestore_Query**: Truy vấn đến Firestore database
- **Component_Re_Render**: React component render lại không cần thiết
- **Bundle_Size**: Kích thước file JavaScript sau khi build
- **Code_Splitting**: Kỹ thuật chia nhỏ bundle thành các chunks nhỏ hơn
- **Lazy_Loading**: Kỹ thuật tải component/module chỉ khi cần thiết
- **Virtual_Scrolling**: Kỹ thuật chỉ render các items visible trong viewport
- **Cache_TTL**: Time-To-Live của cache entry
- **Composite_Index**: Firestore index cho queries với nhiều điều kiện
- **ListenerRegistry**: Hệ thống quản lý tập trung các Firestore listeners
- **React_Memo**: React optimization technique để prevent re-renders
- **Initial_Load**: Thời gian từ khi user truy cập đến khi app sẵn sàng sử dụng
- **Mobile_FPS**: Frames per second trên thiết bị mobile
- **Chat_Lag**: Độ trễ khi gửi/nhận tin nhắn trong chat

## Requirements

### Requirement 1: Memory Leak Prevention System

**User Story:** Là một developer, tôi muốn tất cả event listeners được cleanup tự động, để tránh memory leak và app crash sau 30-60 phút sử dụng.

#### Acceptance Criteria

1. THE ListenerRegistry SHALL quản lý tất cả Firestore listeners trong Platform
2. WHEN một component unmount, THE ListenerRegistry SHALL tự động cleanup tất cả listeners của component đó
3. THE Chat_Component SHALL sử dụng ListenerRegistry để đăng ký tất cả listeners (messages, typing, receiver profile)
4. THE MapView_Component SHALL sử dụng ListenerRegistry để đăng ký tất cả onSnapshot listeners
5. WHEN Platform chạy trong 60 phút, THE Memory_Usage SHALL không tăng quá 10MB so với baseline
6. THE ListenerRegistry SHALL cung cấp method getActiveListenerCount() để monitoring
7. WHEN một listener bị duplicate, THE ListenerRegistry SHALL reuse listener hiện có thay vì tạo mới
8. THE Platform SHALL log warning WHEN số lượng active listeners vượt quá 10

### Requirement 2: Firestore Query Optimization

**User Story:** Là một user, tôi muốn app tải nhanh và không tốn quá nhiều Firestore reads, để tiết kiệm chi phí và cải thiện performance.

#### Acceptance Criteria

1. THE MapView SHALL giới hạn places query ở 20-30 items thay vì 100-200
2. THE Chat SHALL giới hạn messages query ở 50 messages mới nhất
3. THE PlaceList SHALL implement pagination với 20 items per page
4. WHEN user scroll đến cuối list, THE PlaceList SHALL tự động load thêm 20 items tiếp theo
5. THE Platform SHALL tạo composite indexes cho tất cả queries phức tạp
6. THE MapView SHALL sử dụng geohash hoặc bounding box để query places trong khu vực visible
7. THE Platform SHALL cache Firestore query results với TTL 5 phút
8. WHEN cache hit, THE Platform SHALL không thực hiện Firestore read
9. THE Platform SHALL giảm Firestore reads từ 700/day xuống 250/day (64% reduction)

### Requirement 3: Component Re-render Optimization

**User Story:** Là một mobile user, tôi muốn app chạy mượt mà với FPS cao, để có trải nghiệm tốt khi sử dụng.

#### Acceptance Criteria

1. THE Matching_Component SHALL sử dụng React.memo để prevent re-renders khi filters không thay đổi
2. THE MapView SHALL sử dụng React.memo cho marker components
3. THE MapView SHALL chỉ re-render markers khi places data thay đổi, không re-render khi map pan/zoom
4. THE AIAssistant SHALL sử dụng useMemo để memoize message list
5. THE PlaceList SHALL sử dụng React.memo cho PlaceCard components
6. WHEN filters thay đổi, THE Matching_Component SHALL chỉ re-render filtered results, không re-render toàn bộ component tree
7. THE Platform SHALL giảm CPU usage từ 50-70% xuống dưới 30% trên mobile
8. THE Platform SHALL đạt Mobile_FPS từ 55 trở lên (tăng từ 18 FPS)

### Requirement 4: Bundle Size & Code Splitting Optimization

**User Story:** Là một user với kết nối internet chậm, tôi muốn app load nhanh, để không phải chờ lâu khi truy cập.

#### Acceptance Criteria

1. THE Platform SHALL lazy load Leaflet library chỉ khi user mở Map tab
2. THE Platform SHALL lazy load AIAssistant component chỉ khi user mở AI tab
3. THE Platform SHALL lazy load React_Joyride chỉ khi user chưa hoàn thành onboarding
4. WHEN user đã hoàn thành onboarding, THE Platform SHALL không load React_Joyride
5. THE Platform SHALL giảm Initial_Bundle_Size từ 450KB xuống 320KB (29% reduction)
6. THE Platform SHALL implement route-based code splitting cho các pages chính
7. THE Platform SHALL sử dụng dynamic imports cho tất cả heavy libraries
8. THE Platform SHALL đạt Initial_Load time dưới 1.5 giây (giảm từ 2.5s)

### Requirement 5: Mobile Performance Optimization

**User Story:** Là một mobile user, tôi muốn app chạy mượt mà trên điện thoại, để có trải nghiệm tương đương desktop.

#### Acceptance Criteria

1. THE MapView SHALL giới hạn số lượng markers hiển thị ở 30 trên mobile (thay vì 100)
2. THE MapView SHALL sử dụng preferCanvas option cho Leaflet trên mobile
3. THE PlaceList SHALL implement virtual scrolling để chỉ render 10-15 items visible
4. WHEN user scroll, THE PlaceList SHALL dynamically render/unmount items
5. THE Platform SHALL optimize images với lazy loading và responsive sizes
6. THE Platform SHALL sử dụng WebP format cho images khi browser hỗ trợ
7. THE Platform SHALL đạt Mobile_FPS từ 55 trở lên
8. THE Platform SHALL giảm memory usage từ 180MB xuống 85MB trên mobile

### Requirement 6: Caching Strategy Enhancement

**User Story:** Là một developer, tôi muốn caching strategy hiệu quả, để giảm Firestore reads và tăng tốc độ app.

#### Acceptance Criteria

1. THE Platform SHALL tăng Cache_TTL từ 60s lên 300s (5 phút) cho places data
2. THE Platform SHALL implement cache warming cho frequently accessed data
3. WHEN app khởi động, THE Platform SHALL pre-load top 20 places vào cache
4. THE Viewed_Profiles_Cache SHALL persist trong sessionStorage thay vì memory
5. THE Platform SHALL implement stale-while-revalidate strategy cho non-critical data
6. WHEN cache expired, THE Platform SHALL serve stale data và fetch fresh data ở background
7. THE Platform SHALL giảm Firestore reads từ 700/day xuống 250/day
8. THE Platform SHALL track cache hit rate và log khi hit rate < 60%

### Requirement 7: Console Logs & Debug Code Cleanup

**User Story:** Là một developer, tôi muốn production build sạch sẽ không có debug code, để giảm bundle size và tăng bảo mật.

#### Acceptance Criteria

1. THE Platform SHALL remove tất cả console.log() statements trong production build
2. THE Platform SHALL sử dụng logger utility consistently thay vì console.log()
3. THE Logger SHALL tự động disable trong production environment
4. THE Platform SHALL remove tất cả debug code và commented code
5. THE Platform SHALL giảm Bundle_Size thêm 20-30KB sau khi cleanup
6. THE Vite_Config SHALL configure terser để drop_console trong production
7. THE Platform SHALL sử dụng logger.debug() cho debug logs thay vì console.log()
8. THE Platform SHALL chỉ log errors và warnings trong production

### Requirement 8: Firestore Rules & Indexes Optimization

**User Story:** Là một developer, tôi muốn Firestore queries chạy nhanh với proper indexes, để cải thiện performance và giảm latency.

#### Acceptance Criteria

1. THE Platform SHALL tạo composite indexes cho tất cả queries với multiple where clauses
2. THE Platform SHALL tạo composite index cho messages query (conversationId + createdAt)
3. THE Platform SHALL tạo composite index cho places query (category + rating)
4. THE Platform SHALL tạo composite index cho checkIns query (placeId + expiresAt)
5. THE Firestore_Rules SHALL implement rate limiting để prevent abuse
6. THE Firestore_Rules SHALL giới hạn query size ở maximum 100 documents
7. WHEN query không có proper index, THE Platform SHALL log warning và suggest index
8. THE Platform SHALL giảm query latency từ 500-800ms xuống dưới 200ms

### Requirement 9: Chat Performance Optimization

**User Story:** Là một user, tôi muốn chat real-time mượt mà không bị lag, để có trải nghiệm chat tốt.

#### Acceptance Criteria

1. THE Chat SHALL sử dụng useCachedMessages hook với single active listener
2. THE Chat SHALL implement message pagination với 50 messages per load
3. WHEN user scroll lên, THE Chat SHALL tự động load thêm 50 messages cũ hơn
4. THE Chat SHALL sử dụng React.memo cho MessageItem components
5. THE Chat SHALL debounce typing indicator updates (2 giây)
6. THE Chat SHALL giảm Chat_Lag từ 650ms xuống 150ms (77% reduction)
7. THE Chat SHALL optimize scroll behavior để không scroll khi delete message
8. THE Chat SHALL cache conversation list với TTL 5 phút

### Requirement 10: Performance Monitoring & Metrics

**User Story:** Là một developer, tôi muốn monitor performance metrics real-time, để phát hiện và fix performance issues sớm.

#### Acceptance Criteria

1. THE Platform SHALL track Initial_Load time và log khi > 1.5 giây
2. THE Platform SHALL track Mobile_FPS và log khi < 50 FPS
3. THE Platform SHALL track Memory_Usage và log khi tăng > 100MB
4. THE Platform SHALL track Firestore_Reads per day và log khi > 300 reads
5. THE Platform SHALL track Cache_Hit_Rate và log khi < 60%
6. THE Platform SHALL track Component_Render_Count và log khi > 100 renders/second
7. THE Platform SHALL expose performance metrics qua /api/metrics endpoint
8. THE Platform SHALL send performance alerts khi metrics vượt threshold

## Correctness Properties

### Property 1: Memory Leak Prevention (Invariant)

**Property:** Memory usage không tăng quá 10MB sau 60 phút sử dụng liên tục

**Test Strategy:** 
- Chạy app trong 60 phút với typical user behavior
- Measure memory usage mỗi 5 phút
- Assert: `memory_at_60min - memory_at_0min <= 10MB`

### Property 2: Listener Cleanup (Invariant)

**Property:** Số lượng active listeners không vượt quá 10 tại bất kỳ thời điểm nào

**Test Strategy:**
- Monitor ListenerRegistry.getActiveListenerCount() trong suốt session
- Assert: `activeListenerCount <= 10` at all times

### Property 3: Firestore Reads Reduction (Metamorphic)

**Property:** Tổng Firestore reads sau optimization < 40% so với trước optimization

**Test Strategy:**
- Measure Firestore reads trong 24h trước optimization
- Measure Firestore reads trong 24h sau optimization
- Assert: `reads_after < reads_before * 0.4`

### Property 4: Bundle Size Reduction (Metamorphic)

**Property:** Initial bundle size sau optimization < 75% so với trước optimization

**Test Strategy:**
- Measure bundle size trước optimization: 450KB
- Measure bundle size sau optimization
- Assert: `bundle_after < 450KB * 0.75` (< 337.5KB, target 320KB)

### Property 5: Cache Hit Rate (Invariant)

**Property:** Cache hit rate >= 60% cho tất cả cached queries

**Test Strategy:**
- Track cache hits và misses trong 24h
- Calculate hit rate: `hits / (hits + misses)`
- Assert: `hit_rate >= 0.6`

### Property 6: Component Re-render Optimization (Metamorphic)

**Property:** Số lượng component re-renders giảm > 50% sau optimization

**Test Strategy:**
- Count component renders trước optimization (sử dụng React DevTools Profiler)
- Count component renders sau optimization
- Assert: `renders_after < renders_before * 0.5`

### Property 7: Mobile FPS Improvement (Metamorphic)

**Property:** Mobile FPS tăng > 200% (từ 18 lên 55+)

**Test Strategy:**
- Measure FPS trên mobile device trước optimization
- Measure FPS trên mobile device sau optimization
- Assert: `fps_after >= fps_before * 3` (18 * 3 = 54)

### Property 8: Initial Load Time Reduction (Metamorphic)

**Property:** Initial load time giảm > 50% (từ 2.5s xuống < 1.5s)

**Test Strategy:**
- Measure initial load time trước optimization
- Measure initial load time sau optimization
- Assert: `load_time_after < load_time_before * 0.6` (2.5s * 0.6 = 1.5s)

### Property 9: Chat Lag Reduction (Metamorphic)

**Property:** Chat lag giảm > 75% (từ 650ms xuống < 200ms)

**Test Strategy:**
- Measure time từ khi send message đến khi message hiển thị
- Measure trước và sau optimization
- Assert: `chat_lag_after < chat_lag_before * 0.25` (650ms * 0.25 = 162.5ms)

### Property 10: Lazy Loading Effectiveness (Round Trip)

**Property:** Components được lazy load chỉ load khi cần thiết và unload khi không dùng

**Test Strategy:**
- Navigate to Map tab → Assert Leaflet loaded
- Navigate away from Map → Assert Leaflet unloaded (if possible)
- Navigate to AI tab → Assert AIAssistant loaded
- Navigate away from AI → Assert AIAssistant unloaded

## Testing Guidance

### Parser/Serializer Requirements
Không có parser hoặc serializer trong feature này.

### Critical Test Scenarios

1. **Memory Leak Test**: Chạy app liên tục 60 phút, monitor memory usage
2. **Firestore Reads Test**: Track Firestore reads trong 24h, verify < 300 reads/day
3. **Bundle Size Test**: Build production, verify bundle < 320KB
4. **Mobile Performance Test**: Test trên real mobile device, verify FPS > 50
5. **Cache Hit Rate Test**: Monitor cache trong 24h, verify hit rate > 60%
6. **Lazy Loading Test**: Verify components chỉ load khi cần thiết
7. **Component Re-render Test**: Use React DevTools Profiler, verify re-renders giảm > 50%
8. **Chat Performance Test**: Measure chat lag, verify < 200ms

### Performance Benchmarks

**Baseline (Trước Optimization):**
- Initial Load: 2.5-3s
- Mobile FPS: 15-20
- Memory: 180MB (sau 60 phút)
- Firestore Reads: 500-800/day
- Bundle Size: 450KB
- Chat Lag: 500-800ms
- CPU Usage: 50-70%

**Target (Sau Optimization):**
- Initial Load: < 1.5s (52% ⬇️)
- Mobile FPS: 55+ (206% ⬆️)
- Memory: < 95MB (53% ⬇️)
- Firestore Reads: 200-300/day (64% ⬇️)
- Bundle Size: < 320KB (29% ⬇️)
- Chat Lag: < 200ms (77% ⬇️)
- CPU Usage: < 30% (57% ⬇️)

## Success Metrics

1. **Initial Load Time**: Giảm từ 2.5s xuống 1.2s
2. **Mobile FPS**: Tăng từ 18 lên 55
3. **Memory Usage**: Giảm từ 180MB xuống 85MB
4. **Firestore Reads**: Giảm từ 700/day xuống 250/day
5. **Bundle Size**: Giảm từ 450KB xuống 320KB
6. **Chat Lag**: Giảm từ 650ms xuống 150ms
7. **Cache Hit Rate**: Đạt > 60%
8. **Component Re-renders**: Giảm > 50%

## Priority

1. **CRITICAL**: Memory leak cleanup, Firestore query optimization, Lazy loading
2. **HIGH**: Component memoization, Mobile optimization, Virtual scrolling
3. **MEDIUM**: Cache improvement, Composite indexes, Console logs cleanup
