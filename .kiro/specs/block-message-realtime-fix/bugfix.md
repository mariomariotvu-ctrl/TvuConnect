# Bugfix Requirements Document

## Introduction

Khi người dùng A chặn người dùng B trong TVU Connect, người dùng B vẫn có thể nhắn tin bình thường và tin nhắn vẫn được ghi thành công vào Firestore. Điều này xảy ra vì ba lỗi đồng thời:

1. **Chat.tsx dùng one-time fetch** (`getDoc`) thay vì realtime listener (`onSnapshot`) để kiểm tra trạng thái block — nên khi A chặn B trong lúc đang chat, B không nhận được cập nhật realtime, `isBlockedByThem` vẫn là `false`.
2. **Chat.tsx không dùng hook `useBlockedUsers`** đã có sẵn và implement đúng (dùng `onSnapshot` hai chiều), thay vào đó tự implement lại sai.
3. **Firestore Security Rules thiếu block check ở tầng backend** — rule `messages/create` chỉ kiểm tra `isAuthenticated()`, không kiểm tra block status, nên B bị chặn vẫn ghi được vào `messages` collection, bypassing hoàn toàn client-side check.

Bug này ảnh hưởng trực tiếp đến quyền riêng tư và an toàn của người dùng khi tính năng chặn không hoạt động đúng.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN người dùng A chặn người dùng B trong khi B đang mở cửa sổ chat với A, THEN `isBlockedByThem` trong `Chat.tsx` của B vẫn là `false` vì `checkBlock()` chỉ gọi một lần khi mount, không cập nhật realtime.

1.2 WHEN người dùng B (đã bị A chặn) nhấn gửi tin nhắn, THEN client của B không hiển thị cảnh báo bị chặn và vẫn tiến hành gửi tin nhắn bình thường.

1.3 WHEN người dùng B (đã bị A chặn) gọi `addDoc` vào collection `messages`, THEN Firestore Security Rules cho phép ghi thành công vì rule `allow create: if isAuthenticated()` không kiểm tra block status.

1.4 WHEN người dùng B bị A chặn, THEN input nhắn tin của B vẫn hiển thị bình thường (không có thông báo "bạn đã bị chặn"), do `isBlockedByThem` sai.

### Expected Behavior (Correct)

2.1 WHEN người dùng A chặn người dùng B trong khi B đang mở cửa sổ chat, THEN `isBlockedByThem` của B SHALL được cập nhật realtime ngay lập tức thông qua `onSnapshot` listener, khiến input bị ẩn và hiển thị thông báo "Bạn đã bị người dùng này chặn".

2.2 WHEN người dùng B (đã bị A chặn) cố gắng gửi tin nhắn từ phía client, THEN hệ thống SHALL chặn hành động và hiển thị thông báo lỗi phù hợp mà không gửi dữ liệu lên Firestore.

2.3 WHEN người dùng B (đã bị A chặn) cố tình gọi `addDoc` vào collection `messages` (bypass client-side), THEN Firestore Security Rules SHALL từ chối ghi với lỗi `permission-denied` dựa trên kiểm tra block status ở tầng backend.

2.4 WHEN người dùng B mở chat với A và A đã chặn B từ trước, THEN input nhắn tin SHALL được ẩn và thay thế bằng thông báo block ngay khi component mount do listener phát hiện block tồn tại.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN người dùng gửi tin nhắn bình thường (không có block giữa hai phía), THEN hệ thống SHALL CONTINUE TO ghi tin nhắn thành công vào Firestore và hiển thị trên UI của cả hai phía.

3.2 WHEN người dùng A chặn người dùng B, THEN hệ thống SHALL CONTINUE TO cho phép A bỏ chặn B thông qua nút "Bỏ chặn" và khôi phục khả năng nhắn tin của B sau khi bỏ chặn.

3.3 WHEN người dùng A nhắn tin cho C (không bị chặn và không chặn A), THEN hệ thống SHALL CONTINUE TO xử lý rate limiting, content moderation, và optimistic UI như trước — không bị ảnh hưởng bởi thay đổi liên quan đến block.

3.4 WHEN người dùng A tự chặn một người (isBlockedByMe = true), THEN hệ thống SHALL CONTINUE TO ẩn input và hiển thị thông báo "Bạn đã chặn người này" như hiện tại.

3.5 WHEN component `Chat` unmount hoặc `receiverUid` thay đổi, THEN hệ thống SHALL CONTINUE TO cleanup tất cả listeners (bao gồm cả block listeners mới) để tránh memory leak.
