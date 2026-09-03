# Requirements Document

## Introduction

Hệ thống ghép cặp 4 tab của TVU Connect hiện đạt điểm 8.5/10 với thuật toán chấm điểm thông minh và data normalization xuất sắc. Tài liệu này mô tả các yêu cầu để cải tiến hệ thống lên 9.5/10 thông qua 3 giai đoạn: (1) Refactor và tối ưu performance, (2) Feedback system và testing, (3) Machine Learning (tùy chọn).

## Glossary

- **Matching_System**: Hệ thống ghép cặp 4 chế độ (lover, study, hobby, quick)
- **Matching_Component**: Component React chính (Matching.tsx - 978 dòng)
- **Matching_Utils**: Module chứa business logic (matchingUtils.ts)
- **Profile**: Thông tin sinh viên trong hệ thống
- **Match_Score**: Điểm ghép cặp từ 0-100 dựa trên weighted scoring
- **Firestore**: Cloud database lưu trữ profiles và matches
- **Analytics_System**: Hệ thống theo dõi và phân tích hành vi người dùng
- **Composite_Index**: Index phức hợp trong Firestore để tối ưu queries
- **Feedback_System**: Hệ thống thu thập phản hồi (like/dislike) từ người dùng
- **Rate_Limiter**: Cơ chế giới hạn số lượng requests
- **Sub_Component**: Component con được tách ra từ component lớn
- **Profile_Card**: Component hiển thị thông tin profile của một người dùng trong matching results
- **Relationship_Indicator**: Thông tin về mối quan hệ giữa 2 người (cùng khóa, khóa trên/dưới, cùng quê)

## Requirements

### Requirement 1: Refactor Matching Component

**User Story:** Là developer, tôi muốn Matching.tsx được tách thành các sub-components nhỏ hơn, để code dễ maintain và test hơn.

#### Acceptance Criteria

1. THE Matching_Component SHALL be split into at least 4 sub-components: MatchingFilters, MatchingResults, MatchingHistory, và ProfileCard
2. WHEN refactoring is complete, THE main Matching component SHALL contain no more than 250 lines of code
3. THE Sub_Component SHALL maintain all existing functionality without breaking changes
4. WHEN a sub-component is created, THE Sub_Component SHALL have clear props interface with TypeScript types
5. THE refactored code SHALL pass all existing tests without modification

### Requirement 2: Extract Custom Hooks

**User Story:** Là developer, tôi muốn logic phức tạp được extract thành custom hooks, để tái sử dụng và test độc lập.

#### Acceptance Criteria

1. THE Matching_System SHALL provide a useMatchingFilters hook that manages filter state
2. THE Matching_System SHALL provide a useMatchingHistory hook that manages match history
3. THE Matching_System SHALL provide a useBlockedUsers hook that manages blocked users list
4. WHEN a custom hook is created, THE hook SHALL return typed values and functions
5. THE custom hooks SHALL be testable independently from components

### Requirement 3: Analytics Event Tracking

**User Story:** Là product manager, tôi muốn theo dõi hành vi người dùng trong matching, để tối ưu thuật toán dựa trên data thực tế.

#### Acceptance Criteria

1. WHEN a user starts matching, THE Analytics_System SHALL log a "start_matching" event with mode and filters
2. WHEN a user clicks on a profile, THE Analytics_System SHALL log a "profile_clicked" event with profile ID and match score
3. WHEN a user sends a message, THE Analytics_System SHALL log a "message_sent" event with context
4. THE Analytics_System SHALL store events in Firestore collection "matching_analytics"
5. THE Analytics_System SHALL include timestamp, userId, and sessionId in every event
6. WHEN storing analytics, THE Analytics_System SHALL not block the UI thread

### Requirement 4: Optimize Firestore Queries

**User Story:** Là developer, tôi muốn Firestore queries được tối ưu với composite indexes, để giảm số lượng reads và tăng tốc độ.

#### Acceptance Criteria

1. THE Matching_System SHALL use composite indexes for multi-field queries instead of in-memory filtering
2. WHEN querying profiles, THE Matching_System SHALL apply gender filter at database level
3. WHEN querying profiles, THE Matching_System SHALL apply major filter at database level using normalized field
4. THE Matching_System SHALL document all required composite indexes in firestore.indexes.json
5. WHEN optimization is complete, THE Matching_System SHALL reduce Firestore reads by at least 30%

### Requirement 5: Match Feedback Collection

**User Story:** Là người dùng, tôi muốn đánh giá các matches (like/dislike), để hệ thống hiểu preferences của tôi và gợi ý tốt hơn.

#### Acceptance Criteria

1. WHEN viewing a match, THE Matching_System SHALL display like and dislike buttons
2. WHEN a user clicks like, THE Feedback_System SHALL store feedback with action "like" and timestamp
3. WHEN a user clicks dislike, THE Feedback_System SHALL store feedback with action "dislike" and timestamp
4. THE Feedback_System SHALL store feedback in Firestore collection "match_feedback"
5. THE Feedback_System SHALL prevent duplicate feedback for the same match pair
6. WHEN feedback is submitted, THE Matching_System SHALL update UI immediately without page reload

### Requirement 6: Server-Side Rate Limiting

**User Story:** Là system admin, tôi muốn giới hạn số lượng matching requests, để ngăn spam và bảo vệ Firestore quota.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL limit matching requests to 30 per user per hour
2. WHEN rate limit is exceeded, THE Rate_Limiter SHALL return error message "Bạn đã vượt quá giới hạn, vui lòng thử lại sau"
3. THE Rate_Limiter SHALL be implemented in Firestore Security Rules
4. THE Rate_Limiter SHALL track request count using Firestore document per user
5. THE Rate_Limiter SHALL reset counter after 1 hour automatically

### Requirement 7: Unit Tests for Matching Utils

**User Story:** Là developer, tôi muốn matching utilities có unit tests, để đảm bảo thuật toán hoạt động đúng khi refactor.

#### Acceptance Criteria

1. THE Matching_Utils SHALL have unit tests for normalizeVietnameseText function
2. THE Matching_Utils SHALL have unit tests for calculateMatchingScore function
3. THE Matching_Utils SHALL have unit tests for getSeniorityRelation function
4. THE Matching_Utils SHALL have unit tests for majorContains function with acronym matching
5. THE unit tests SHALL achieve at least 90% code coverage for matchingUtils.ts
6. WHEN tests run, THE test suite SHALL complete in less than 5 seconds

### Requirement 8: Performance Monitoring

**User Story:** Là developer, tôi muốn monitor performance metrics, để phát hiện bottlenecks và tối ưu.

#### Acceptance Criteria

1. THE Matching_System SHALL measure and log query execution time for each Firestore query
2. WHEN query time exceeds 2 seconds, THE Matching_System SHALL log a warning
3. THE Matching_System SHALL track average match score calculation time
4. THE Matching_System SHALL expose performance metrics through console in development mode
5. THE performance metrics SHALL not impact production performance

### Requirement 9: Error Handling and Recovery

**User Story:** Là người dùng, tôi muốn hệ thống xử lý lỗi gracefully, để không bị stuck khi có vấn đề network hoặc database.

#### Acceptance Criteria

1. WHEN Firestore query fails, THE Matching_System SHALL display user-friendly error message
2. WHEN Firestore query fails, THE Matching_System SHALL provide retry button
3. IF retry fails 3 times, THEN THE Matching_System SHALL suggest checking internet connection
4. THE Matching_System SHALL handle offline mode by showing cached profiles
5. WHEN error occurs, THE Matching_System SHALL log error details for debugging

### Requirement 10: Documentation and Code Comments

**User Story:** Là developer mới, tôi muốn code có documentation đầy đủ, để hiểu nhanh cách hệ thống hoạt động.

#### Acceptance Criteria

1. THE Matching_Component SHALL have JSDoc comments explaining props and behavior
2. THE Matching_Utils SHALL have JSDoc comments for all exported functions
3. THE custom hooks SHALL have usage examples in comments
4. THE Matching_System SHALL have README.md explaining architecture và data flow
5. THE composite indexes SHALL be documented with explanation of why they're needed

### Requirement 11: Simplify Profile Card Display

**User Story:** Là người dùng, tôi muốn Profile Card chỉ hiển thị thông tin quan trọng và dễ đọc, để không bị rối bởi quá nhiều thông tin không cần thiết.

#### Acceptance Criteria

1. THE Profile_Card SHALL display exactly 3 relationship indicators: "Cùng khóa" (same academic year), "Khóa trên/dưới" (senior/junior year), và "Cùng quê" (same hometown/province)
2. THE Profile_Card SHALL NOT display study goals (học nhóm, tìm bạn cùng môn, etc.) on the card UI
3. WHEN displaying relationship indicators, THE Profile_Card SHALL only show indicators that are true for the match pair
4. THE Matching_System SHALL continue to use study goals data for matching algorithm and filtering logic
5. THE Profile_Card SHALL maintain all existing profile information (photo, name, major, academic year) in addition to the 3 relationship indicators

