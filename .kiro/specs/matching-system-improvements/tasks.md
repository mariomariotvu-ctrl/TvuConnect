# Implementation Plan: Matching System Improvements

## Overview

This implementation plan improves TVU Connect's 4-tab matching system from 8.5/10 to 9.5/10 through refactoring, analytics, optimization, and comprehensive testing. The plan is organized into phases that build incrementally, with each task referencing specific requirements and including optional testing sub-tasks.

## Tasks

- [x] 0. Create Analytics Dashboard (Priority Task)
  - [x] 0.1 Create analytics dashboard HTML page
    - Create `public/matching-analytics-dashboard.html`
    - Add real-time event stream display
    - Add filters by eventType, userId, and date range
    - Add summary statistics (total events, events by type, top users)
    - Include charts for event distribution over time
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 0.2 Add dashboard link to admin tools
    - Add navigation link in appropriate admin section
    - Ensure proper authentication/access control
    - _Requirements: 3.4_

- [x] 1. Extract custom hooks for state management
  - [x] 1.1 Create useMatchingFilters hook
    - Create `src/hooks/useMatchingFilters.ts`
    - Implement filter state management with useState
    - Add setFilters, resetFilters, and hasActiveFilters functions
    - Export typed interface UseMatchingFiltersReturn
    - _Requirements: 2.1_
  
  - [ ]* 1.2 Write unit tests for useMatchingFilters
    - Test initial state values
    - Test filter updates through setFilters
    - Test resetFilters functionality
    - Test hasActiveFilters computation
    - _Requirements: 2.1, 7.1_
  
  - [x] 1.3 Create useMatchingHistory hook
    - Create `src/hooks/useMatchingHistory.ts`
    - Implement Firestore subscription with onSnapshot
    - Add pagination with loadMore function
    - Filter out blocked users
    - Deduplicate matches by matchedUid
    - _Requirements: 2.2_
  
  - [ ]* 1.4 Write unit tests for useMatchingHistory
    - Test Firestore subscription setup
    - Test pagination logic
    - Test blocked user filtering
    - Test deduplication
    - _Requirements: 2.2, 7.1_
  
  - [x] 1.5 Create useBlockedUsers hook
    - Create `src/hooks/useBlockedUsers.ts`
    - Subscribe to blocks collection (both directions)
    - Maintain cached Set of blocked UIDs
    - Implement blockUser and unblockUser functions
    - _Requirements: 2.3_
  
  - [ ]* 1.6 Write unit tests for useBlockedUsers
    - Test subscription to blocks collection
    - Test blockUser operation
    - Test unblockUser operation
    - Test real-time updates
    - _Requirements: 2.3, 7.1_

- [x] 2. Create sub-components for UI modularity
  - [x] 2.1 Create ProfileCard component
    - Create `src/components/matching/ProfileCard.tsx`
    - Display profile photo, name, major, academic year
    - Show match score badge
    - Display exactly 3 relationship indicators: "Cùng khóa", "Khóa trên/dưới", "Cùng quê"
    - Only show relationship indicators that are true
    - Do NOT display study goals on the card
    - Add like/dislike buttons (conditional)
    - Emit onProfileClick and onFeedback events
    - _Requirements: 1.1, 1.4, 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ]* 2.2 Write unit tests for ProfileCard
    - Test rendering with different props
    - Test click event emission
    - Test feedback button clicks
    - Test relationship indicators display (only show true indicators)
    - Test that study goals are NOT displayed
    - Test conditional rendering of feedback buttons
    - _Requirements: 1.1, 1.4_
  
  - [x] 2.3 Create MatchingFilters component
    - Create `src/components/matching/MatchingFilters.tsx`
    - Render filter UI (dropdowns, inputs, segmented controls)
    - Handle filter changes and emit to parent
    - Add show/hide animation
    - Display active filter count badge
    - _Requirements: 1.1, 1.4_
  
  - [ ]* 2.4 Write unit tests for MatchingFilters
    - Test filter UI rendering
    - Test filter change events
    - Test show/hide animation
    - Test active filter count
    - _Requirements: 1.1, 1.4_
  
  - [x] 2.5 Create MatchingResults component
    - Create `src/components/matching/MatchingResults.tsx`
    - Render grid of ProfileCard components
    - Show loading skeletons
    - Display fallback indicator
    - Handle "Load One More" button
    - Emit feedback events
    - _Requirements: 1.1, 1.4_
  
  - [ ]* 2.6 Write unit tests for MatchingResults
    - Test grid rendering
    - Test loading state
    - Test fallback indicator
    - Test load more functionality
    - _Requirements: 1.1, 1.4_
  
  - [x] 2.7 Create MatchingHistory component
    - Create `src/components/matching/MatchingHistory.tsx`
    - Render match history sidebar
    - Show timestamps and match reasons
    - Handle "Load More" pagination
    - Emit profile click events
    - _Requirements: 1.1, 1.4_
  
  - [ ]* 2.8 Write unit tests for MatchingHistory
    - Test history rendering
    - Test pagination
    - Test profile click events
    - Test empty state
    - _Requirements: 1.1, 1.4_

- [x] 3. Refactor main Matching component
  - [x] 3.1 Integrate custom hooks into Matching.tsx
    - Replace inline state with useMatchingFilters
    - Replace inline history logic with useMatchingHistory
    - Replace inline blocked users logic with useBlockedUsers
    - _Requirements: 1.1, 2.1, 2.2, 2.3_
  
  - [x] 3.2 Replace inline UI with sub-components
    - Replace filter UI with MatchingFilters component
    - Replace results grid with MatchingResults component
    - Replace history sidebar with MatchingHistory component
    - _Requirements: 1.1, 1.4_
  
  - [x] 3.3 Verify Matching.tsx line count < 250
    - Count lines in refactored Matching.tsx
    - Ensure all functionality preserved
    - Verify TypeScript compilation
    - _Requirements: 1.2_
  
  - [ ]* 3.4 Run existing tests to verify no breaking changes
    - Run full test suite
    - Verify all tests pass
    - Manual testing of all 4 matching modes
    - _Requirements: 1.3_

- [x] 4. Checkpoint - Refactoring complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement analytics tracking system
  - [x] 5.1 Create matchingAnalytics module
    - Create `src/utils/matchingAnalytics.ts`
    - Implement trackMatchingStart function
    - Implement trackProfileClick function
    - Implement trackMessageSent function
    - Use batch writes for performance
    - Include sessionId generation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 5.2 Create matching_analytics Firestore collection
    - Define collection schema in code comments
    - Add TypeScript interface for AnalyticsEvent
    - _Requirements: 3.4_
  
  - [x] 5.3 Integrate analytics into Matching component
    - Call trackMatchingStart when matching starts
    - Call trackProfileClick when profile clicked
    - Call trackMessageSent when message sent
    - Use fire-and-forget pattern (non-blocking)
    - _Requirements: 3.1, 3.2, 3.3, 3.6_
  
  - [ ]* 5.4 Write property test for analytics event completeness
    - **Property 2: Analytics Event Completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
    - Verify all events contain userId, sessionId, timestamp, eventType
    - Use fast-check with 100 iterations
    - _Requirements: 3.5_
  
  - [ ]* 5.5 Write property test for analytics storage location
    - **Property 3: Analytics Storage Location**
    - **Validates: Requirements 3.4**
    - Verify events stored in "matching_analytics" collection
    - Use fast-check with 100 iterations
    - _Requirements: 3.4_
  
  - [ ]* 5.6 Write property test for analytics non-blocking behavior
    - **Property 4: Analytics Non-Blocking**
    - **Validates: Requirements 3.6**
    - Verify tracking calls return within 50ms
    - Use fast-check with 100 iterations
    - _Requirements: 3.6_

- [-] 6. Create and deploy Firestore composite indexes
  - [x] 6.1 Create firestore.indexes.json file
    - Add composite index for gender + academicYear
    - Add composite index for gender + majorNormalized
    - Add composite index for userId + timestamp (analytics)
    - Add composite index for eventType + timestamp (analytics)
    - Add composite index for userId + timestamp (feedback)
    - Document rationale for each index
    - _Requirements: 4.1, 4.4_
  
  - [x] 6.2 Create migration script for majorNormalized field
    - Create `scripts/add-major-normalized.ts`
    - Read all profiles from Firestore
    - Add majorNormalized field using normalizeVietnameseText
    - Update documents in batches
    - Log progress and completion
    - _Requirements: 4.3_
  
  - [ ] 6.3 Run migration script
    - Execute migration script
    - Verify all profiles have majorNormalized field
    - Check for any errors
    - _Requirements: 4.3_
  
  - [ ] 6.4 Deploy Firestore indexes
    - Run `firebase deploy --only firestore:indexes`
    - Wait for index creation to complete
    - Verify indexes in Firebase Console
    - _Requirements: 4.1, 4.4_
  
  - [x] 6.5 Update queries to use database-level filtering
    - Update profile queries to filter by gender at database level
    - Update profile queries to filter by majorNormalized at database level
    - Remove in-memory filtering for these fields
    - _Requirements: 4.2, 4.3_
  
  - [ ] 6.6 Measure and verify Firestore read reduction
    - Add logging to count Firestore reads before and after
    - Verify at least 30% reduction in reads
    - Document results
    - _Requirements: 4.5_

- [ ] 7. Checkpoint - Analytics and optimization complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement match feedback collection system
  - [ ] 8.1 Create matchingFeedback module
    - Create `src/utils/matchingFeedback.ts`
    - Implement submitFeedback function
    - Implement getFeedback function
    - Use document ID pattern: `${userId}_${matchedUserId}`
    - Use setDoc with merge: true for upserts
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 8.2 Create match_feedback Firestore collection
    - Define collection schema in code comments
    - Add TypeScript interface for MatchFeedback
    - _Requirements: 5.4_
  
  - [ ] 8.3 Add feedback buttons to ProfileCard
    - Add like and dislike buttons
    - Show buttons conditionally based on showFeedback prop
    - Emit onFeedback event with action
    - Add visual feedback on click
    - _Requirements: 5.1_
  
  - [ ] 8.4 Integrate feedback into Matching component
    - Pass showFeedback prop to ProfileCard
    - Handle onFeedback events
    - Call submitFeedback function
    - Update UI immediately (optimistic update)
    - _Requirements: 5.1, 5.6_
  
  - [ ]* 8.5 Write property test for feedback storage round trip
    - **Property 5: Feedback Storage Round Trip**
    - **Validates: Requirements 5.2, 5.3, 5.4**
    - Verify submitted feedback can be retrieved with same action
    - Use fast-check with 100 iterations
    - _Requirements: 5.2, 5.3, 5.4_
  
  - [ ]* 8.6 Write property test for feedback duplicate prevention
    - **Property 6: Feedback Duplicate Prevention**
    - **Validates: Requirements 5.5**
    - Verify only one feedback document exists per match pair
    - Use fast-check with 100 iterations
    - _Requirements: 5.5_
  
  - [ ]* 8.7 Write property test for feedback UI reactivity
    - **Property 7: Feedback UI Reactivity**
    - **Validates: Requirements 5.6**
    - Verify UI updates without page reload
    - Use fast-check with 100 iterations
    - _Requirements: 5.6_

- [ ] 9. Implement server-side rate limiting
  - [ ] 9.1 Create user_rate_limits Firestore collection
    - Define collection schema in code comments
    - Add TypeScript interface for RateLimit
    - Document ID pattern: userId
    - _Requirements: 6.3, 6.4_
  
  - [ ] 9.2 Add rate limiting to Firestore Security Rules
    - Update firestore.rules file
    - Add rules for user_rate_limits collection
    - Limit to 30 requests per hour
    - Auto-reset after 1 hour
    - _Requirements: 6.1, 6.3, 6.5_
  
  - [ ] 9.3 Deploy Firestore Security Rules
    - Run `firebase deploy --only firestore:rules`
    - Verify rules in Firebase Console
    - _Requirements: 6.3_
  
  - [ ] 9.4 Add rate limit check to Matching component
    - Check rate limit before starting matching
    - Increment counter on each request
    - Handle rate limit exceeded error
    - Display error message: "Bạn đã vượt quá giới hạn, vui lòng thử lại sau"
    - Show countdown timer until reset
    - _Requirements: 6.1, 6.2_
  
  - [ ]* 9.5 Write property test for rate limit enforcement
    - **Property 8: Rate Limit Enforcement**
    - **Validates: Requirements 6.1, 6.2**
    - Verify 31st request is rejected with correct error message
    - Use fast-check with 100 iterations
    - _Requirements: 6.1, 6.2_
  
  - [ ]* 9.6 Write property test for rate limit reset
    - **Property 9: Rate Limit Reset**
    - **Validates: Requirements 6.5**
    - Verify user can make requests after 1 hour
    - Use fast-check with 100 iterations
    - _Requirements: 6.5_

- [ ] 10. Checkpoint - Feedback and rate limiting complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Write comprehensive unit tests for matching utilities
  - [ ] 11.1 Write tests for normalizeVietnameseText
    - Test Vietnamese diacritics removal
    - Test lowercase conversion
    - Test whitespace normalization
    - Test empty string handling
    - _Requirements: 7.1_
  
  - [ ] 11.2 Write tests for calculateMatchingScore
    - Test score calculation with all factors
    - Test weighted scoring
    - Test boundary values (0 and 100)
    - Test missing fields handling
    - _Requirements: 7.2_
  
  - [ ] 11.3 Write tests for getSeniorityRelation
    - Test same year detection
    - Test senior detection
    - Test junior detection
    - Test edge cases
    - _Requirements: 7.3_
  
  - [ ] 11.4 Write tests for majorContains with acronym matching
    - Test exact match
    - Test acronym match (e.g., "CNTT" matches "Công nghệ thông tin")
    - Test partial match
    - Test case insensitivity
    - _Requirements: 7.4_
  
  - [ ] 11.5 Verify 90% code coverage for matchingUtils.ts
    - Run coverage report
    - Identify uncovered lines
    - Add tests for uncovered code
    - _Requirements: 7.5_
  
  - [ ] 11.6 Verify test suite completes in < 5 seconds
    - Run test suite and measure time
    - Optimize slow tests if needed
    - _Requirements: 7.6_

- [ ] 12. Implement performance monitoring
  - [ ] 12.1 Create performanceMonitor module
    - Create `src/utils/performanceMonitor.ts`
    - Implement measureQueryTime function using performance.now()
    - Implement trackScoreCalculation function
    - Implement logMetrics function with console.table()
    - Use circular buffer (max 100 metrics)
    - _Requirements: 8.1, 8.3_
  
  - [ ] 12.2 Integrate performance monitoring into queries
    - Wrap all Firestore queries with measureQueryTime
    - Add query name for identification
    - _Requirements: 8.1_
  
  - [ ] 12.3 Add slow query warnings
    - Log warning for queries > 2 seconds
    - Include query name and duration
    - _Requirements: 8.2_
  
  - [ ] 12.4 Add score calculation tracking
    - Track time for calculateMatchingScore calls
    - Include profile count in metrics
    - _Requirements: 8.3_
  
  - [ ] 12.5 Add dev mode console output
    - Expose metrics via console.table() in development
    - Ensure zero overhead in production
    - _Requirements: 8.4_
  
  - [ ]* 12.6 Write property test for query performance measurement
    - **Property 10: Query Performance Measurement**
    - **Validates: Requirements 8.1**
    - Verify all queries are measured and logged
    - Use fast-check with 100 iterations
    - _Requirements: 8.1_
  
  - [ ]* 12.7 Write property test for slow query warning
    - **Property 11: Slow Query Warning**
    - **Validates: Requirements 8.2**
    - Verify warnings logged for queries > 2 seconds
    - Use fast-check with 100 iterations
    - _Requirements: 8.2_
  
  - [ ]* 12.8 Write property test for score calculation tracking
    - **Property 12: Score Calculation Performance Tracking**
    - **Validates: Requirements 8.3**
    - Verify calculation time is tracked
    - Use fast-check with 100 iterations
    - _Requirements: 8.3_
  
  - [ ] 12.9 Verify zero production overhead
    - Build production bundle
    - Verify performance monitoring code is tree-shaken or disabled
    - _Requirements: 8.5_

- [ ] 13. Checkpoint - Testing and monitoring complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement comprehensive error handling
  - [ ] 14.1 Create retry logic with exponential backoff
    - Create retryWithBackoff utility function
    - Support configurable max retries (default 3)
    - Implement exponential backoff (1s, 2s, 4s)
    - _Requirements: 9.3_
  
  - [ ] 14.2 Add network error handling
    - Detect network errors from Firestore
    - Display toast: "Không thể kết nối. Vui lòng kiểm tra mạng."
    - Show retry button
    - Log error with context
    - _Requirements: 9.1, 9.2, 9.5_
  
  - [ ] 14.3 Add permission error handling
    - Detect permission errors
    - Display toast: "Không có quyền truy cập. Vui lòng đăng nhập lại."
    - Log error details
    - Redirect to login if needed
    - _Requirements: 9.1, 9.2, 9.5_
  
  - [ ] 14.4 Add quota exceeded error handling
    - Detect quota exceeded errors
    - Display mock profiles with warning banner
    - Toast: "⚠️ Đã hết Data Firebase hôm nay (Quota Exceeded)"
    - Log quota exceeded event
    - _Requirements: 9.1, 9.2, 9.5_
  
  - [ ] 14.5 Add offline mode detection
    - Detect offline status
    - Show offline indicator banner
    - Display cached profiles
    - Disable "Start Matching" button
    - Queue analytics events for later sync
    - _Requirements: 9.4_
  
  - [ ] 14.6 Add 3-retry limit with connection suggestion
    - After 3 failed retries, suggest checking internet
    - Display helpful message
    - _Requirements: 9.3_
  
  - [ ]* 14.7 Write property test for error response completeness
    - **Property 13: Error Response Completeness**
    - **Validates: Requirements 9.1, 9.2, 9.5**
    - Verify errors display message, retry button, and log details
    - Use fast-check with 100 iterations
    - _Requirements: 9.1, 9.2, 9.5_

- [ ] 15. Add comprehensive documentation
  - [ ] 15.1 Add JSDoc comments to Matching component
    - Document props interface
    - Document component behavior
    - Add usage examples
    - _Requirements: 10.1_
  
  - [ ] 15.2 Add JSDoc comments to matchingUtils
    - Document all exported functions
    - Add parameter descriptions
    - Add return value descriptions
    - Add usage examples
    - _Requirements: 10.2_
  
  - [ ] 15.3 Add JSDoc comments to custom hooks
    - Document hook purpose
    - Document return values
    - Add usage examples in comments
    - _Requirements: 10.3_
  
  - [ ] 15.4 Create README.md for matching system
    - Explain architecture and data flow
    - Add component hierarchy diagram
    - Document key features
    - Add troubleshooting section
    - _Requirements: 10.4_
  
  - [ ] 15.5 Document composite indexes
    - Explain why each index is needed
    - Document query patterns
    - Add performance impact notes
    - _Requirements: 10.5_

- [ ] 16. Final integration and verification
  - [ ] 16.1 Run full test suite
    - Run all unit tests
    - Run all property tests
    - Verify 90% coverage for utils
    - Verify test suite < 5 seconds
    - _Requirements: 7.5, 7.6_
  
  - [ ] 16.2 Manual testing of all features
    - Test all 4 matching modes (lover, study, hobby, quick)
    - Test filter functionality
    - Test feedback submission
    - Test rate limiting
    - Test error handling scenarios
    - Test offline mode
    - Test Profile Card displays only 3 relationship indicators
    - Verify study goals are NOT displayed on Profile Card
    - _Requirements: 1.3, 1.5, 11.1, 11.2, 11.3_
  
  - [ ] 16.3 Verify performance metrics
    - Measure Firestore read reduction (target: 30%)
    - Measure query times (target: < 2s P95)
    - Verify analytics non-blocking (< 50ms)
    - Check bundle size impact (< 15 KB)
    - _Requirements: 4.5, 8.2, 3.6_
  
  - [ ] 16.4 Verify line count reduction
    - Count lines in Matching.tsx (target: < 250)
    - Document before/after comparison
    - _Requirements: 1.2_
  
  - [ ] 16.5 Check TypeScript compilation
    - Verify no TypeScript errors
    - Verify strict mode enabled
    - Verify no ESLint errors
    - _Requirements: 1.5_
  
  - [ ] 16.6 Review security rules
    - Verify rate limiting rules deployed
    - Verify analytics rules deployed
    - Verify feedback rules deployed
    - Test rules with Firebase Emulator
    - _Requirements: 6.3_

- [ ] 17. Update ProfileCard to simplify display (Requirement 11)
  - [ ] 17.1 Update ProfileCard component
    - Remove study goals display from Profile Card UI
    - Add logic to display 3 relationship indicators: "Cùng khóa", "Khóa trên/dưới", "Cùng quê"
    - Only show indicators that are true for the match pair
    - Ensure study goals data is still used in matching algorithm
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ]* 17.2 Write unit tests for simplified ProfileCard
    - Test that only 3 relationship indicators are displayed
    - Test that study goals are NOT displayed
    - Test that only true indicators are shown
    - Test that matching algorithm still uses study goals data
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ] 17.3 Manual testing of ProfileCard changes
    - Verify Profile Card displays correctly in all 4 matching modes
    - Verify relationship indicators show correctly
    - Verify study goals are not visible on card
    - Verify matching algorithm still works with study goals
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 18. Final checkpoint - Implementation complete
  - Ensure all tests pass, verify all requirements met, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (100 iterations each)
- Unit tests validate specific examples and edge cases
- Task 0 (Analytics Dashboard) is prioritized as requested by the user
- All code examples use TypeScript (the language of the existing codebase)
- Focus is on coding tasks only - no deployment, user testing, or business tasks
