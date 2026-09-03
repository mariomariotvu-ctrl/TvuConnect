# Requirements Document

## Introduction

Tính năng **Matching Exhausted History Display** nhằm cải thiện trải nghiệm người dùng trong ứng dụng TVU Connect khi người dùng đã hết lượt ghép cặp trong chu kỳ 8 tiếng. Hiện tại, khi hết lượt, màn hình hiển thị banner thông báo và nút bị vô hiệu hóa nhưng phần nội dung bên dưới trống rỗng, dẫn đến người dùng có xu hướng thoát ứng dụng. Tính năng này sẽ hiển thị danh sách các hồ sơ đã được ghép trong chu kỳ hiện tại kèm nút "Nhắn tin" cho từng hồ sơ, kể cả những hồ sơ mà người dùng trước đó đã bỏ qua, tạo cơ hội kết nối lại và giữ chân người dùng.

## Glossary

- **Matching_Screen**: Màn hình ghép cặp trong ứng dụng TVU Connect, nơi người dùng tìm kiếm kết nối với sinh viên khác.
- **Exhausted_State**: Trạng thái khi người dùng đã sử dụng hết số lượt ghép cặp trong chu kỳ 8 tiếng hiện tại (`remainingMatches === 0`).
- **History_Section**: Phần giao diện hiển thị danh sách hồ sơ đã ghép bên dưới banner thông báo hết lượt.
- **Match_Record**: Một bản ghi ghép cặp trong Firestore collection `matches`, chứa thông tin `matchedProfile`, `matchedUid`, `createdAt`, `userUid`.
- **Matched_Profile**: Hồ sơ sinh viên (`StudentProfile`) đã từng được ghép cặp với người dùng hiện tại trong lịch sử.
- **Message_Button**: Nút "Nhắn tin" trên mỗi thẻ hồ sơ trong History_Section, cho phép người dùng bắt đầu cuộc trò chuyện.
- **Daily_Limit_Banner**: Banner gradient đỏ hiện tại hiển thị thông báo "Đã hết lượt ghép - Vui lòng đợi khoảng X tiếng nữa".
- **useMatchingHistory**: Custom React hook hiện có, lấy dữ liệu `matches` từ Firestore theo `userUid`, sắp xếp theo `createdAt` giảm dần.
- **MatchingHistory**: Component React hiện có, render danh sách hồ sơ lịch sử. Hiện luôn hiển thị bất kể trạng thái lượt ghép.
- **Blocked_User**: Người dùng bị chặn, được lọc ra khỏi danh sách hiển thị qua `blockedSet`.
- **Match_Mode**: Chế độ ghép cặp (`lover`, `study`, `hobby`, `quick`) ảnh hưởng đến giao diện nhưng không ảnh hưởng đến logic lịch sử.

## Requirements

### Requirement 1: Hiển thị History Section khi hết lượt

**User Story:** Là một sinh viên TVU đã hết lượt ghép cặp trong ngày, tôi muốn xem lại danh sách các hồ sơ đã được ghép trước đó, để tôi có thể kết nối lại thay vì rời khỏi ứng dụng.

#### Acceptance Criteria

1. WHEN `remainingMatches === 0`, THE `Matching_Screen` SHALL hiển thị `History_Section` ngay bên dưới `Daily_Limit_Banner`.
2. WHEN `remainingMatches === 0` VÀ `matchHistory` có ít nhất 1 `Match_Record` hợp lệ, THE `History_Section` SHALL hiển thị danh sách các `Matched_Profile` đã ghép.
3. WHEN `remainingMatches === 0` VÀ `matchHistory` rỗng, THE `History_Section` SHALL hiển thị thông báo trống "Chưa có lịch sử ghép cặp nào".
4. WHILE `remainingMatches > 0`, THE `Matching_Screen` SHALL hiển thị `MatchingHistory` component theo vị trí và hành vi hiện tại (không thay đổi UX khi còn lượt).

---

### Requirement 2: Nội dung hiển thị mỗi hồ sơ trong History Section

**User Story:** Là sinh viên TVU đang xem lịch sử ghép cặp khi hết lượt, tôi muốn thấy đủ thông tin về từng hồ sơ đã ghép, để tôi có thể nhận ra và quyết định có nên nhắn tin không.

#### Acceptance Criteria

1. THE `History_Section` SHALL hiển thị cho mỗi `Matched_Profile`: ảnh đại diện (`photoURL`), họ tên (`fullName`), ngành học (`major`), và thời gian ghép (`createdAt`).
2. IF `matchedProfile.photoURL` là null hoặc undefined, THEN THE `History_Section` SHALL hiển thị icon placeholder thay thế ảnh đại diện.
3. IF `matchedProfile.major` là null hoặc undefined, THEN THE `History_Section` SHALL hiển thị chuỗi "Chưa cập nhật" thay cho ngành học.
4. THE `History_Section` SHALL hiển thị `createdAt` theo định dạng ngày tháng tiếng Việt (`dd/mm/yyyy`).
5. IF `matchedProfile` của một `Match_Record` là null hoặc undefined, THEN THE `History_Section` SHALL bỏ qua `Match_Record` đó và không render thẻ hồ sơ tương ứng.

---

### Requirement 3: Nút Nhắn tin trên mỗi hồ sơ

**User Story:** Là sinh viên TVU đang xem lịch sử ghép cặp khi hết lượt, tôi muốn có nút nhắn tin ngay trên mỗi thẻ hồ sơ, kể cả những hồ sơ tôi đã bỏ qua trước đó, để tôi có thể bắt đầu kết nối bất cứ lúc nào.

#### Acceptance Criteria

1. THE `History_Section` SHALL hiển thị nút "Nhắn tin" trên mỗi thẻ `Matched_Profile`.
2. WHEN người dùng nhấn nút "Nhắn tin" trên một thẻ hồ sơ, THE `Matching_Screen` SHALL gọi callback `onMatchFound` với `matchedProfile` tương ứng để điều hướng sang màn hình chat.
3. THE `History_Section` SHALL hiển thị nút "Nhắn tin" cho TẤT CẢ `Matched_Profile` trong lịch sử, bao gồm cả những hồ sơ người dùng đã bỏ qua trước đó.
4. WHERE màn hình hiển thị trên thiết bị di động (chiều rộng màn hình < 768px), THE nút "Nhắn tin" SHALL có kích thước tối thiểu 44x44px để đảm bảo khả năng chạm.

---

### Requirement 4: Lọc người dùng bị chặn

**User Story:** Là sinh viên TVU, tôi muốn những người tôi đã chặn không xuất hiện trong danh sách lịch sử, để tôi không phải thấy nội dung không mong muốn.

#### Acceptance Criteria

1. THE `History_Section` SHALL lọc ra tất cả `Match_Record` có `matchedUid` nằm trong `blockedSet` của người dùng hiện tại.
2. WHEN người dùng chặn một người dùng khác trong khi `History_Section` đang hiển thị, THE `History_Section` SHALL cập nhật danh sách theo thời gian thực và loại bỏ hồ sơ vừa bị chặn.

---

### Requirement 5: Phân trang và tải thêm

**User Story:** Là sinh viên TVU có nhiều lịch sử ghép cặp, tôi muốn có thể tải thêm hồ sơ nếu danh sách dài, để trang không bị quá nặng khi load ban đầu.

#### Acceptance Criteria

1. THE `History_Section` SHALL hiển thị tối đa 10 `Match_Record` đầu tiên khi tải lần đầu (khởi tạo `historyLimit = 10`).
2. WHEN `hasMoreHistory === true`, THE `History_Section` SHALL hiển thị nút "Xem thêm lịch sử".
3. WHEN người dùng nhấn nút "Xem thêm lịch sử", THE `History_Section` SHALL tải thêm 10 `Match_Record` tiếp theo bằng cách tăng `historyLimit` thêm 10.
4. WHEN `hasMoreHistory === false`, THE `History_Section` SHALL ẩn nút "Xem thêm lịch sử".

---

### Requirement 6: Tiêu đề và nhãn phân biệt

**User Story:** Là sinh viên TVU, tôi muốn phần lịch sử khi hết lượt có tiêu đề và thông điệp rõ ràng, để tôi hiểu đây là danh sách cơ hội kết nối lại chứ không phải kết quả ghép cặp mới.

#### Acceptance Criteria

1. THE `History_Section` (khi `Exhausted_State`) SHALL hiển thị tiêu đề "Kết nối lại với hồ sơ đã ghép" thay cho tiêu đề "Lịch sử ghép cặp" hiện tại.
2. THE `History_Section` (khi `Exhausted_State`) SHALL hiển thị dòng mô tả phụ "Nhắn tin ngay để không bỏ lỡ cơ hội kết nối" bên dưới tiêu đề.
3. THE `History_Section` SHALL hiển thị số lượng hồ sơ trong danh sách kế bên tiêu đề (ví dụ: "3 hồ sơ").

---

### Requirement 7: Trạng thái loading dữ liệu lịch sử

**User Story:** Là sinh viên TVU, tôi muốn thấy trạng thái loading rõ ràng khi dữ liệu lịch sử đang được tải, để tôi biết ứng dụng đang hoạt động bình thường.

#### Acceptance Criteria

1. WHILE `useMatchingHistory.isLoading === true` VÀ `Exhausted_State` đang active, THE `History_Section` SHALL hiển thị skeleton loader thay cho danh sách hồ sơ.
2. WHEN `useMatchingHistory.error` không phải null, THE `History_Section` SHALL hiển thị thông báo lỗi "Không thể tải lịch sử. Vui lòng thử lại." kèm nút "Thử lại".
3. WHEN người dùng nhấn nút "Thử lại", THE `History_Section` SHALL kích hoạt lại quá trình tải dữ liệu từ Firestore.
