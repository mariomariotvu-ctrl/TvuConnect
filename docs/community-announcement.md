# Thông báo chào cộng đồng

Nội dung nằm ở `config/community-announcement.json`; Firebase Remote Config bật/tắt
và cung cấp nội dung cho web. Không dùng FCM, không tạo tin nhắn hay email.

- Hiện sau đăng nhập và hoàn thành hồ sơ/điều khoản/hướng dẫn, khi tab đang mở.
- Chờ nếu có cuộc gọi, phòng học, phản hồi hoặc menu đang mở.
- Toast có nút đóng, tồn tại 20 giây. Tải lại trang không hiển thị lại.
- Transaction tạo receipt riêng ở `users/{uid}/announcementReceipts/{campaignId}`,
  tránh lặp giữa thiết bị/tab. Local cache chỉ tối ưu; dữ liệu server là nguồn chính.
- Mất mạng/lỗi quyền: hoãn, thử lại tối đa một lần/phút; không ảnh hưởng đăng nhập.
- Receipt được ghi ngay trước khi xếp lịch hiển thị. Nếu đóng trang đúng lúc đó,
  tài khoản có thể bỏ lỡ toast; đây không phải cơ chế xác nhận người dùng đã đọc.
- Người chưa đăng nhập hoặc chưa hoàn tất onboarding sẽ thấy sau khi hoàn thành.
- Không áp dụng TTL cho receipts vì xoá chúng có thể làm thông báo hiện lại.

## Vận hành

Yêu cầu gcloud đã đăng nhập tài khoản có quyền Remote Config trên project
`tvu-connect-1dc97`.

```sh
npm run announcement:community                 # kiểm tra, không bật
npm run announcement:community -- --publish    # bật toàn cộng đồng
npm run announcement:community -- --disable --publish
```

Script giữ nguyên các cài đặt khác, dùng ETag để không đè thay đổi đồng thời.
**Giữ nguyên ID** khi sửa câu chữ hoặc tắt/bật lại. Chỉ đổi ID nếu thực sự muốn
phát một thông báo mới cho mọi người.

Triển khai Firestore rules trước, frontend tiếp theo, rồi xuất bản thông báo.
Trang cũ cần nhận bản web mới mới có thành phần hiển thị này. Các thay đổi nội dung
sau đó đi qua Remote Config realtime; nếu kết nối realtime gián đoạn có thể cần
đợi lần fetch tiếp theo (tối đa cache hiện tại 12 giờ).
