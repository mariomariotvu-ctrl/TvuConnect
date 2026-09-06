# Requirements Document

## Introduction

Tính năng Online Presence Indicator cho phép người dùng TVU Connect nhìn thấy trạng thái online/offline của nhau thông qua một chấm màu nhỏ (indicator dot) hiển thị trực tiếp trên avatar. Tính năng giúp sinh viên biết ai đang trực tuyến để có thể nhắn tin ngay lập tức, tương tự như Facebook Messenger.

Dự án đã có các module nền tảng (`StatusManager`, `usePresenceManager`, `useOnlineStatusCache`, `StatusIndicator`, `OnlineStatus`) từ spec `user-activity-status`. Tính năng này tập trung vào việc **hoàn thiện và tích hợp nhất quán** indicator đó ra toàn bộ ứng dụng: danh sách cuộc trò chuyện, trang hồ sơ, kết quả matching, và mọi nơi hiển thị avatar người dùng.

---

## Glossary

- **Presence_System**: Hệ thống quản lý và phân phối trạng thái online của người dùng, bao gồm `StatusManager`, Firebase Realtime Database path `/presence/{userId}/`, và các React hooks liên quan.
- **Online_Indicator**: Chấm tròn nhỏ màu xanh lá (#42b72a) hiển thị trên góc dưới-phải của avatar khi người dùng đang online.
- **Away_Indicator**: Chấm tròn màu cam (#ffa500) hiển thị khi người dùng không tương tác trong 5 phút.
- **Offline_Indicator**: Chấm tròn màu xám (#8a8d91) hoặc ẩn hoàn toàn, hiển thị khi người dùng offline.
- **Avatar_Container**: Phần tử HTML bao bọc ảnh đại diện người dùng, nơi `Online_Indicator` được đặt vào với `position: absolute`.
- **StatusIndicator**: React component hiện có tại `src/components/StatusIndicator.tsx`, render indicator dot dựa trên `UserStatus` prop.
- **OnlineStatus**: React component hiện có tại `src/components/OnlineStatus.tsx`, tích hợp `useOnlineStatus` hook và render cả dot lẫn text trạng thái.
- **usePresenceManager**: Hook hiện có tại `src/hooks/usePresenceManager.ts`, khởi tạo `StatusManager` và kết nối với `useActivityDetector` để ghi trạng thái người dùng hiện tại lên Firebase.
- **useOnlineStatusCache**: Hook hiện có tại `src/hooks/useOnlineStatusCache.ts`, đọc trạng thái người dùng khác từ Firestore với cơ chế polling 30 giây và deduplication.
- **ConversationsList**: Component tại `src/components/ConversationsList.tsx` hiển thị danh sách cuộc trò chuyện kèm avatar người dùng.
- **ProfileCard**: Component tại `src/components/ProfileCard.tsx` hiển thị hồ sơ chi tiết người dùng trong trang matching.
- **Chat**: Component tại `src/components/Chat.tsx` hiển thị giao diện chat 1-1.
- **Presence_Data**: Dữ liệu trạng thái lưu trong Firebase Realtime Database (`/presence/{userId}/`) gồm: `status`, `lastActive`, `connections`, `settings`.
- **Heartbeat**: Cơ chế ghi định kỳ lên Firebase mỗi 3 phút để duy trì trạng thái online.
- **onDisconnect**: Cơ chế Firebase tự động cập nhật trạng thái về `offline` khi kết nối bị ngắt đột ngột.
- **Invisible_Mode**: Chế độ người dùng bật để ẩn trạng thái online của bản thân với tất cả người khác.
- **Touch_Target**: Vùng chạm tối thiểu 44×44px theo WCAG 2.1 cho các phần tử tương tác trên mobile.

---

## Requirements

### Requirement 1: Quản lý trạng thái hiện diện người dùng

**User Story:** Là một sinh viên TVU, tôi muốn ứng dụng tự động đánh dấu tôi là "đang online" khi tôi đang dùng app và "offline" khi tôi thoát, để người khác thấy được tôi đang trực tuyến.

#### Acceptance Criteria

1. WHEN người dùng đã đăng nhập và mở ứng dụng, THE Presence_System SHALL ghi trạng thái online và timestamp hoạt động cuối lên Firebase Realtime Database trong vòng 3 giây.

2. WHEN người dùng tương tác với ứng dụng (di chuyển chuột, gõ phím, chạm màn hình, cuộn trang), THE Presence_System SHALL cập nhật timestamp hoạt động cuối lên Firebase tối đa 1 lần mỗi 30 giây.

3. IF người dùng không tương tác liên tục trong 5 phút, THEN THE Presence_System SHALL chuyển trạng thái từ `"online"` sang `"away"`.

4. WHEN người dùng tương tác trở lại sau khi ở trạng thái `"away"`, THE Presence_System SHALL chuyển trạng thái về `"online"` trong vòng 3 giây.

5. WHEN kết nối Firebase bị ngắt (đóng tab, mất mạng, thoát app), THE Presence_System SHALL tự động cập nhật trạng thái về `"offline"` thông qua cơ chế `onDisconnect` của Firebase.

6. WHEN ứng dụng đang chạy, THE Presence_System SHALL ghi Heartbeat lên Firebase mỗi 3 phút để ngăn Firebase tự hết hạn kết nối.

7. WHEN người dùng đăng xuất chủ động, THE Presence_System SHALL cập nhật trạng thái về `"offline"` ngay lập tức trước khi kết thúc phiên.

8. WHEN người dùng đăng nhập từ nhiều thiết bị cùng lúc, THE Presence_System SHALL duy trì trạng thái `"online"` chừng nào còn ít nhất một thiết bị đang hoạt động, và chỉ chuyển về `"offline"` khi tất cả thiết bị ngắt kết nối.

---

### Requirement 2: Hiển thị indicator online trong danh sách tin nhắn

**User Story:** Là một sinh viên TVU, tôi muốn thấy chấm xanh trên avatar bạn bè trong danh sách tin nhắn, để tôi biết ai đang online và nhắn tin ngay.

#### Acceptance Criteria

1. WHEN `ConversationsList` hiển thị danh sách cuộc trò chuyện, THE ConversationsList SHALL render `Online_Indicator` ở góc dưới-phải của mỗi `Avatar_Container` cho từng người dùng trong danh sách.

2. WHEN người dùng trong danh sách có `status: "online"` trong `Presence_Data`, THE Online_Indicator SHALL hiển thị với màu sắc và kiểu dáng tương ứng trạng thái online.

3. WHEN người dùng trong danh sách có `status: "away"`, THE Away_Indicator SHALL hiển thị với màu sắc và kiểu dáng tương ứng trạng thái away.

4. WHEN người dùng trong danh sách có `status: "offline"` hoặc không có `Presence_Data`, THE Offline_Indicator SHALL ẩn hoàn toàn (không render) để tránh gây rối giao diện.

5. THE Online_Indicator trong `ConversationsList` SHALL có kích thước `small` (8px diameter) để không che khuất avatar.

6. WHEN trạng thái người dùng thay đổi, THE ConversationsList SHALL cập nhật `Online_Indicator` tương ứng một cách tự động mà không cần tải lại trang.

7. IF `ConversationsList` không thể kết nối tới Presence_System để lấy dữ liệu trạng thái, THEN THE ConversationsList SHALL ẩn `Online_Indicator` và không hiển thị thông báo lỗi cho người dùng.

---

### Requirement 3: Hiển thị trạng thái online trên trang hồ sơ

**User Story:** Là một sinh viên TVU, khi tôi xem hồ sơ người khác, tôi muốn biết họ có đang online không và lần cuối họ hoạt động là khi nào.

#### Acceptance Criteria

1. WHEN `ProfileCard` hiển thị hồ sơ người dùng khác, THE ProfileCard SHALL render `OnlineStatus` component bên dưới tên người dùng, hiển thị cả dot indicator lẫn text trạng thái.

2. WHEN người dùng được xem hồ sơ đang `online`, THE OnlineStatus SHALL hiển thị text "Đang hoạt động" kèm `Online_Indicator`.

3. WHEN người dùng được xem hồ sơ đang `away`, THE OnlineStatus SHALL hiển thị text "Không hoạt động" kèm `Away_Indicator`.

4. WHEN người dùng được xem hồ sơ đang `offline`, THE OnlineStatus SHALL hiển thị text mô tả thời gian lần cuối hoạt động theo định dạng: "Vừa hoạt động" (dưới 30 giây), "Hoạt động X phút trước" (dưới 60 phút), "Hoạt động X giờ trước" (dưới 24 giờ), "Hoạt động hôm qua" (từ 1 đến dưới 2 ngày), "Hoạt động X ngày trước" (từ 2 ngày đến dưới 7 ngày), và "Không hoạt động" khi `lastActive` từ 7 ngày trở lên hoặc không có dữ liệu.

5. IF `lastActive` của người dùng là `null`, không tồn tại trong `Presence_Data`, hoặc là giá trị không hợp lệ (NaN, giá trị âm), THEN THE OnlineStatus SHALL hiển thị text "Không hoạt động" thay vì crash hoặc hiển thị giá trị lỗi.

6. IF `ProfileCard` đang hiển thị hồ sơ của chính người dùng đang đăng nhập, THEN THE ProfileCard SHALL không render `OnlineStatus` component.

---

### Requirement 4: Hiển thị trạng thái online trong cửa sổ chat

**User Story:** Là một sinh viên TVU, khi tôi đang nhắn tin với ai đó, tôi muốn thấy họ có online không ngay trong cửa sổ chat.

#### Acceptance Criteria

1. WHEN `Chat` component hiển thị header của cuộc trò chuyện, THE Chat SHALL render `OnlineStatus` component bên dưới tên người nhận.

2. WHEN người nhận đang `online`, THE Chat SHALL hiển thị text "Đang hoạt động" trong header.

3. WHEN người nhận đang `away`, THE Chat SHALL hiển thị text "Không hoạt động" trong header kèm `Away_Indicator`.

4. WHEN người nhận đang `offline`, THE Chat SHALL hiển thị thời gian hoạt động cuối theo định dạng: "Vừa hoạt động" (dưới 30 giây), "Hoạt động X phút trước" (dưới 60 phút), "Hoạt động X giờ trước" (dưới 24 giờ), "Hoạt động hôm qua" (từ 1 đến dưới 2 ngày), "Hoạt động X ngày trước" (từ 2 ngày đến dưới 7 ngày), và "Không hoạt động" khi `lastActive` từ 7 ngày trở lên.

5. IF `userId` của người nhận là `null`, `undefined`, hoặc chuỗi rỗng, THEN THE Chat SHALL không render `OnlineStatus` component.

6. IF `lastActive` của người nhận là `null` hoặc không có trong `Presence_Data`, THEN THE Chat SHALL hiển thị text "Không hoạt động" thay vì crash hoặc hiển thị giá trị lỗi.

7. WHILE `Chat` đang tải dữ liệu trạng thái lần đầu (`loading: true`), THE Chat SHALL hiển thị trạng thái chờ tải thay vì `OnlineStatus` để tránh flash nội dung sai.

8. IF `Chat` không thể kết nối tới Presence_System để lấy trạng thái người nhận, THEN THE Chat SHALL hiển thị text "Không hoạt động" trong header mà không hiển thị thông báo lỗi cho người dùng.

---

### Requirement 5: Thiết kế indicator nhất quán trên toàn ứng dụng

**User Story:** Là một sinh viên TVU, tôi muốn thấy indicator online nhất quán ở mọi nơi có avatar, để trải nghiệm thống nhất trên toàn ứng dụng.

#### Acceptance Criteria

1. THE `Avatar_Container` bao bọc avatar người dùng SHALL đảm bảo `Online_Indicator` được định vị tại góc dưới-phải một cách nhất quán trên mọi nơi hiển thị avatar trong ứng dụng.

2. WHEN `StatusIndicator` component được render với prop `status` hợp lệ (`"online"`, `"away"`, `"offline"`), THE StatusIndicator SHALL hiển thị màu sắc tương ứng với từng trạng thái một cách nhất quán.

3. THE `StatusIndicator` SHALL hỗ trợ ba kích thước qua prop `size`: `small` (8px), `medium` (12px), `large` (16px).

4. THE `StatusIndicator` SHALL có viền bao quanh dot để đảm bảo contrast với mọi màu nền avatar, bao gồm nền sáng và nền tối.

5. WHEN người dùng hover vào `StatusIndicator` trên desktop hoặc tap vào `StatusIndicator` trên mobile, THE StatusIndicator SHALL hiển thị tooltip sau 300ms với text mô tả trạng thái tương ứng bằng tiếng Việt.

6. WHEN người dùng di chuyển chuột ra ngoài vùng `StatusIndicator` hoặc tap ra ngoài tooltip trên mobile, THE StatusIndicator SHALL ẩn tooltip ngay lập tức.

7. IF `StatusIndicator` nhận prop `status` không thuộc một trong các giá trị hợp lệ (`"online"`, `"away"`, `"offline"`), THEN THE StatusIndicator SHALL render theo trạng thái `"offline"` làm giá trị mặc định và ghi cảnh báo vào console.

---

### Requirement 6: Tối ưu hóa hiệu suất đọc trạng thái online

**User Story:** Là nhà phát triển TVU Connect, tôi muốn hệ thống đọc trạng thái online hiệu quả, không gây lag hoặc vượt quota Firebase.

#### Acceptance Criteria

1. THE `useOnlineStatusCache` hook SHALL sử dụng một bộ cache dùng chung ở cấp module (không phải cấp component) để lưu kết quả trạng thái của từng `userId` với TTL trong khoảng từ 25 giây đến 35 giây, tránh gọi Firebase lặp lại khi nhiều component đọc cùng một `userId`.

2. THE `useOnlineStatusCache` hook SHALL deduplicate các yêu cầu fetch đồng thời cho cùng một `userId` bằng cách tái sử dụng `Promise` đang pending thay vì tạo yêu cầu mới.

3. WHEN `useOnlineStatusCache` đọc trạng thái từ Firestore, THE hook SHALL sử dụng `getDoc` polling thay vì `onSnapshot` để tránh lỗi assertion khi component mount/unmount nhanh trong trang matching.

4. WHEN trạng thái một `userId` được đọc từ Firestore, THE `useOnlineStatusCache` SHALL coi người dùng là `online` chỉ khi trường `isOnline` là `true` VÀ `lastActive` trong vòng 420 giây gần nhất tính từ thời điểm hiện tại.

5. WHILE `useOnlineStatusCache` đang trong giai đoạn loading lần đầu, THE component sử dụng hook SHALL không render `Online_Indicator` để tránh flash nội dung sai.

6. IF `useOnlineStatusCache` gặp lỗi khi fetch từ Firestore, THEN THE hook SHALL trả về trạng thái offline cùng thông tin lỗi (`{ isOnline: false, loading: false, error: true }`) thay vì crash ứng dụng.

7. IF `useOnlineStatusCache` nhận `userId` là `null` hoặc `undefined`, THEN THE hook SHALL trả về ngay `{ isOnline: false, loading: false, error: false }` mà không thực hiện bất kỳ yêu cầu Firebase nào.

8. IF `useOnlineStatusCache` gặp lỗi permission (ví dụ: người dùng chưa xác thực), THEN THE hook SHALL trả về `{ isOnline: false, loading: false, error: true }` và không thử lại tự động.

---

### Requirement 7: Quyền riêng tư và kiểm soát trạng thái

**User Story:** Là một sinh viên TVU, tôi muốn có thể ẩn trạng thái online của mình và không thấy trạng thái của người đã chặn tôi.

#### Acceptance Criteria

1. WHEN người dùng bật Invisible_Mode trong cài đặt, THE Presence_System SHALL lưu cài đặt Invisible_Mode của người dùng lên Firebase.

2. WHILE Invisible_Mode đang bật, THE Presence_System SHALL ghi trạng thái `"offline"` lên Firebase thay vì trạng thái thực tế, để các người dùng khác thấy người này là offline.

3. IF người dùng A đã chặn người dùng B, THEN THE Presence_System khi được người dùng A truy vấn trạng thái của B SHALL trả về trạng thái không hiển thị (`{ status: "offline", isVisible: false }`).

4. WHEN người dùng tắt Invisible_Mode, THE Presence_System SHALL cập nhật trạng thái thực tế lên Firebase trong vòng 3 giây.

5. IF `Presence_Data` của người dùng không tồn tại trong Firebase, THEN THE Presence_System SHALL trả về trạng thái offline mặc định (`{ isOnline: false, error: false }`) mà không báo lỗi.

6. THE Firebase Security Rules tại đường dẫn lưu trữ Presence_Data SHALL cho phép đọc chỉ khi người dùng đã xác thực và từ chối tất cả yêu cầu khi chưa xác thực.

---

### Requirement 8: Xử lý trạng thái trên thiết bị di động

**User Story:** Là một sinh viên TVU dùng điện thoại, tôi muốn trạng thái online hoạt động đúng khi tôi chuyển sang app khác hoặc khóa màn hình.

#### Acceptance Criteria

1. WHILE ứng dụng đang ở trạng thái background trên thiết bị di động (trang bị ẩn theo Page Visibility API), THE Presence_System SHALL duy trì `status: "online"` thêm tối đa 5 phút trước khi chuyển sang `"away"`.

2. WHEN ứng dụng trở lại foreground sau khi ở background, THE Presence_System SHALL cập nhật trạng thái về `"online"` trong vòng 3 giây.

3. WHEN thiết bị mất kết nối internet trong hơn 10 giây, THE Presence_System SHALL dựa vào cơ chế `onDisconnect` của Firebase để tự động đánh dấu `offline` mà không cần xử lý thêm phía client.

4. WHEN thiết bị phục hồi kết nối internet sau khi đã mất kết nối, THE Presence_System SHALL tự động ghi lại trạng thái `"online"` lên Firebase trong vòng 5 giây.

5. THE `StatusIndicator` component SHALL không có animation pulse khi `status: "offline"` hoặc `status: "away"` để tiết kiệm pin và giảm visual noise.

---

### Requirement 9: Hỗ trợ trợ năng (Accessibility)

**User Story:** Là một sinh viên TVU sử dụng công nghệ hỗ trợ, tôi muốn có thể hiểu trạng thái online của người khác qua màn hình đọc.

#### Acceptance Criteria

1. THE `Online_Indicator` dot SHALL có thuộc tính `aria-label` mô tả trạng thái bằng tiếng Việt: "Đang hoạt động", "Không hoạt động", hoặc "Ngoại tuyến".

2. THE `Online_Indicator` khi chỉ là phần tử trang trí (không tương tác) SHALL có `role="img"` để screen reader đọc đúng ngữ cảnh.

3. THE màu sắc của `Online_Indicator` SHALL đáp ứng tỷ lệ contrast tối thiểu 3:1 với màu nền thực tế mà indicator được đặt lên (bao gồm nền trắng, nền xám nhạt, và nền của Avatar_Container) theo WCAG 2.1 Level AA.

4. WHEN trạng thái người dùng thay đổi trong danh sách, THE ConversationsList SHALL duy trì focus bàn phím tại phần tử hiện tại mà không dịch chuyển focus sang phần tử khác, và không gây re-render toàn bộ danh sách.

5. WHEN trạng thái người dùng thay đổi, THE ConversationsList SHALL thông báo cho screen reader thông qua thuộc tính `aria-live="polite"` trên vùng chứa danh sách.

---

### Requirement 10: Kiểm thử tự động tính đúng đắn

**User Story:** Là nhà phát triển TVU Connect, tôi muốn có bộ kiểm thử tự động bảo đảm logic trạng thái hoạt động đúng trong mọi tình huống.

#### Acceptance Criteria

1. WHEN chạy bộ kiểm thử với mọi giá trị `UserStatus` hợp lệ (`"online"`, `"away"`, `"offline"`), THE StatusIndicator SHALL luôn render màu tương ứng với trạng thái đầu vào và không bao giờ render màu của trạng thái khác.

2. WHEN `useOnlineStatusCache` được gọi nhiều lần với cùng `userId` và các lần gọi xảy ra trong cùng khoảng TTL (25–35 giây), THE hook SHALL luôn trả về kết quả giống nhau mà không tạo thêm network request.

3. THE hệ thống SHALL có kiểm thử round-trip xác minh rằng: serialize `UserStatus` sang chuỗi string và parse lại SHALL cho kết quả tương đương về mặt ngữ nghĩa (cùng `status`, cùng `isOnline`).

4. WHEN chạy kiểm thử với mọi giá trị `lastActive` hợp lệ là timestamp trong quá khứ (giá trị nguyên dương nhỏ hơn timestamp hiện tại), THE `formatLastSeen` SHALL luôn trả về chuỗi không rỗng và không chứa giá trị lỗi (NaN, undefined, null, "Invalid Date").

5. WHEN `useOnlineStatusCache` đọc dữ liệu từ Firestore với cặp `(isOnline, lastActive)` hợp lệ, THE hook SHALL trả về `isOnline === true` nếu và chỉ nếu trường `isOnline` là `true` VÀ khoảng cách giữa thời điểm hiện tại và `lastActive` nhỏ hơn 420 giây.
