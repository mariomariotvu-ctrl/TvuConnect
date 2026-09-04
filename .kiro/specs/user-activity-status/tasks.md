# Implementation Plan: User Activity Status System

## Overview

Triển khai hệ thống hiển thị trạng thái hoạt động người dùng theo thời gian thực (online/away/offline) tương tự Facebook, sử dụng Firebase Realtime Database, React hooks, và TypeScript. Hệ thống bao gồm activity detector, status manager, UI components, và property-based tests với fast-check.

## Tasks

- [x] 1. Thiết lập Firebase Realtime Database và Security Rules
  - Tạo cấu trúc database `/presence/{userId}/` với các fields: status, lastActive, connections, settings
  - Viết Firebase Security Rules cho authentication, privacy mode, và blocked users
  - Thiết lập indexes cho query optimization
  - Configure Firebase onDisconnect() mechanism
  - _Requirements: 4.2, 4.3, 6.3, 6.4_

- [x] 2. Implement Activity Detector Hook (useActivityDetector.ts)
  - [x] 2.1 Tạo useActivityDetector hook với event listeners
    - Implement throttled event detection cho mousemove, keydown, click, touchstart, scroll
    - Quản lý lastActivity timestamp trong state
    - Cleanup listeners khi unmount
    - _Requirements: 1.1, 1.5, 8.1_
  
  - [ ]* 2.2 Write property test for Activity Detector
    - **Property 1: Activity Detection Across All Event Types**
    - **Validates: Requirements 1.1, 8.1**
  
  - [ ]* 2.3 Write property test for Event Throttling
    - **Property 2: Event Throttling Rate Limit**
    - **Validates: Requirements 1.5, 4.1**
  
  - [x] 2.4 Implement multi-tab activity sync với localStorage
    - Listen localStorage events để sync activity across tabs
    - Broadcast activity events đến các tabs khác
    - _Requirements: 7.1_
  
  - [ ]* 2.5 Write unit tests for Activity Detector
    - Test throttling logic với burst events
    - Test multi-tab sync behavior
    - Test cleanup on unmount

- [x] 3. Implement Status Manager (userStatusManager.ts)
  - [x] 3.1 Tạo StatusManager class với state machine
    - Implement state transitions: online → away → offline
    - Quản lý idle và offline thresholds (5 min, 15 min)
    - Implement connection tracking với unique connectionId
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [ ]* 3.2 Write property test for Idle Timeout Transitions
    - **Property 3: Idle Timeout Transitions**
    - **Validates: Requirements 1.2, 1.3**
  
  - [ ]* 3.3 Write property test for Activity Recovery
    - **Property 4: Activity Recovery**
    - **Validates: Requirements 1.4**
  
  - [x] 3.4 Implement Firebase sync với debouncing
    - Connect đến Firebase Realtime Database
    - Implement debounced write operations (30s interval)
    - Setup onDisconnect() để auto-offline
    - Use Firebase server timestamps
    - _Requirements: 4.1, 4.2, 4.3, 7.4_
  
  - [x] 3.5 Implement multi-device connection tracking
    - Track connections từ multiple devices
    - Aggregate status: online nếu bất kỳ device nào online
    - Cleanup stale connections
    - _Requirements: 7.2, 7.3_
  
  - [ ]* 3.6 Write property test for Multi-device Status Aggregation
    - **Property 21: Multi-device Status Aggregation**
    - **Validates: Requirements 7.2, 7.3**
  
  - [x] 3.7 Implement privacy và invisible mode
    - Add setInvisibleMode() method
    - Add privacy mode filtering logic
    - Write presence data với authentication
    - _Requirements: 6.1, 6.5_
  
  - [ ]* 3.8 Write property test for Privacy Mode Visibility
    - **Property 15: Privacy Mode Visibility**
    - **Validates: Requirements 6.1**
  
  - [ ]* 3.9 Write property test for Invisible Mode
    - **Property 19: Invisible Mode Status Override**
    - **Validates: Requirements 6.5**
  
  - [ ]* 3.10 Write unit tests for Status Manager
    - Test state machine transitions
    - Test Firebase connection/disconnection
    - Test error handling và retry logic

- [x] 4. Checkpoint - Test core functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Status Indicator Component (StatusIndicator.tsx)
  - [x] 5.1 Tạo StatusIndicator component với styling
    - Render circular dot với correct colors (#42b72a, #ffa500, #8a8d91)
    - Implement size variants (small, medium, large)
    - Position dot at bottom-right of avatar (hoặc custom position)
    - Add 2px white border và smooth transitions
    - _Requirements: 2.2, 2.3, 2.4, 5.1, 5.2, 5.4_
  
  - [ ]* 5.2 Write property test for Status Indicator Color Mapping
    - **Property 6: Status Indicator Color Mapping**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  
  - [ ]* 5.3 Write property test for Status Indicator Positioning
    - **Property 12: Status Indicator Positioning**
    - **Validates: Requirements 5.1**
  
  - [x] 5.4 Implement hover tooltip
    - Show Status Text trong tooltip khi hover
    - Tooltip appears trong 300ms
    - Make touch-friendly cho mobile (44px touch target)
    - _Requirements: 5.3, 8.4_
  
  - [ ]* 5.5 Write property test for Hover Tooltip Display
    - **Property 13: Hover Tooltip Display**
    - **Validates: Requirements 5.3**
  
  - [ ]* 5.6 Write unit tests for Status Indicator
    - Test rendering với different statuses
    - Test size và position props
    - Test tooltip behavior

- [x] 6. Implement Status Text Component (StatusText.tsx)
  - [x] 6.1 Tạo StatusText component với time formatting
    - Format time: "Active now", "Active just now", "Active X minutes/hours/days ago"
    - Implement short và long format options
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6_
  
  - [ ]* 6.2 Write property test for Status Text Formatting
    - **Property 7: Status Text Formatting**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6**
  
  - [x] 6.3 Implement auto-update timer
    - Update displayed time mỗi 60 seconds
    - Cleanup interval khi unmount
    - _Requirements: 3.3_
  
  - [ ]* 6.4 Write property test for Auto-update Timestamp Display
    - **Property 8: Auto-update Timestamp Display**
    - **Validates: Requirements 3.3**
  
  - [x] 6.5 Style component giống Facebook
    - Light gray color cho text
    - Proper spacing trong user lists
    - _Requirements: 5.5, 5.6_
  
  - [ ]* 6.6 Write property test for User List Status Text Layout
    - **Property 14: User List Status Text Layout**
    - **Validates: Requirements 5.5**
  
  - [ ]* 6.7 Write unit tests for Status Text
    - Test time formatting cho specific cases
    - Test auto-update behavior
    - Test format options

- [x] 7. Implement useUserStatus Hook
  - [x] 7.1 Tạo useUserStatus hook
    - Subscribe đến Firebase path `/presence/{userId}`
    - Return status data với derived fields (isOnline, isAway, isOffline, timeAgo)
    - Implement caching để giảm re-renders
    - Handle loading và error states
    - _Requirements: 2.1, 6.2_
  
  - [ ]* 7.2 Write property test for Real-time Status Propagation
    - **Property 5: Real-time Status Propagation**
    - **Validates: Requirements 2.1**
  
  - [ ]* 7.3 Write property test for Blocked User Status Hiding
    - **Property 16: Blocked User Status Hiding**
    - **Validates: Requirements 6.2**
  
  - [x] 7.4 Implement privacy filtering
    - Check privacy mode settings
    - Filter based on friends list
    - Handle blocked users
    - _Requirements: 6.1, 6.2_
  
  - [ ]* 7.5 Write unit tests for useUserStatus
    - Test subscription lifecycle
    - Test data caching
    - Test error handling
    - Test privacy filtering

- [x] 8. Implement useOnlineUsers Hook
  - [x] 8.1 Tạo useOnlineUsers hook
    - Query Firebase với orderByChild('status').equalTo('online')
    - Implement limit, includeAway, và sortBy options
    - Batch reads để optimize performance
    - Cache results với 30s TTL
    - _Requirements: 4.6_
  
  - [ ]* 8.2 Write property test for Batch Query Optimization
    - **Property 11: Batch Query Optimization**
    - **Validates: Requirements 4.6**
  
  - [ ]* 8.3 Write unit tests for useOnlineUsers
    - Test filtering và sorting
    - Test caching behavior
    - Test batch operations

- [x] 9. Checkpoint - Test all components and hooks
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Error Handling và Network Recovery
  - [x] 10.1 Add error handling cho network failures
    - Implement exponential backoff retry (1s, 2s, 4s, 8s, max 30s)
    - Queue updates locally khi offline
    - Maintain last known status for 2 minutes
    - Display connection status indicator
    - _Requirements: 4.4, 7.5_
  
  - [ ]* 10.2 Write property test for Network Loss Grace Period
    - **Property 22: Network Loss Grace Period**
    - **Validates: Requirements 7.5**
  
  - [x] 10.3 Add authentication error handling
    - Catch auth errors từ Firebase
    - Trigger re-authentication flow
    - Suspend presence tracking until authenticated
    - _Requirements: 6.3_
  
  - [ ]* 10.4 Write property test for Authentication Required
    - **Property 17: Authentication Required for Writes**
    - **Validates: Requirements 6.3**
  
  - [x] 10.4 Add permission denied handling
    - Return default offline status cho unauthorized access
    - Cache permission denials
    - Log unauthorized access attempts
    - _Requirements: 6.4_
  
  - [ ]* 10.5 Write property test for Unauthorized Read Denial
    - **Property 18: Unauthorized Read Denial**
    - **Validates: Requirements 6.4**
  
  - [ ]* 10.6 Write unit tests for error handling
    - Test retry logic
    - Test offline queue
    - Test auth error flows

- [x] 11. Implement Mobile Optimizations
  - [x] 11.1 Add mobile-specific behavior
    - Detect mobile background/foreground transitions
    - Maintain online status for 5 min khi vào background
    - Update đến online trong 2s khi return foreground
    - Detect low battery và reduce update frequency
    - _Requirements: 8.2, 8.3, 8.5_
  
  - [ ]* 11.2 Write property test for Mobile Background Status
    - **Property 23: Mobile Background Status Persistence**
    - **Validates: Requirements 8.2, 8.3**
  
  - [ ]* 11.3 Write property test for Low Battery Update Reduction
    - **Property 24: Low Battery Update Reduction**
    - **Validates: Requirements 8.5**
  
  - [ ]* 11.4 Write unit tests for mobile optimizations
    - Test background/foreground transitions
    - Test battery detection
    - Test touch events

- [x] 12. Implement Monitoring và Metrics
  - [x] 12.1 Add metrics tracking
    - Track total online users count
    - Track status update latency
    - Track failed update count
    - Expose health check endpoint
    - _Requirements: 9.2, 9.3_
  
  - [ ]* 12.2 Write property test for Metrics Tracking
    - **Property 25: Metrics Tracking**
    - **Validates: Requirements 9.2**
  
  - [x] 12.3 Add error alerting
    - Log consecutive failures
    - Alert monitoring system sau 3 failures
    - Implement debug mode với detailed logging
    - _Requirements: 9.1, 9.4_
  
  - [ ]* 12.4 Write property test for Consecutive Failure Alert
    - **Property 26: Consecutive Failure Alert**
    - **Validates: Requirements 9.4**
  
  - [ ]* 12.5 Write unit tests for monitoring
    - Test metrics collection
    - Test alert triggering
    - Test debug mode

- [x] 13. Implement Cleanup và Maintenance
  - [x] 13.1 Add stale data cleanup
    - Implement background job để remove presence data > 7 days old
    - Cleanup orphaned connections
    - _Requirements: 4.5_
  
  - [ ]* 13.2 Write property test for Stale Data Cleanup
    - **Property 10: Stale Data Cleanup**
    - **Validates: Requirements 4.5**
  
  - [ ]* 13.3 Write property test for Disconnect Auto-offline
    - **Property 9: Disconnect Auto-offline**
    - **Validates: Requirements 4.3**
  
  - [ ]* 13.4 Write unit tests for cleanup
    - Test stale data removal
    - Test connection cleanup
    - Test memory leak prevention

- [x] 14. Final Integration và Wiring
  - [x] 14.1 Wire Status Manager với Activity Detector
    - Initialize StatusManager khi user authenticates
    - Connect activity events đến status updates
    - Setup proper lifecycle management
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 14.2 Integrate UI components vào existing pages
    - Add StatusIndicator đến avatars trong chat, user lists, profile cards
    - Add StatusText đến appropriate locations
    - Ensure proper styling và responsive behavior
    - _Requirements: 5.6, 2.5_
  
  - [x] 14.3 Add developer tools
    - Manual status override cho testing
    - Debug panel showing current status
    - Test mode support
    - _Requirements: 9.5_
  
  - [ ]* 14.4 Write integration tests
    - Test end-to-end flow: activity → detection → update → UI
    - Test multi-device scenarios
    - Test privacy scenarios
    - Test network interruption recovery

- [x] 15. Final Checkpoint - Comprehensive Testing
  - Run all unit tests và property tests
  - Test trên Chrome, Firefox, Safari, Edge
  - Test trên iOS Safari và Android Chrome
  - Test với slow 3G network throttling
  - Verify Firebase quota usage
  - Check memory leaks với Chrome DevTools
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All 26 correctness properties từ design document được covered bởi property tests
- Property tests sử dụng fast-check với minimum 100 iterations
- Each task references specific requirements cho traceability
- Firebase Security Rules cần được deploy trước khi test integration
- Mobile testing requires physical devices hoặc emulators
- Performance testing cần monitor Firebase quota usage
