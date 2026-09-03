# Requirements Document

## Introduction

Tính năng **Matched Profiles On Limit Reached** cải thiện trải nghiệm người dùng trong TVU Connect khi người dùng đã hết lượt ghép cặp trong chu kỳ 8 tiếng.

Hiện tại, component `Matching.tsx` khi `remainingMatches === 0` chỉ hiển thị banner đỏ "Đã hết lượt ghép" và nút bị vô hiệu hóa. Component `MatchingHistory` luôn hiển thị phía dưới bất kể trạng thái lượt ghép, nhưng không có nút "Nhắn tin" chuyên biệt và không được trình bày như một danh sách cơ hội kết nối lại.

Tính năng này bổ sung hai điều:
1. Khi hết lượt, hiển thị rõ ràng danh sách hồ sơ đã ghép bên dưới banner với tiêu đề phù hợp ngữ cảnh "Kết nối lại với hồ sơ đã ghép".
2. Trên mỗi thẻ hồ sơ trong danh sách này, hiển thị nút "Nhắn tin" để người dùng có thể bắt đầu cuộc trò chuyện ngay.

Hook `useMatchingHistory` và Firestore collection `matches` đã có sẵn; tính năng này tận dụng hạ tầng hiện có.

## Glossary

- **Matching_Screen**: Component `Matching.tsx` — màn hình ghép cặp chính của TVU Connect.
- **Exhausted_State**: Trạng thái khi `remainingMatches === 0` (người dùng đã dùng hết lượt ghép trong chu kỳ 8 tiếng hiện tại).
- **Daily_Limit_Banner**: Banner gradient đỏ hiện tại trong `Matching.tsx` hiển thị "⏰ Đã hết lượt ghép - Vui lòng đợi khoảng X tiếng nữa".
- **Matched_Profiles_Section**: Component mới được thêm vào, hiển thị danh sách hồ sơ đã ghép khi `Exhausted_State` đang active.
- **Match_Record**: Một bản ghi trong Firestore collection `matches` chứa `matchedProfile`, `matchedUid`, `createdAt`, `userUid`, `id`.
- **Matched_Profile**: Đối tượng `StudentProfile` lưu trong trường `matchedProfile` của một `Match_Record`.
- **Profile_Card**: Thẻ UI hiển thị thông tin tóm tắt của một `Matched_Profile` bên trong `Matched_Profiles_Section`.
- **Message_Button**: Nút "Nhắn tin" trên mỗi `Profile_Card` trong `Matched_Profiles_Section`.
- **useMatchingHistory**: Custom hook hiện có (`src/hooks/useMatchingHistory.ts`) trả về `{ matchHistory, hasMoreHistory, loadMore, isLoading, error }`.
- **MatchingHistory**: Component hiện có (`src/components/matching/MatchingHistory.tsx`) — component lịch sử hiện tại, KHÔNG bị thay đổi bởi tính năng này.
- **onMatchFound**: Prop callback của `Matching_Screen` nhận `StudentProfile`, dùng để điều hướng sang màn hình chat.
- **Blocked_User**: Người dùng có `uid` nằm trong `blockedSet`, bị lọc ra khỏi mọi danh sách hiển thị.

## Requirements

### Requirement 1: Hiển thị Matched_Profiles_Section khi hết lượt

**User Story:** Là sinh viên TVU đã hết lượt ghép cặp, tôi muốn thấy danh sách các hồ sơ đã ghép trước đó ngay bên dưới thông báo hết lượt, để tôi không phải nhìn màn hình trống và có thể kết nối lại.

#### Acceptance Criteria

1. WHEN `remainingMatches === 0`, THE `Matching_Screen` SHALL render `Matched_Profiles_Section` ngay bên dưới `Daily_Limit_Banner`, trước `MatchingHistory` component hiện có.
2. WHILE `remainingMatches > 0`, THE `Matching_Screen` SHALL không render `Matched_Profiles_Section` (component không tồn tại trong DOM, không dùng CSS `display: none`).
3. WHEN `remainingMatches === 0` VÀ `useMatchingHistory.isLoading === false` VÀ `matchHistory` có ít nhất 1 `Match_Record` hợp lệ, THE `Matched_Profiles_Section` SHALL hiển thị danh sách `Profile_Card` ngay lập tức.
4. WHEN `remainingMatches === 0` VÀ `useMatchingHistory.isLoading === true`, THE `Matched_Profiles_Section` SHALL hiển thị skeleton loader với ít nhất 3 placeholder item.
5. WHEN `remainingMatches === 0` VÀ `useMatchingHistory.isLoading === false` VÀ `matchHistory` rỗng, THE `Matched_Profiles_Section` SHALL hiển thị thông báo "Chưa có hồ sơ nào được ghép".
6. WHEN `remainingMatches === 0` VÀ `useMatchingHistory.error` khác null, THE `Matched_Profiles_Section` SHALL hiển thị thông báo lỗi "Không thể tải danh sách. Vui lòng thử lại." kèm nút "Thử lại".
7. WHEN người dùng nhấn nút "Thử lại", THE `Matched_Profiles_Section` SHALL kích hoạt lại quá trình tải dữ liệu từ `useMatchingHistory`.

---

### Requirement 2: Tiêu đề và ngữ cảnh của Matched_Profiles_Section

**User Story:** Là sinh viên TVU, tôi muốn phần danh sách hồ sơ khi hết lượt có tiêu đề và mô tả rõ ràng, để tôi hiểu đây là cơ hội kết nối lại chứ không phải kết quả ghép mới.

#### Acceptance Criteria

1. THE `Matched_Profiles_Section` SHALL hiển thị tiêu đề "Kết nối lại với hồ sơ đã ghép" kèm icon phù hợp (ví dụ: icon lịch sử hoặc tim).
2. THE `Matched_Profiles_Section` SHALL hiển thị dòng mô tả phụ "Nhắn tin ngay để không bỏ lỡ cơ hội kết nối" bên dưới tiêu đề.
3. THE tiêu đề và mô tả phụ SHALL có font size và màu sắc nhất quán với phong cách thiết kế hiện tại của `Matching_Screen` (dark mode compatible).

---

### Requirement 3: Nội dung hiển thị trên mỗi Profile_Card

**User Story:** Là sinh viên TVU đang xem lịch sử khi hết lượt, tôi muốn thấy đủ thông tin trên mỗi thẻ hồ sơ, để nhận ra được người đó và quyết định có nên nhắn tin không.

#### Acceptance Criteria

1. THE `Profile_Card` SHALL hiển thị ảnh đại diện (`photoURL`), họ tên (`fullName`), ngành học (`major`), và ngày ghép (`createdAt`) của `Matched_Profile`.
2. IF `matchedProfile.photoURL` là null hoặc undefined, THEN THE `Profile_Card` SHALL hiển thị icon `UserIcon` placeholder thay thế ảnh đại diện.
3. IF `matchedProfile.major` là null, undefined hoặc chuỗi rỗng (`""`), THEN THE `Profile_Card` SHALL hiển thị chuỗi "Chưa cập nhật" thay cho ngành học.
4. THE `Profile_Card` SHALL hiển thị `createdAt` theo định dạng ngày tiếng Việt (`dd/MM/yyyy`); IF `createdAt` là null, THEN THE `Profile_Card` SHALL hiển thị "Không rõ ngày".
5. IF `match.matchedProfile` là null hoặc undefined, THEN THE `Matched_Profiles_Section` SHALL bỏ qua `Match_Record` đó và không render `Profile_Card` tương ứng.

---

### Requirement 4: Nút Nhắn tin trên Profile_Card

**User Story:** Là sinh viên TVU, tôi muốn có nút nhắn tin ngay trên mỗi thẻ hồ sơ, kể cả những người tôi đã bỏ qua trước đó, để bắt đầu kết nối bất cứ lúc nào mà không cần điều hướng thêm.

#### Acceptance Criteria

1. THE `Profile_Card` SHALL hiển thị `Message_Button` với nhãn "Nhắn tin" và icon tin nhắn, đặt bên phải mỗi thẻ.
2. WHEN người dùng nhấn `Message_Button` trên một `Profile_Card`, THE `Matching_Screen` SHALL gọi `onMatchFound` với `matchedProfile` tương ứng để điều hướng sang màn hình chat.
3. THE `Matched_Profiles_Section` SHALL hiển thị `Message_Button` cho TẤT CẢ `Profile_Card` trong danh sách, không phân biệt người dùng đã nhắn tin hay chưa.
4. WHERE ứng dụng chạy trên thiết bị di động (chiều rộng màn hình < 768px hoặc chiều rộng màn hình không hợp lệ), THE `Message_Button` SHALL có kích thước tối thiểu 44x44px để đảm bảo khả năng chạm chuẩn accessibility.
5. THE `Message_Button` SHALL có visual style (màu sắc gradient, bo góc) nhất quán với nút hành động chính trong `Matching_Screen`; THE `Message_Button` SHALL có trạng thái hover/active rõ ràng.

---

### Requirement 5: Lọc người dùng bị chặn

**User Story:** Là sinh viên TVU, tôi không muốn thấy những người tôi đã chặn trong danh sách hồ sơ khi hết lượt, để không phải tiếp xúc với nội dung không mong muốn.

#### Acceptance Criteria

1. THE `Matched_Profiles_Section` SHALL lọc ra tất cả `Match_Record` có `matchedUid` nằm trong `blockedSet` trước khi render danh sách (logic lọc này đã được `useMatchingHistory` xử lý).
2. WHEN `blockedSet` thay đổi trong khi `Matched_Profiles_Section` đang hiển thị, THE `Matched_Profiles_Section` SHALL cập nhật danh sách theo thời gian thực và loại bỏ hồ sơ vừa bị chặn.

---

### Requirement 6: Phân trang — Tải thêm hồ sơ

**User Story:** Là sinh viên TVU có nhiều lịch sử ghép cặp, tôi muốn có thể tải thêm hồ sơ nếu danh sách dài, để trang không bị nặng khi tải lần đầu.

#### Acceptance Criteria

1. THE `Matched_Profiles_Section` SHALL hiển thị số lượng `Profile_Card` ban đầu bằng với giá trị `initialLimit` của `useMatchingHistory` (hiện tại là 10).
2. WHEN `hasMoreHistory === true`, THE `Matched_Profiles_Section` SHALL hiển thị nút "Xem thêm" bên dưới danh sách.
3. WHEN người dùng nhấn nút "Xem thêm", THE `Matched_Profiles_Section` SHALL gọi `loadMore()` từ `useMatchingHistory` để tải thêm 10 `Match_Record` tiếp theo.
4. WHEN `hasMoreHistory === false`, THE `Matched_Profiles_Section` SHALL ẩn nút "Xem thêm".

---

### Requirement 7: Tích hợp vào Matching_Screen mà không phá vỡ hành vi hiện có

**User Story:** Là developer, tôi muốn `Matched_Profiles_Section` được tích hợp vào `Matching.tsx` mà không thay đổi bất kỳ hành vi hiện có nào, để deploy an toàn.

#### Acceptance Criteria

1. THE `Matched_Profiles_Section` SHALL được đặt trong JSX của `Matching_Screen` sau `Daily_Limit_Banner` và trước `MatchingResults` component.
2. THE tính năng mới SHALL không thay đổi behavior của nút "Bắt đầu ghép cặp" hiện tại.
3. THE tính năng mới SHALL không thay đổi component `MatchingHistory` hiện có (component này vẫn render độc lập ở cuối trang).
4. THE `Matched_Profiles_Section` SHALL được implement như một React component riêng biệt trong `src/components/matching/`.
5. THE `Matched_Profiles_Section` SHALL nhận `matchHistory`, `hasMoreHistory`, `loadMore`, `isLoading`, `error`, và `onStartChat: (profile: StudentProfile) => void` qua props từ `Matching_Screen`.

---

### Requirement 8: Reset trạng thái khi lượt ghép được phục hồi

**User Story:** Là sinh viên TVU, tôi muốn `Matched_Profiles_Section` tự động ẩn đi khi lượt ghép được reset, để giao diện trở về trạng thái bình thường mà không cần reload trang.

#### Acceptance Criteria

1. WHEN `remainingMatches` thay đổi từ `0` sang giá trị lớn hơn `0`, THE `Matching_Screen` SHALL tự động ẩn `Matched_Profiles_Section` mà không cần reload trang.
2. THE việc ẩn/hiện `Matched_Profiles_Section` SHALL được kiểm soát hoàn toàn bởi điều kiện render React (`remainingMatches === 0`), không dùng CSS `display: none` hay `visibility: hidden`.
