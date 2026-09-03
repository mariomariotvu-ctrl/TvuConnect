# Requirements Document

## Introduction

Hệ thống Matching Feedback System cho phép người dùng đánh giá mức độ hài lòng sau khi ghép cặp thành công trong ứng dụng TVU Connect. Hệ thống thu thập feedback dưới dạng đánh giá sao (1-5 sao), nhận xét văn bản tùy chọn, và phân loại theo các danh mục cụ thể. Dữ liệu feedback được lưu trữ trong Firestore và sử dụng để cải thiện thuật toán ghép cặp, đồng thời cung cấp thống kê cho admin dashboard.

## Glossary

- **Matching_System**: Hệ thống ghép cặp hiện tại của TVU Connect (đã triển khai)
- **Feedback_System**: Hệ thống đánh giá sau ghép cặp (tính năng mới)
- **Match_Pair**: Một cặp ghép thành công giữa hai người dùng
- **Rating**: Đánh giá bằng số sao từ 1-5
- **Feedback_Record**: Bản ghi feedback trong Firestore
- **Feedback_Prompt**: Giao diện yêu cầu người dùng đánh giá
- **Admin_Dashboard**: Giao diện quản trị để xem thống kê feedback
- **Feedback_Category**: Danh mục phân loại feedback (tương thích tính cách, sở thích chung, giao tiếp, v.v.)
- **Anonymous_Feedback**: Feedback không tiết lộ danh tính người đánh giá
- **Spam_Prevention**: Cơ chế chống spam đánh giá

## Requirements

### Requirement 1: Star Rating Submission

**User Story:** Là người dùng, tôi muốn đánh giá mức độ hài lòng bằng số sao sau khi ghép cặp, để chia sẻ trải nghiệm của mình.

#### Acceptance Criteria

1. WHEN a Match_Pair is successful for 24 hours, THE Feedback_System SHALL display a Feedback_Prompt to the user
2. THE Feedback_System SHALL accept Rating values from 1 to 5 stars inclusive
3. WHEN a user selects a Rating, THE Feedback_System SHALL provide visual feedback showing the selected star count
4. THE Feedback_System SHALL allow users to change their Rating selection before submission
5. WHEN a user submits a Rating, THE Feedback_System SHALL create a Feedback_Record in Firestore within 2 seconds

### Requirement 2: Optional Text Comment

**User Story:** Là người dùng, tôi muốn thêm nhận xét văn bản tùy chọn, để giải thích chi tiết hơn về đánh giá của mình.

#### Acceptance Criteria

1. THE Feedback_Prompt SHALL provide a text input field for optional comments
2. THE Feedback_System SHALL accept text comments up to 500 characters
3. WHEN a user enters more than 500 characters, THE Feedback_System SHALL display a character count warning
4. THE Feedback_System SHALL allow users to submit Rating without text comments
5. WHEN a text comment contains profanity or inappropriate content, THE Feedback_System SHALL reject the submission and display an error message

### Requirement 3: Feedback Category Selection

**User Story:** Là người dùng, tôi muốn phân loại feedback theo các danh mục cụ thể, để cung cấp thông tin có cấu trúc hơn.

#### Acceptance Criteria

1. THE Feedback_Prompt SHALL display predefined Feedback_Category options including "Tương thích tính cách", "Sở thích chung", "Giao tiếp tốt", "Mục tiêu học tập", and "Khác"
2. THE Feedback_System SHALL allow users to select multiple Feedback_Category values
3. WHEN no Feedback_Category is selected, THE Feedback_System SHALL use "Khác" as the default category
4. THE Feedback_System SHALL store all selected Feedback_Category values in the Feedback_Record

### Requirement 4: Feedback Prompt Timing

**User Story:** Là người dùng, tôi muốn được nhắc đánh giá vào thời điểm phù hợp, để có đủ trải nghiệm trước khi đánh giá.

#### Acceptance Criteria

1. WHEN a Match_Pair is created, THE Feedback_System SHALL record the match timestamp
2. WHEN 24 hours have passed since match timestamp, THE Feedback_System SHALL display the Feedback_Prompt to both users
3. THE Feedback_System SHALL display the Feedback_Prompt only once per Match_Pair per user
4. WHEN a user dismisses the Feedback_Prompt, THE Feedback_System SHALL allow re-display after 7 days if no feedback was submitted
5. THE Feedback_System SHALL not display Feedback_Prompt for Match_Pair older than 30 days

### Requirement 5: Firestore Data Storage

**User Story:** Là hệ thống, tôi cần lưu trữ feedback vào Firestore, để dữ liệu được bảo toàn và có thể truy vấn.

#### Acceptance Criteria

1. WHEN a user submits feedback, THE Feedback_System SHALL create a document in the "matchFeedback" collection
2. THE Feedback_Record SHALL include fields: matchId, userId, rating, comment, categories, timestamp, and isAnonymous
3. THE Feedback_System SHALL set isAnonymous to true by default
4. WHEN Firestore write fails, THE Feedback_System SHALL retry up to 3 times with exponential backoff
5. WHEN all retries fail, THE Feedback_System SHALL display an error message and allow the user to retry manually

### Requirement 6: Spam Prevention

**User Story:** Là hệ thống, tôi cần ngăn chặn spam feedback, để đảm bảo chất lượng dữ liệu.

#### Acceptance Criteria

1. THE Feedback_System SHALL allow only one Feedback_Record per user per Match_Pair
2. WHEN a user attempts to submit duplicate feedback for the same Match_Pair, THE Feedback_System SHALL reject the submission and display "Bạn đã đánh giá cặp ghép này rồi"
3. THE Feedback_System SHALL check for existing Feedback_Record before displaying Feedback_Prompt
4. WHEN a Feedback_Record already exists, THE Feedback_System SHALL not display the Feedback_Prompt
5. THE Feedback_System SHALL use Firestore security rules to enforce one-feedback-per-match constraint

### Requirement 7: Average Rating Display (Optional)

**User Story:** Là người dùng, tôi muốn xem rating trung bình của mình, để biết mức độ hài lòng chung của những người đã ghép cặp với mình.

#### Acceptance Criteria

1. WHERE the user enables rating display in settings, THE Feedback_System SHALL calculate and display average rating on user profile
2. THE Feedback_System SHALL calculate average rating from all Feedback_Record where the user is the matched partner
3. THE Feedback_System SHALL display average rating with one decimal place precision
4. WHERE the user has fewer than 3 feedback records, THE Feedback_System SHALL display "Chưa đủ dữ liệu" instead of average rating
5. THE Feedback_System SHALL update average rating in real-time when new feedback is received

### Requirement 8: Admin Dashboard Statistics

**User Story:** Là admin, tôi muốn xem thống kê feedback, để hiểu chất lượng ghép cặp và cải thiện hệ thống.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display total number of Feedback_Record entries
2. THE Admin_Dashboard SHALL display average rating across all feedback
3. THE Admin_Dashboard SHALL display rating distribution (count of 1-star, 2-star, 3-star, 4-star, 5-star)
4. THE Admin_Dashboard SHALL display most common Feedback_Category values
5. THE Admin_Dashboard SHALL filter statistics by date range, matching mode (lover/study/hobby/quick), and rating threshold
6. THE Admin_Dashboard SHALL refresh statistics every 60 seconds
7. THE Admin_Dashboard SHALL display feedback trends over time using a line chart

### Requirement 9: Privacy Protection

**User Story:** Là người dùng, tôi muốn feedback của mình được ẩn danh, để thoải mái chia sẻ ý kiến trung thực.

#### Acceptance Criteria

1. THE Feedback_System SHALL not display the reviewer's identity to the reviewed user
2. THE Feedback_Record SHALL store userId for analytics purposes only
3. THE Feedback_System SHALL not allow users to view who gave them specific ratings
4. THE Admin_Dashboard SHALL display aggregated statistics only, not individual feedback details with user identities
5. WHEN displaying feedback comments in Admin_Dashboard, THE Feedback_System SHALL redact any personally identifiable information

### Requirement 10: Matching Algorithm Integration

**User Story:** Là hệ thống, tôi cần sử dụng feedback để cải thiện thuật toán ghép cặp, để tăng chất lượng ghép cặp trong tương lai.

#### Acceptance Criteria

1. WHEN calculating matching scores, THE Matching_System SHALL consider average rating of potential matches
2. THE Matching_System SHALL prioritize users with average rating above 3.5 stars
3. WHEN a user consistently receives ratings below 2.5 stars, THE Matching_System SHALL reduce their visibility in matching results by 50%
4. THE Matching_System SHALL analyze Feedback_Category data to improve matching criteria weights
5. THE Matching_System SHALL recalculate matching algorithm parameters weekly based on feedback data
