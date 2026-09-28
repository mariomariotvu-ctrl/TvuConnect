# Bạn mới, bạn bè và lời mời

## Hành vi

- `/friends?tab=new` là mục mặc định. Phân trang 24 hồ sơ, sắp xếp `createdAt` giảm dần ngay trong truy vấn. Nhãn **Bạn mới** áp dụng trong 7 ngày. Bộ lọc Quanh đây ưu tiên khoảng cách trong các kết quả đã tải và vẫn yêu cầu tự nguyện chia sẻ vị trí gần đúng.
- `/friends?tab=friends` lấy hồ sơ từ các quan hệ `friendships` đã chấp nhận, không lọc từ trang khám phá giới hạn. Danh sách xếp theo tên.
- `/friends?tab=requests` tách lời mời đã nhận/đã gửi, hỗ trợ chấp nhận, từ chối và thu hồi. Số lượng và trạng thái cập nhật theo thời gian thực.
- Người bị chặn ở một trong hai chiều không xuất hiện trong các danh sách hoặc thông báo.

## Thông báo thành viên mới

`announceNewProfile` đang triển khai ở **asia-southeast1**, khác vùng `us-central1` của API kết bạn. Cập nhật đúng hàm hiện có; không tạo thêm một trigger ở vùng khác.

Khi một hồ sơ lần đầu có tên và ngày tạo hợp lệ, hàm ghi một sự kiện công khai `communityNotifications/new_profile_<uid>`. Hồ sơ phải mới trong 6 giờ so với thời điểm sự kiện; sửa hồ sơ cũ không phát thông báo lại. Transaction và ID cố định chống tạo trùng khi retry.

- Không cần trùng sở thích hoặc bật vị trí để có thông báo cộng đồng.
- Chỉ ghi tên, ảnh đại diện HTTPS, mã hồ sơ và nội dung chào đón; không đưa email, số điện thoại hoặc tọa độ vào sự kiện.
- Mọi tài khoản đăng nhập đọc cùng một nguồn sự kiện, nhưng dấu đã đọc lưu riêng ở `users/<uid>/communityNotificationReads`.
- Không gửi push hàng loạt cho tất cả thành viên. Thông báo push ghép sở thích/gần nhau hiện có vẫn giữ nguyên tùy chọn của người nhận.
- Feed gộp thông báo riêng và cộng đồng theo ID, loại tin nhắn/cuộc gọi, chính mình, người bị chặn và sự kiện hết hạn. Tab **Bạn mới** trong trung tâm thông báo lọc `new_profile`.
- Xóa tài khoản cũng xóa sự kiện cộng đồng. Thông báo cộng đồng hết hạn sau 7 ngày; ứng dụng ẩn ngay theo `expiresAt`, không chờ TTL.
- Chỉ áp dụng cho hồ sơ mới sau triển khai. Không tạo thông báo hàng loạt cho các tài khoản cũ.

## Triển khai

Triển khai rules/indexes không dùng `--force`: dự án có các index và TTL khác được quản lý ngoài file cấu hình này, không được xóa chúng.

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project tvu-connect-1dc97 --non-interactive
npx firebase deploy --only functions:announceNewProfile,functions:manageFriendConnection,functions:deleteStudentAccount --project tvu-connect-1dc97 --non-interactive
```

Lần đầu bật retry cho `announceNewProfile` cần xác nhận riêng của Firebase CLI. Không mở rộng sang toàn bộ Functions để xử lý cảnh báo đó.

TTL riêng cho dữ liệu tạm mới (không thay thế các chính sách TTL đang có):

```sh
gcloud firestore fields ttls update expiresAt --collection-group=communityNotifications --database='(default)' --enable-ttl --project=tvu-connect-1dc97
```

Các index mới cần ở trạng thái READY trước khi sử dụng bộ lọc có sắp xếp. Giao diện được triển khai qua nhánh `main` trên Vercel.

## Kiểm tra

```sh
npm run lint
npx vitest run --exclude firestore.rules.test.ts
npm --prefix functions test
npm run test:rules
npm run build
```

Chạy lint và build tuần tự. Kiểm tra trình duyệt bằng tài khoản/dữ liệu thử nghiệm; không tự tạo tài khoản hoặc lời mời giả trên production.
