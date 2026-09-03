# Implementation Plan

## Overview

Bugfix hai vấn đề spacing trong trang Explore: (1) PlaceList có padding-bottom quá lớn (96px → 24px) — đã hoàn thành; (2) MapView container dùng `height: calc(100vh - 120px)` cố định thay vì flexbox, gây khoảng trắng dưới cùng trên desktop.

## Tasks

## Phase 1: PlaceList Padding Fix (ĐÃ HOÀN THÀNH ✅)

- [x] 1. Viết bug condition exploration test cho PlaceList padding
- [x] 2. Viết preservation property tests cho PlaceList
- [x] 3. Fix PlaceList padding (96px → 24px)
  - [x] 3.1 Implement the fix
  - [x] 3.2 Verify bug condition test pass
  - [x] 3.3 Verify preservation tests pass
- [x] 4. Checkpoint PlaceList - Tất cả tests pass

## Phase 2: MapView Container Height Fix (CẦN THỰC HIỆN ⚠️)

- [x] 5. Viết bug condition exploration test cho MapView container
  - **Property: MapView Container Flexbox Layout**
  - **QUAN TRỌNG**: Test này PHẢI FAIL trên code chưa sửa - failure xác nhận bug tồn tại
  - **MỤC TIÊU**: Phát hiện counterexamples chứng minh container height cố định gây vấn đề
  - Test implementation details từ Bug Condition trong design
  - Test assertions: container KHÔNG nên có `height: calc(100vh - 120px)`
  - Chạy test trên code CHƯA SỬA
  - **KẾT QUẢ MONG ĐỢI**: Test FAILS (đây là đúng - nó chứng minh bug tồn tại)
  - Document counterexamples tìm được
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 6. Viết preservation property tests cho MapView (TRƯỚC KHI implement fix)
  - **Property: Preservation** - Tabs, Mobile, và Chức năng Khác
  - **QUAN TRỌNG**: Tuân theo observation-first methodology
  - Quan sát hành vi trên code CHƯA SỬA cho non-buggy inputs
  - Viết property-based tests capture observed behavior patterns
  - Test cases: tab switching, mobile view, search, filter, interactions
  - Chạy tests trên code CHƯA SỬA
  - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận baseline behavior cần preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 7. Fix MapView container height

  - [x] 7.1 Implement the fix
    - Mở file `src/components/MapView.tsx`
    - Tìm dòng 735 (hoặc search `calc(100vh - 120px)`)
    - Xóa `style={{ height: 'calc(100vh - 120px)' }}`
    - Giữ nguyên `className="flex-1 flex flex-col"`
    - Code mới: `<div className="flex-1 flex flex-col">`
    - _Bug_Condition: Container sử dụng height cố định thay vì flexbox_
    - _Expected_Behavior: Container tự động điều chỉnh chiều cao bằng flexbox_
    - _Preservation: Tabs, mobile view, search, filter, interactions, scroll behavior_
    - _Requirements: 2.1, 2.2, 2.3, 3.1-3.9_

  - [x] 7.2 Verify bug condition exploration test bây giờ pass
    - **Property: MapView Container Flexbox Layout**
    - Chạy lại CÙNG test từ task 5
    - **KẾT QUẢ MONG ĐỢI**: Test PASSES (xác nhận bug đã được fix)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.3 Verify preservation tests vẫn pass
    - **Property: Preservation**
    - Chạy lại CÙNG tests từ task 6
    - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận không có regressions)

- [x] 8. Final Checkpoint - Đảm bảo tất cả tests pass
  - Chạy tất cả tests (PlaceList + MapView) để đảm bảo không có regressions
  - Kiểm tra visual trên desktop: không còn khoảng trống dưới cùng
  - Kiểm tra visual trên mobile: layout vẫn hoạt động đúng
  - Kiểm tra tab switching: Bản đồ, Địa điểm, AI Trợ lý đều hoạt động tốt
  - Kiểm tra resize window: layout responsive đúng
  - Hỏi user xác nhận vấn đề đã được giải quyết

## Notes

- Phase 1 (PlaceList padding fix) đã hoàn thành
- Phase 2 tập trung vào MapView container height: xóa `style={{ height: 'calc(100vh - 120px)' }}`
- File cần sửa: `src/components/MapView.tsx`
- Chạy tests bằng `npx vitest --run`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["5", "6"] },
    { "id": 1, "tasks": ["7.1"] },
    { "id": 2, "tasks": ["7.2", "7.3"] },
    { "id": 3, "tasks": ["8"] }
  ]
}
```
