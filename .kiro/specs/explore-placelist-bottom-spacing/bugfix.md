# Tài liệu Yêu cầu Bugfix: Khoảng trống dưới cùng PlaceList trên Desktop

## Giới thiệu

Trong tính năng Khám phá (Explore) trên desktop, phần danh sách địa điểm (PlaceList) có khoảng trống không mong muốn ở dưới cùng. Vấn đề này có **hai nguyên nhân**:

1. **PlaceList padding** (ĐÃ FIX ✅): Padding bottom 96px quá lớn đã được giảm xuống 24px
2. **MapView container height** (CẦN FIX ⚠️): Container sử dụng `calc(100vh - 120px)` tạo ra giới hạn chiều cao không tối ưu

Khoảng trống này làm cho danh sách địa điểm không kéo dài hết chiều cao có thể, tạo ra trải nghiệm không tối ưu và lãng phí không gian hiển thị trên desktop.

**File ảnh hưởng:** 
- `src/components/PlaceList.tsx` (ĐÃ FIX ✅)
- `src/components/MapView.tsx` (CẦN FIX ⚠️)

**Vị trí lỗi:** 
- ~~PlaceList dòng 649 - thuộc tính `padding` trong scrollable container~~ (ĐÃ FIX ✅)
- MapView dòng 735 - thuộc tính `height: calc(100vh - 120px)` trong content container (CẦN FIX ⚠️)

## Phân tích Lỗi

### Hành vi Hiện tại (Lỗi)

**1. PlaceList Padding (ĐÃ FIX ✅)**

1.1 ~~WHEN người dùng truy cập tính năng Khám phá trên desktop (màn hình >= 768px) THEN hệ thống hiển thị danh sách địa điểm với padding bottom 96px, tạo ra khoảng trống lớn không cần thiết ở dưới cùng~~ → **ĐÃ FIX: padding bottom giảm xuống 24px**

**2. MapView Container Height (CẦN FIX ⚠️)**

2.1 WHEN người dùng truy cập tính năng Khám phá trên desktop THEN hệ thống sử dụng `height: calc(100vh - 120px)` cho content container, tạo ra giới hạn chiều cao cố định không tối ưu

2.2 WHEN người dùng xem PlaceList trên desktop với container height cố định THEN hệ thống không tận dụng hết không gian có sẵn, tạo ra khoảng trống dưới cùng

2.3 WHEN danh sách địa điểm có nhiều items trên desktop THEN hệ thống vẫn giới hạn chiều cao bởi `calc(100vh - 120px)`, không cho phép PlaceList mở rộng tối đa

### Hành vi Mong đợi (Đúng)

**1. PlaceList Padding (ĐÃ ĐẠT ✅)**

~~2.1 WHEN người dùng truy cập tính năng Khám phá trên desktop (màn hình >= 768px) THEN hệ thống SHALL hiển thị danh sách địa điểm với padding bottom tối ưu (24px), tối đa hóa không gian hiển thị~~ → **ĐÃ ĐẠT**

**2. MapView Container Height (CẦN ĐẠT ⚠️)**

2.1 WHEN người dùng truy cập tính năng Khám phá trên desktop THEN hệ thống SHALL sử dụng flexbox layout (`flex: 1`) thay vì height cố định, cho phép content container tự động điều chỉnh chiều cao

2.2 WHEN người dùng xem PlaceList trên desktop THEN hệ thống SHALL cho phép PlaceList mở rộng tối đa trong không gian có sẵn, không bị giới hạn bởi height cố định

2.3 WHEN danh sách địa điểm có nhiều items trên desktop THEN hệ thống SHALL hiển thị tối đa số lượng địa điểm có thể trong viewport, tận dụng hết không gian hiển thị

### Hành vi Không thay đổi (Phòng ngừa Regression)

3.1 WHEN người dùng truy cập tính năng Khám phá trên mobile (màn hình < 768px) THEN hệ thống SHALL TIẾP TỤC hiển thị padding bottom 120px như hiện tại để tránh che khuất bởi navigation bar

3.2 WHEN người dùng chuyển đổi giữa các tabs (Bản đồ, Địa điểm, AI Trợ lý) THEN hệ thống SHALL TIẾP TỤC hoạt động bình thường với layout mới

3.3 WHEN người dùng tìm kiếm, lọc theo category, hoặc sắp xếp địa điểm THEN hệ thống SHALL TIẾP TỤC hoạt động bình thường

3.4 WHEN người dùng tương tác với các card địa điểm (check-in, chỉ đường, xem chi tiết) THEN hệ thống SHALL TIẾP TỤC hoạt động bình thường không bị ảnh hưởng

3.5 WHEN người dùng cuộn danh sách địa điểm lên xuống THEN hệ thống SHALL TIẾP TỤC có scroll behavior mượt mà và hiệu suất tốt

3.6 WHEN danh sách địa điểm được lazy load thêm items THEN hệ thống SHALL TIẾP TỤC load và hiển thị đúng

3.7 WHEN người dùng chuyển đổi giữa dark mode và light mode THEN hệ thống SHALL TIẾP TỤC hiển thị đúng trong cả hai chế độ

3.8 WHEN người dùng resize cửa sổ trình duyệt từ desktop sang mobile hoặc ngược lại THEN hệ thống SHALL TIẾP TỤC áp dụng đúng layout tương ứng

3.9 WHEN người dùng xem tab Bản đồ hoặc AI Trợ lý THEN hệ thống SHALL TIẾP TỤC hiển thị đúng với layout mới
