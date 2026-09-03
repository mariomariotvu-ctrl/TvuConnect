# Tài Liệu Yêu Cầu Sửa Lỗi: Nút Gửi Tin Nhắn Vẫn Hiển Thị Loading

## Giới Thiệu

Lỗi này xảy ra trong tính năng chat của hệ thống TVU Connect. Khi người dùng gửi tin nhắn, nút gửi hiển thị icon loading (spinner) nhưng không reset về trạng thái ban đầu sau khi tin nhắn đã được gửi thành công và hiển thị trong danh sách chat. Điều này gây nhầm lẫn cho người dùng về trạng thái gửi tin nhắn và ảnh hưởng đến trải nghiệm người dùng.

**Vị trí lỗi:** Component `src/components/Chat.tsx`

**Ảnh hưởng:** Trải nghiệm người dùng (UX) - Người dùng không biết tin nhắn đã được gửi thành công hay chưa khi nút vẫn hiển thị loading.

## Phân Tích Lỗi

### Hành Vi Hiện Tại (Lỗi)

1.1 KHI người dùng gửi tin nhắn văn bản thành công VÀ tin nhắn đã hiển thị trong danh sách chat THÌ nút gửi vẫn hiển thị icon loading (Loader2 spinner) thay vì icon Send

1.2 KHI người dùng gửi tin nhắn thoại thành công VÀ tin nhắn thoại đã hiển thị trong danh sách chat THÌ nút gửi vẫn hiển thị icon loading (Loader2 spinner) thay vì icon Send

1.3 KHI tin nhắn đã được gửi thành công VÀ state `sending` vẫn là `true` THÌ người dùng không thể gửi tin nhắn tiếp theo vì nút bị disabled

1.4 KHI xảy ra lỗi validation (tin nhắn rỗng, vi phạm nội dung, vượt quá giới hạn) TRƯỚC KHI gọi `setSending(true)` THÌ nút không hiển thị loading (đây là hành vi ĐÚNG nhưng cần ghi nhận để tránh regression)

### Hành Vi Mong Muốn (Sửa Lỗi)

2.1 KHI tin nhắn văn bản được gửi thành công VÀ được thêm vào Firestore collection 'messages' THÌ hệ thống PHẢI reset state `sending` về `false` ngay lập tức

2.2 KHI tin nhắn thoại được gửi thành công VÀ được thêm vào Firestore collection 'messages' THÌ hệ thống PHẢI reset state `sending` về `false` ngay lập tức

2.3 KHI state `sending` được reset về `false` THÌ nút gửi PHẢI hiển thị icon Send thay vì Loader2 spinner

2.4 KHI state `sending` được reset về `false` THÌ nút gửi PHẢI được enable lại (không còn disabled) để người dùng có thể gửi tin nhắn tiếp theo

2.5 KHI xảy ra lỗi trong quá trình gửi tin nhắn (permission-denied, unavailable, hoặc lỗi khác) THÌ hệ thống PHẢI reset state `sending` về `false` trong catch block hoặc finally block

2.6 KHI tin nhắn đạt giới hạn (100 tin nhắn) THÌ hệ thống PHẢI reset state `sending` về `false` trước khi return

### Hành Vi Không Thay Đổi (Phòng Ngừa Regression)

3.1 KHI người dùng nhập tin nhắn rỗng (chỉ có khoảng trắng) VÀ nhấn nút gửi THÌ hệ thống PHẢI TIẾP TỤC return sớm TRƯỚC KHI gọi `setSending(true)` và hiển thị thông báo lỗi

3.2 KHI người dùng bị chặn (isBlockedByMe hoặc isBlockedByThem) VÀ cố gắng gửi tin nhắn THÌ hệ thống PHẢI TIẾP TỤC return sớm TRƯỚC KHI gọi `setSending(true)` và hiển thị thông báo lỗi phù hợp

3.3 KHI người dùng vượt quá rate limit (10 tin nhắn/phút) THÌ hệ thống PHẢI TIẾP TỤC return sớm TRƯỚC KHI gọi `setSending(true)` và hiển thị thông báo thời gian chờ

3.4 KHI tin nhắn không hợp lệ (validation fails) THÌ hệ thống PHẢI TIẾP TỤC return sớm TRƯỚC KHI gọi `setSending(true)` và hiển thị thông báo lỗi

3.5 KHI tin nhắn chứa nội dung vi phạm (shouldBlockMessage) THÌ hệ thống PHẢI TIẾP TỤC return sớm TRƯỚC KHI gọi `setSending(true)` và ghi log vi phạm

3.6 KHI file âm thanh quá lớn (validateAudioSize fails) THÌ hệ thống PHẢI TIẾP TỤC return sớm TRƯỚC KHI gọi `setSending(true)` và hiển thị thông báo lỗi

3.7 KHI `sending` là `true` VÀ người dùng cố gắng gửi tin nhắn khác THÌ hệ thống PHẢI TIẾP TỤC return sớm để tránh gửi trùng lặp

3.8 KHI tin nhắn được gửi thành công THÌ hệ thống PHẢI TIẾP TỤC xóa nội dung ô input (`setNewMessage('')`) chỉ cho tin nhắn văn bản (không áp dụng cho tin nhắn thoại)

3.9 KHI tin nhắn được gửi thành công THÌ hệ thống PHẢI TIẾP TỤC cập nhật conversation document với lastMessage và lastMessageAt

3.10 KHI tin nhắn được gửi thành công THÌ hệ thống PHẢI TIẾP TỤC xóa typing status của người gửi

3.11 KHI nút gửi bị disabled (do `sending` = true hoặc tin nhắn rỗng) THÌ nút PHẢI TIẾP TỤC hiển thị opacity giảm (opacity-50) và không phản hồi click

3.12 KHI người dùng đang gửi tin nhắn (sending = true) THÌ ô input và nút ghi âm PHẢI TIẾP TỤC bị disabled
