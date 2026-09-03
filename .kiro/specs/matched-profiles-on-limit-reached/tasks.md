# Implementation Plan: Matched Profiles On Limit Reached

## Overview

Thêm `MatchedProfilesSection` component vào `Matching.tsx` để hiển thị danh sách hồ sơ đã ghép kèm nút "Nhắn tin" khi người dùng hết lượt ghép cặp (`remainingMatches === 0`). Tận dụng hoàn toàn `useMatchingHistory` hook và hạ tầng Firestore hiện có — chỉ thêm mới, không sửa logic cũ.

## Tasks

- [x] 1. Tạo component `MatchedProfilesSection` với toàn bộ state views
  - [x] 1.1 Tạo file `src/components/matching/MatchedProfilesSection.tsx` với interface props và skeleton loader
    - Định nghĩa interface `MatchedProfilesSectionProps` với các props: `matchHistory: Match[]`, `hasMoreHistory: boolean`, `loadMore: () => void`, `isLoading: boolean`, `error: string | null`, `onStartChat: (profile: StudentProfile) => void`
    - Implement skeleton loader: khi `isLoading === true` render ≥3 placeholder item với `aria-busy="true"` và `aria-label="Đang tải hồ sơ"`
    - Thêm `data-testid="matched-profiles-section"` vào root element của component
    - Import `Match`, `StudentProfile` từ `../../types`
    - _Requirements: 1.4, 7.4, 7.5_

  - [x] 1.2 Implement header section và các state views (empty, error)
    - Render tiêu đề "Kết nối lại với hồ sơ đã ghép" kèm icon (History hoặc Heart từ lucide-react) và dòng mô tả phụ "Nhắn tin ngay để không bỏ lỡ cơ hội kết nối"
    - Implement empty state: khi `matchHistory` rỗng và `isLoading === false`, hiển thị "Chưa có hồ sơ nào được ghép"
    - Implement error state: khi `error !== null`, hiển thị "Không thể tải danh sách. Vui lòng thử lại." kèm nút "Thử lại" gọi `loadMore()`
    - Font size và màu sắc dark mode compatible, nhất quán với `Matching.tsx`
    - _Requirements: 1.5, 1.6, 1.7, 2.1, 2.2, 2.3_

  - [x] 1.3 Implement `ProfileCardItem` sub-component (inline trong cùng file)
    - Định nghĩa interface `ProfileCardItemProps` với `match: Match` và `onStartChat: (profile: StudentProfile) => void`
    - Render avatar: nếu `photoURL` có giá trị thì dùng `<img>` với `onError` fallback về `UserIcon`; nếu null/undefined thì render `UserIcon` placeholder ngay
    - Render `fullName`, `major` với fallback `"Chưa cập nhật"` khi major là null/undefined/`""`
    - Implement hàm `formatMatchDate`: nhận `Timestamp | null | undefined`, trả về chuỗi `dd/MM/yyyy` (dùng `toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })`) hoặc `"Không rõ ngày"` nếu null/undefined
    - Render ngày ghép với `data-testid="match-date"` và `data-testid="profile-card-item"` trên wrapper
    - Guard: `if (!match.matchedProfile) return null`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.4 Implement `Message_Button` trong `ProfileCardItem` với accessibility
    - Render nút "Nhắn tin" với icon tin nhắn (MessageCircle từ lucide-react) đặt bên phải mỗi thẻ
    - `aria-label="Nhắn tin với {match.matchedProfile.fullName}"` để screen reader phân biệt các nút
    - Kích thước tối thiểu `min-h-[44px] min-w-[44px]` để đảm bảo touch target 44×44px
    - Visual style gradient nhất quán với nút chính trong `Matching.tsx` (ví dụ: `bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500`)
    - Trạng thái hover/active rõ ràng
    - `onClick`: gọi `onStartChat(match.matchedProfile!)` — chỉ gọi khi `matchedProfile` không null
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.5 Implement danh sách `ProfileCardItem` và nút "Xem thêm"
    - Render list: lọc `matchHistory` bỏ qua item có `matchedProfile == null`, map mỗi item thành `<ProfileCardItem>` với `key={match.id ?? match.matchedUid}`
    - Render nút "Xem thêm" chỉ khi `hasMoreHistory === true`; khi `hasMoreHistory === false` không render nút
    - Nhấn "Xem thêm" gọi `loadMore()`
    - _Requirements: 1.3, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4_

- [ ] 2. Viết tests cho `MatchedProfilesSection`
  - [x]* 2.1 Viết unit tests (example-based) trong `src/components/matching/MatchedProfilesSection.test.tsx`
    - `isLoading=true` → ≥3 skeleton items có `aria-busy="true"` trong DOM
    - `matchHistory=[]`, `isLoading=false` → text "Chưa có hồ sơ nào được ghép" xuất hiện
    - `error="some error"` → thông báo lỗi + nút "Thử lại" visible
    - Click "Thử lại" → `loadMore` mock được gọi 1 lần
    - Profile card rendered → button có text "Nhắn tin" present
    - matchHistory có 3 items đều có `matchedProfile` hợp lệ → 3 `ProfileCardItem` rendered
    - matchHistory có 1 item với `matchedProfile = null` → item đó bị skip, không render card
    - Click "Xem thêm" → `loadMore` mock được gọi 1 lần
    - `photoURL=undefined` → `UserIcon` placeholder rendered thay avatar
    - `hasMoreHistory=false` → nút "Xem thêm" không xuất hiện
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 3.2, 3.5, 6.2, 6.4_

  - [ ]* 2.2 Viết PBT — Property 1: Visibility ↔ remainingMatches (fast-check, ≥100 runs)
    - **Property 1: Visibility ↔ remainingMatches condition**
    - **Validates: Requirements 1.1, 1.2, 8.1, 8.2**
    - File: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`
    - Dùng `fc.integer({ min: 0, max: 100 })` cho `remainingMatches`
    - Khi `remaining === 0`: `data-testid="matched-profiles-section"` phải có trong DOM
    - Khi `remaining > 0`: element không tồn tại trong DOM (không phải `display:none`)
    - Cần wrap test trong một component wrapper truyền `remainingMatches` vào `Matching.tsx` hoặc test trực tiếp conditional render

  - [ ]* 2.3 Viết PBT — Property 2: Card count equals valid match count (fast-check, ≥100 runs)
    - **Property 2: Profile card count equals valid match count**
    - **Validates: Requirements 1.3, 3.5**
    - File: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`
    - Dùng `fc.array(arbitraryMatch())` sinh danh sách match ngẫu nhiên
    - `validCount = matches.filter(m => m.matchedProfile != null).length`
    - Số lượng element có `data-testid="profile-card-item"` phải bằng `validCount`

  - [ ]* 2.4 Viết PBT — Property 3: Invalid major fields always display fallback (fast-check, ≥100 runs)
    - **Property 3: Invalid major fields always display fallback**
    - **Validates: Requirements 3.3**
    - File: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`
    - Dùng `fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(''))` cho `major`
    - Với mọi giá trị invalid, text `"Chưa cập nhật"` phải xuất hiện trong DOM

  - [ ]* 2.5 Viết PBT — Property 4: Date formatting produces valid Vietnamese date string (fast-check, ≥100 runs)
    - **Property 4: Date formatting produces valid Vietnamese date string**
    - **Validates: Requirements 3.4**
    - File: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`
    - Dùng `arbitraryTimestamp()` sinh Firestore Timestamp hợp lệ từ `fc.date()`
    - `data-testid="match-date"` phải match regex `/^\d{2}\/\d{2}\/\d{4}$/`
    - Khi `createdAt` null/undefined: phải hiển thị `"Không rõ ngày"`

  - [ ]* 2.6 Viết PBT — Property 5: Message button callback receives correct profile (fast-check, ≥100 runs)
    - **Property 5: Message button callback receives correct profile**
    - **Validates: Requirements 4.2, 4.3**
    - File: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`
    - Dùng `fc.array(arbitraryMatchWithProfile(), { minLength: 1 })`
    - Click nút "Nhắn tin" trên card thứ `i` → `onStartChat` được gọi với đúng `matches[i].matchedProfile`

  - [ ]* 2.7 Viết PBT — Property 6: Load more button visibility matches hasMoreHistory (fast-check, ≥100 runs)
    - **Property 6: Load more button visibility matches hasMoreHistory**
    - **Validates: Requirements 6.2, 6.4**
    - File: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`
    - Dùng `fc.boolean()` cho `hasMoreHistory`
    - `hasMoreHistory=true` → nút "Xem thêm" tồn tại trong DOM
    - `hasMoreHistory=false` → nút "Xem thêm" không tồn tại trong DOM

- [x] 3. Checkpoint — Đảm bảo component hoạt động độc lập
  - Đảm bảo tất cả tests pass, hỏi người dùng nếu có vấn đề phát sinh.

- [x] 4. Cập nhật `Matching.tsx` để tích hợp `MatchedProfilesSection`
  - [x] 4.1 Destructure thêm `isLoading` và `error` từ `useMatchingHistory` trong `Matching.tsx`
    - Tìm dòng `const { matchHistory, hasMoreHistory, loadMore } = useMatchingHistory(...)` hiện có
    - Thêm `isLoading: isHistoryLoading` và `error: historyError` vào destructuring — không thay đổi gì khác trong call
    - Import `MatchedProfilesSection` từ `./matching/MatchedProfilesSection`
    - _Requirements: 7.1, 7.5_

  - [x] 4.2 Thêm conditional render `MatchedProfilesSection` vào JSX của `Matching.tsx`
    - Đặt block `{remainingMatches === 0 && (<MatchedProfilesSection ... />)}` sau `Daily_Limit_Banner` (khối `remainingMatches === 0 ? ...`) và trước `<MatchingResults>`
    - Truyền props: `matchHistory={matchHistory}`, `hasMoreHistory={hasMoreHistory}`, `loadMore={loadMore}`, `isLoading={isHistoryLoading}`, `error={historyError}`, `onStartChat={onMatchFound}`
    - Không thay đổi bất kỳ logic nào khác trong file — nút "Bắt đầu ghép cặp", `MatchingResults`, `MatchingHistory` giữ nguyên
    - _Requirements: 1.1, 1.2, 7.1, 7.2, 7.3, 8.1, 8.2_

- [x] 5. Checkpoint cuối — Kiểm tra tích hợp và TypeScript
  - Chạy `npx tsc --noEmit` để xác nhận không có lỗi type
  - Chạy `npx vitest --run src/components/matching/MatchedProfilesSection` để xác nhận tất cả tests pass
  - Hỏi người dùng nếu có lỗi phát sinh.

## Notes

- Tasks có dấu `*` là optional — có thể bỏ qua để MVP nhanh hơn
- **Nguyên tắc cốt lõi**: Chỉ thêm mới, không sửa logic cũ trong `Matching.tsx` hay `MatchingHistory.tsx`
- `MatchedProfilesSection` nhận toàn bộ state qua props — không gọi hook trực tiếp, tránh double Firestore subscription
- `blockedSet` filtering đã được `useMatchingHistory` xử lý trước khi truyền xuống component — không cần lọc lại
- Conditional render thuần React (không CSS `display:none`) để component unmount hoàn toàn khi `remainingMatches > 0`
- `formatMatchDate` phải dùng `toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })` — output chuẩn là `dd/MM/yyyy`
- PBT file đặt tại `src/components/matching/MatchedProfilesSection.pbt.test.tsx`, cấu hình `numRuns: 100` tối thiểu

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["4.2"] }
  ]
}
```
