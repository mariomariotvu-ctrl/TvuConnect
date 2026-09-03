# Implementation Plan

## Overview

Bugfix trạng thái block không được cập nhật realtime trong Chat: (1) `checkBlock()` chỉ chạy một lần khi mount, không lắng nghe thay đổi — cần thay bằng `onSnapshot`; (2) Firestore rules chỉ check `isAuthenticated()`, cho phép user bị chặn vẫn gửi được tin nhắn — cần thêm `isNotBlocked` check.

## Tasks

- [x] 1. Viết exploration test cho bug condition (TRƯỚC KHI SỬA)
  - **Property 1: Bug Condition** — Block Status Not Updated Realtime
  - **CRITICAL**: Test này PHẢI FAIL trên code chưa sửa — failure xác nhận bug tồn tại
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: Test này encode expected behavior — sẽ validate fix khi pass sau implementation
  - **GOAL**: Surface counterexamples chứng minh bug tồn tại
  - **Scoped PBT Approach**: Scope property vào 2 failing cases cụ thể:
    - Case A (Realtime miss): Mock `onSnapshot` cho block document của `Chat.tsx` — gọi `checkBlock()` ban đầu, sau đó trigger snapshot change (block document được tạo) — assert `isBlockedByThem` được cập nhật thành `true`
    - Case B (Backend bypass): Dùng Firebase Emulator hoặc mock rules — user bị chặn gọi `addDoc(collection(db,'messages'), {...})` — assert kết quả là `permission-denied`
  - Chạy test trên code CHƯA SỬA
  - **EXPECTED OUTCOME**: Tests FAIL (xác nhận bug tồn tại):
    - Case A: `isBlockedByThem` vẫn là `false` sau snapshot change vì `checkBlock` không subscribe
    - Case B: `addDoc` thành công (không `permission-denied`) vì rules chỉ check `isAuthenticated()`
  - Document counterexamples tìm được để hiểu root cause
  - Mark task complete khi tests được viết, chạy, và failure được document
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Viết preservation property tests (TRƯỚC KHI SỬA)
  - **Property 2: Preservation** — Normal Messaging and Existing Block UI Behavior
  - **IMPORTANT**: Theo observation-first methodology
  - **Observe on UNFIXED code**:
    - Observe: `addDoc(messages, {...})` với hai user không block nhau → thành công
    - Observe: UI ẩn input khi `isBlockedByMe = true` → input không render
    - Observe: Listeners được cleanup khi component unmount (kiểm tra listenerRegistry)
    - Observe: `handleBlock()` tạo doc `blocks/{uid1}_{uid2}` thành công
    - Observe: `handleUnblock()` xóa doc và restore messaging thành công
  - Viết property-based tests capture observed behaviors:
    - PBT: Với mọi cặp (userA, userB) không có block document → `addDoc` vào messages thành công
    - PBT: Với mọi trạng thái `isBlockedByMe = true` → input area không render, hiển thị block message
    - Unit: Listeners block mới (sau fix) được đăng ký trong `listenerRegistry` và cleanup khi unmount
  - Chạy tests trên code CHƯA SỬA
  - **EXPECTED OUTCOME**: Tests PASS (xác nhận baseline behavior cần preserve)
  - Mark task complete khi tests được viết, chạy, và passing trên unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix: Block Message Realtime + Firestore Security

  - [x] 3.1 Sửa Chat.tsx — Thay checkBlock() bằng onSnapshot realtime
    - Xóa hàm `checkBlock()` và lời gọi `checkBlock()` trong `useEffect`
    - Thêm `onSnapshot` listener cho `doc(db, 'blocks', \`${auth.currentUser.uid}_${receiverUid}\`)`:
      - Callback: `(snap) => setIsBlockedByMe(snap.exists())`
      - Error handler: log warning, default về `false`
    - Thêm `onSnapshot` listener cho `doc(db, 'blocks', \`${receiverUid}_${auth.currentUser.uid}\`)`:
      - Callback: `(snap) => setIsBlockedByThem(snap.exists())`
      - Error handler: log warning, default về `false`
    - Đăng ký cả hai listener qua `listenerRegistry.register()` với `componentName: 'Chat'`, `collection: 'blocks'`, `priority: 9`, `conversationId`
    - Unregister cả hai trong cleanup `return () => { ... }` của `useEffect`
    - _Bug_Condition: isBugCondition(input) — block document tồn tại hoặc thay đổi sau khi Chat mount_
    - _Expected_Behavior: isBlockedByThem cập nhật realtime khi block document được tạo/xóa_
    - _Preservation: Cleanup listeners, không ảnh hưởng normal messaging flow_
    - _Requirements: 2.1, 2.4, 3.5_

  - [x] 3.2 Sửa firestore.rules — Thêm block check cho messages/create
    - Thêm helper function `isNotBlocked` vào phần helper functions:
      ```
      function isNotBlocked(senderUid, receiverUid) {
        return !exists(/databases/$(database)/documents/blocks/$(senderUid + '_' + receiverUid)) &&
               !exists(/databases/$(database)/documents/blocks/$(receiverUid + '_' + senderUid));
      }
      ```
    - Cập nhật rule `allow create` trong `match /messages/{messageId}`:
      ```
      allow create: if isAuthenticated()
        && request.resource.data.senderUid == request.auth.uid
        && isNotBlocked(request.auth.uid, request.resource.data.receiverUid);
      ```
    - Đảm bảo `receiverUid` field tồn tại trong message data (đã có trong `handleSendMessage`)
    - _Bug_Condition: isBugCondition — user bị chặn gọi addDoc vào messages_
    - _Expected_Behavior: Firestore trả về permission-denied khi block document tồn tại_
    - _Preservation: Users không block nhau vẫn create messages thành công_
    - _Requirements: 2.3, 3.1_

  - [x] 3.3 Verify exploration test (Property 1) now passes
    - **Property 1: Expected Behavior** — Block Status Updated Realtime + Backend Blocked
    - **IMPORTANT**: Chạy lại ĐÚNG test từ task 1 — KHÔNG viết test mới
    - Test từ task 1 đã encode expected behavior
    - Khi test pass, xác nhận expected behavior được thỏa mãn
    - Re-run exploration tests từ task 1:
      - Case A: `isBlockedByThem` cập nhật thành `true` sau snapshot change ✓
      - Case B: `addDoc` từ blocked user trả về `permission-denied` ✓
    - **EXPECTED OUTCOME**: Tests PASS (xác nhận bug đã được fix)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify preservation tests (Property 2) still pass
    - **Property 2: Preservation** — Normal Messaging and Existing Behaviors Unchanged
    - **IMPORTANT**: Chạy lại ĐÚNG tests từ task 2 — KHÔNG viết test mới
    - Re-run tất cả preservation tests từ task 2
    - **EXPECTED OUTCOME**: Tests vẫn PASS (xác nhận không có regression)
    - Confirm không có regression nào sau fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint — Đảm bảo tất cả tests pass
  - Chạy toàn bộ test suite để đảm bảo không có test nào fail
  - Kiểm tra Firestore rules với Firebase Emulator nếu có thể
  - Verify bằng tay: A chặn B trong khi chat → B thấy thông báo realtime ngay lập tức
  - Verify bằng tay: User bị chặn không thể ghi messages qua bất kỳ client nào
  - Hỏi user nếu có vấn đề phát sinh

## Notes

- Firestore rules cần deploy sau khi sửa
- `onSnapshot` listeners cần đăng ký qua `listenerRegistry` để cleanup đúng
- Chạy tests bằng `npx vitest --run`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
