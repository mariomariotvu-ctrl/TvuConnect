# Implementation Plan: Online Presence Indicator

## Overview

Hoàn thiện và tích hợp nhất quán hệ thống hiển thị trạng thái online/offline lên toàn bộ ứng dụng TVU Connect. Dự án đã có nền tảng từ spec `user-activity-status` (`StatusManager`, `usePresenceManager`, `useOnlineStatusCache`, `StatusIndicator`, `OnlineStatus`). Spec này tập trung vào:

1. **Hoàn thiện core utilities** — `formatLastSeen` đầy đủ edge case, `StatusManager` bổ sung multi-device & invisible mode đầy đủ
2. **Cải thiện hooks** — `useOnlineStatusCache` xử lý permission error, error state, null guard; `usePresenceManager` đảm bảo lifecycle ổn định
3. **Nâng cấp components** — `StatusIndicator` thêm `aria-label`/`role="img"`, prop validation; `OnlineStatus` sử dụng `formatLastSeen` chuẩn
4. **Tích hợp UI** — `ConversationsList`, `Chat`, `ProfileCard` render indicator nhất quán
5. **Security** — Cập nhật Firebase Security Rules cho invisible mode và blocked users
6. **Kiểm thử** — Property-based tests với `fast-check` bảo đảm các invariant đã định nghĩa trong design

## Tasks

- [x] 1. Hoàn thiện utility `formatLastSeen` và tách thành module riêng
  - [x] 1.1 Tạo file `src/utils/formatLastSeen.ts` với logic đầy đủ theo design
    - Triển khai hàm `formatLastSeen(lastActive: Date | null): string` theo đúng thuật toán trong design (7 mức thời gian)
    - Xử lý edge case: `null` → `"Không hoạt động"`, diff âm (clock skew) → `"Không hoạt động"`, `lastActive` không hợp lệ → `"Không hoạt động"`
    - Export hàm và type để dùng chung trong `OnlineStatus`, `useOnlineStatus`, `Chat`, `ProfileCard`
    - _Requirements: 3.4, 3.5, 4.4, 10.4_

  - [x]* 1.2 Viết property test cho `formatLastSeen` (Property 4)
    - **Property 4: formatLastSeen không bao giờ trả về chuỗi chứa giá trị lỗi**
    - Dùng `fast-check`: với mọi `timestamp` nguyên dương hợp lệ ≤ `Date.now()`, kết quả không chứa `NaN`, `undefined`, `null`, `"Invalid Date"`, không rỗng
    - Test thêm: `null` → `"Không hoạt động"`, diff âm → `"Không hoạt động"`
    - **Validates: Requirements 3.4, 4.4, 10.4**

- [x] 2. Hoàn thiện `useOnlineStatusCache` — error handling và permission guard
  - [x] 2.1 Cập nhật `src/hooks/useOnlineStatusCache.ts` xử lý permission error và error types
    - Phân biệt lỗi permission (`PERMISSION_DENIED`) và lỗi mạng trong `catch` block
    - Khi lỗi permission: trả về `{ isOnline: false, loading: false, error: true }` và không retry tự động
    - Khi lỗi mạng: trả về `{ isOnline: false, loading: false, error: true }` không hiển thị UI error
    - Đảm bảo `userId === null | undefined` → trả về `{ isOnline: false, loading: false, error: false }` ngay lập tức, không gọi Firebase
    - _Requirements: 6.6, 6.7, 6.8_

  - [x]* 2.2 Viết property test cho logic `isOnline` (Property 3)
    - **Property 3: isOnline logic — if and only if**
    - Dùng `fast-check`: với mọi `(isOnlineFlag: boolean, ageMs: number)`, kết quả `isOnline === true` khi và chỉ khi `isOnlineFlag === true` VÀ `ageMs < 420_000`
    - Test thêm: `ageMs = 419_999` → `true`; `ageMs = 420_001` → `false`
    - **Validates: Requirements 6.4, 10.5**

  - [ ]* 2.3 Viết property test cho cache deduplication (Property 2)
    - **Property 2: Cache deduplication trong TTL**
    - Dùng `fast-check` + mock Firestore: với mọi `userId` và N lần gọi hook trong cùng TTL (30s), số network request thực tế luôn bằng 1
    - **Validates: Requirements 6.1, 6.2, 10.2**

- [x] 3. Hoàn thiện `StatusIndicator` — accessibility và prop validation
  - [x] 3.1 Cập nhật `src/components/StatusIndicator.tsx` thêm aria attributes và prop validation
    - Thêm `aria-label` tương ứng từng trạng thái: `"Đang hoạt động"` / `"Không hoạt động"` / `"Ngoại tuyến"`
    - Thêm `role="img"` trên wrapper element khi chỉ là trang trí
    - Thêm prop validation: khi `status` không thuộc `['online', 'away', 'offline']` → fallback về `'offline'` + `console.warn`
    - Bỏ `minWidth: 44 / minHeight: 44` khỏi dot div (touch target nên đặt ở wrapper level, không phải trên dot nhỏ vì gây layout overflow)
    - Tắt animation pulse khi `status === 'offline'` hoặc `status === 'away'` (Requirement 8.5)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.5, 9.1, 9.2_

  - [x]* 3.2 Viết property test cho màu sắc nhất quán (Property 1)
    - **Property 1: StatusIndicator luôn render màu đúng với trạng thái đầu vào**
    - Dùng `fast-check` với `fc.constantFrom('online', 'away', 'offline')`: rendered dot luôn có `backgroundColor === STATUS_COLORS[status]`, không bao giờ render màu trạng thái khác
    - **Validates: Requirements 5.2, 10.1**

- [x] 4. Hoàn thiện `OnlineStatus` — tích hợp `formatLastSeen` đầy đủ và away state
  - [x] 4.1 Cập nhật `src/components/OnlineStatus.tsx` dùng `formatLastSeen` từ module mới
    - Import `formatLastSeen` từ `src/utils/formatLastSeen.ts`
    - Thêm hiển thị trạng thái `away`: dot màu cam (#ffa500) + text `"Không hoạt động"` (theo Req 3.3, 4.3)
    - Khi `error === true`: trả về `null` (ẩn component, không hiện thông báo lỗi)
    - Khi `loading === true`: trả về `null` để tránh flash nội dung sai (Property 6)
    - Khi `!userId`: trả về `null` ngay lập tức
    - Đọc `status` từ `useOnlineStatusCached` (nếu hook trả về `status` field) hoặc suy luận từ `isOnline` + `lastActive`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

- [x] 5. Checkpoint — Kiểm tra core utilities và components
  - Đảm bảo tất cả unit test và property test cho `formatLastSeen`, `useOnlineStatusCache`, `StatusIndicator`, `OnlineStatus` đều pass.
  - Hỏi người dùng nếu cần điều chỉnh trước khi tích hợp UI.

- [x] 6. Tích hợp `StatusIndicator` vào `ConversationsList`
  - [x] 6.1 Cập nhật `src/components/ConversationsList.tsx` render indicator trên mỗi avatar
    - Bọc avatar của mỗi conversation item trong container `position: relative`
    - Gọi `useOnlineStatusCached(otherUserId)` cho mỗi item
    - Render `<StatusIndicator status="online" size="small" position="bottom-right" showTooltip aria-label="Đang hoạt động" role="img" />` chỉ khi `!loading && isOnline`
    - Khi `status === 'offline'` hoặc `loading === true`: không render `StatusIndicator` (ẩn hoàn toàn)
    - Thêm `aria-live="polite"` trên container danh sách để thông báo thay đổi trạng thái cho screen reader
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 9.4, 9.5_

  - [-]* 6.2 Viết unit test cho ConversationsList — indicator rendering
    - Test: `isOnline === true && !loading` → render dot; `isOnline === false` → không render dot; `loading === true` → không render dot
    - Test: lỗi Presence_System → ẩn dot, không crash, không hiện thông báo lỗi
    - _Requirements: 2.4, 2.7_

- [x] 7. Tích hợp `OnlineStatus` vào `Chat`
  - [x] 7.1 Cập nhật `src/components/Chat.tsx` render `OnlineStatus` trong header
    - Tìm phần header hiển thị tên người nhận trong component `Chat`
    - Thêm `<OnlineStatus userId={receiverUid} size="sm" showText />` bên dưới tên người nhận
    - Guard: không render `OnlineStatus` khi `receiverUid` là `null`, `undefined`, hoặc chuỗi rỗng
    - Khi `loading === true`: render skeleton/placeholder text thay vì `OnlineStatus` để tránh flash (Req 4.7)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x]* 7.2 Viết unit test cho Chat — online status trong header
    - Test: `receiverUid` hợp lệ → render `OnlineStatus`; `receiverUid` null/undefined → không render
    - Test: `loading === true` → hiển thị trạng thái chờ, không render `OnlineStatus`
    - Test: lỗi Presence_System → hiển thị `"Không hoạt động"`, không crash
    - _Requirements: 4.5, 4.7, 4.8_

- [x] 8. Tích hợp `OnlineStatus` vào `ProfileCard`
  - [x] 8.1 Cập nhật `src/components/ProfileCard.tsx` render `OnlineStatus` dưới tên người dùng
    - Thêm `<OnlineStatus userId={userId} size="md" showText />` bên dưới tên người dùng trong `ProfileCard`
    - Guard: không render `OnlineStatus` khi `userId === currentUserId` (đang xem profile của chính mình, Req 3.6)
    - `OnlineStatus` tự xử lý `loading` và `error` state bên trong (không cần wrapper loading ở đây)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [-]* 8.2 Viết unit test cho ProfileCard — online status rendering
    - Test: `userId !== currentUserId` → render `OnlineStatus`; `userId === currentUserId` → không render
    - Test: `lastActive === null` → hiển thị `"Không hoạt động"`, không crash
    - _Requirements: 3.5, 3.6_

- [x] 9. Checkpoint — Kiểm tra tích hợp UI
  - Đảm bảo tất cả unit test cho `ConversationsList`, `Chat`, `ProfileCard` đều pass.
  - Kiểm tra: indicator hiển thị đúng, không flash khi loading, ẩn đúng khi offline/error.
  - Hỏi người dùng nếu cần điều chỉnh trước khi cập nhật Security Rules.

- [x] 10. Cập nhật Firebase Security Rules
  - [x] 10.1 Cập nhật `database.rules.json` theo logic trong design
    - Cập nhật rule `.read` cho path `presence/$userId`: từ chối đọc khi `invisibleMode === true` (trừ chủ sở hữu), từ chối khi reader bị chặn (`blocked[auth.uid]` tồn tại)
    - Đảm bảo logic hiện tại không bị break (các rule `.write`, `.validate` giữ nguyên)
    - Logic mới: `auth.uid === $userId || (invisibleMode === false && !blocked[auth.uid].exists())`
    - Ghi chú file CHECKLIST_DEPLOY_RULES.txt nếu cần deploy sau
    - _Requirements: 7.1, 7.2, 7.3, 7.6_

- [x] 11. Kiểm thử round-trip serialization (Property 5)
  - [x]* 11.1 Viết property test cho round-trip UserStatus serialization (Property 5)
    - **Property 5: Round-trip UserStatus serialization**
    - Dùng `fast-check` với `fc.constantFrom('online', 'away', 'offline')`: `JSON.parse(JSON.stringify(status)) === status`
    - Mở rộng: test serialize → parse toàn bộ `StatusCacheEntry` object vẫn giữ nguyên `isOnline` và `lastActive`
    - **Validates: Requirements 10.3**

- [x] 12. Checkpoint cuối — Đảm bảo tất cả tests pass
  - Chạy toàn bộ test suite (`vitest --run`)
  - Kiểm tra không có TypeScript errors (`tsc --noEmit`)
  - Xác nhận tất cả property tests pass với ít nhất 100 iterations
  - Đảm bảo tất cả tests pass, hỏi người dùng nếu có vấn đề phát sinh.

## Notes

- Tasks đánh dấu `*` là optional, có thể bỏ qua khi cần MVP nhanh
- Thư viện property-based testing: `fast-check` (đã có trong dự án từ spec `user-activity-status`)
- Mỗi property test cần ít nhất 100 iterations
- **Không implement lại từ đầu**: các module `StatusManager`, `usePresenceManager`, `useActivityDetector` đã hoàn chỉnh từ spec `user-activity-status` — chỉ cần hoàn thiện theo gap analysis
- `formatLastSeen` hiện tại trong `useOnlineStatus.ts` thiếu: xử lý diff âm (clock skew), ngưỡng 7 ngày (hiện có "vài tuần"), và thiếu test → tách ra `src/utils/formatLastSeen.ts` và bổ sung
- `useOnlineStatusCache` hiện tại chưa phân biệt permission error vs network error — cần cập nhật task 2.1
- `StatusIndicator` hiện tại có `minWidth/minHeight: 44` trực tiếp trên dot div gây layout issue → fix trong task 3.1
- Firebase Security Rules: `database.rules.json` hiện tại thiếu logic `invisibleMode` chặn read từ người khác — task 10.1 bổ sung
- Sau khi cập nhật `database.rules.json`, nhớ deploy: `firebase deploy --only database`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["6.1", "7.1", "8.1", "11.1"] },
    { "id": 5, "tasks": ["6.2", "7.2", "8.2", "10.1"] }
  ]
}
```
