# Tài Liệu Yêu Cầu Bugfix - Mobile Performance Fix

## Introduction

TVU Connect là mạng xã hội dành cho sinh viên Trường Đại học Trà Vinh, được xây dựng bằng React + TypeScript + Firebase. Khi kiểm tra nền tảng trên thiết bị di động, phát hiện một số vấn đề về layout, hiệu suất, tương tác cảm ứng, và giao diện người dùng khiến trải nghiệm trên mobile chưa mượt mà, không nhất quán so với desktop.

Bugfix này nhằm xác định và sửa các lỗi mobile trên toàn bộ nền tảng TVU Connect, bao gồm: layout/responsive design, hiệu suất render, touch/gesture interactions, navigation UX, UI bugs, scroll/tap/swipe, font size, spacing và button sizes.

---

## Bug Analysis

### Current Behavior (Defect)

**Layout & Responsive Design**

1.1 WHEN người dùng truy cập trang chủ (Home) trên màn hình có chiều rộng nhỏ hơn 375px (iPhone SE, Galaxy A series nhỏ) THEN hệ thống hiển thị nội dung bị tràn ngang (horizontal overflow), gây thanh cuộn ngang không mong muốn

1.2 WHEN người dùng mở modal (CreateDocumentModal, EditDocumentModal, ProfileCard, ConfirmModal) trên mobile THEN hệ thống hiển thị modal bị cắt nội dung hoặc không có khả năng cuộn để xem toàn bộ nội dung bên trong

1.3 WHEN người dùng xem danh sách bài viết (PostsList) có nhiều ảnh trên mobile THEN hệ thống render layout ảnh không đúng tỷ lệ, ảnh bị co giãn hoặc tràn ra ngoài container

1.4 WHEN người dùng mở trang Khám Phá (MapView) trên mobile THEN hệ thống hiển thị bản đồ và panel thông tin địa điểm chồng lên nhau, gây khó thao tác

**Hiệu Suất (Performance)**

1.5 WHEN người dùng cuộn nhanh danh sách bài viết (PostsList) trên thiết bị di động tầm trung THEN hệ thống bị giật (jank), frame rate giảm xuống dưới 30fps do render đồng thời nhiều PostCard với `content-visibility: auto` chưa được cấu hình `contain-intrinsic-size` chính xác

1.6 WHEN người dùng chuyển đổi giữa các tab (Home, Posts, Chat, Explore, Documents) trên mobile THEN hệ thống mất từ 1-3 giây để hiển thị nội dung do lazy-load components chưa được preload đúng thời điểm

1.7 WHEN người dùng ở màn hình Chat và bàn phím ảo (virtual keyboard) bật lên THEN hệ thống không tính toán lại chiều cao container đúng, khiến ô nhập liệu bị che khuất bởi bàn phím trên iOS Safari

**Touch & Gesture Interactions**

1.8 WHEN người dùng nhấn nhanh (fast tap) vào nút Like/Reaction trên PostCard THEN hệ thống ghi nhận nhiều lần nhấn liên tiếp, gây gọi API nhiều lần không cần thiết

1.9 WHEN người dùng vuốt (swipe) trong màn hình Chat để xóa tin nhắn THEN hệ thống không nhận diện được gesture swipe, không có hành động gì xảy ra

1.10 WHEN người dùng nhấn giữ (long press) vào tin nhắn trong Chat THEN hệ thống không hiển thị menu tùy chọn (xóa, copy) trên một số thiết bị Android

**Navigation & UX trên Mobile**

1.11 WHEN người dùng đang ở màn hình con (Chat, Profile card) và nhấn nút Back trên thanh điều hướng hệ thống (Android back button) THEN hệ thống không xử lý sự kiện popstate, thay vào đó đóng toàn bộ ứng dụng hoặc không làm gì

1.12 WHEN người dùng mở mobile menu (hamburger menu) và tap ra ngoài để đóng THEN hệ thống đôi khi không đóng menu do event listener có độ trễ 100ms xung đột với touch events

1.13 WHEN người dùng nhấn vào tab navigation (bottom nav) trong khi đang ở giữa một scroll animation THEN hệ thống scroll về đầu trang nhưng không cancel animation đang chạy, gây flickering

**UI Bugs trên Mobile**

1.14 WHEN người dùng xem PostCard trên mobile ở dark mode THEN hệ thống hiển thị text màu trắng trên nền trắng (hoặc text quá tối trên nền tối) ở một số phần tử do CSS specificity conflict giữa global dark mode styles và inline styles

1.15 WHEN người dùng mở ReactionPicker trên PostCard ở mobile THEN hệ thống hiển thị reaction picker bị che khuất hoặc tràn ra ngoài viewport, không thể chọn reaction ở cuối danh sách

1.16 WHEN người dùng xem ConversationsList trên màn hình nhỏ (< 375px) THEN hệ thống hiển thị tên người dùng và timestamp bị chồng lên nhau do flex layout không có gap phù hợp

**Scroll, Tap, Swipe**

1.17 WHEN người dùng cuộn trong danh sách Conversations (ConversationsList) và nhấn vào một cuộc trò chuyện ngay sau khi dừng cuộn THEN hệ thống đôi khi kích hoạt sự kiện tap vào sai item (scroll momentum tap issue trên iOS)

1.18 WHEN người dùng cuộn lên trên trong màn hình Chat để tải thêm tin nhắn (load more) THEN hệ thống giữ vị trí scroll không ổn định, nhảy về đầu trang sau khi load thêm tin nhắn

**Font Size, Spacing, Button Sizes**

1.19 WHEN người dùng nhìn vào các nút action nhỏ (Edit, Delete trên PostCard) trên mobile THEN hệ thống hiển thị nút có kích thước quá nhỏ (dưới 44×44px), không đáp ứng tiêu chuẩn touch target tối thiểu của Apple HIG và Material Design

1.20 WHEN người dùng đọc nội dung bài viết (PostCard) trên mobile ở chế độ landscape THEN hệ thống không điều chỉnh font size phù hợp, text bị quá nhỏ hoặc quá lớn so với viewport

---

### Expected Behavior (Correct)

**Layout & Responsive Design**

2.1 WHEN người dùng truy cập trang chủ trên màn hình nhỏ hơn 375px THEN hệ thống SHALL hiển thị toàn bộ nội dung trong viewport, không có horizontal overflow, áp dụng đúng `overflow-x: hidden` và layout co giãn phù hợp

2.2 WHEN người dùng mở bất kỳ modal nào trên mobile THEN hệ thống SHALL hiển thị modal fullscreen hoặc bottom sheet có thể cuộn toàn bộ nội dung, với `max-height: 90dvh` và `overflow-y: auto`

2.3 WHEN người dùng xem danh sách bài viết có nhiều ảnh trên mobile THEN hệ thống SHALL render layout ảnh đúng tỷ lệ gốc, không bị co giãn, sử dụng `object-contain` hoặc `object-cover` phù hợp với từng loại layout

2.4 WHEN người dùng mở trang Khám Phá (MapView) trên mobile THEN hệ thống SHALL hiển thị bản đồ và panel thông tin địa điểm riêng biệt, không chồng lên nhau, có thể kéo panel lên/xuống bằng gesture

**Hiệu Suất**

2.5 WHEN người dùng cuộn nhanh danh sách bài viết trên thiết bị di động tầm trung THEN hệ thống SHALL duy trì frame rate tối thiểu 60fps, sử dụng `contain-intrinsic-size` chính xác theo chiều cao thực tế của PostCard

2.6 WHEN người dùng chuyển đổi giữa các tab trên mobile THEN hệ thống SHALL hiển thị nội dung trong vòng 500ms, nhờ preload được kích hoạt khi user hover/focus vào tab (hoặc ngay sau khi app load xong)

2.7 WHEN người dùng ở màn hình Chat và bàn phím ảo bật lên THEN hệ thống SHALL tự động tính toán lại chiều cao container sử dụng `100dvh` thay vì `100vh`, đảm bảo ô nhập liệu luôn hiển thị trên bàn phím

**Touch & Gesture Interactions**

2.8 WHEN người dùng nhấn nhanh vào nút Like/Reaction THEN hệ thống SHALL chỉ ghi nhận một lần nhấn trong khoảng 300ms (debounce), tránh gọi API trùng lặp

2.9 WHEN người dùng vuốt trái trên tin nhắn trong Chat THEN hệ thống SHALL hiển thị nút xóa tin nhắn (swipe-to-delete), với animation trượt mượt mà

2.10 WHEN người dùng nhấn giữ vào tin nhắn trong Chat THEN hệ thống SHALL hiển thị context menu với các tùy chọn (Xóa, Copy) trên tất cả thiết bị iOS và Android

**Navigation & UX**

2.11 WHEN người dùng nhấn nút Back hệ thống trên Android khi đang ở màn hình con THEN hệ thống SHALL xử lý sự kiện `popstate`/`backbutton`, điều hướng về màn hình cha thay vì đóng app

2.12 WHEN người dùng tap ra ngoài mobile menu để đóng THEN hệ thống SHALL đóng menu ngay lập tức, không có độ trễ gây nhầm lẫn với touch events

2.13 WHEN người dùng nhấn vào tab navigation THEN hệ thống SHALL scroll về đầu trang mượt mà và cancel mọi animation đang chạy trước đó

**UI Bugs**

2.14 WHEN người dùng xem PostCard ở dark mode trên mobile THEN hệ thống SHALL hiển thị tất cả text với màu sắc tương phản đúng theo tiêu chuẩn WCAG AA (ratio tối thiểu 4.5:1), không có text trắng trên nền trắng

2.15 WHEN người dùng mở ReactionPicker trên PostCard ở mobile THEN hệ thống SHALL hiển thị reaction picker trong viewport, tự động điều chỉnh vị trí (flip up/down) dựa trên không gian còn lại

2.16 WHEN người dùng xem ConversationsList trên màn hình nhỏ THEN hệ thống SHALL hiển thị tên và timestamp trên cùng hàng với gap phù hợp, không chồng chéo

**Scroll, Tap, Swipe**

2.17 WHEN người dùng dừng cuộn và nhấn vào item trong danh sách THEN hệ thống SHALL kích hoạt đúng item được nhấn, áp dụng `touch-action: manipulation` và xử lý scroll momentum correctly trên iOS

2.18 WHEN người dùng cuộn lên để tải thêm tin nhắn trong Chat THEN hệ thống SHALL duy trì vị trí scroll hiện tại sau khi load thêm, sử dụng `scrollAnchor` hoặc lưu và khôi phục `scrollTop`

**Font Size, Spacing, Button Sizes**

2.19 WHEN người dùng nhìn vào các nút action trên mobile THEN hệ thống SHALL đảm bảo mọi vùng chạm (touch target) có kích thước tối thiểu 44×44px theo Apple HIG, kể cả khi icon nhỏ hơn bằng cách thêm padding ẩn

2.20 WHEN người dùng đọc nội dung trên mobile ở chế độ landscape THEN hệ thống SHALL áp dụng font size responsive phù hợp, sử dụng `clamp()` hoặc breakpoint landscape để đảm bảo readability

---

### Unchanged Behavior (Regression Prevention)

**Desktop & Tablet Layout**

3.1 WHEN người dùng truy cập TVU Connect trên desktop (chiều rộng ≥ 1024px) THEN hệ thống SHALL CONTINUE TO hiển thị layout desktop đầy đủ, không bị ảnh hưởng bởi các thay đổi CSS mobile

3.2 WHEN người dùng truy cập TVU Connect trên tablet (768px - 1023px) THEN hệ thống SHALL CONTINUE TO hiển thị layout tablet đúng như trước, responsive breakpoints md: không thay đổi

**Chức Năng Core**

3.3 WHEN người dùng gửi tin nhắn trong Chat THEN hệ thống SHALL CONTINUE TO gửi tin nhắn thành công đến Firestore, optimistic UI hoạt động bình thường

3.4 WHEN người dùng đăng bài viết (Post) mới THEN hệ thống SHALL CONTINUE TO lưu bài viết lên Firestore và hiển thị trong feed ngay lập tức

3.5 WHEN người dùng đăng nhập bằng Google OAuth THEN hệ thống SHALL CONTINUE TO xác thực thành công, chuyển hướng về trang chủ và load hồ sơ người dùng

3.6 WHEN người dùng tìm kiếm bạn bè (Matching) THEN hệ thống SHALL CONTINUE TO trả về danh sách gợi ý phù hợp theo tiêu chí đã chọn

**Dark Mode**

3.7 WHEN người dùng bật dark mode trên desktop THEN hệ thống SHALL CONTINUE TO hiển thị toàn bộ giao diện dark mode với màu sắc glassmorphism đã thiết kế

3.8 WHEN người dùng chuyển đổi giữa light mode và dark mode THEN hệ thống SHALL CONTINUE TO chuyển đổi tức thì, lưu preference vào localStorage

**Firebase & Performance Optimizations Hiện Tại**

3.9 WHEN ứng dụng khởi động THEN hệ thống SHALL CONTINUE TO warm cache (top 20 địa điểm) sau 1 giây delay, không ảnh hưởng đến critical startup path

3.10 WHEN người dùng cuộn qua nhiều bài viết THEN hệ thống SHALL CONTINUE TO áp dụng `content-visibility: auto` để tối ưu paint performance, chỉ thay đổi giá trị `contain-intrinsic-size` cho chính xác hơn

3.11 WHEN người dùng sử dụng bàn phím để điều hướng (accessibility) THEN hệ thống SHALL CONTINUE TO hiển thị focus ring theo chuẩn `*:focus-visible` đã thiết lập

**Notifications & Real-time**

3.12 WHEN người dùng nhận tin nhắn mới khi đang ở tab khác THEN hệ thống SHALL CONTINUE TO hiển thị toast notification với nút "Xem ngay"

3.13 WHEN người dùng đang online THEN hệ thống SHALL CONTINUE TO cập nhật online status heartbeat theo chu kỳ đã cấu hình
