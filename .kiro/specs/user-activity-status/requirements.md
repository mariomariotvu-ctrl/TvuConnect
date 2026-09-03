# Requirements Document - User Activity Status System

## Introduction

Hệ thống hiển thị trạng thái hoạt động của người dùng (User Activity Status System) cung cấp khả năng theo dõi và hiển thị trạng thái online/offline/away của người dùng theo thời gian thực. Hệ thống được thiết kế để thông minh, hiệu quả và chính xác, với UX/UI tương tự Facebook, giúp người dùng biết được ai đang online và có thể tương tác ngay lập tức.

## Glossary

- **Status_System**: Hệ thống quản lý và hiển thị trạng thái hoạt động của người dùng
- **Activity_Detector**: Module phát hiện hoạt động của người dùng (mouse, keyboard, touch)
- **Status_Manager**: Module quản lý và cập nhật trạng thái người dùng
- **Status_Indicator**: Component UI hiển thị trạng thái (dot màu xanh/xám)
- **Presence_Database**: Cơ sở dữ liệu lưu trữ trạng thái người dùng
- **Real_Time_Sync**: Hệ thống đồng bộ trạng thái theo thời gian thực
- **Timestamp_Manager**: Module quản lý thời gian cập nhật cuối cùng
- **Status_Text**: Text hiển thị "Active X minutes ago"
- **Idle_Threshold**: Ngưỡng thời gian để chuyển sang trạng thái idle (5 phút)
- **Offline_Threshold**: Ngưỡng thời gian để chuyển sang trạng thái offline (15 phút)
- **Update_Debouncer**: Cơ chế giảm tần suất cập nhật để tối ưu performance

## Requirements

### Requirement 1: Phát hiện trạng thái hoạt động tự động

**User Story:** Là người dùng, tôi muốn hệ thống tự động phát hiện khi tôi đang hoạt động hoặc không hoạt động, để trạng thái của tôi được cập nhật chính xác mà không cần thao tác thủ công.

#### Acceptance Criteria

1. WHEN a user performs any interaction (mouse move, click, keyboard, touch), THE Activity_Detector SHALL detect the activity
2. WHEN no activity is detected for 5 minutes, THE Status_Manager SHALL change user status to "away"
3. WHEN no activity is detected for 15 minutes, THE Status_Manager SHALL change user status to "offline"
4. WHEN an "away" or "offline" user performs any activity, THE Status_Manager SHALL change status back to "online" within 2 seconds
5. THE Activity_Detector SHALL use event throttling with a maximum update frequency of once per 30 seconds to optimize performance

### Requirement 2: Hiển thị trạng thái real-time

**User Story:** Là người dùng, tôi muốn thấy trạng thái của người khác được cập nhật theo thời gian thực, để tôi biết ai đang online và có thể chat ngay.

#### Acceptance Criteria

1. WHEN another user's status changes, THE Real_Time_Sync SHALL push the update to all connected clients within 3 seconds
2. THE Status_Indicator SHALL display a green dot for online users
3. THE Status_Indicator SHALL display a gray dot for offline users
4. WHERE a user is "away", THE Status_Indicator SHALL display a yellow/amber dot
5. WHEN a user's status updates, THE Status_Indicator SHALL animate smoothly without jarring transitions

### Requirement 3: Hiển thị timestamp hoạt động cuối

**User Story:** Là người dùng, tôi muốn thấy "Active X minutes ago" cho người dùng offline/away, để biết họ hoạt động lần cuối khi nào.

#### Acceptance Criteria

1. WHEN a user is offline or away, THE Status_Text SHALL display "Active X minutes ago"
2. WHEN a user is online, THE Status_Text SHALL display "Active now"
3. THE Timestamp_Manager SHALL update the displayed time automatically every 60 seconds
4. WHEN the last activity was less than 1 minute ago, THE Status_Text SHALL display "Active just now"
5. WHEN the last activity was more than 60 minutes ago, THE Status_Text SHALL display "Active X hours ago"
6. WHEN the last activity was more than 24 hours ago, THE Status_Text SHALL display "Active X days ago"

### Requirement 4: Tối ưu hóa performance và tài nguyên

**User Story:** Là quản trị viên hệ thống, tôi muốn hệ thống trạng thái hoạt động không tiêu tốn quá nhiều tài nguyên, để đảm bảo hiệu suất tổng thể của ứng dụng.

#### Acceptance Criteria

1. THE Update_Debouncer SHALL limit status updates to maximum 1 request per 30 seconds per user
2. THE Status_System SHALL use Firebase Realtime Database presence system for efficient real-time sync
3. WHEN a user closes the browser or loses connection, THE Status_Manager SHALL automatically set status to "offline" within 30 seconds
4. THE Status_System SHALL implement connection recovery with exponential backoff when network is unstable
5. THE Presence_Database SHALL automatically clean up stale presence data older than 7 days
6. THE Status_System SHALL batch multiple status queries into a single database read when loading user lists

### Requirement 5: UX/UI giống Facebook

**User Story:** Là người dùng quen với Facebook, tôi muốn trạng thái hoạt động có giao diện và trải nghiệm tương tự Facebook, để dễ sử dụng và quen thuộc.

#### Acceptance Criteria

1. THE Status_Indicator SHALL be positioned at the bottom-right of user avatars
2. THE Status_Indicator SHALL be a circular dot with 10px diameter and 2px white border
3. WHERE a user hovers over the Status_Indicator, THE Status_Text SHALL display in a tooltip within 300ms
4. THE Status_Indicator SHALL use the exact color: #42b72a (green) for online, #8a8d91 (gray) for offline
5. WHEN displaying in a user list, THE Status_Text SHALL appear next to the username in light gray color
6. THE Status_System SHALL display online status prominently in chat interface, profile cards, and user lists

### Requirement 6: Bảo mật và quyền riêng tư

**User Story:** Là người dùng, tôi muốn kiểm soát ai có thể thấy trạng thái hoạt động của tôi, để bảo vệ quyền riêng tư của mình.

#### Acceptance Criteria

1. WHERE a user enables privacy mode, THE Status_System SHALL hide their online status from all users except friends
2. WHERE a user blocks another user, THE Status_System SHALL hide their status from the blocked user
3. THE Status_Manager SHALL write presence data with user authentication required
4. IF an unauthorized user attempts to read another user's status, THEN THE Presence_Database SHALL deny the request
5. THE Status_System SHALL allow users to appear offline while still being online (invisible mode)

### Requirement 7: Độ chính xác cao

**User Story:** Là người dùng, tôi muốn trạng thái hiển thị phản ánh chính xác tình trạng thực tế, để tôi không nhắn tin cho người đang offline hoặc bỏ lỡ cơ hội chat với người đang online.

#### Acceptance Criteria

1. THE Activity_Detector SHALL detect activity across multiple browser tabs of the same user
2. WHEN a user has multiple devices online simultaneously, THE Status_Manager SHALL show status as "online"
3. WHEN all devices of a user disconnect, THE Status_Manager SHALL update to "offline" within 30 seconds
4. THE Status_System SHALL use server timestamp for all time calculations to avoid client clock skew
5. WHEN network connection is lost temporarily, THE Status_System SHALL maintain last known status for up to 2 minutes before marking as offline

### Requirement 8: Mobile optimization

**User Story:** Là người dùng mobile, tôi muốn tính năng trạng thái hoạt động làm việc mượt mà trên thiết bị di động, để có trải nghiệm tương đương desktop.

#### Acceptance Criteria

1. THE Activity_Detector SHALL detect touch events and screen interactions on mobile devices
2. WHEN a mobile app goes to background, THE Status_Manager SHALL maintain "online" status for 5 minutes before switching to "away"
3. WHEN a mobile app returns to foreground, THE Status_Manager SHALL update status to "online" within 2 seconds
4. THE Status_Indicator SHALL be touch-friendly with minimum 44px touch target size
5. THE Status_System SHALL minimize battery consumption by reducing update frequency when battery is low

### Requirement 9: Testing và monitoring

**User Story:** Là developer, tôi muốn có khả năng test và monitor hệ thống trạng thái, để đảm bảo hoạt động đúng và phát hiện vấn đề sớm.

#### Acceptance Criteria

1. THE Status_System SHALL provide a debug mode that logs all status transitions
2. THE Status_System SHALL track metrics: total online users, average status update latency, failed updates
3. THE Status_System SHALL expose a health check endpoint that returns current system status
4. WHEN status update fails 3 consecutive times, THE Status_System SHALL log an error and alert monitoring system
5. THE Status_System SHALL support manual status override for testing purposes in development environment
