# Bugfix Requirements Document

## Introduction

Trang "Hồ sơ" (Profile) trên TVU Connect bị kẹt ở trạng thái loading vô tận — spinner xoay mãi và không bao giờ hiển thị nội dung form hồ sơ. Lỗi xảy ra với người dùng "07-Trần Tấn Hưng" khi truy cập tab "Hồ sơ" trên giao diện desktop (`localhost:3000`).

**Nguyên nhân gốc rễ:** `ProfileForm.tsx` khởi tạo `loading = true` và chỉ set `loading = false` trong `finally` của `fetchProfile()`. Ba kịch bản gây spinner vô tận:
1. Component unmount/remount nhanh trước khi async fetch hoàn thành → `finally` không chạy
2. `onSnapshot` (blocks) lỗi permission/quota → chỉ gọi `setLoadingBlocks(false)`, không gọi `setLoading(false)`
3. Không có timeout fallback — nếu cả hai cùng lỗi, `loading` kẹt mãi ở `true`

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN người dùng đã đăng nhập điều hướng đến tab "Hồ sơ" THEN hệ thống hiển thị spinner xoay vô tận mà không bao giờ render form hồ sơ

1.2 WHEN `ProfileForm` mount và `fetchProfile()` bị hủy giữa chừng (do component unmount/remount nhanh) THEN hệ thống không gọi `setLoading(false)`, khiến `loading` state mãi là `true`

1.3 WHEN `onSnapshot` lắng nghe collection `blocks` gặp lỗi (permission denied hoặc quota exceeded) đồng thời `fetchProfile` cũng gặp lỗi THEN hệ thống không giải phóng `loading` state, spinner không dừng

1.4 WHEN profile của người dùng đã tồn tại trong Firestore nhưng request bị timeout hoặc lỗi mạng tạm thời THEN hệ thống không có cơ chế timeout fallback cho `loading` state trong `ProfileForm`, spinner kẹt mãi

### Expected Behavior (Correct)

2.1 WHEN người dùng đã đăng nhập điều hướng đến tab "Hồ sơ" THEN hệ thống SHALL hiển thị form hồ sơ trong vòng tối đa 5 giây

2.2 WHEN `fetchProfile()` bị hủy do component unmount THEN hệ thống SHALL đảm bảo `loading` state được giải phóng về `false`

2.3 WHEN `onSnapshot` hoặc `fetchProfile` gặp bất kỳ lỗi nào THEN hệ thống SHALL kết thúc trạng thái loading và hiển thị form với dữ liệu rỗng hoặc thông báo lỗi

2.4 WHEN `loading` state vẫn là `true` sau 5 giây kể từ khi mount THEN hệ thống SHALL tự động gọi timeout fallback để kết thúc spinner

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `fetchProfile()` thành công THEN hệ thống SHALL CONTINUE TO hiển thị form được điền sẵn dữ liệu hồ sơ

3.2 WHEN người dùng lưu hồ sơ thành công THEN hệ thống SHALL CONTINUE TO điều hướng đến trang Matching

3.3 WHEN `onSnapshot` nhận dữ liệu hợp lệ THEN hệ thống SHALL CONTINUE TO hiển thị danh sách blocks

3.4 WHEN profile chưa tồn tại THEN hệ thống SHALL CONTINUE TO hiển thị form trống

3.5 WHEN người dùng chưa đăng nhập THEN hệ thống SHALL CONTINUE TO chuyển hướng đến trang đăng nhập

---

### Requirement 1: Loading State Resolution Guarantee

**User Story:** As a logged-in user, I want the profile page to always stop loading and show content, so that I am not stuck with an infinite spinner.

#### Acceptance Criteria

1. WHEN người dùng đã đăng nhập điều hướng đến tab "Hồ sơ" THEN hệ thống SHALL dừng spinner và hiển thị form hồ sơ (hoặc form trống nếu chưa có profile) trong vòng tối đa 5 giây

2. WHEN `fetchProfile()` bị hủy do component unmount trước khi hoàn thành THEN hệ thống SHALL đảm bảo `loading` state được giải phóng về `false` để không gây rò rỉ trạng thái khi component mount lại

3. WHEN `loading` state vẫn là `true` sau 5 giây kể từ khi `ProfileForm` mount THEN hệ thống SHALL tự động kết thúc trạng thái loading và hiển thị thông báo lỗi cho người dùng thay vì spinner

### Requirement 2: Error Handling in Async Profile Operations

**User Story:** As a logged-in user, I want the profile page to gracefully handle errors during data loading, so that I can still access the form even when network or permission errors occur.

#### Acceptance Criteria

1. WHEN cả `fetchProfile` và `onSnapshot` (blocks) đều gặp lỗi đồng thời THEN hệ thống SHALL kết thúc trạng thái loading và hiển thị form trống kèm thông báo lỗi, bất kể thứ tự xảy ra lỗi

2. WHEN `onSnapshot` gặp lỗi permission-denied THEN hệ thống SHALL kết thúc trạng thái loading, hiển thị form hồ sơ với danh sách blocks rỗng, và hiển thị thông báo "Không thể tải danh sách chặn"

3. WHEN `onSnapshot` gặp lỗi quota-exceeded THEN hệ thống SHALL kết thúc trạng thái loading, hiển thị form hồ sơ với dữ liệu đã cache (nếu có) hoặc form trống, và hiển thị thông báo quota vượt hạn

4. WHEN `fetchProfile` bị lỗi mạng tạm thời (timeout, connection error) và `loading` state vẫn là `true` sau 10 giây THEN hệ thống SHALL tự động kết thúc trạng thái loading và hiển thị form trống kèm thông báo lỗi mạng

### Requirement 3: Regression Prevention for Successful Profile Flows

**User Story:** As a logged-in user with existing profile data, I want all the normal profile operations to continue working correctly after the loading bug is fixed, so that the fix does not break existing functionality.

#### Acceptance Criteria

1. WHEN `fetchProfile()` thành công và Firestore trả về dữ liệu hồ sơ THEN hệ thống SHALL hiển thị form được điền sẵn đầy đủ các trường (tên hiển thị, ảnh đại diện, mô tả, sở thích, ngành học, v.v.) với giá trị khớp chính xác với dữ liệu trong Firestore

2. WHEN người dùng lưu hồ sơ thành công THEN hệ thống SHALL gọi callback `onSave(profile)` và điều hướng người dùng đến trang Matching

3. WHEN `onSnapshot` cho collection `blocks` nhận được snapshot chứa ít nhất một document THEN hệ thống SHALL hiển thị mỗi document đó như một mục trong danh sách người dùng đã chặn trong form

4. WHEN `onSnapshot` cho collection `blocks` nhận được snapshot rỗng (không có document nào) THEN hệ thống SHALL hiển thị danh sách blocks trống mà không báo lỗi

5. WHEN `fetchProfile()` thành công nhưng profile chưa tồn tại trong Firestore THEN hệ thống SHALL hiển thị form với tất cả các trường ở trạng thái trống để người dùng nhập thông tin lần đầu

6. WHEN người dùng chưa đăng nhập truy cập đường dẫn trang Hồ sơ THEN hệ thống SHALL chuyển hướng người dùng đến trang đăng nhập thay vì render `ProfileForm`
