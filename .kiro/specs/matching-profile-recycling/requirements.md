# Requirements Document - Matching Profile Recycling System

## Introduction

TVU Connect là nền tảng kết nối sinh viên với hệ thống matching 4 chế độ (lover, study, hobby, quick). Hiện tại, khi người dùng đã xem hết tất cả hồ sơ phù hợp với bộ lọc của họ, hệ thống hiển thị thông báo "Không còn hồ sơ phù hợp" và người dùng bị "kẹt" - không thể tiếp tục matching cho đến khi có người dùng mới hoặc đợi 24 giờ để cache xóa. Điều này tạo trải nghiệm không tốt, đặc biệt với các bộ lọc hẹp.

Hệ thống Profile Recycling triển khai 3 cấp độ tìm kiếm thông minh: (1) Fresh Profiles - hồ sơ chưa xem, (2) Stale Profiles - hồ sơ đã xem > 7 ngày, (3) All Profiles - tất cả hồ sơ đã xem. Hệ thống tự động chuyển đổi giữa các cấp độ, hiển thị indicator rõ ràng, và tối ưu Firestore queries để giảm chi phí.

## Glossary

- **Profile_Recycling_System**: Hệ thống tái sử dụng hồ sơ đã xem với 3 cấp độ
- **Fresh_Profile**: Hồ sơ chưa từng được xem bởi người dùng
- **Stale_Profile**: Hồ sơ đã xem cách đây > 7 ngày
- **Recycled_Profile**: Hồ sơ đã xem trong vòng 7 ngày
- **Tier_Manager**: Module quản lý chuyển đổi giữa các cấp độ
- **View_History_Cache**: Cache lưu lịch sử xem hồ sơ với timestamp
- **Cooldown_Period**: Khoảng thời gian 7 ngày trước khi hồ sơ có thể hiển thị lại
- **Tier_Indicator**: UI component hiển thị cấp độ hiện tại
- **Last_Viewed_Badge**: Badge hiển thị thời gian xem lần cuối
- **Matching_Mode**: Một trong 4 chế độ: lover, study, hobby, quick
- **Query_Optimizer**: Module tối ưu Firestore queries
- **Cache_Manager**: Module quản lý cache với TTL
- **Viewed_Profiles_Cache**: Cache hiện tại lưu UIDs đã xem (24h TTL)

## Requirements

### Requirement 1: Fresh Profiles Tier (Cấp 1)

**User Story:** Là sinh viên, tôi muốn xem các hồ sơ mới chưa từng xem trước, để có trải nghiệm matching tốt nhất với những người hoàn toàn mới.

#### Acceptance Criteria

1. WHEN loading matching profiles, THE Profile_Recycling_System SHALL prioritize Fresh_Profile entries first
2. THE Profile_Recycling_System SHALL filter out all UIDs present in View_History_Cache
3. THE Profile_Recycling_System SHALL sort Fresh_Profile by match score from high to low
4. WHEN displaying Fresh_Profile, THE Profile_Recycling_System SHALL NOT show any Last_Viewed_Badge
5. THE Profile_Recycling_System SHALL use existing Query_Optimizer with limit of 50 profiles per query
6. WHEN a Fresh_Profile is viewed, THE View_History_Cache SHALL store UID with current timestamp
7. THE Fresh_Profile query SHALL complete within 2 seconds on mobile networks

### Requirement 2: Stale Profiles Tier (Cấp 2)

**User Story:** Là sinh viên, tôi muốn xem lại các hồ sơ đã xem cách đây > 7 ngày, để có cơ hội kết nối lại với những người tôi có thể đã bỏ lỡ.

#### Acceptance Criteria

1. WHEN Fresh_Profile list is empty, THE Tier_Manager SHALL automatically transition to Stale_Profile tier
2. THE Profile_Recycling_System SHALL query profiles where UID exists in View_History_Cache AND last viewed timestamp > 7 days ago
3. THE Profile_Recycling_System SHALL sort Stale_Profile by last viewed time from oldest to newest
4. WHEN displaying Stale_Profile, THE Profile_Recycling_System SHALL show Last_Viewed_Badge with text "Đã xem lần cuối: X ngày trước"
5. THE Last_Viewed_Badge SHALL calculate days using formula: Math.floor((now - lastViewedTimestamp) / (24 * 60 * 60 * 1000))
6. THE Profile_Recycling_System SHALL limit Stale_Profile query to 30 profiles per request
7. THE transition from Fresh to Stale tier SHALL occur without page reload

### Requirement 3: All Profiles Tier (Cấp 3)

**User Story:** Là sinh viên, tôi muốn xem tất cả hồ sơ kể cả đã xem gần đây, để không bao giờ thấy thông báo "hết hồ sơ" và có thể tiếp tục matching.

#### Acceptance Criteria

1. WHEN Stale_Profile list is empty, THE Tier_Manager SHALL automatically transition to All Profiles tier
2. THE Profile_Recycling_System SHALL query all profiles in View_History_Cache regardless of timestamp
3. THE Profile_Recycling_System SHALL sort All Profiles by last viewed time from oldest to newest
4. WHEN displaying Recycled_Profile, THE Profile_Recycling_System SHALL show Last_Viewed_Badge with appropriate time unit
5. IF last viewed < 24 hours ago, THEN Last_Viewed_Badge SHALL display "Đã xem lần cuối: X giờ trước"
6. IF last viewed >= 24 hours ago, THEN Last_Viewed_Badge SHALL display "Đã xem lần cuối: X ngày trước"
7. THE Profile_Recycling_System SHALL limit All Profiles query to 20 profiles per request
8. THE transition from Stale to All tier SHALL occur without page reload

### Requirement 4: Tier Indicator UI

**User Story:** Là sinh viên, tôi muốn biết rõ mình đang ở cấp độ nào, để hiểu tại sao tôi thấy badge "đã xem" và quản lý kỳ vọng.

#### Acceptance Criteria

1. THE Tier_Indicator SHALL display current tier name at top of matching screen
2. WHEN in Fresh tier, THE Tier_Indicator SHALL show "🆕 Hồ sơ mới" with green color
3. WHEN in Stale tier, THE Tier_Indicator SHALL show "🔄 Xem lại (>7 ngày)" with orange color
4. WHEN in All tier, THE Tier_Indicator SHALL show "♻️ Tất cả hồ sơ" with blue color
5. THE Tier_Indicator SHALL include profile count text: "X hồ sơ khả dụng"
6. WHEN tier changes, THE Tier_Indicator SHALL animate transition with 300ms fade effect
7. THE Tier_Indicator SHALL be visible on both mobile and desktop layouts

### Requirement 5: View History Cache Enhancement

**User Story:** Là developer, tôi muốn View_History_Cache lưu timestamp chi tiết, để hỗ trợ logic phân cấp và hiển thị badge chính xác.

#### Acceptance Criteria

1. THE View_History_Cache SHALL store entries with structure: {uid: string, viewedAt: number, viewCount: number}
2. WHEN a profile is viewed, THE View_History_Cache SHALL update viewedAt to current timestamp
3. WHEN a profile is viewed multiple times, THE View_History_Cache SHALL increment viewCount
4. THE View_History_Cache SHALL maintain 24-hour TTL for cache invalidation
5. THE View_History_Cache SHALL persist to localStorage for cross-session continuity
6. WHEN loading from localStorage, THE View_History_Cache SHALL clean entries older than 30 days
7. THE View_History_Cache SHALL provide method getProfilesByAge(minDays: number) for tier filtering

### Requirement 6: Automatic Tier Transition Logic

**User Story:** Là sinh viên, tôi muốn hệ thống tự động chuyển cấp độ, để không phải thao tác thủ công khi hết hồ sơ.

#### Acceptance Criteria

1. THE Tier_Manager SHALL check if current tier has available profiles before displaying
2. WHEN current tier returns 0 profiles, THE Tier_Manager SHALL automatically advance to next tier
3. THE Tier_Manager SHALL attempt Fresh tier first, then Stale tier, then All tier
4. WHEN transitioning tiers, THE Tier_Manager SHALL update Tier_Indicator immediately
5. THE Tier_Manager SHALL log tier transition events to analytics
6. THE tier transition SHALL complete within 500ms
7. IF all tiers return 0 profiles, THEN THE Tier_Manager SHALL display "Không có hồ sơ phù hợp với bộ lọc"

### Requirement 7: Cache Strategy Optimization

**User Story:** Là developer, tôi muốn cache strategy tối ưu cho từng tier, để giảm Firestore reads và cải thiện performance.

#### Acceptance Criteria

1. THE Cache_Manager SHALL cache Fresh_Profile results with TTL of 60 seconds
2. THE Cache_Manager SHALL cache Stale_Profile results with TTL of 300 seconds (5 minutes)
3. THE Cache_Manager SHALL cache All Profiles results with TTL of 600 seconds (10 minutes)
4. WHEN user applies new filters, THE Cache_Manager SHALL invalidate all tier caches
5. WHEN user changes Matching_Mode, THE Cache_Manager SHALL invalidate all tier caches
6. THE Cache_Manager SHALL use separate cache keys for each tier and filter combination
7. THE cache key format SHALL be: "tier:{tierName}:mode:{mode}:filters:{filterHash}"

### Requirement 8: Firestore Query Optimization

**User Story:** Là developer, tôi muốn Firestore queries được tối ưu, để không tăng chi phí quá 20% so với hiện tại.

#### Acceptance Criteria

1. THE Query_Optimizer SHALL reuse existing composite indexes for gender and major filters
2. THE Profile_Recycling_System SHALL perform UID filtering in-memory, not at database level
3. THE Profile_Recycling_System SHALL batch profile fetches in groups of 10 UIDs using "where uid in array"
4. WHEN fetching Stale_Profile, THE Query_Optimizer SHALL limit to 30 documents per query
5. WHEN fetching All Profiles, THE Query_Optimizer SHALL limit to 20 documents per query
6. THE Profile_Recycling_System SHALL track document reads per session
7. THE total Firestore reads SHALL NOT increase by more than 20% compared to baseline

### Requirement 9: Last Viewed Badge Component

**User Story:** Là sinh viên, tôi muốn thấy badge rõ ràng khi xem hồ sơ đã xem, để biết mình đã gặp người này trước đó.

#### Acceptance Criteria

1. THE Last_Viewed_Badge SHALL display as a small chip at top-right of profile card
2. THE Last_Viewed_Badge SHALL use gray background with white text
3. THE Last_Viewed_Badge SHALL show icon 👁️ followed by time text
4. WHEN last viewed < 1 hour, THE Last_Viewed_Badge SHALL show "Đã xem lần cuối: X phút trước"
5. WHEN last viewed < 24 hours, THE Last_Viewed_Badge SHALL show "Đã xem lần cuối: X giờ trước"
6. WHEN last viewed >= 24 hours, THE Last_Viewed_Badge SHALL show "Đã xem lần cuối: X ngày trước"
7. THE Last_Viewed_Badge SHALL NOT display for Fresh_Profile
8. THE Last_Viewed_Badge SHALL be responsive and readable on mobile screens

### Requirement 10: Smooth Transition Animation

**User Story:** Là sinh viên, tôi muốn chuyển đổi giữa các tier mượt mà, để trải nghiệm không bị gián đoạn hoặc giật lag.

#### Acceptance Criteria

1. WHEN tier changes, THE Profile_Recycling_System SHALL fade out current profile with 200ms duration
2. WHEN tier changes, THE Profile_Recycling_System SHALL show loading indicator for 300ms
3. WHEN new tier loads, THE Profile_Recycling_System SHALL fade in new profile with 200ms duration
4. THE Tier_Indicator SHALL slide in from top with 300ms ease-out animation
5. THE total transition time SHALL NOT exceed 1 second
6. THE animation SHALL use CSS transitions, not JavaScript setInterval
7. THE animation SHALL be disabled on low-end devices (detected via navigator.hardwareConcurrency < 4)

### Requirement 11: Analytics and Monitoring

**User Story:** Là product manager, tôi muốn theo dõi metrics của Profile Recycling, để đánh giá hiệu quả và tối ưu hơn nữa.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL log "tier_transition" event when changing tiers
2. THE "tier_transition" event SHALL include: fromTier, toTier, mode, timestamp, userId
3. THE Profile_Recycling_System SHALL log "profile_recycled_view" event when showing Stale or Recycled profile
4. THE Profile_Recycling_System SHALL track average time spent per tier
5. THE Profile_Recycling_System SHALL track percentage of users reaching each tier
6. THE analytics events SHALL be stored in Firestore collection "recycling_analytics"
7. THE analytics SHALL NOT block UI thread or delay profile loading

### Requirement 12: Filter Compatibility

**User Story:** Là sinh viên, tôi muốn Profile Recycling hoạt động với tất cả bộ lọc, để có trải nghiệm nhất quán bất kể tôi chọn filter gì.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL apply gender filter to all tiers
2. THE Profile_Recycling_System SHALL apply major filter to all tiers using majorNormalized field
3. THE Profile_Recycling_System SHALL apply academic year filter to all tiers
4. THE Profile_Recycling_System SHALL apply seniority filter (same/senior/junior) to all tiers
5. WHEN filters change, THE Tier_Manager SHALL reset to Fresh tier
6. WHEN filters change, THE Cache_Manager SHALL invalidate all cached results
7. THE filtered results SHALL maintain match score sorting within each tier

### Requirement 13: Mode-Specific Behavior

**User Story:** Là sinh viên, tôi muốn Profile Recycling hoạt động phù hợp với từng mode, để trải nghiệm tối ưu cho mục đích của tôi.

#### Acceptance Criteria

1. WHEN in lover mode, THE Profile_Recycling_System SHALL prioritize profiles with high match score
2. WHEN in study mode, THE Profile_Recycling_System SHALL prioritize profiles with common study goals
3. WHEN in hobby mode, THE Profile_Recycling_System SHALL prioritize profiles with common interests
4. WHEN in quick mode, THE Profile_Recycling_System SHALL use simplified scoring and faster transitions
5. THE Cooldown_Period SHALL be 7 days for lover mode
6. THE Cooldown_Period SHALL be 5 days for study and hobby modes
7. THE Cooldown_Period SHALL be 3 days for quick mode

### Requirement 14: Error Handling and Edge Cases

**User Story:** Là sinh viên, tôi muốn hệ thống xử lý lỗi gracefully, để không bị stuck khi có vấn đề network hoặc cache.

#### Acceptance Criteria

1. WHEN Firestore query fails, THE Profile_Recycling_System SHALL retry once after 2 seconds
2. IF retry fails, THEN THE Profile_Recycling_System SHALL display error message "Không thể tải hồ sơ, vui lòng thử lại"
3. WHEN View_History_Cache is corrupted, THE Profile_Recycling_System SHALL clear cache and start fresh
4. WHEN localStorage is full, THE Profile_Recycling_System SHALL use in-memory cache only
5. IF user has viewed all profiles in all tiers, THEN THE Profile_Recycling_System SHALL show "Bạn đã xem hết tất cả hồ sơ phù hợp"
6. THE error messages SHALL be displayed in Vietnamese
7. THE Profile_Recycling_System SHALL log all errors to console for debugging

### Requirement 15: Performance Requirements

**User Story:** Là sinh viên, tôi muốn Profile Recycling load nhanh trên mobile, để không tốn thời gian chờ đợi.

#### Acceptance Criteria

1. THE Fresh_Profile query SHALL complete within 2 seconds on 3G network
2. THE Stale_Profile query SHALL complete within 1.5 seconds on 3G network
3. THE All Profiles query SHALL complete within 1 second on 3G network
4. THE tier transition SHALL complete within 1 second total
5. THE View_History_Cache lookup SHALL complete within 50ms
6. THE Profile_Recycling_System SHALL use lazy loading for profile images
7. THE memory usage SHALL NOT exceed 50MB for cache and profile data

### Requirement 16: Backward Compatibility

**User Story:** Là developer, tôi muốn Profile Recycling tương thích với code hiện tại, để deploy an toàn không breaking changes.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL reuse existing Viewed_Profiles_Cache module
2. THE Profile_Recycling_System SHALL integrate with existing Query_Optimizer
3. THE Profile_Recycling_System SHALL work with existing Cache_Manager
4. THE Profile_Recycling_System SHALL maintain existing Matching component API
5. THE Profile_Recycling_System SHALL NOT modify existing Firestore security rules
6. THE Profile_Recycling_System SHALL provide feature flag "enableProfileRecycling" for gradual rollout
7. WHEN feature flag is false, THE system SHALL use legacy "no more profiles" behavior

### Requirement 17: Cost Reduction Metrics

**User Story:** Là product owner, tôi muốn đảm bảo Profile Recycling không tăng chi phí Firestore, để duy trì tính bền vững của nền tảng.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL track total Firestore reads per user session
2. THE Profile_Recycling_System SHALL calculate average reads per match found
3. THE Profile_Recycling_System SHALL compare reads with baseline (before recycling)
4. THE Firestore reads SHALL NOT increase by more than 20% compared to baseline
5. THE cache hit rate SHALL be at least 40% for Stale and All tiers
6. THE Profile_Recycling_System SHALL provide cost report in console (dev mode only)
7. THE cost report SHALL show: total reads, cache hits, cache misses, estimated cost

### Requirement 18: User Engagement Metrics

**User Story:** Là product manager, tôi muốn đo lường impact của Profile Recycling, để chứng minh giá trị của tính năng.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL track "matches per session" metric
2. THE Profile_Recycling_System SHALL track "time spent in matching" metric
3. THE Profile_Recycling_System SHALL track "bounce rate" (users leaving after seeing "no profiles")
4. THE Profile_Recycling_System SHALL track "tier 2 reach rate" (% users reaching Stale tier)
5. THE Profile_Recycling_System SHALL track "tier 3 reach rate" (% users reaching All tier)
6. THE target SHALL be 0% users seeing "no more profiles" message
7. THE target SHALL be 30% increase in matches per session

### Requirement 19: Testing and Validation

**User Story:** Là developer, tôi muốn có test suite đầy đủ, để đảm bảo Profile Recycling hoạt động đúng trong mọi trường hợp.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL have unit tests for tier transition logic
2. THE Profile_Recycling_System SHALL have unit tests for View_History_Cache operations
3. THE Profile_Recycling_System SHALL have unit tests for Last_Viewed_Badge time calculations
4. THE Profile_Recycling_System SHALL have integration tests for Firestore queries
5. THE Profile_Recycling_System SHALL have E2E tests for complete user flow
6. THE test coverage SHALL be at least 85% for new code
7. THE test suite SHALL complete in less than 30 seconds

### Requirement 20: Documentation and Deployment

**User Story:** Là developer, tôi muốn có documentation đầy đủ, để team có thể maintain và extend Profile Recycling dễ dàng.

#### Acceptance Criteria

1. THE Profile_Recycling_System SHALL have README.md explaining architecture and data flow
2. THE Profile_Recycling_System SHALL have JSDoc comments for all public functions
3. THE Profile_Recycling_System SHALL have deployment guide with step-by-step instructions
4. THE Profile_Recycling_System SHALL have rollback plan if issues occur
5. THE Profile_Recycling_System SHALL have monitoring dashboard showing key metrics
6. THE documentation SHALL include examples for each tier scenario
7. THE documentation SHALL be written in Vietnamese for team accessibility

