# Requirements Document - Firestore Query Optimization

## Introduction

TVU Connect là nền tảng kết nối sinh viên với các tính năng: matching, posts, messages, explore places, và AI assistant. Hiện tại, nền tảng đang sử dụng Firestore làm database chính với nhiều queries chưa được tối ưu, dẫn đến hiệu suất chậm và chi phí cao. Tính năng này nhằm tối ưu hóa toàn bộ Firestore queries, giảm số lượng document reads, cải thiện tốc độ load dữ liệu, và giảm chi phí vận hành.

## Glossary

- **Query_Optimizer**: Hệ thống tối ưu hóa Firestore queries
- **Cache_Manager**: Hệ thống quản lý cache cho dữ liệu Firestore
- **Index_Manager**: Hệ thống quản lý Firestore indexes
- **Batch_Processor**: Hệ thống xử lý batch operations
- **Query_Monitor**: Hệ thống giám sát hiệu suất queries
- **Pagination_Handler**: Hệ thống xử lý phân trang dữ liệu
- **Real_Time_Listener**: Hệ thống quản lý real-time listeners
- **Document_Read**: Một lần đọc document từ Firestore
- **Composite_Index**: Index kết hợp nhiều fields trong Firestore
- **Query_Limit**: Giới hạn số lượng documents trong một query
- **Cache_TTL**: Time-to-live của cached data
- **Snapshot_Listener**: Real-time listener sử dụng onSnapshot

## Requirements

### Requirement 1: Query Optimization for Posts Feed

**User Story:** Là một sinh viên, tôi muốn xem bảng tin load nhanh, để tôi có thể xem các bài viết mới nhất mà không phải chờ đợi lâu.

#### Acceptance Criteria

1. WHEN loading posts feed, THE Query_Optimizer SHALL limit initial query to 10 documents
2. WHEN posts feed is loaded, THE Query_Optimizer SHALL use composite index on (createdAt DESC)
3. WHEN user scrolls to bottom, THE Pagination_Handler SHALL load next 10 posts using startAfter cursor
4. THE Query_Optimizer SHALL filter posts older than 18 hours at database level using where clause
5. WHEN posts are loaded, THE Cache_Manager SHALL cache results for 60 seconds
6. THE Real_Time_Listener SHALL update only new posts created after initial load
7. THE Query_Optimizer SHALL reduce document reads by at least 40% compared to current implementation

### Requirement 2: Query Optimization for Matching System

**User Story:** Là một sinh viên, tôi muốn tìm kiếm bạn bè phù hợp nhanh chóng, để tôi có thể kết nối với nhiều người mà không tốn thời gian chờ đợi.

#### Acceptance Criteria

1. WHEN searching for matches, THE Query_Optimizer SHALL apply gender filter at database level using where clause
2. WHEN major filter is applied, THE Query_Optimizer SHALL use majorNormalized field with composite index
3. WHEN academic year filter is applied, THE Query_Optimizer SHALL use where clause at database level
4. THE Query_Optimizer SHALL limit matching query to maximum 50 documents per request
5. THE Cache_Manager SHALL cache viewed profiles for 24 hours to prevent re-fetching
6. WHEN loading one more profile, THE Query_Optimizer SHALL exclude already shown UIDs using in-memory filtering
7. THE Batch_Processor SHALL save match history in batches of 10 instead of individual writes
8. THE Query_Optimizer SHALL reduce document reads by at least 50% compared to current implementation

### Requirement 3: Query Optimization for Messages and Conversations

**User Story:** Là một sinh viên, tôi muốn tin nhắn load nhanh và real-time, để tôi có thể trò chuyện mượt mà với bạn bè.

#### Acceptance Criteria

1. WHEN loading conversations list, THE Query_Optimizer SHALL limit initial query to 20 conversations
2. WHEN loading messages in a conversation, THE Query_Optimizer SHALL limit initial query to 30 messages
3. THE Query_Optimizer SHALL use composite index on (conversationId, createdAt DESC) for messages
4. THE Pagination_Handler SHALL load older messages using startAfter cursor when user scrolls up
5. THE Cache_Manager SHALL cache conversation list for 120 seconds
6. THE Real_Time_Listener SHALL subscribe only to active conversation, not all conversations
7. WHEN user switches conversation, THE Real_Time_Listener SHALL unsubscribe from previous conversation
8. THE Query_Optimizer SHALL reduce document reads by at least 60% compared to current implementation

### Requirement 4: Query Optimization for Explore Places

**User Story:** Là một sinh viên, tôi muốn xem bản đồ địa điểm load nhanh trên mobile, để tôi có thể khám phá các địa điểm xung quanh mà không bị lag.

#### Acceptance Criteria

1. WHEN loading places on mobile, THE Query_Optimizer SHALL limit query to 100 places
2. WHEN loading places on desktop, THE Query_Optimizer SHALL limit query to 200 places
3. WHEN category filter is applied, THE Query_Optimizer SHALL use where clause at database level
4. THE Cache_Manager SHALL cache places data for 300 seconds (5 minutes)
5. WHEN loading check-ins, THE Query_Optimizer SHALL filter expired check-ins at database level using where clause
6. THE Query_Optimizer SHALL limit check-ins query to 30 on mobile and 50 on desktop
7. WHEN loading events, THE Query_Optimizer SHALL filter past events at database level using where clause
8. THE Query_Optimizer SHALL limit events query to 5 on mobile and 10 on desktop
9. THE Query_Optimizer SHALL reduce document reads by at least 45% compared to current implementation

### Requirement 5: Query Optimization for User Profiles

**User Story:** Là một sinh viên, tôi muốn xem profile của người khác load nhanh, để tôi có thể quyết định có muốn kết nối hay không.

#### Acceptance Criteria

1. WHEN loading user profile, THE Cache_Manager SHALL check cache first before querying Firestore
2. THE Cache_Manager SHALL cache user profiles for 180 seconds (3 minutes)
3. WHEN loading blocked users list, THE Query_Optimizer SHALL limit query to 30 users
4. THE Batch_Processor SHALL fetch blocked profiles in one query using where uid in array
5. WHEN checking if user is saved, THE Query_Optimizer SHALL use composite index on (fromUid, toUid)
6. THE Query_Optimizer SHALL reduce document reads by at least 55% compared to current implementation

### Requirement 6: Query Optimization for Online Status

**User Story:** Là một sinh viên, tôi muốn thấy trạng thái online của bạn bè mà không làm tăng chi phí Firestore, để nền tảng có thể hoạt động bền vững.

#### Acceptance Criteria

1. THE Cache_Manager SHALL cache online status for 30 seconds per user
2. THE Real_Time_Listener SHALL reuse existing listener if one already exists for a user
3. WHEN component unmounts, THE Real_Time_Listener SHALL unsubscribe from online status listener
4. THE Query_Optimizer SHALL prevent duplicate listeners for the same user
5. THE Query_Optimizer SHALL reduce document reads by at least 70% compared to current implementation

### Requirement 7: Composite Index Management

**User Story:** Là một developer, tôi muốn có danh sách đầy đủ các composite indexes cần thiết, để tôi có thể deploy chúng lên Firestore và tối ưu queries.

#### Acceptance Criteria

1. THE Index_Manager SHALL define composite index for posts collection on (createdAt DESC)
2. THE Index_Manager SHALL define composite index for messages collection on (conversationId, createdAt DESC)
3. THE Index_Manager SHALL define composite index for profiles collection on (gender, majorNormalized, academicYear)
4. THE Index_Manager SHALL define composite index for checkIns collection on (expiresAt, createdAt DESC)
5. THE Index_Manager SHALL define composite index for events collection on (startTime, createdAt DESC)
6. THE Index_Manager SHALL define composite index for favorites collection on (fromUid, toUid)
7. THE Index_Manager SHALL define composite index for blocks collection on (blockerUid, blockedUid)
8. THE Index_Manager SHALL provide firestore.indexes.json file with all required indexes

### Requirement 8: Caching Strategy Implementation

**User Story:** Là một developer, tôi muốn có caching strategy rõ ràng, để giảm số lượng Firestore reads và cải thiện hiệu suất.

#### Acceptance Criteria

1. THE Cache_Manager SHALL implement in-memory cache using Map data structure
2. THE Cache_Manager SHALL store cache entries with timestamp and TTL
3. WHEN cache entry expires, THE Cache_Manager SHALL remove it from cache
4. THE Cache_Manager SHALL provide cache hit rate monitoring
5. WHEN data is updated, THE Cache_Manager SHALL invalidate related cache entries
6. THE Cache_Manager SHALL limit cache size to maximum 100 entries per collection
7. WHEN cache is full, THE Cache_Manager SHALL evict oldest entries using LRU algorithm

### Requirement 9: Batch Operations for Write Operations

**User Story:** Là một developer, tôi muốn gộp các write operations lại, để giảm số lượng write operations và chi phí Firestore.

#### Acceptance Criteria

1. WHEN saving match history, THE Batch_Processor SHALL batch writes in groups of 10
2. WHEN deleting user account, THE Batch_Processor SHALL batch delete operations
3. THE Batch_Processor SHALL execute batch operations within 500ms
4. IF batch operation fails, THEN THE Batch_Processor SHALL retry individual operations
5. THE Batch_Processor SHALL reduce write operations by at least 30% compared to current implementation

### Requirement 10: Query Performance Monitoring

**User Story:** Là một developer, tôi muốn giám sát hiệu suất của các queries, để phát hiện và khắc phục các queries chậm.

#### Acceptance Criteria

1. THE Query_Monitor SHALL log query execution time for all Firestore queries
2. WHEN query takes longer than 2 seconds, THE Query_Monitor SHALL log warning
3. THE Query_Monitor SHALL track total document reads per session
4. THE Query_Monitor SHALL provide query performance report with average execution time
5. THE Query_Monitor SHALL track cache hit rate for each collection
6. THE Query_Monitor SHALL provide dashboard showing top 10 slowest queries

### Requirement 11: Pagination Implementation

**User Story:** Là một sinh viên, tôi muốn load thêm dữ liệu khi scroll xuống, để không phải load tất cả dữ liệu cùng lúc và tiết kiệm băng thông.

#### Acceptance Criteria

1. THE Pagination_Handler SHALL use startAfter cursor for pagination
2. THE Pagination_Handler SHALL store last document reference for next page
3. WHEN loading next page, THE Pagination_Handler SHALL reuse previous query with startAfter
4. THE Pagination_Handler SHALL indicate when no more data is available
5. THE Pagination_Handler SHALL prevent duplicate page loads
6. THE Pagination_Handler SHALL load next page within 1 second

### Requirement 12: Real-Time Listener Optimization

**User Story:** Là một developer, tôi muốn tối ưu real-time listeners, để giảm số lượng snapshot reads và chi phí Firestore.

#### Acceptance Criteria

1. THE Real_Time_Listener SHALL unsubscribe from listeners when component unmounts
2. THE Real_Time_Listener SHALL prevent duplicate listeners for the same query
3. THE Real_Time_Listener SHALL use query limits to reduce snapshot size
4. WHEN data changes, THE Real_Time_Listener SHALL update only changed documents
5. THE Real_Time_Listener SHALL provide listener registry to track active listeners
6. THE Real_Time_Listener SHALL reduce snapshot reads by at least 50% compared to current implementation

### Requirement 13: Query Result Validation

**User Story:** Là một developer, tôi muốn validate query results, để đảm bảo dữ liệu trả về đúng format và không có lỗi.

#### Acceptance Criteria

1. WHEN query returns results, THE Query_Optimizer SHALL validate document structure
2. IF document is missing required fields, THEN THE Query_Optimizer SHALL filter it out
3. THE Query_Optimizer SHALL log validation errors for debugging
4. THE Query_Optimizer SHALL provide fallback data when query fails
5. THE Query_Optimizer SHALL handle quota exceeded errors gracefully

### Requirement 14: Cost Reduction Metrics

**User Story:** Là một product owner, tôi muốn theo dõi chi phí Firestore, để đảm bảo tối ưu hóa đang hoạt động hiệu quả.

#### Acceptance Criteria

1. THE Query_Monitor SHALL track total document reads per day
2. THE Query_Monitor SHALL calculate estimated daily cost based on Firestore pricing
3. THE Query_Monitor SHALL compare current cost with baseline before optimization
4. THE Query_Monitor SHALL provide cost reduction percentage report
5. THE Query_Optimizer SHALL reduce overall Firestore costs by at least 50%
6. THE Query_Monitor SHALL alert when daily read quota exceeds 80% of limit

### Requirement 15: Migration and Deployment

**User Story:** Là một developer, tôi muốn có hướng dẫn migration rõ ràng, để deploy các tối ưu hóa lên production một cách an toàn.

#### Acceptance Criteria

1. THE Index_Manager SHALL provide step-by-step guide to deploy composite indexes
2. THE Index_Manager SHALL verify all indexes are created before enabling optimized queries
3. THE Query_Optimizer SHALL provide feature flag to enable/disable optimizations
4. THE Query_Optimizer SHALL provide rollback plan if optimization causes issues
5. THE Query_Optimizer SHALL provide testing checklist for all optimized queries
6. THE Query_Optimizer SHALL provide performance comparison report before and after optimization
