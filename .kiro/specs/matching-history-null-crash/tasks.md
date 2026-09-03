# Implementation Plan

## Overview

Bugfix crash `TypeError: undefined is not an object (evaluating 'e.matchedProfile.photoURL')` khi MatchingHistory render Match document thiếu matchedProfile. Fix đã được implement tại 4 lớp (hook, component, type, caller). Các tasks tập trung vào việc viết tests để verify fix hoạt động đúng và không có regression.

## Tasks

- [-] 1. Viết bug condition exploration test
  - **Property 1: Bug Condition** — Null matchedProfile không gây crash
  - **QUAN TRỌNG**: Fix đã được implement. Test này phải PASS trên code hiện tại để xác nhận fix hoạt động đúng.
  - **GOAL**: Verify rằng `useMatchingHistory` filter bỏ documents có `matchedProfile = null/undefined` và `MatchingHistory` không crash khi gặp item không hợp lệ
  - **Scoped PBT Approach**: Scope property vào các concrete cases: `matchedProfile = null`, `matchedProfile = undefined`, `matchedProfile` missing field
  - Test rằng `useMatchingHistory` filter bỏ document có `matchedProfile = null` — document đó không xuất hiện trong kết quả trả về
  - Test rằng `useMatchingHistory` filter bỏ document có `matchedProfile = undefined`
  - Test rằng `MatchingHistory` render với item có `matchedProfile = null` không crash và trả về `null` cho item đó
  - Test rằng guard trong `Matching.tsx` không gọi `handleProfileClick` khi `match.matchedProfile` là null/undefined
  - Các test phải PASS trên code hiện tại (fix đã có sẵn)
  - Document kết quả: ghi nhận rằng fix hoạt động đúng
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [-] 2. Viết preservation property tests
  - **Property 2: Preservation** — Match document hợp lệ hoạt động như cũ
  - **QUAN TRỌNG**: Áp dụng observation-first methodology — quan sát hành vi hiện tại rồi mới viết assertion
  - Quan sát: `MatchingHistory` render đúng `photoURL`, `fullName`, `major`, timestamp cho match hợp lệ
  - Quan sát: Click vào match item hợp lệ gọi `handleProfileClick` với đúng `StudentProfile`
  - Quan sát: Deduplication và filter blocked users trong `useMatchingHistory` hoạt động đúng
  - Viết property-based test: sinh ngẫu nhiên danh sách `Match[]` với `matchedProfile` hợp lệ → verify tất cả được render đầy đủ
  - Viết property-based test: mix hợp lệ và không hợp lệ → verify chỉ items hợp lệ xuất hiện, count đúng
  - Test nút "Xem thêm lịch sử" và logic `hasMoreHistory` không bị ảnh hưởng
  - Test empty list → component trả về `null` (không render gì cả)
  - Các test phải PASS trên code hiện tại
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix cho lỗi crash null matchedProfile trong MatchingHistory

  - [x] 3.1 Implement fix tại tất cả các lớp
    - **ĐÃ HOÀN THÀNH** — Fix đã được implement trong source code
    - `src/hooks/useMatchingHistory.ts`: `const validMatches = matches.filter(m => m.matchedProfile != null)` ✅
    - `src/components/matching/MatchingHistory.tsx`: `if (!match.matchedProfile) return null` trong render ✅
    - `src/types.ts`: `matchedProfile?: StudentProfile | null` (optional với comment giải thích) ✅
    - `src/components/Matching.tsx`: `onProfileClick={(match) => match.matchedProfile && handleProfileClick(match.matchedProfile)}` ✅
    - _Bug_Condition: isBugCondition(match) where match.matchedProfile = null OR undefined_
    - _Expected_Behavior: filter bỏ document không hợp lệ, skip render item, không gọi handleProfileClick với null_
    - _Preservation: Match document hợp lệ tiếp tục render và hoạt động đúng_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [-] 3.2 Verify bug condition exploration test pass
    - **Property 1: Expected Behavior** — Null matchedProfile không gây crash
    - **QUAN TRỌNG**: Chạy lại ĐÚNG test từ task 1 — KHÔNG viết test mới
    - Test từ task 1 encode expected behavior — khi pass, xác nhận fix hoạt động đúng
    - Chạy bug condition exploration test từ bước 1
    - **KẾT QUẢ MONG ĐỢI**: Tất cả tests PASS
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [-] 3.3 Verify preservation tests vẫn pass
    - **Property 2: Preservation** — Match document hợp lệ hoạt động như cũ
    - **QUAN TRỌNG**: Chạy lại ĐÚNG tests từ task 2 — KHÔNG viết tests mới
    - Chạy preservation property tests từ bước 2
    - **KẾT QUẢ MONG ĐỢI**: Tất cả tests PASS (không có regression)
    - Xác nhận toàn bộ hành vi hiện tại với match hợp lệ được giữ nguyên

- [~] 4. Checkpoint — Đảm bảo tất cả tests pass
  - Chạy toàn bộ test suite để đảm bảo không có regression
  - Verify không có TypeScript errors liên quan đến `matchedProfile` sau khi type đã được cập nhật
  - Hỏi user nếu có câu hỏi hoặc cần điều chỉnh

## Notes

- Fix đã được implement đầy đủ trong source code — tasks chủ yếu tập trung verify
- `useMatchingHistory.ts` dùng `!= null` để filter cả `null` lẫn `undefined`
- `MatchingHistory.tsx` dùng `!match.matchedProfile` làm null guard tại component layer
- Chạy tests bằng `npx vitest --run` (không dùng watch mode)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.2", "3.3"] },
    { "id": 2, "tasks": ["4"] }
  ]
}
```
