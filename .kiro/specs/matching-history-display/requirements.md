# Requirements Document

## Introduction

TVU Student Connect là mạng xã hội dành cho sinh viên Đại học Trà Vinh với tính năng ghép đôi (matching) 4 chế độ: lover, study, hobby, quick. Hệ thống giới hạn 5 lượt ghép mỗi chu kỳ 8 giờ.

Hiện tại khi người dùng hết lượt ghép, màn hình chỉ hiển thị banner "Đã hết lượt ghép" và nút bắt đầu ghép bị vô hiệu hóa. Phần còn lại của trang trống rỗng, khiến người dùng không có gì để làm và dễ rời khỏi ứng dụng.

Tính năng này bổ sung phần hiển thị danh sách các hồ sơ đã được ghép trước đó ngay bên dưới banner hết lượt, giúp người dùng xem lại các hồ sơ cũ và nhắn tin cho những người mà trước đó họ chưa liên hệ. Dữ liệu lịch sử ghép đã có sẵn trong Firestore (collection `matches`) và hook `useMatchingHistory` đã được triển khai — tính năng này tận dụng lại hạ tầng hiện có để cải thiện trải nghiệm người dùng.

## Glossary

- **Matching_Screen**: Màn hình ghép đôi chính (component `Matching.tsx`)
- **History_Display_Section**: Vùng hiển thị lịch sử ghép khi hết lượt, được thêm mới bởi tính năng này
- **Matched_Profile**: Hồ sơ sinh viên đã được ghép với người dùng hiện tại (lưu trong Firestore collection `matches`)
- **Daily_Limit_Banner**: Thành phần UI hiển thị thông báo "Đã hết lượt ghép" và thời gian reset
- **Match_History_Hook**: Hook `useMatchingHistory` đã có sẵn, trả về danh sách `Match[]` từ Firestore
- **Profile_Card_Item**: Thẻ UI hiển thị thông tin tóm tắt của một Matched_Profile trong History_Display_Section
- **Message_Action_Button**: Nút "Nhắn tin" trên Profile_Card_Item để bắt đầu cuộc trò chuyện
- **Chat_Handler**: Hàm `handleStartChat(uid)` đã có trong `App.tsx`, dùng để mở chat với một người dùng
- **Reset_Timer**: Thời gian đếm ngược đến khi lượt ghép được reset (mỗi chu kỳ 8 giờ)

## Requirements

### Requirement 1: Hiển Thị History_Display_Section Khi Hết Lượt

**User Story:** Là sinh viên TVU, tôi muốn thấy danh sách các hồ sơ đã ghép ngay khi hết lượt ghép, để tôi có thể xem lại và tương tác thay vì nhìn trang trống.

#### Acceptance Criteria

1. WHEN `remainingMatches === 0`, THE Matching_Screen SHALL render History_Display_Section ngay bên dưới Daily_Limit_Banner trong cùng một lần render, không có khoảng trống giữa hai thành phần
2. WHEN `remainingMatches > 0`, THE Matching_Screen SHALL NOT render History_Display_Section (hoàn toàn không có trong DOM, không phải CSS hidden)
3. WHEN Match_History_Hook đã có dữ liệu (`isLoading === false`) tại thời điểm `remainingMatches` chuyển sang `0`, THE History_Display_Section SHALL hiển thị danh sách ngay lập tức mà không cần fetch lại
4. WHEN Match_History_Hook đang tải dữ liệu (`isLoading === true`), THE History_Display_Section SHALL hiển thị tối thiểu 3 skeleton item có chiều cao bằng Profile_Card_Item thực tế
5. WHEN `remainingMatches === 0` AND `isLoading === false` AND `matchHistory.length === 0`, THE History_Display_Section SHALL hiển thị thông báo "Chưa có hồ sơ nào được ghép" thay vì vùng trống
6. WHEN `remainingMatches === 0` AND `isError === true`, THE History_Display_Section SHALL hiển thị thông báo lỗi bằng tiếng Việt thay vì danh sách trống

### Requirement 2: Tiêu Đề Và Ngữ Cảnh Của History_Display_Section

**User Story:** Là sinh viên TVU, tôi muốn biết rõ phần danh sách bên dưới là gì, để tôi hiểu đây là hồ sơ đã ghép chứ không phải kết quả ghép mới.

#### Acceptance Criteria

1. THE History_Display_Section SHALL hiển thị tiêu đề "Hồ sơ đã ghép" với icon phù hợp (ví dụ: 🕐 hoặc icon History)
2. THE History_Display_Section SHALL hiển thị mô tả ngắn "Xem lại và nhắn tin với những người đã ghép trước đó" phía dưới tiêu đề
3. THE tiêu đề và mô tả SHALL có phong cách thiết kế (font size, màu sắc) nhất quán với các phần khác trong Matching_Screen
4. WHERE ứng dụng được phát hiện đang chạy trên thiết bị mobile, THE History_Display_Section SHALL hiển thị đầy đủ không bị cắt xén; WHEN nội dung không vừa màn hình, THE History_Display_Section SHALL cho phép cuộn (scroll) thay vì cắt bớt nội dung

### Requirement 3: Danh Sách Profile_Card_Item

**User Story:** Là sinh viên TVU, tôi muốn xem danh sách các hồ sơ đã ghép dưới dạng thẻ trực quan, để nhanh chóng nhận ra và tương tác với từng người.

#### Acceptance Criteria

1. THE History_Display_Section SHALL hiển thị tối đa 5 Profile_Card_Item ban đầu khi mới render
2. WHEN `hasMoreHistory === true`, THE History_Display_Section SHALL hiển thị nút "Xem thêm" để tải thêm Matched_Profile
3. WHEN người dùng nhấn nút "Xem thêm", THE History_Display_Section SHALL gọi `loadMore()` từ Match_History_Hook để tải thêm 10 hồ sơ tiếp theo
4. THE Profile_Card_Item SHALL hiển thị avatar (ảnh đại diện hoặc icon mặc định nếu không có ảnh), tên đầy đủ, và ngành học của Matched_Profile
5. WHEN Profile_Card_Item được render với dữ liệu `matchedProfile` hợp lệ, THE Profile_Card_Item SHALL hiển thị ngày ghép theo định dạng `dd/MM/yyyy` lấy từ trường `createdAt` của Match
6. IF `match.matchedProfile` là `null` hoặc `undefined`, THEN THE History_Display_Section SHALL bỏ qua Profile_Card_Item đó và không render để tránh crash

### Requirement 4: Message_Action_Button Trên Profile_Card_Item

**User Story:** Là sinh viên TVU, tôi muốn có nút nhắn tin ngay trên mỗi thẻ hồ sơ trong lịch sử, để tôi có thể bắt đầu cuộc trò chuyện mà không cần điều hướng thêm.

#### Acceptance Criteria

1. THE Profile_Card_Item SHALL hiển thị Message_Action_Button với nhãn "Nhắn tin" và icon tin nhắn
2. WHEN người dùng nhấn Message_Action_Button, THE Matching_Screen SHALL gọi Chat_Handler với `uid` của Matched_Profile tương ứng
3. THE Message_Action_Button SHALL có visual style (màu sắc gradient, bo góc) nhất quán với các nút hành động khác trong ứng dụng
4. THE Message_Action_Button SHALL có trạng thái hover/active rõ ràng để phản hồi tương tác người dùng

### Requirement 5: Truyền Chat_Handler Vào History_Display_Section

**User Story:** Là developer, tôi muốn History_Display_Section nhận Chat_Handler qua props, để component không bị tight-coupling với logic điều hướng và dễ test.

#### Acceptance Criteria

1. THE History_Display_Section SHALL nhận prop `onStartChat: (uid: string) => void` từ Matching_Screen
2. THE Matching_Screen SHALL truyền Chat_Handler (`handleStartChat` từ `App.tsx`) xuống History_Display_Section qua props
3. THE Matching_Screen SHALL truyền `matchHistory`, `hasMoreHistory`, `loadMore`, và `isLoading` từ Match_History_Hook xuống History_Display_Section
4. IF prop `onStartChat` không được cung cấp, THEN THE Message_Action_Button SHALL bị ẩn thay vì crash ứng dụng

### Requirement 6: Tích Hợp Vào Màn Hình Matching Hiện Tại

**User Story:** Là developer, tôi muốn History_Display_Section được tích hợp vào Matching.tsx mà không phá vỡ giao diện và logic hiện tại, để deploy an toàn.

#### Acceptance Criteria

1. THE History_Display_Section SHALL được đặt phía dưới Daily_Limit_Banner và phía trên MatchingResults component trong cây JSX của Matching_Screen
2. THE tính năng mới SHALL không thay đổi behavior của nút "Bắt đầu ghép cặp" hiện tại
3. THE tính năng mới SHALL không thay đổi behavior của component MatchingHistory hiện tại (vẫn hiển thị riêng biệt ở cuối trang)
4. WHEN `remainingMatches > 0`, THE Matching_Screen SHALL hoạt động hoàn toàn giống như trước khi có tính năng này và History_Display_Section SHALL hoàn toàn không có trong DOM
5. THE History_Display_Section SHALL được implement như một React component riêng biệt trong thư mục `src/components/matching/`

### Requirement 7: Xử Lý Lỗi Và Trạng Thái Edge Case

**User Story:** Là sinh viên TVU, tôi muốn ứng dụng không bị lỗi hoặc hiển thị nội dung sai khi dữ liệu lịch sử ghép có vấn đề, để trải nghiệm luôn ổn định.

#### Acceptance Criteria

1. WHEN Match_History_Hook trả về `error` khác `null`, THE History_Display_Section SHALL hiển thị thông báo lỗi ngắn gọn bằng tiếng Việt (không bao gồm thông tin kỹ thuật) thay vì crash
2. WHEN bất kỳ lỗi hệ thống nào xảy ra, THE Profile_Card_Item SHALL hiển thị icon avatar mặc định thay vì ảnh bị vỡ, kể cả khi URL ảnh hợp lệ
3. THE History_Display_Section SHALL xử lý trường hợp `createdAt` là `null` bằng cách hiển thị "Không rõ ngày" thay vì crash
4. THE tất cả text trong History_Display_Section SHALL được viết bằng tiếng Việt

### Requirement 8: Trải Nghiệm Người Dùng Khi Reset Lượt Ghép

**User Story:** Là sinh viên TVU, tôi muốn History_Display_Section biến mất khi tôi có lượt ghép mới, để giao diện trở về trạng thái bình thường mà không cần reload trang.

#### Acceptance Criteria

1. WHEN `remainingMatches` thay đổi từ `0` sang giá trị lớn hơn `0` (sau khi reset chu kỳ), THE Matching_Screen SHALL tự động ẩn History_Display_Section mà không cần reload trang
2. THE việc ẩn/hiện History_Display_Section SHALL được kiểm soát hoàn toàn bởi điều kiện render React dựa trên giá trị `remainingMatches`; THE Matching_Screen SHALL NOT sử dụng CSS `display: none` hoặc `visibility: hidden` cho mục đích này
