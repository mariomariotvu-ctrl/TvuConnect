# Implementation Plan: Matching Profile Recycling System

## Overview

This implementation plan converts the Profile Recycling design into actionable coding tasks. The system implements 3-tier profile recycling (Fresh → Stale → All) to eliminate "no more profiles" scenarios. Implementation follows a 5-week roadmap with incremental validation.

## Tasks

- [ ] 1. Set up Enhanced View History Cache
  - Extend existing `src/utils/viewedProfilesCache.ts` with timestamp and view count tracking
  - Add `ViewHistoryEntry` interface with fields: uid, viewedAt, viewCount, mode
  - Implement `getProfilesByAge(userId: string, minDays: number)` method for tier filtering
  - Add 30-day cleanup logic in `cleanupOldEntries()` method
  - Implement localStorage persistence with error handling for quota exceeded
  - Add backward compatibility for existing cache format (auto-migrate old entries)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 16.2_

- [ ]* 1.1 Write property test for View History Cache
  - **Property 5: View History Round Trip**
  - **Validates: Requirements 5.2**
  - Test that marking a profile as viewed creates an entry with timestamp within last second
  - Use fast-check to generate random user IDs and profile IDs
  - Verify viewCount increments on repeated views (Property 14)

- [ ]* 1.2 Write unit tests for View History Cache
  - Test markAsViewed() updates timestamp correctly
  - Test viewCount increments on multiple views
  - Test getProfilesByAge() filters by age threshold
  - Test cleanupOldEntries() removes entries > 30 days
  - Test corrupted cache recovery (invalid JSON)
  - Test localStorage quota exceeded fallback to memory
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 14.3, 14.4_

- [ ] 2. Implement Tier Manager
  - Create `src/utils/tierManager.ts` with TierManager class
  - Implement tier state management (currentTier: 'fresh' | 'stale' | 'all')
  - Add `getCooldownPeriod(mode: string)` method returning 7/5/3 days for lover/study/quick modes
  - Implement `transitionToNextTier()` method with automatic progression (Fresh → Stale → All)
  - Add `checkAvailability(tier: string)` method to verify profiles exist before transition
  - Implement `resetToFresh()` method for filter/mode changes
  - Add `shouldTransition()` logic checking if current tier has 0 profiles
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 13.5, 13.6, 13.7_


- [ ]* 2.1 Write property test for Tier Manager
  - **Property 6: Automatic Tier Transition**
  - **Validates: Requirements 6.2**
  - Test that when a tier returns 0 profiles, system transitions to next tier
  - Verify transition order: Fresh → Stale → All
  - Use fast-check to generate random availability scenarios

- [ ]* 2.2 Write unit tests for Tier Manager
  - Test initial state starts with 'fresh' tier
  - Test transitionToNextTier() progresses correctly
  - Test getCooldownPeriod() returns correct days per mode
  - Test resetToFresh() resets state
  - Test shouldTransition() returns true when availableCount = 0
  - _Requirements: 6.1, 6.2, 6.3, 13.5, 13.6, 13.7_

- [ ] 3. Create Profile Recycling Service
  - Create `src/services/profileRecyclingService.ts` with ProfileRecyclingService class
  - Implement `getProfiles(config: ProfileRecyclingConfig)` orchestration method
  - Integrate TierManager and ViewHistoryCache for tier selection
  - Implement `markProfileViewed(userId: string, profileId: string)` method
  - Add `getCurrentTier()` and `getTierStats()` getter methods
  - Integrate with existing FirestoreQueryOptimizer for queries
  - Implement in-memory UID filtering using Set for O(1) lookup
  - Add tier-specific query limits (50 for Fresh, 30 for Stale, 20 for All)
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 2.6, 3.7, 8.2, 8.4, 8.5_

- [ ]* 3.1 Write property test for Profile Recycling Service
  - **Property 2: Viewed UID Filtering**
  - **Validates: Requirements 1.2**
  - Test that filtered results contain no UIDs from viewed set
  - Use fast-check to generate random profile arrays and viewed UID sets
  - Verify Set-based filtering is O(1) lookup

- [ ]* 3.2 Write integration tests for Profile Recycling Service
  - Test getProfiles() returns Fresh tier first
  - Test automatic transition to Stale when Fresh empty
  - Test automatic transition to All when Stale empty
  - Test markProfileViewed() updates cache
  - Test filter application across all tiers
  - _Requirements: 1.1, 6.2, 6.3, 12.1, 12.2, 12.3, 12.4_

- [ ] 4. Checkpoint - Core Infrastructure Complete
  - Ensure all tests pass for View History Cache, Tier Manager, and Profile Recycling Service
  - Verify backward compatibility with existing viewedProfilesCache.ts
  - Test localStorage persistence and recovery
  - Ask the user if questions arise

- [ ] 5. Implement Tier Indicator Component
  - Create `src/components/TierIndicator.tsx` React component
  - Add TierIndicatorProps interface with tier, availableCount, isTransitioning fields
  - Implement tier-specific rendering: 🆕 "Hồ sơ mới" (green), 🔄 "Xem lại (>7 ngày)" (orange), ♻️ "Tất cả hồ sơ" (blue)
  - Add profile count display: "{availableCount} hồ sơ khả dụng"
  - Implement 300ms fade transition animation using CSS transitions
  - Add responsive styling for mobile and desktop layouts
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ]* 5.1 Write unit tests for Tier Indicator Component
  - Test renders correct text and color for each tier
  - Test displays profile count correctly
  - Test shows loading state during transitions
  - Test responsive design on mobile viewport
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7_

- [ ] 6. Implement Last Viewed Badge Component
  - Create `src/components/LastViewedBadge.tsx` React component
  - Add LastViewedBadgeProps interface with viewedAt and tier fields
  - Implement `formatTimeAgo(timestamp: number)` function with Vietnamese text
  - Add conditional rendering: return null for tier='fresh'
  - Implement time unit selection: < 60 min → "X phút trước", < 24h → "X giờ trước", >= 24h → "X ngày trước"
  - Style badge with gray background, white text, 👁️ icon, positioned top-right
  - Add responsive font sizing (12px mobile, 14px desktop)
  - _Requirements: 2.4, 2.5, 3.4, 3.5, 3.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ]* 6.1 Write property test for Last Viewed Badge
  - **Property 9: Time Formatting Consistency**
  - **Validates: Requirements 2.4, 2.5, 3.4, 3.5, 3.6, 9.4, 9.5, 9.6**
  - Test formatTimeAgo() returns correct unit based on time difference
  - Use fast-check to generate random timestamps from 0 to 365 days ago
  - Verify "phút trước" for < 60 min, "giờ trước" for < 24h, "ngày trước" for >= 24h

- [ ]* 6.2 Write unit tests for Last Viewed Badge Component
  - Test returns null for tier='fresh'
  - Test shows "X phút trước" for recent views (< 1 hour)
  - Test shows "X giờ trước" for views < 24 hours
  - Test shows "X ngày trước" for views >= 24 hours
  - Test badge styling and positioning
  - _Requirements: 2.4, 2.5, 3.4, 3.5, 3.6, 9.3, 9.4, 9.5, 9.6, 9.7_

- [ ] 7. Integrate with Matching Component
  - Refactor `src/components/Matching.tsx` to use ProfileRecyclingService
  - Replace direct Firestore queries with `recyclingService.getProfiles()`
  - Add TierIndicator component to matching screen UI
  - Add LastViewedBadge to ProfileCard component
  - Update `handleStartMatching()` to handle RecyclingResult
  - Call `recyclingService.markProfileViewed()` when user views profile
  - Add tier state management (currentTier, availableCount)
  - Implement tier transition UI updates
  - _Requirements: 1.1, 1.6, 4.1, 9.1, 16.4_

- [ ]* 7.1 Write integration tests for Matching Component
  - Test ProfileRecyclingService integration
  - Test TierIndicator displays correctly
  - Test LastViewedBadge shows on Stale/All tiers
  - Test markProfileViewed() called on profile view
  - Test tier transitions update UI
  - _Requirements: 1.1, 1.6, 4.1, 9.1_

- [ ] 8. Test all 4 matching modes
  - Test lover mode with 7-day cooldown period
  - Test study mode with 5-day cooldown period
  - Test hobby mode with 5-day cooldown period
  - Test quick mode with 3-day cooldown period
  - Verify tier transitions work in all modes
  - Verify filters apply correctly in all modes
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ] 9. Checkpoint - UI Components Complete
  - Ensure all tests pass for TierIndicator and LastViewedBadge
  - Verify Matching component integration works
  - Test responsive design on mobile and desktop
  - Test all 4 matching modes
  - Ask the user if questions arise

- [ ] 10. Implement Recycling Analytics
  - Create `src/utils/recyclingAnalytics.ts` with RecyclingAnalytics class
  - Implement `trackTierTransition(userId, fromTier, toTier, mode)` method
  - Implement `trackProfileRecycledView(userId, profileId, daysSinceLastView, mode)` method
  - Add Firestore collection "recycling_analytics" with auto-generated document IDs
  - Implement non-blocking async operations (never throw errors)
  - Add `getMetrics(userId)` method for analytics dashboard
  - Integrate analytics calls into ProfileRecyclingService
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [ ]* 10.1 Write property test for Recycling Analytics
  - **Property 18: Tier Transition Analytics**
  - **Validates: Requirements 11.1, 11.2**
  - Test that tier transitions log events with correct structure
  - Verify event includes: eventType, userId, fromTier, toTier, mode, timestamp
  - Use fast-check to generate random tier transitions

- [ ]* 10.2 Write unit tests for Recycling Analytics
  - Test trackTierTransition() creates correct event structure
  - Test trackProfileRecycledView() includes daysSinceLastView
  - Test analytics operations are non-blocking (complete within 50ms)
  - Test errors don't throw (silent failure)
  - Test getMetrics() calculates tier reach rates
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7_

- [ ] 11. Implement Cache Strategy
  - Integrate with existing `src/utils/firestoreCacheManager.ts`
  - Implement tiered TTL strategy: 60s for Fresh, 300s for Stale, 600s for All
  - Create `generateCacheKey(tier, mode, filters)` function with filter hash
  - Implement cache invalidation on filter changes
  - Implement cache invalidation on mode changes
  - Add cache key format: "tier:{tierName}:mode:{mode}:filters:{filterHash}"
  - Test cache hit rates meet 40% target
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ]* 11.1 Write property test for Cache Strategy
  - **Property 37: Cache Key Uniqueness**
  - **Validates: Requirements 7.6, 7.7**
  - Test that different (tier, mode, filters) combinations generate different cache keys
  - Use fast-check to generate random filter combinations
  - Verify no collisions in generated keys

- [ ]* 11.2 Write unit tests for Cache Strategy
  - Test cache TTL expiration (60s/300s/600s)
  - Test generateCacheKey() produces consistent keys
  - Test cache invalidation on filter changes
  - Test cache invalidation on mode changes
  - Test cache hit rate tracking
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 12. Implement Query Optimization
  - Verify reuse of existing composite indexes for gender and major filters
  - Implement in-memory UID filtering (not database-level)
  - Implement batch fetching with "where uid in array" for Stale/All tiers
  - Add batch size limit of 10 UIDs per query (Firestore limit)
  - Implement parallel batch execution with Promise.all()
  - Add Firestore read tracking per session
  - Verify total reads don't increase > 20% vs baseline
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ]* 12.1 Write property test for Query Optimization
  - **Property 38: Batch Fetching Size**
  - **Validates: Requirements 8.3**
  - Test that UID lists are split into batches of max 10 UIDs
  - Use fast-check to generate random UID arrays of varying sizes
  - Verify batch count = ceil(uidCount / 10)

- [ ]* 12.2 Write unit tests for Query Optimization
  - Test in-memory UID filtering uses Set for O(1) lookup
  - Test batch fetching splits UIDs correctly
  - Test parallel batch execution
  - Test Firestore read tracking
  - Test read count increase < 20% vs baseline
  - _Requirements: 8.2, 8.3, 8.6, 8.7_

- [ ] 13. Checkpoint - Analytics & Optimization Complete
  - Ensure all tests pass for analytics and caching
  - Verify cache hit rates meet 40% target
  - Verify Firestore read increase < 20%
  - Test query performance on 3G network simulation
  - Ask the user if questions arise

- [ ] 14. Implement Error Handling
  - Add retry logic with 2-second delay for Firestore query failures
  - Implement corrupted cache recovery (clear and start fresh)
  - Add localStorage quota exceeded fallback to in-memory cache
  - Implement Vietnamese error messages for all user-facing errors
  - Add error message "Không thể tải hồ sơ, vui lòng thử lại" for query failures
  - Add error message "Bạn đã xem hết tất cả hồ sơ phù hợp" when all tiers empty
  - Implement error logging to console with context (operation, userId, timestamp)
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

- [ ]* 14.1 Write unit tests for Error Handling
  - Test retry logic executes after 2 seconds
  - Test corrupted cache recovery clears cache
  - Test localStorage quota fallback to memory
  - Test Vietnamese error messages display correctly
  - Test error logging includes context
  - Test graceful degradation (no crashes)
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.7_

- [ ] 15. Implement Feature Flag and Rollout
  - Add `enableProfileRecycling` feature flag to `src/firebase.ts` or config
  - Implement legacy fallback logic when flag is false
  - Add conditional logic in Matching component to use legacy or new system
  - Test flag toggle behavior (enable/disable)
  - Document rollout strategy: 0% → 5% → 25% → 50% → 100%
  - Create rollback plan documentation
  - _Requirements: 16.6, 16.7_

- [ ]* 15.1 Write unit tests for Feature Flag
  - Test legacy behavior when flag is false
  - Test new recycling behavior when flag is true
  - Test flag toggle doesn't break existing functionality
  - _Requirements: 16.6, 16.7_

- [ ] 16. Add Firestore indexes and security rules
  - Add composite index for recycling_analytics collection (userId + timestamp)
  - Add composite index for recycling_analytics collection (eventType + timestamp)
  - Add security rules for recycling_analytics collection (read/write with auth)
  - Verify existing profile indexes are reused (no new indexes needed)
  - Deploy indexes to Firestore
  - Deploy security rules to Firestore
  - _Requirements: 16.5_

- [ ] 17. Write comprehensive documentation
  - Create README.md explaining architecture and data flow
  - Add JSDoc comments to all public functions and classes
  - Document tier selection algorithm and complexity
  - Document cache strategy and TTL configuration
  - Document error handling patterns
  - Add code examples for each tier scenario
  - Write deployment guide with step-by-step instructions
  - Document rollback plan
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

- [ ] 18. Checkpoint - Error Handling & Documentation Complete
  - Ensure all error scenarios are tested
  - Verify feature flag works correctly
  - Review documentation completeness
  - Test Firestore indexes and security rules
  - Ask the user if questions arise

- [ ] 19. Perform QA testing on all user flows
  - Test complete flow: Start matching → View Fresh profiles → Mark as viewed → Verify cache
  - Test tier transition: Exhaust Fresh → Auto-transition to Stale → Verify badge shows
  - Test filter changes: Apply filters → Verify cache invalidated → Verify tier reset to Fresh
  - Test mode changes: Change mode → Verify cooldown period changes → Verify tier reset
  - Test empty results: View all profiles → Reach All tier → Verify message shows
  - Test error scenarios: Network failure → Verify retry → Verify error message
  - _Requirements: 1.1, 2.1, 3.1, 6.2, 12.5, 12.6, 14.1, 14.2_

- [ ] 20. Test on mobile devices
  - Test on iOS Safari (iPhone)
  - Test on Android Chrome
  - Test responsive design on various screen sizes
  - Test touch interactions and gestures
  - Test performance on 3G network (< 2s query time)
  - Test animations on low-end devices
  - Verify lazy image loading works
  - _Requirements: 1.7, 2.7, 3.7, 4.7, 9.8, 10.7, 15.1, 15.2, 15.3, 15.6_

- [ ] 21. Test on desktop browsers
  - Test on Chrome, Firefox, Safari, Edge
  - Test keyboard navigation and accessibility
  - Test responsive design on desktop viewports
  - Verify ARIA labels for screen readers
  - Test with various filter combinations
  - _Requirements: 4.7, 9.8_

- [ ] 22. Performance testing and optimization
  - Measure Fresh tier query time on 3G network (target < 2s)
  - Measure Stale tier query time on 3G network (target < 1.5s)
  - Measure All tier query time on 3G network (target < 1s)
  - Measure tier transition time (target < 1s)
  - Measure View History Cache lookup time (target < 50ms)
  - Measure memory usage (target < 50MB)
  - Optimize if targets not met
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

- [ ] 23. Checkpoint - Testing Complete
  - Ensure all QA tests pass
  - Verify performance targets met
  - Verify mobile and desktop compatibility
  - Review test coverage (target 85%)
  - Ask the user if questions arise

- [ ] 24. Deploy with feature flag disabled (0% rollout)
  - Deploy code to production with enableProfileRecycling = false
  - Verify deployment successful
  - Verify no breaking changes to existing functionality
  - Monitor error rates and performance metrics
  - Confirm system stable with flag disabled
  - _Requirements: 16.6, 16.7_

- [ ] 25. Enable for internal testing (5% rollout)
  - Set feature flag to true for 5% of users
  - Monitor tier transition metrics
  - Monitor Firestore read counts
  - Monitor user engagement metrics
  - Monitor error rates
  - Collect internal feedback
  - Wait 24 hours before next rollout
  - _Requirements: 16.6_

- [ ] 26. Gradual rollout to 25% users
  - Increase feature flag to 25% of users
  - Monitor all metrics for 48 hours
  - Track tier 2 reach rate (% users reaching Stale tier)
  - Track tier 3 reach rate (% users reaching All tier)
  - Track matches per session increase (target 30%)
  - Track bounce rate (target 0% seeing "no profiles")
  - Verify Firestore read increase < 20%
  - _Requirements: 17.4, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

- [ ] 27. Gradual rollout to 50% users
  - Increase feature flag to 50% of users
  - Monitor all metrics for 48 hours
  - Compare metrics between control (50%) and treatment (50%) groups
  - Verify success criteria met
  - Prepare for full rollout
  - _Requirements: 18.6, 18.7_

- [ ] 28. Full rollout to 100% users
  - Set feature flag to true for 100% of users
  - Monitor all metrics for 1 week
  - Verify success criteria met:
    - 0% users see "no more profiles" message
    - 30% increase in matches per session
    - Query times < 2s on 3G
    - Firestore reads increase < 20%
    - Cache hit rate > 40%
    - Error rate < 0.1%
  - Celebrate successful launch!
  - _Requirements: 18.6, 18.7_

- [ ] 29. Set up monitoring dashboard
  - Create analytics dashboard showing tier metrics
  - Add performance metrics (query times, cache hit rates)
  - Add engagement metrics (matches per session, time spent)
  - Add cost metrics (Firestore reads, cost per session)
  - Set up alerts for error rate > 0.1%
  - Set up alerts for Firestore read increase > 20%
  - Document dashboard usage
  - _Requirements: 11.4, 11.5, 17.1, 17.2, 17.3, 18.1, 18.2, 18.3_

- [ ] 30. Final checkpoint - Launch Complete
  - Verify all success criteria met
  - Verify monitoring dashboard operational
  - Document lessons learned
  - Plan future iterations based on metrics
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end user flows
- Gradual rollout (0% → 5% → 25% → 50% → 100%) ensures safe deployment
- Feature flag allows instant rollback if issues occur
- All user-facing text is in Vietnamese
- Performance targets: < 2s query time on 3G, < 1s tier transitions
- Cost target: Firestore reads increase < 20% vs baseline
- Engagement target: 30% increase in matches per session, 0% bounce rate
