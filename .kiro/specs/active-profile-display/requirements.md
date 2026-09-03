# Requirements Document

## Introduction

Tính năng Active Profile Display (Hiển thị Hồ sơ Hoạt động) cải thiện trải nghiệm ghép đôi trong 4 tab tìm kiếm của TVU Connect: **Tìm người yêu** (`lover`), **Sở thích chung** (`hobby`), **Bạn cùng học** (`study`), và **Kết nối nhanh** (`quick`). Hiện tại, hệ thống ghép đôi sắp xếp hồ sơ dựa thuần túy vào điểm tương đồng (matching score), không phân biệt hồ sơ đang hoạt động hay đã ngưng sử dụng. Điều này dẫn đến người dùng thường thấy những hồ sơ "chết" — không online, không phản hồi — gây trải nghiệm nhàm chán và thất vọng.

Tính năng này tích hợp dữ liệu trạng thái hoạt động (đã có qua hệ thống `user-activity-status`) vào pipeline sắp xếp và hiển thị hồ sơ, ưu tiên đưa những hồ sơ đang online hoặc hoạt động gần đây lên đầu kết quả, đồng thời hiển thị rõ ràng trạng thái hoạt động trên mỗi thẻ hồ sơ.

## Glossary

- **Active_Score**: Điểm hoạt động tính từ trạng thái online và thời gian hoạt động gần nhất, dùng để boost thứ tự hiển thị
- **Activity_Booster**: Module tính toán và áp dụng Active_Score vào pipeline sắp xếp hồ sơ
- **Matching_Pipeline**: Quy trình lấy, lọc, tính điểm, và sắp xếp hồ sơ trong `matchingService.ts`
- **Profile_Card**: Component `ProfileCard.tsx` trong `src/components/matching/` hiển thị thẻ hồ sơ sinh viên
- **Activity_Badge**: Thành phần UI hiển thị trạng thái hoạt động (dot màu + text) trên Profile_Card
- **Online_Threshold**: Ngưỡng thời gian để coi một hồ sơ là "đang online" (5 phút gần nhất)
- **Recent_Threshold**: Ngưỡng thời gian để coi một hồ sơ là "hoạt động gần đây" (24 giờ gần nhất)
- **Stale_Profile**: Hồ sơ không có hoạt động nào trong hơn 7 ngày
- **Composite_Score**: Điểm tổng hợp cuối cùng = (Matching_Score × 0.7) + (Active_Score × 0.3)
- **Presence_Database**: Firebase Realtime Database lưu trữ dữ liệu trạng thái (`presence/{uid}`)
- **Status_Indicator**: Dot màu xanh/vàng/xám hiển thị trạng thái realtime trên avatar
- **Batch_Status_Fetcher**: Module lấy trạng thái của nhiều user cùng một lúc thay vì từng user riêng lẻ
- **Matching_Service**: `matchingService.ts` trong `src/services/`
- **Cached_Matching**: Hook `useCachedMatching.ts` trong `src/hooks/`

## Requirements

### Requirement 1: Tính điểm hoạt động cho hồ sơ

**User Story:** Là người dùng TVU Connect, tôi muốn thấy những người đang online hoặc mới hoạt động được ưu tiên hiển thị, để tôi không mất thời gian nhắn tin cho những tài khoản không còn dùng nữa.

#### Acceptance Criteria

1. THE Activity_Booster SHALL tính Active_Score cho mỗi hồ sơ theo công thức:
   - Hồ sơ có `status = 'online'`: Active_Score = 100
   - Hồ sơ có `lastActive` trong vòng 1 giờ: Active_Score = 80
   - Hồ sơ có `lastActive` trong vòng 6 giờ: Active_Score = 60
   - Hồ sơ có `lastActive` trong vòng 24 giờ: Active_Score = 40
   - Hồ sơ có `lastActive` trong vòng 7 ngày: Active_Score = 20
   - Hồ sơ có `lastActive` hơn 7 ngày hoặc không có dữ liệu: Active_Score = 0
2. THE Activity_Booster SHALL tính Composite_Score = (Matching_Score × 0.7) + (Active_Score × 0.3)
3. WHEN hồ sơ không có dữ liệu presence trong Presence_Database, THE Activity_Booster SHALL gán Active_Score = 0 mà không gây lỗi
4. THE Matching_Pipeline SHALL sắp xếp hồ sơ theo Composite_Score giảm dần thay vì chỉ theo Matching_Score

### Requirement 2: Lấy dữ liệu trạng thái hàng loạt

**User Story:** Là developer, tôi muốn hệ thống lấy trạng thái hoạt động của nhiều hồ sơ hiệu quả, để không gây ra N+1 queries làm chậm kết quả ghép đôi.

#### Acceptance Criteria

1. THE Batch_Status_Fetcher SHALL lấy dữ liệu presence của tất cả hồ sơ ứng viên trong một lần gọi duy nhất đến Presence_Database
2. WHEN Presence_Database không khả dụng hoặc trả về lỗi, THE Batch_Status_Fetcher SHALL trả về kết quả rỗng và để Matching_Pipeline tiếp tục với Active_Score = 0 cho tất cả hồ sơ
3. THE Batch_Status_Fetcher SHALL hoàn thành trong vòng 2 giây, IF quá 2 giây, THEN THE Batch_Status_Fetcher SHALL timeout và trả về kết quả rỗng
4. THE Batch_Status_Fetcher SHALL cache kết quả trong bộ nhớ với TTL = 60 giây để tránh gọi lại khi load thêm hồ sơ trong cùng phiên

### Requirement 3: Hiển thị trạng thái hoạt động trên thẻ hồ sơ

**User Story:** Là người dùng, tôi muốn nhìn thấy trạng thái hoạt động ngay trên thẻ hồ sơ trong kết quả ghép đôi, để tôi chủ động chọn nhắn tin người đang online.

#### Acceptance Criteria

1. THE Profile_Card SHALL hiển thị Activity_Badge trên góc dưới-phải của avatar
2. WHEN `status = 'online'`, THE Activity_Badge SHALL hiển thị dot màu xanh lá (#22c55e) với kích thước 10×10px và viền trắng 2px
3. WHEN `lastActive` trong vòng 24 giờ nhưng không online, THE Activity_Badge SHALL hiển thị dot màu vàng (#f59e0b) với kích thước 10×10px và viền trắng 2px
4. WHEN `lastActive` hơn 24 giờ (strictly greater than 24 hours — hồ sơ hoạt động đúng 24 giờ trước sẽ bị ẩn badge), THE Activity_Badge SHALL không hiển thị dot (ẩn hoàn toàn)
5. THE Profile_Card SHALL hiển thị text trạng thái ngắn gọn bên cạnh tên người dùng:
   - `status = 'online'`: hiển thị "● Online" màu xanh lá
   - `lastActive` trong vòng 1 giờ: hiển thị "Vừa hoạt động" màu xanh lá nhạt
   - `lastActive` trong vòng 24 giờ: hiển thị "Hoạt động X giờ trước" màu xám
   - Không có dữ liệu hoặc hơn 24 giờ: không hiển thị text trạng thái
6. WHERE người dùng bật chế độ ẩn (invisible mode), THE Profile_Card SHALL không hiển thị Activity_Badge và status text của người đó — Activity_Badge và status text được kiểm soát độc lập nhau, không phụ thuộc nhau

### Requirement 4: Nhãn phân loại mức độ hoạt động trong kết quả

**User Story:** Là người dùng, tôi muốn nhìn thấy nhóm hồ sơ được phân loại rõ ràng theo mức độ hoạt động, để biết ai đang sẵn sàng tương tác ngay.

#### Acceptance Criteria

1. WHEN kết quả ghép đôi chứa ít nhất 1 hồ sơ online, THE Matching_Pipeline SHALL đặt tất cả hồ sơ online lên đầu danh sách trước các hồ sơ khác
2. WHEN kết quả ghép đôi chứa ít nhất 1 hồ sơ online và ít nhất 1 hồ sơ offline (kiểm tra bằng cách đếm thực tế số hồ sơ online và offline trong batch), THE Profile_Card của hồ sơ online SHALL hiển thị nhãn "🟢 Đang online" phía trên tên người dùng
3. THE Matching_Pipeline SHALL giới hạn không quá 2 hồ sơ Stale_Profile trong mỗi batch kết quả 4 hồ sơ
4. IF tất cả 4 hồ sơ trong batch đều là Stale_Profile, THEN THE Matching_Pipeline SHALL log cảnh báo và vẫn trả về kết quả bình thường (không chặn)

### Requirement 5: Tương thích với các tab và bộ lọc hiện có

**User Story:** Là người dùng, tôi muốn tính năng ưu tiên hồ sơ hoạt động hoạt động nhất quán trên tất cả 4 tab ghép đôi và không bị ảnh hưởng bởi các bộ lọc hiện có.

#### Acceptance Criteria

1. THE Activity_Booster SHALL áp dụng cho cả 4 mode: `lover`, `hobby`, `study`, và `quick`
2. WHEN người dùng áp dụng bộ lọc (giới tính, ngành học, năm học...), THE Activity_Booster SHALL chỉ tính điểm trên tập hồ sơ đã qua lọc, không gây xung đột với logic lọc hiện có
3. WHEN `isShowingFallback = true` (đang hiển thị hồ sơ đã xem lại), THE Activity_Booster SHALL vẫn áp dụng sắp xếp theo Composite_Score; IF hệ thống tính điểm gặp lỗi khi đang hiển thị fallback, THEN THE Matching_Pipeline SHALL hiển thị hồ sơ fallback theo thứ tự gốc thay vì không hiển thị gì
4. THE Activity_Booster SHALL không thay đổi cơ chế giới hạn lượt ghép (daily limit) và cache hồ sơ đã xem hiện có

### Requirement 6: Hiệu suất và không gây hồi quy

**User Story:** Là developer, tôi muốn tính năng mới không làm tăng đáng kể thời gian phản hồi của hệ thống ghép đôi, để người dùng không cảm thấy chậm hơn.

#### Acceptance Criteria

1. THE Activity_Booster SHALL hoàn thành tính toán Active_Score trong vòng 100ms cho tập hồ sơ lên đến 50 hồ sơ
2. WHEN Batch_Status_Fetcher không nhận được dữ liệu (lỗi hoặc timeout), THE Matching_Pipeline SHALL fallback về sắp xếp thuần túy theo Matching_Score như trước đây
3. THE Profile_Card SHALL không render lại (re-render) chỉ vì thay đổi trạng thái online của hồ sơ khác trong cùng danh sách; các re-render vì lý do khác (tương tác người dùng, cập nhật dữ liệu của chính hồ sơ đó) là bình thường
4. THE Batch_Status_Fetcher SHALL không tạo thêm Firestore listener mới (`onSnapshot`), chỉ dùng `get()` một lần để tránh gây lỗi INTERNAL ASSERTION FAILED đã từng xảy ra

### Requirement 7: Parse và serialization dữ liệu trạng thái

**User Story:** Là developer, tôi muốn dữ liệu trạng thái từ Firebase Realtime Database được parse và xử lý nhất quán, để không có bug khi định dạng dữ liệu thay đổi.

#### Acceptance Criteria

1. THE Activity_Booster SHALL parse trường `lastActive` từ Presence_Database theo cả hai định dạng: Unix timestamp (số nguyên) và ISO string
2. THE Activity_Booster SHALL parse trường `status` từ Presence_Database nhận các giá trị: `'online'`, `'away'`, `'offline'`, và các giá trị không xác định (fallback về `'offline'`)
3. FOR ALL dữ liệu presence hợp lệ, parse thành ActivityData rồi format ngược lại rồi parse lại SHALL tạo ra kết quả tương đương (round-trip property)
4. IF dữ liệu presence bị null, undefined, hoặc thiếu trường, THEN THE Activity_Booster SHALL trả về Active_Score = 0 mà không ném exception
