# Block Message Realtime Fix — Bugfix Design

## Overview

Bug này làm cho tính năng chặn người dùng (block) trong TVU Connect hoạt động không đúng về mặt realtime và an toàn backend. Có ba điểm lỗi riêng biệt nhưng liên quan:

1. `Chat.tsx` dùng `getDoc` (one-time fetch) thay vì `onSnapshot` để theo dõi block status, khiến B không biết realtime khi bị chặn giữa phiên chat.
2. `Chat.tsx` tự implement lại block check sai, trong khi hook `useBlockedUsers` ở `src/hooks/useBlockedUsers.ts` đã implement đúng với `onSnapshot` hai chiều.
3. Firestore Security Rules cho `messages/create` chỉ check `isAuthenticated()`, cho phép user bị chặn vẫn ghi được vào Firestore, bypass hoàn toàn client-side protection.

Chiến lược fix: thay thế `checkBlock()` trong `Chat.tsx` bằng `onSnapshot` realtime (hoặc dùng `useBlockedUsers` hook), và thêm `isNotBlocked()` helper vào `firestore.rules` để chặn ghi ở tầng backend.

---

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt bug — block status thay đổi sau khi `Chat` component đã mount, hoặc block đã tồn tại nhưng không được kiểm tra ở backend.
- **Property (P)**: Hành vi đúng khi bug condition xảy ra — `isBlockedByThem` phải cập nhật realtime và Firestore phải từ chối ghi.
- **Preservation**: Các hành vi hiện tại phải giữ nguyên — gửi tin nhắn bình thường, chặn/bỏ chặn, cleanup listeners, rate limiting, content moderation.
- **checkBlock()**: Hàm trong `Chat.tsx` (khoảng dòng 134) dùng `getDoc` — đây là hàm cần được thay thế/sửa.
- **useBlockedUsers**: Hook tại `src/hooks/useBlockedUsers.ts` dùng `onSnapshot` đúng cách cho cả hai hướng block.
- **isBlockedByMe**: State trong `Chat.tsx` — `true` khi current user đã chặn receiver.
- **isBlockedByThem**: State trong `Chat.tsx` — `true` khi receiver đã chặn current user.
- **listenerRegistry**: Utility tại `src/utils/listenerRegistry.ts` quản lý Firestore listeners để tránh memory leak.
- **Block document**: Document tại `blocks/{blockerUid}_{blockedUid}` với fields `blockerUid`, `blockedUid`, `createdAt`.

---

## Bug Details

### Bug Condition

Bug xảy ra khi block status thay đổi SAU khi `Chat` component đã mount (scenario realtime), hoặc khi Firestore không enforce block check ở tầng rules (scenario backend bypass).

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { event: 'mount' | 'send', currentUserId: string, receiverUid: string }
  OUTPUT: boolean

  IF input.event = 'mount' THEN
    // Bug 1 & 2: checkBlock dùng getDoc, không realtime
    RETURN blockExistsInFirestore(receiverUid + '_' + currentUserId)
           AND isBlockedByThemState = false  // state không phản ánh thực tế
  END IF

  IF input.event = 'send' THEN
    // Bug 3: Firestore rules không check block
    RETURN blockExistsInFirestore(currentUserId + '_' + receiverUid)
           OR blockExistsInFirestore(receiverUid + '_' + currentUserId)
           AND firestoreAllowsWrite = true  // rules chỉ check isAuthenticated()
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Realtime miss**: A đang chat với B. A chặn B (tạo doc `blocks/{A_uid}_{B_uid}`). B vẫn thấy input bình thường, gõ tin và gửi thành công vì `isBlockedByThem` của B vẫn là `false`.
- **Backend bypass**: B mở DevTools, dùng Firebase SDK gọi `addDoc(collection(db,'messages'), {...})`. Firestore rules cho phép vì chỉ check `isAuthenticated()`.
- **Không ảnh hưởng**: C và D không block nhau, nhắn tin bình thường — hành vi không thay đổi sau fix.
- **Edge case**: A chặn B, sau đó bỏ chặn B trong cùng phiên chat — listener phải cập nhật cả hai chiều.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Gửi tin nhắn text và audio giữa hai người dùng không block nhau phải tiếp tục hoạt động bình thường.
- Chức năng chặn (handleBlock) và bỏ chặn (handleUnblock) từ phía người chặn phải tiếp tục hoạt động.
- UI ẩn input và hiển thị thông báo khi `isBlockedByMe = true` phải giữ nguyên.
- Rate limiting, content moderation, optimistic UI, và audio recording không bị ảnh hưởng.
- Cleanup listeners khi component unmount hoặc `receiverUid` thay đổi phải tiếp tục hoạt động đúng.

**Scope:**
Tất cả input KHÔNG phải trường hợp block (hai người dùng không block nhau, hoặc chỉ `isBlockedByMe = true` đã hoạt động) phải không bị ảnh hưởng bởi fix này.

---

## Hypothesized Root Cause

Dựa trên phân tích bug description và code review:

1. **getDoc vs onSnapshot (Root cause chính của Bug 1)**: `checkBlock()` dùng `getDoc` chỉ đọc một lần khi mount. Không có subscriber để nhận document change events từ Firestore. Khi block document được tạo/xóa sau đó, state trong `Chat.tsx` không được cập nhật.

2. **Duplicate implementation thay vì reuse hook (Root cause của Bug 2)**: `useBlockedUsers.ts` đã implement đúng với `onSnapshot` hai chiều nhưng `Chat.tsx` không import hay dùng hook này. Việc tự implement lại (`checkBlock`) dẫn đến lỗi.

3. **Firestore rules thiếu block check (Root cause của Bug 3)**: Rule `allow create: if isAuthenticated()` tại `match /messages/{messageId}` không gọi bất kỳ helper nào kiểm tra block. Vì Firestore SDK có thể gọi trực tiếp từ bất kỳ client nào (DevTools, script), đây là security gap nghiêm trọng.

4. **Không có integration giữa client guard và backend guard**: Client-side check và server-side rule đang độc lập, không nhất quán. Fix đúng phải cập nhật cả hai.

---

## Correctness Properties

Property 1: Bug Condition — Block Status Realtime Update

_For any_ trạng thái chat trong đó block document `blocks/{receiverUid}_{currentUserUid}` tồn tại hoặc được tạo mới sau khi `Chat` đã mount, hàm cập nhật block (sau fix) SHALL phản ánh `isBlockedByThem = true` ngay lập tức thông qua realtime listener, và input SHALL bị ẩn / Firestore SHALL từ chối ghi tin nhắn mới.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Normal Messaging Behavior

_For any_ cặp người dùng trong đó `isBugCondition` trả về `false` (không có block document giữa hai phía), hàm gửi tin nhắn SAU fix SHALL tạo ra kết quả giống hệt trước fix — tin nhắn được ghi vào Firestore, hiển thị trên UI, UI input bình thường, không có error toast liên quan đến block.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

---

## Fix Implementation

### Changes Required

Assuming root cause analysis is correct:

**File 1**: `src/components/Chat.tsx`

**Function**: `checkBlock()` (khoảng dòng 134) trong `useEffect`

**Specific Changes**:

1. **Thay thế `checkBlock()` + `getDoc` bằng `onSnapshot` realtime**:
   - Xóa hàm `checkBlock()` và lời gọi `checkBlock()`.
   - Thêm `onSnapshot` listener cho `doc(db, 'blocks', \`${auth.currentUser.uid}_${receiverUid}\`)` để cập nhật `setIsBlockedByMe`.
   - Thêm `onSnapshot` listener cho `doc(db, 'blocks', \`${receiverUid}_${auth.currentUser.uid}\`)` để cập nhật `setIsBlockedByThem`.
   - Đăng ký cả hai listener qua `listenerRegistry.register()` để đảm bảo cleanup đúng.
   - Đảm bảo `unsubscribe` được gọi trong cleanup function của `useEffect`.

2. **Cập nhật import** nếu cần: thêm `onSnapshot` đã có trong import list (đã imported từ `../firebase`).

3. **Đảm bảo ref sync**: `isBlockedByMeRef` và `isBlockedByThemRef` đã được sync qua `useEffect` riêng — không cần thay đổi.

**File 2**: `firestore.rules`

**Section**: `match /messages/{messageId}`

**Specific Changes**:

1. **Thêm helper function `isNotBlocked`** trước hoặc sau `isAuthenticated()`:
   ```
   function isNotBlocked(senderUid, receiverUid) {
     return !exists(/databases/$(database)/documents/blocks/$(senderUid + '_' + receiverUid)) &&
            !exists(/databases/$(database)/documents/blocks/$(receiverUid + '_' + senderUid));
   }
   ```

2. **Cập nhật rule `allow create`** cho messages:
   ```
   allow create: if isAuthenticated()
     && request.resource.data.senderUid == request.auth.uid
     && isNotBlocked(request.auth.uid, request.resource.data.receiverUid);
   ```
   - Kiểm tra `senderUid` phải là người gọi (chống giả mạo sender).
   - Kiểm tra không có block document theo cả hai hướng.

---

## Testing Strategy

### Validation Approach

Chiến lược kiểm thử theo hai giai đoạn: trước tiên viết test để xác nhận bug tồn tại trên code chưa sửa (exploration), sau đó verify fix hoạt động đúng và không gây regression (fix + preservation).

### Exploratory Bug Condition Checking

**Goal**: Xác nhận ba bug condition tồn tại trước khi implement fix. Confirm hoặc refute root cause analysis.

**Test Plan**: Viết test mô phỏng:
- Trạng thái block thay đổi sau khi `Chat` mount và kiểm tra xem state có cập nhật không.
- Gọi `addDoc` vào `messages` collection từ user bị chặn và kiểm tra Firestore rules có cho phép không.

Chạy tests trên code CHƯA SỬA — kỳ vọng FAIL.

**Test Cases**:
1. **Realtime Block Test**: Tạo mock `onSnapshot` cho block document, gọi `checkBlock()`, sau đó trigger thay đổi trong snapshot — kiểm tra `isBlockedByThem` có cập nhật không (sẽ FAIL trên code chưa sửa).
2. **Backend Bypass Test**: Dùng Firebase Emulator hoặc mock rules, gửi `addDoc` với user bị chặn — kiểm tra result có `permission-denied` không (sẽ FAIL — rules hiện tại cho phép).
3. **Mount Detection Test**: Tạo block document trước khi mount `Chat`, kiểm tra `isBlockedByThem` sau mount (có thể PASS vì `checkBlock` vẫn chạy khi mount — nhưng không phải realtime).

**Expected Counterexamples**:
- `isBlockedByThem` không cập nhật khi block document được tạo sau mount.
- Firestore write thành công dù block document tồn tại.

### Fix Checking

**Goal**: Verify rằng với mọi input thỏa `isBugCondition`, hàm sau fix tạo ra hành vi đúng.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := checkBlockStatus_fixed(input)
  ASSERT isBlockedByThem = true  (khi block doc tồn tại)
  ASSERT firestoreWrite = 'permission-denied'  (khi blocked user ghi messages)
END FOR
```

### Preservation Checking

**Goal**: Verify rằng với mọi input KHÔNG thỏa `isBugCondition`, hành vi sau fix giống hệt trước fix.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT sendMessage_original(input) = sendMessage_fixed(input)
  ASSERT firestoreWrite_original(input) = firestoreWrite_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing phù hợp cho preservation vì:
- Tự động sinh nhiều test case với các cặp userId, nội dung tin nhắn khác nhau.
- Bắt được edge case mà manual test bỏ qua.
- Đảm bảo hành vi không thay đổi trên toàn bộ input domain không-block.

**Test Cases**:
1. **Normal Messaging Preservation**: Quan sát `addDoc` thành công cho hai user không block nhau trên code chưa sửa → viết test verify vẫn thành công sau fix.
2. **isBlockedByMe Preservation**: Quan sát UI ẩn input khi `isBlockedByMe = true` → verify UI behavior không đổi sau fix.
3. **Listener Cleanup Preservation**: Quan sát tất cả listener được cleanup khi unmount → verify block listeners mới cũng được cleanup.
4. **Unblock Flow Preservation**: Verify flow bỏ chặn (`handleUnblock`) và khôi phục messaging vẫn hoạt động đúng.

### Unit Tests

- Test `onSnapshot` callback cho block document cập nhật `isBlockedByMe` và `isBlockedByThem` đúng.
- Test `isNotBlocked()` helper trong Firestore rules với các block document tồn tại/không tồn tại.
- Test cleanup listener block khi component unmount và khi `receiverUid` thay đổi.

### Property-Based Tests

- Sinh ngẫu nhiên các cặp `(userA, userB)` không có block → verify `isNotBlocked` trả về `true` và ghi messages thành công.
- Sinh ngẫu nhiên block document và kiểm tra `isBlockedByThem` cập nhật realtime.
- Test toàn bộ non-block input path với nhiều nội dung tin nhắn khác nhau để verify preservation.

### Integration Tests

- Test full flow: A chat với B → A chặn B → B thấy block notification realtime → B thử gửi → thất bại (cả client và backend).
- Test: A chặn B → A bỏ chặn B → B có thể nhắn tin trở lại.
- Test: A và C chat bình thường trong khi A block B ở chat khác — không ảnh hưởng.
