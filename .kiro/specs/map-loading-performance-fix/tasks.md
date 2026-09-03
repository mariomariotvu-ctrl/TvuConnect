# Implementation Plan

## Overview

Fix vấn đề đơ màn hình khi chuyển sang tab "Bản đồ" trên mobile. Toàn bộ thay đổi chỉ nằm trong một file duy nhất: `src/components/MapView.tsx`. Áp dụng progressive rendering với `requestAnimationFrame`, batch 20 markers/frame, chỉ trên mobile.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1"] },
    { "wave": 3, "tasks": ["3.2"] },
    { "wave": 4, "tasks": ["3.3"] },
    { "wave": 5, "tasks": ["3.4"] },
    { "wave": 6, "tasks": ["3.5", "3.6"] },
    { "wave": 7, "tasks": ["4"] }
  ]
}
```

## Tasks

- [-] 1. Viết bug condition exploration test (TRƯỚC KHI fix)
  - **Property 1: Bug Condition** - Progressive Marker Rendering bị thiếu trên Mobile
  - **QUAN TRỌNG**: Test này PHẢI FAIL trên code chưa fix — failure xác nhận bug tồn tại
  - **KHÔNG cố sửa test hay code khi nó fail**
  - **MỤC TIÊU**: Tìm counterexample chứng minh bug tồn tại
  - **Scoped PBT**: Scope property vào trường hợp cụ thể: mobile viewport (375px), 100 places, activeTab = 'map'
  - Kiểm tra `visibleMarkers` state ban đầu = 100 ngay lập tức (isBugCondition: isMobile=true, activeTab='map', placesCount>50, visibleMarkersInitial=100)
  - Kiểm tra `displayPlaces.map(...)` render toàn bộ markers không qua slice — không có progressive rendering
  - Xác nhận KHÔNG tồn tại useEffect nào gọi `requestAnimationFrame` để tăng dần `visibleMarkers`
  - Chạy test trên code CHƯA fix
  - **KẾT QUẢ DỰ KIẾN**: Test FAIL (xác nhận bug tồn tại)
  - Document counterexample: "visibleMarkers = 100 ngay lập tức, tất cả 100 markers render trong một frame"
  - Đánh dấu task hoàn thành khi test đã viết, đã chạy và failure đã được ghi lại
  - _Requirements: 1.1_

- [-] 2. Viết preservation property tests (TRƯỚC KHI fix)
  - **Property 2: Preservation** - Desktop Full Render và Các Tab Khác Không Bị Ảnh Hưởng
  - **QUAN TRỌNG**: Theo methodology observation-first
  - Quan sát: `isMobile=false` → `displayPlaces.map(...)` render đầy đủ toàn bộ markers ngay lập tức trên code chưa fix
  - Quan sát: `activeTab='list'` → `PlaceList` nhận `nearbyPlaces` đầy đủ, không bị giới hạn bởi `visibleMarkers`
  - Quan sát: `activeTab='ai'` → `LazyAIAssistant` mount bình thường, không phụ thuộc `visibleMarkers`
  - Quan sát: `activeTab='rental'` → `RentalList` hoạt động độc lập với `visibleMarkers`
  - Viết property-based test: với mọi input NOT isBugCondition (desktop, tab khác, mobile + ≤20 places), hành vi không đổi so với code gốc
  - Viết test cụ thể: desktop (viewport 1200px) → `visibleMarkers` = `displayPlaces.length` render đủ ngay lập tức
  - Viết test cụ thể: mobile tab = 'list' → PlaceList nhận `nearbyPlaces` đầy đủ, không cắt bởi visibleMarkers
  - Viết test cụ thể: mobile tab = 'map' với ≤20 places → không cần progressive rendering
  - Chạy tests trên code CHƯA fix
  - **KẾT QUẢ DỰ KIẾN**: Tests PASS (xác nhận baseline behavior cần giữ nguyên)
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix progressive rendering trong MapView.tsx

  - [x] 3.1 Thay đổi initial state từ 100 xuống 20
    - Tìm dòng: `const [visibleMarkers, setVisibleMarkers] = useState(100);`
    - Thay thành: `const [visibleMarkers, setVisibleMarkers] = useState(20);`
    - Chỉ thay đổi con số 100 → 20, không thay đổi gì khác
    - _Bug_Condition: isBugCondition(X) where X.visibleMarkersInitial = 100 → fix về 20_
    - _Expected_Behavior: batch đầu tiên 20 markers thay vì 100_
    - _Requirements: 2.1_

  - [x] 3.2 Sửa reset useEffect khi chuyển tab
    - Tìm useEffect: `if (activeTab !== 'map') { setVisibleMarkers(100); }`
    - Thay thành logic mới:
      ```typescript
      if (activeTab !== 'map') {
        setVisibleMarkers(isMobile ? 20 : displayPlaces.length);
      }
      ```
    - Reset về 20 trên mobile (sẵn sàng cho lần mở map tiếp theo), reset về full trên desktop
    - Thêm `isMobile` và `displayPlaces.length` vào dependency array của useEffect này
    - _Bug_Condition: reset về 100 sai — fix thành reset về 20 (mobile) hoặc displayPlaces.length (desktop)_
    - _Preservation: desktop giữ nguyên hành vi render đầy đủ_
    - _Requirements: 2.1, 3.3_

  - [x] 3.3 Thêm useEffect mới với requestAnimationFrame để tăng dần visibleMarkers
    - Thêm useEffect ngay sau useEffect reset hiện tại:
      ```typescript
      useEffect(() => {
        if (!isMobile || activeTab !== 'map' || displayPlaces.length <= 20) {
          if (!isMobile) setVisibleMarkers(displayPlaces.length);
          return;
        }
        // Mobile + map tab + >20 places → progressive rendering
        let currentBatch = 20;
        setVisibleMarkers(currentBatch);
        const addNextBatch = () => {
          if (currentBatch >= displayPlaces.length) return;
          currentBatch = Math.min(currentBatch + 20, displayPlaces.length);
          setVisibleMarkers(currentBatch);
          if (currentBatch < displayPlaces.length) {
            requestAnimationFrame(addNextBatch);
          }
        };
        requestAnimationFrame(addNextBatch);
      }, [isMobile, activeTab, displayPlaces.length]);
      ```
    - CHỈ kích hoạt khi `isMobile=true` VÀ `activeTab='map'` VÀ `displayPlaces.length > 20`
    - Batch size = 20 markers/frame (~16ms mỗi frame)
    - Desktop bypass: set `visibleMarkers = displayPlaces.length` ngay lập tức
    - _Bug_Condition: isBugCondition(X) — fix bằng requestAnimationFrame batching_
    - _Expected_Behavior: frame1=20, frame2=40, ..., frameN=displayPlaces.length_
    - _Preservation: isMobile=false → render đầy đủ ngay lập tức_
    - _Requirements: 2.1, 2.2, 3.3_

  - [x] 3.4 Thay displayPlaces.map thành displayPlaces.slice(0, visibleMarkers).map trong render markers
    - Tìm trong phần render (trong `<MapContainer>`): `{displayPlaces.map(place => {`
    - Thay thành: `{displayPlaces.slice(0, visibleMarkers).map(place => {`
    - Chỉ thay đúng 1 chỗ trong comment `{/* Memoized markers - Task 5.4 */}`
    - Không thay đổi logic bên trong map callback
    - _Bug_Condition: displayPlaces.map(...) render toàn bộ → fix bằng slice(0, visibleMarkers)_
    - _Expected_Behavior: chỉ render visibleMarkers markers trong mỗi frame_
    - _Preservation: khi visibleMarkers = displayPlaces.length thì kết quả giống hệt code gốc_
    - _Requirements: 2.1, 2.3_

  - [x] 3.5 Verify bug condition exploration test (từ task 1) bây giờ phải PASS
    - **Property 1: Expected Behavior** - Progressive Marker Rendering hoạt động đúng
    - **QUAN TRỌNG**: Chạy lại ĐÚNG test đã viết ở task 1 — KHÔNG viết test mới
    - Test từ task 1 encode expected behavior: visibleMarkers bắt đầu = 20, tăng dần theo requestAnimationFrame
    - Khi test này pass → xác nhận bug đã được fix
    - Kiểm tra: `useState(20)` thay vì `useState(100)`
    - Kiểm tra: `displayPlaces.slice(0, visibleMarkers).map(...)` thay vì `displayPlaces.map(...)`
    - Kiểm tra: useEffect với `requestAnimationFrame` tồn tại và tăng dần đúng batch 20
    - **KẾT QUẢ DỰ KIẾN**: Test PASS (xác nhận bug đã fix)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.6 Verify preservation tests (từ task 2) vẫn PASS sau khi fix
    - **Property 2: Preservation** - Desktop và Các Tab Khác Không Bị Ảnh Hưởng
    - **QUAN TRỌNG**: Chạy lại ĐÚNG tests đã viết ở task 2 — KHÔNG viết tests mới
    - Desktop: `isMobile=false` → `visibleMarkers = displayPlaces.length` ngay lập tức, không có progressive delay
    - Tab list: `nearbyPlaces` đầy đủ vẫn được truyền vào `PlaceList`, không bị cắt bởi `visibleMarkers`
    - Tab ai/rental: không thay đổi gì, vẫn mount bình thường
    - **KẾT QUẢ DỰ KIẾN**: Tests PASS (xác nhận không có regression)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint — Đảm bảo tất cả tests pass
  - Chạy lại toàn bộ test suite để xác nhận
  - Kiểm tra Property 1 (Bug Condition → Expected Behavior): PASS
  - Kiểm tra Property 2 (Preservation): PASS
  - Verify không có TypeScript errors sau khi thay đổi
  - Verify chỉ file `src/components/MapView.tsx` bị thay đổi — không có file nào khác bị sửa
  - Nếu có vấn đề phát sinh, hỏi người dùng trước khi tiếp tục

## Notes

- **File duy nhất cần sửa**: `src/components/MapView.tsx`
- **Tổng cộng thay đổi**: 4 chỗ — initial state (1 dòng), reset useEffect (2 dòng), thêm 1 useEffect mới (~15 dòng), slice trong render (1 dòng)
- **Desktop không bị ảnh hưởng**: Logic `if (!isMobile)` đảm bảo render đầy đủ ngay lập tức trên desktop
- **Batch size = 20**: 20 markers/frame × ~16ms/frame = toàn bộ 100 markers trong ~80ms thay vì block 2–5 giây
