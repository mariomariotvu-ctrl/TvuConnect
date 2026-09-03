# Implementation Plan: Active Profile Display

## Overview

Tích hợp dữ liệu trạng thái hoạt động từ Firebase Realtime Database vào pipeline ghép đôi, ưu tiên hiển thị hồ sơ đang online/mới hoạt động lên đầu kết quả và bổ sung Activity_Badge trực quan lên từng thẻ hồ sơ. Triển khai theo nguyên tắc fail-gracefully: mọi lỗi fetch đều fallback về Matching_Score thuần.

## Tasks

- [x] 1. Tạo types và cấu trúc dữ liệu nền tảng
  - Thêm interface `ActivityData`, `RawPresenceData` vào `src/types.ts` hoặc export trực tiếp từ `activityBooster.ts`
  - Định nghĩa `ProfileWithScore` interface với các trường: `profile`, `matchingScore`, `activeScore`, `compositeScore`
  - Định nghĩa `ActivityStatus` type (`'online' | 'away' | 'offline'`)
  - _Requirements: 1.1, 1.2, 7.1, 7.2_

- [x] 2. Implement `src/utils/activityBooster.ts` — pure functions
  - [x] 2.1 Implement `parsePresenceData` và `formatPresenceData`
    - Parse `lastActive` từ cả Unix timestamp (number) và ISO string; NaN → 0
    - Parse `status`: chỉ giữ `'online'|'away'|'offline'`, còn lại fallback `'offline'`
    - Parse `settings.invisibleMode`
    - `formatPresenceData` serialize ngược lại thành `RawPresenceData`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x]* 2.2 Viết property test cho `parsePresenceData` và `formatPresenceData` (fast-check)
    - **Property 6: Parse lastActive Unix ms = parse ISO string**
    - **Validates: Requirements 7.1**
    - **Property 7: Status không hợp lệ → fallback 'offline'**
    - **Validates: Requirements 7.2**
    - **Property 8: Round-trip parse→format→parse cho kết quả tương đương**
    - **Validates: Requirements 7.3**
    - Sử dụng `fc.assert(fc.property(...), { numRuns: 200 })` trong `src/utils/activityBooster.pbt.test.ts`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 2.3 Implement `calculateActiveScore`
    - `status === 'online'` → 100 (kiểm tra trước, không phụ thuộc `lastActive`)
    - `lastActive ≤ 1h` → 80, `≤ 6h` → 60, `≤ 24h` → 40, `≤ 7d` → 20, còn lại → 0
    - Input `null` → trả về 0, không throw
    - _Requirements: 1.1, 1.3_

  - [x]* 2.4 Viết property test cho `calculateActiveScore` (fast-check)
    - **Property 1: Active_Score ∈ {0, 20, 40, 60, 80, 100}**
    - **Validates: Requirements 1.1**
    - **Property 10: calculateActiveScore mode-independent (hàm không nhận tham số mode)**
    - **Validates: Requirements 5.1**
    - Chạy tối thiểu 200 iterations
    - _Requirements: 1.1, 5.1_

  - [x] 2.5 Implement `calculateCompositeScore`
    - Công thức: `matchingScore × 0.7 + activeScore × 0.3`
    - Input range [0, 100] cho cả hai tham số
    - _Requirements: 1.2_

  - [x]* 2.6 Viết property test cho `calculateCompositeScore` (fast-check)
    - **Property 2: compositeScore = 0.7×matching + 0.3×active (±1e-9)**
    - **Validates: Requirements 1.2**
    - Chạy 500 iterations với `fc.float({ min: 0, max: 100, noNaN: true })`
    - _Requirements: 1.2_

  - [x] 2.7 Implement `isStaleProfile`
    - Trả về `true` khi `lastActive > 7 ngày` hoặc `data === null`
    - _Requirements: 4.3_

  - [x] 2.8 Implement `applyActivityBooster`
    - Nhận `Array<{ profile, score }>` và `Map<string, ActivityData>`
    - Tính `activeScore` cho từng profile qua `calculateActiveScore`
    - Tính `compositeScore` qua `calculateCompositeScore`
    - Sort kết quả theo `compositeScore` giảm dần
    - UID không có trong `presenceMap` → `activeScore = 0`
    - _Requirements: 1.2, 1.4, 4.1, 5.2_

  - [x]* 2.9 Viết property test cho `applyActivityBooster` (fast-check)
    - **Property 3: Kết quả được sắp xếp theo compositeScore giảm dần**
    - **Validates: Requirements 1.4, 4.1**
    - **Property 5: presenceMap rỗng → thứ tự tương đối theo matchingScore không đổi**
    - **Validates: Requirements 6.2**
    - Dùng arbitrary generator cho `StudentProfile` mock (chỉ cần trường `uid`)
    - _Requirements: 1.4, 4.1, 6.2_

  - [x] 2.10 Implement `limitStaleProfiles`
    - Giới hạn ≤ 2 Stale_Profile trong batch
    - Khi tất cả đều stale: log warning, trả về bình thường (không chặn)
    - _Requirements: 4.3, 4.4_

  - [x]* 2.11 Viết property test cho `limitStaleProfiles` (fast-check)
    - **Property 9: stale ≤ 2 khi có ≥ 2 non-stale trong danh sách**
    - **Validates: Requirements 4.3**
    - _Requirements: 4.3_

- [x] 3. Implement `src/utils/batchStatusFetcher.ts` — I/O + cache
  - [x] 3.1 Implement cache layer (`BATCH_CACHE_TTL_MS = 60_000`)
    - Cache key: `JSON.stringify(sorted_uids)`
    - `clearBatchStatusCache()` xóa toàn bộ cache (dùng trong tests)
    - `getBatchStatusCacheStats()` trả về `{ size, oldestEntryAgeMs }`
    - _Requirements: 2.4_

  - [x] 3.2 Implement `batchFetchPresenceStatus`
    - Nhận `uids: string[]`; UIDs rỗng → trả về `Map()` ngay
    - Check cache trước: nếu hit và còn TTL → trả về cached data, không gọi Firebase
    - Fetch từ `ref(realtimeDb, 'presence')` dùng `get()` (không dùng `onSnapshot`)
    - Timeout 2s qua `Promise.race` với `setTimeout`
    - Mọi lỗi (Firebase error, timeout, parse error) → trả về `Map()` rỗng, không throw
    - Parse từng entry qua `parsePresenceData`, skip UID nếu parse thất bại
    - Lưu kết quả vào cache sau khi fetch thành công
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.4_

  - [x]* 3.3 Viết unit tests cho `batchStatusFetcher` với Firebase mock
    - **Property 4: Cache idempotent — fetch thứ 2 trong 60s = same result, không gọi Firebase**
    - **Validates: Requirements 2.4**
    - Mock `firebase/database` với `vi.mock`
    - Test: UIDs rỗng → Map rỗng, không gọi `get()`
    - Test: Firebase timeout → Map rỗng sau 2s
    - Test: Firebase lỗi → Map rỗng, không throw
    - Test: Cache hit — fetch lần 2 trong TTL không gọi `get()` thêm
    - Test: Cache miss sau TTL — gọi lại Firebase
    - Dùng `vi.useFakeTimers()` để kiểm soát thời gian
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Checkpoint — Đảm bảo tất cả unit tests và property tests của utils pass
  - Chạy `npx vitest --run src/utils/activityBooster` và `npx vitest --run src/utils/batchStatusFetcher`
  - Đảm bảo tất cả tests pass, hỏi người dùng nếu có vấn đề phát sinh.

- [x] 5. Cập nhật `src/services/matchingService.ts`
  - [x] 5.1 Thêm `activityDataMap` và `isInOnlineBatch` vào `MatchingServiceResult`
    - `activityDataMap: Map<string, ActivityData>` — dữ liệu activity cho từng uid
    - `isInOnlineBatch: boolean` — true khi batch có ít nhất 1 online VÀ ít nhất 1 offline
    - _Requirements: 3.2, 4.2_

  - [x] 5.2 Tích hợp Activity_Booster vào `fetchMatchingProfiles`
    - Sau bước `calculateMatchingScore`, thêm:
      1. `batchFetchPresenceStatus(uids)` — bọc trong try/catch, fallback `Map()` rỗng
      2. `applyActivityBooster(profilesWithScores, presenceMap)` → `profilesWithBoost`
      3. Sort theo `compositeScore` giảm dần
      4. `limitStaleProfiles(sortedProfiles, 4)`
      5. Lấy top 4 profiles
    - Tính `isInOnlineBatch` từ top 4: có ít nhất 1 online VÀ ít nhất 1 không online
    - Trả về `activityDataMap` chứa ActivityData của top 4 profiles
    - Đảm bảo fallback path (Map rỗng) vẫn trả về profiles theo Matching_Score
    - _Requirements: 1.2, 1.4, 2.2, 4.1, 4.2, 4.3, 5.2, 6.2_

  - [x] 5.3 Cập nhật `loadOneMoreProfile` để nhất quán
    - Trả về thêm `activityData?: ActivityData` cho profile mới load
    - Nếu batchStatusFetcher đã cache → dùng cache, không fetch lại
    - _Requirements: 2.4, 5.2_

- [x] 6. Cập nhật `src/hooks/useCachedMatching.ts`
  - [x] 6.1 Thêm `activityDataMap` và `isInOnlineBatch` vào `UseCachedMatchingResult`
    - State: `activityDataMap: Map<string, ActivityData>` (khởi tạo `new Map()`)
    - State: `isInOnlineBatch: boolean` (khởi tạo `false`)
    - Cập nhật `startMatching`: sau `fetchMatchingProfiles`, set cả 2 state từ `result`
    - Export 2 fields mới trong return object
    - _Requirements: 3.2, 4.2_

- [x] 7. Cập nhật `src/components/matching/ProfileCard.tsx`
  - [x] 7.1 Thêm props `activityData` và `isInOnlineBatch` vào interface
    - `activityData?: ActivityData | null`
    - `isInOnlineBatch?: boolean`
    - Cập nhật `React.memo` comparator để so sánh `activityData?.status` và `activityData?.lastActive`
    - _Requirements: 3.1, 3.6, 6.3_

  - [x] 7.2 Implement component `ActivityBadge` (inline trong file hoặc tách riêng)
    - `status === 'online'` → dot `#22c55e` (green-500), 10×10px, viền trắng 2px
    - `lastActive ≤ 24h` nhưng không online → dot `#f59e0b` (amber-400), 10×10px, viền trắng 2px
    - `lastActive > 24h` (strictly) → không render
    - Đặt `position: absolute; bottom: 0; right: 0` bên trong wrapper avatar
    - Không render khi `invisibleMode === true`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 7.3 Implement component `ActivityStatusText`
    - `status === 'online'` → "● Online" màu `#22c55e`
    - `lastActive ≤ 1h` → "Vừa hoạt động" màu xanh lá nhạt
    - `lastActive ≤ 24h` → "Hoạt động X giờ trước" màu xám
    - `> 24h` hoặc không có data → không render
    - Không render khi `invisibleMode === true`
    - _Requirements: 3.5, 3.6_

  - [x] 7.4 Thêm nhãn "🟢 Đang online" và wire tất cả vào render
    - Nhãn "🟢 Đang online" phía trên tên: chỉ khi `status === 'online'` VÀ `isInOnlineBatch === true`
    - Thêm `ActivityBadge` vào góc dưới-phải avatar (relative wrapper + absolute badge)
    - Thêm `ActivityStatusText` bên cạnh tên người dùng
    - `activityData === null/undefined` → không render badge, không crash
    - _Requirements: 3.1, 3.2, 3.5, 4.2_

- [x] 8. Cập nhật `src/components/matching/MatchingResults.tsx`
  - [x] 8.1 Thêm props `activityDataMap` và `isInOnlineBatch` vào `MatchingResultsProps`
    - `activityDataMap: Map<string, ActivityData>`
    - `isInOnlineBatch: boolean`
    - _Requirements: 3.1, 4.2_

  - [x] 8.2 Truyền `activityData` và `isInOnlineBatch` xuống mỗi `ProfileCard`
    - `activityData={activityDataMap.get(profile.uid)}`
    - `isInOnlineBatch={isInOnlineBatch}`
    - Wrap `activityDataMap` trong `useMemo` để tránh re-render không cần thiết
    - _Requirements: 3.1, 6.3_

- [x] 9. Cập nhật `src/components/Matching.tsx`
  - [x] 9.1 Destructure `activityDataMap` và `isInOnlineBatch` từ `useCachedMatching`
    - Thêm 2 trường vào destructuring của hook result
    - _Requirements: 3.1, 4.2_

  - [x] 9.2 Truyền `activityDataMap` và `isInOnlineBatch` xuống `MatchingResults`
    - Thêm 2 props vào `<MatchingResults ... />`
    - _Requirements: 3.1, 4.2_

- [x] 10. Checkpoint — Đảm bảo pipeline tích hợp hoạt động đúng
  - Kiểm tra TypeScript không có lỗi: `npx tsc --noEmit`
  - Hỏi người dùng nếu có lỗi type cần giải quyết.

- [x] 11. Viết component tests cho `ProfileCard` với activity data
  - [x]* 11.1 Viết tests cho `ActivityBadge` và `ActivityStatusText` trong `src/components/matching/ProfileCard.activity.test.tsx`
    - `activityData.status === 'online'` → badge dot xanh xuất hiện trong DOM
    - `lastActive < 24h`, không online → badge dot vàng xuất hiện
    - `lastActive > 24h` → không có badge
    - `invisibleMode === true` → không badge, không status text
    - `activityData === null` → không badge, không crash
    - Nhãn "🟢 Đang online" xuất hiện khi `isInOnlineBatch = true` và online
    - Nhãn "🟢 Đang online" KHÔNG xuất hiện khi `isInOnlineBatch = false`
    - Dùng `@testing-library/react` và `vi.fn()` cho mock handlers
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2_

- [x] 12. Checkpoint cuối — Chạy toàn bộ test suite để xác nhận
  - Chạy `npx vitest --run` để chạy tất cả tests
  - Đảm bảo tất cả 10 properties pass, unit tests pass, component tests pass
  - Kiểm tra không có regression từ các test hiện có
  - Hỏi người dùng nếu có bất kỳ vấn đề nào phát sinh.

## Notes

- Tasks có dấu `*` là optional — có thể bỏ qua để MVP nhanh hơn
- Mỗi task tham chiếu requirements cụ thể để dễ trace
- `activityBooster.ts` là pure functions, không import Firebase — dễ test hoàn toàn
- `batchStatusFetcher.ts` xử lý mọi lỗi nội bộ, không bao giờ throw ra ngoài
- Property tests nằm trong `activityBooster.pbt.test.ts`, unit tests trong `activityBooster.test.ts`
- `ProfileCard` trong `src/components/matching/` (không phải `src/components/ProfileCard.tsx`)
- `realtimeDb` import từ `src/firebase.ts`, đã được export sẵn

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.7"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.8", "3.2"] },
    { "id": 3, "tasks": ["2.6", "2.9", "2.10", "3.3"] },
    { "id": 4, "tasks": ["2.11", "5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["5.3", "6.1"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3"] },
    { "id": 9, "tasks": ["7.4", "8.1"] },
    { "id": 10, "tasks": ["8.2", "9.1"] },
    { "id": 11, "tasks": ["9.2"] },
    { "id": 12, "tasks": ["11.1"] }
  ]
}
```
