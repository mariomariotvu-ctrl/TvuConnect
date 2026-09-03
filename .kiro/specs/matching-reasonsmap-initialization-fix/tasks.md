# Implementation Plan

## Overview

Sửa lỗi initialization order của biến `reasonsMap` trong component `Matching.tsx`. Biến `reasonsMap` được dùng trong `handleProfileClick` callback (dòng 64) trước khi nó được khai báo bằng `useMemo` hook (dòng 148), vi phạm temporal dead zone trong JavaScript. Fix: di chuyển khai báo `reasonsMap` lên trước `handleProfileClick`.

## Tasks

- [x] 1. Viết bug condition exploration test
  - **Property 1: Bug Condition** - Component Crash Do ReasonsMap Initialization Order
  - **QUAN TRỌNG**: Test này PHẢI FAIL trên code chưa sửa - failure xác nhận lỗi tồn tại
  - **KHÔNG cố gắng sửa test hoặc code khi test fail**
  - **LƯU Ý**: Test này mô tả hành vi mong muốn - nó sẽ validate fix khi pass sau khi implement
  - **MỤC TIÊU**: Tạo counterexamples chứng minh lỗi tồn tại
  - **Phương pháp Scoped PBT**: Scope property vào các trường hợp cụ thể bị lỗi (4 matching modes)
  - Test implementation details từ Bug Condition trong design:
    - Test rằng component Matching render thành công với mode='lover' (không throw ReferenceError)
    - Test rằng component Matching render thành công với mode='study' (không throw ReferenceError)
    - Test rằng component Matching render thành công với mode='hobby' (không throw ReferenceError)
    - Test rằng component Matching render thành công với mode='quick' (không throw ReferenceError)
    - Test rằng handleProfileClick callback có thể access reasonsMap khi được call
  - Test assertions phải match Expected Behavior Properties từ design:
    - `no_reference_error(result)` - Component không throw ReferenceError
    - `component_renders_successfully(result)` - Component mount thành công
    - `handleProfileClick_can_access_reasonsMap(result)` - Callback có thể truy cập reasonsMap
  - Chạy test trên code CHƯA SỬA (Matching.tsx với reasonsMap ở dòng 148)
  - **KẾT QUẢ MONG ĐỢI**: Test FAIL (điều này đúng - nó chứng minh lỗi tồn tại)
  - Document các counterexamples tìm được (ví dụ: "ReferenceError: Cannot access 'reasonsMap' before initialization")
  - Đánh dấu task hoàn thành khi test đã được viết, chạy, và failure đã được ghi lại
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Viết preservation property tests (TRƯỚC KHI implement fix)
  - **Property 2: Preservation** - Matching Functionality Không Đổi
  - **QUAN TRỌNG**: Tuân theo phương pháp observation-first
  - Quan sát hành vi trên code CHƯA SỬA cho các runtime behaviors (nếu có thể mock reasonsMap để component mount được)
  - Viết property-based tests capture các hành vi đã quan sát từ Preservation Requirements
  - Property-based testing tạo nhiều test cases tự động để đảm bảo mạnh mẽ hơn
  - Test cases preservation:
    - Test handleProfileClick gọi trackProfileClick với matchScore chính xác (số lượng matching reasons)
    - Test handleProfileClick gọi onMatchFound callback với profile đúng
    - Test reasonsMap được tính toán từ getMatchingReasons() với currentProfile, profile, và mode đúng
    - Test reasonsMap re-compute khi matchedProfiles, currentProfile, hoặc mode thay đổi
    - Test MatchingResults component nhận reasonsMap prop và hiển thị matching reasons đúng
    - Test matching logic cho các modes khác nhau: lover, study, hobby, quick
    - Test edge case: currentProfile = null → reasonsMap có empty arrays
  - Chạy tests trên code CHƯA SỬA (hoặc với mock setup nếu cần)
  - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận hành vi baseline cần bảo toàn)
  - Đánh dấu task hoàn thành khi tests đã viết, chạy, và pass trên code chưa sửa
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Sửa lỗi initialization order của reasonsMap

  - [x] 3.1 Implement fix trong src/components/Matching.tsx
    - **Solution**: Di chuyển useMemo reasonsMap từ dòng 148 lên vị trí sau useCachedMatching hook (sau dòng 52)
    - **Bước 1**: Mở file `src/components/Matching.tsx`
    - **Bước 2**: Tìm block code useMemo reasonsMap (dòng 148-156):
      ```typescript
      const reasonsMap = useMemo(() => {
        const map = new Map<string, string[]>();
        matchedProfiles.forEach(profile => {
          const reasons = currentProfile ? getMatchingReasons(currentProfile, profile, mode) : [];
          map.set(profile.uid, reasons);
        });
        return map;
      }, [matchedProfiles, currentProfile, mode]);
      ```
    - **Bước 3**: Cut block code này (xóa khỏi vị trí cũ)
    - **Bước 4**: Paste block code vào vị trí mới - ngay sau useCachedMatching hook (khoảng sau dòng 52, trước useCallback handleFiltersChange)
    - **Bước 5**: Verify dependencies order đúng:
      - `matchedProfiles` có từ useCachedMatching hook (dòng 46-52) ✓
      - `currentProfile` state đã được khai báo (dòng 41) ✓
      - `mode` là prop từ component ✓
      - Tất cả dependencies đã available ở vị trí mới ✓
    - **Bước 6**: Giữ nguyên handleProfileClick callback ở dòng 64 với dependency `[reasonsMap, currentUser.uid, onMatchFound]`
    - **Bước 7**: Verify logic không thay đổi:
      - Giữ nguyên logic tính toán: `getMatchingReasons(currentProfile, profile, mode)`
      - Giữ nguyên dependencies: `[matchedProfiles, currentProfile, mode]`
      - Chỉ thay đổi vị trí khai báo
    - **Lưu ý**: Không refactor logic, không thay đổi implementation, chỉ di chuyển code block
    - _Bug_Condition: isBugCondition(input) where input.handleProfileClick_line < input.reasonsMap_line AND input.handleProfileClick_dependencies.includes('reasonsMap')_
    - _Expected_Behavior: Component render thành công, handleProfileClick có thể access reasonsMap an toàn_
    - _Preservation: Tất cả logic matching, tracking analytics, hiển thị matching reasons, và re-rendering behavior phải hoạt động giống hệt như trước_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test giờ đây pass
    - **Property 1: Expected Behavior** - Component Renders Without ReferenceError
    - **QUAN TRỌNG**: Chạy lại test GIỐNG HỆT từ task 1 - KHÔNG viết test mới
    - Test từ task 1 mô tả hành vi mong muốn
    - Khi test này pass, nó xác nhận hành vi mong muốn đã được thỏa mãn
    - Chạy bug condition exploration test từ task 1
    - **KẾT QUẢ MONG ĐỢI**: Test PASS (xác nhận lỗi đã được sửa)
    - Verify component render thành công với tất cả 4 modes
    - Verify handleProfileClick có thể access reasonsMap
    - Verify không có ReferenceError trong console
    - _Requirements: Expected Behavior Properties từ design_

  - [x] 3.3 Verify preservation tests vẫn pass
    - **Property 2: Preservation** - Matching Functionality Unchanged
    - **QUAN TRỌNG**: Chạy lại tests GIỐNG HỆT từ task 2 - KHÔNG viết tests mới
    - Chạy preservation property tests từ task 2
    - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận không có regressions)
    - Confirm handleProfileClick vẫn track analytics với matchScore đúng
    - Confirm handleProfileClick vẫn gọi onMatchFound callback
    - Confirm reasonsMap vẫn tính toán đúng từ getMatchingReasons()
    - Confirm reasonsMap re-compute khi dependencies thay đổi
    - Confirm MatchingResults hiển thị matching reasons chính xác

- [x] 4. Checkpoint - Đảm bảo tất cả tests pass
  - Chạy tất cả tests (bug condition + preservation) và verify tất cả đều pass
  - Test thủ công với tất cả 4 matching modes:
    - Mode 'lover': Mở tab "Tìm người yêu" → Click "Bắt đầu ghép cặp" → Verify component render và profiles hiển thị
    - Mode 'study': Mở tab "Bạn cùng học" → Click "Bắt đầu ghép cặp" → Verify component render và profiles hiển thị
    - Mode 'hobby': Mở tab "Sở thích chung" → Click "Bắt đầu ghép cặp" → Verify component render và profiles hiển thị
    - Mode 'quick': Mở tab "Kết nối nhanh" → Click "Bắt đầu ghép cặp" → Verify component render và profiles hiển thị
  - Test profile click behavior:
    - Click vào profile card → Verify navigate to profile detail
    - Verify analytics tracking được gọi với matchScore đúng
    - Verify matching reasons hiển thị đúng trong UI
  - Test filters và re-render:
    - Thay đổi filters → Verify reasonsMap được re-compute
    - Change matching mode → Verify reasons được tính lại đúng
  - Verify không có console errors hoặc warnings
  - Verify không có ReferenceError
  - Test với currentProfile = null edge case
  - Hỏi user nếu có câu hỏi phát sinh

## Notes

- Chỉ di chuyển vị trí khai báo `reasonsMap` — không thay đổi logic hay dependencies
- File cần sửa: `src/components/Matching.tsx`
- Chạy tests bằng `npx vitest --run`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
