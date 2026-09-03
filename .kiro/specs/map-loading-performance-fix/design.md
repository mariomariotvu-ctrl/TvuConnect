# Map Loading Performance Fix Design

## Overview

Fix vấn đề đơ màn hình khi chuyển sang tab "Bản đồ" trên thiết bị mobile. Hiện tại, khi chuyển tab, hệ thống render đồng thời toàn bộ 100+ markers Leaflet trong một frame duy nhất, gây block main thread và đơ giao diện 2–5 giây.

**Giải pháp:** Thay vì render tất cả markers cùng lúc, hệ thống sẽ render từng batch 20 markers mỗi 16ms (1 frame) qua `requestAnimationFrame`, chỉ trên mobile. Desktop không thay đổi gì.

**Phạm vi thay đổi:**
- File duy nhất: `src/components/MapView.tsx`
- Thay đổi duy nhất: State `visibleMarkers` trên mobile được tăng dần từ 20 lên tổng số thực tế qua `requestAnimationFrame`
- Dữ liệu 150 địa điểm vẫn tải đủ — KHÔNG giảm số lượng
- Tất cả các tab khác (list, ai, rental) không thay đổi gì
- Desktop (viewport ≥ 768px) không bị ảnh hưởng

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt bug — khi người dùng tap tab "Bản đồ" trên mobile và hệ thống render đồng thời 100+ markers trong một frame
- **Property (P)**: Hành vi mong muốn — markers được render dần từng batch nhỏ (20 markers/frame), không block main thread
- **Preservation**: Các hành vi hiện có phải giữ nguyên — desktop render đầy đủ ngay lập tức, các tab khác hoạt động bình thường, tất cả tính năng map (zoom, pan, filter, check-in) hoạt động đầy đủ
- **visibleMarkers**: State React kiểm soát số lượng markers hiển thị trên bản đồ
- **displayPlaces**: Array địa điểm được filter theo category và map bounds, là nguồn dữ liệu cho markers
- **requestAnimationFrame**: Browser API để thực thi code trong frame tiếp theo (mỗi ~16ms), tránh block main thread
- **MemoizedMarker**: Component React.memo render một marker Leaflet, chỉ re-render khi props thay đổi
- **isMobile**: Boolean state phát hiện thiết bị mobile (viewport < 768px)
- **activeTab**: State theo dõi tab hiện tại ('map' | 'list' | 'ai' | 'rental')

## Bug Details

### Bug Condition

Bug xảy ra khi người dùng tap vào tab "Bản đồ" trên thiết bị mobile với hơn 50 địa điểm đã load. Hệ thống cố gắng render toàn bộ 100+ markers Leaflet (SVG elements) và inject vào DOM trong một lần duy nhất, gây block main thread.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { isMobile: boolean, activeTab: string, placesCount: number, visibleMarkersInitial: number }
  OUTPUT: boolean
  
  RETURN input.isMobile = true
         AND input.activeTab = 'map'
         AND input.placesCount > 50
         AND input.visibleMarkersInitial = 100  // Set all at once instead of progressive
END FUNCTION
```

**Root Cause:**
```typescript
// Line 135 trong MapView.tsx
const [visibleMarkers, setVisibleMarkers] = useState(100); // ❌ Set to 100 immediately

// Line 871-890 trong MapView.tsx
{displayPlaces.map(place => {  // ❌ Render TẤT CẢ displayPlaces cùng lúc
  // ... render MemoizedMarker
})}
```

### Examples

**Ví dụ 1: Samsung Galaxy A series (CPU tầm trung)**
- Người dùng tap tab "Bản đồ"
- Hệ thống load 102 địa điểm
- `visibleMarkers = 100` → render 100 markers ngay lập tức
- Main thread bị block 3-4 giây, màn hình đơ, không scroll được
- **Expected**: Hiển thị 20 markers đầu tiên trong ~200ms, sau đó thêm dần 20 markers mỗi 16ms

**Ví dụ 2: iPhone 12 Mini (màn hình nhỏ, iOS Safari)**
- Người dùng tap tab "Bản đồ"
- Hệ thống load 150 địa điểm (full limit)
- Render 100 markers cùng lúc → giật lag 2 giây
- **Expected**: Progressive rendering, mượt mà trong ~1 giây

**Ví dụ 3: Desktop Chrome (MacBook Pro)**
- Người dùng click tab "Bản đồ"
- Hệ thống load 300 địa điểm
- Render đầy đủ ngay lập tức → hoạt động bình thường (desktop có CPU mạnh)
- **Expected**: GIỮ NGUYÊN hành vi này — desktop không cần progressive rendering

**Edge Case: Chỉ có 10 địa điểm**
- Người dùng tap tab "Bản đồ" trên mobile
- Chỉ có 10 địa điểm → render 10 markers
- Không có lag (số lượng nhỏ)
- **Expected**: Hoạt động bình thường, không cần progressive rendering

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Desktop (viewport ≥ 768px) PHẢI render toàn bộ markers ngay lập tức như hiện tại
- Tab "Địa điểm" (list view) PHẢI hiển thị toàn bộ danh sách địa điểm đầy đủ
- Tab "AI" và "Tìm Trọ" PHẢI hoạt động bình thường
- Chức năng zoom, pan, filter theo category trên map PHẢI hoạt động đầy đủ
- Khi tap vào marker, PlaceInfoBottomSheet PHẢI hiển thị đầy đủ thông tin
- Check-in modal và Event modal PHẢI hoạt động bình thường
- Map bounds filtering (`displayPlaces` từ `queryPlacesInBounds`) PHẢI hoạt động đúng

**Scope:**
Tất cả các input KHÔNG liên quan đến tab "Bản đồ" trên mobile với >50 địa điểm phải hoạt động y nguyên. Bao gồm:
- Desktop truy cập tab "Bản đồ" (render đầy đủ ngay lập tức)
- Mobile truy cập các tab khác (list, ai, rental)
- Mobile truy cập map với <50 địa điểm (không cần progressive)
- Tất cả tương tác với markers (click, popup, check-in)
- Tất cả filter (category, bounds)

## Hypothesized Root Cause

Dựa trên phân tích code, các nguyên nhân chính là:

1. **Immediate Full Batch Rendering**: `visibleMarkers` được set = 100 ngay lập tức khi component mount (line 135), khiến toàn bộ 100 markers được render trong một frame duy nhất.
   - **Evidence**: `const [visibleMarkers, setVisibleMarkers] = useState(100);`
   - **Impact**: Main thread bị block 2-5 giây trên mobile yếu

2. **No Progressive Loading Logic**: Không có logic nào để tăng dần `visibleMarkers` theo batch. Hiện tại chỉ có logic reset về 100 khi rời khỏi tab map (lines 691-695).
   - **Evidence**: `useEffect(() => { if (activeTab !== 'map') setVisibleMarkers(100); }, [activeTab])`
   - **Impact**: Không có cơ chế nào để phân tán render workload

3. **No Device Detection for Rendering Strategy**: Logic render không phân biệt mobile vs desktop. Desktop có CPU mạnh nên render đầy đủ ngay lập tức là OK, nhưng mobile cần progressive.
   - **Evidence**: `displayPlaces.map(place => <MemoizedMarker ... />)` — không có điều kiện `if (isMobile)`
   - **Impact**: Mobile bị forced render như desktop

4. **SVG Icon Creation Overhead (Minor)**: `iconCache` tạo toàn bộ 15 category icons trong một lần (lines 708-773), tuy đã được memoize nhưng vẫn tốn thời gian khởi tạo lần đầu.
   - **Evidence**: `useMemo(() => { /* create 15 icons */ }, [theme])`
   - **Impact**: Thêm ~100-200ms vào lần render đầu tiên

## Correctness Properties

Property 1: Bug Condition - Progressive Marker Rendering on Mobile

_For any_ input where the bug condition holds (mobile device, tab = 'map', >50 places), the fixed MapView component SHALL render markers progressively in batches of 20 markers per frame using requestAnimationFrame, with the first batch appearing within 200ms and all markers fully rendered within 1000ms, ensuring main thread is never blocked for more than 100ms continuously.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Desktop Full Rendering

_For any_ input where isMobile = false, the fixed MapView component SHALL render all markers immediately in a single batch as before, preserving the current desktop user experience with no progressive rendering delay.

**Validates: Requirements 3.1, 3.3**

Property 3: Preservation - Other Tabs Unaffected

_For any_ input where activeTab ≠ 'map', the fixed MapView component SHALL behave identically to the original code, with list view, AI tab, and rental tab functioning exactly as before.

**Validates: Requirements 3.1, 3.2, 3.6**

Property 4: Preservation - Map Interactions

_For any_ map interaction (zoom, pan, marker click, check-in, filter by category), the fixed MapView component SHALL produce the same behavior as the original code, with all features functioning identically.

**Validates: Requirements 3.2, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Giả sử phân tích root cause đúng, chúng ta cần thay đổi như sau:

**File**: `src/components/MapView.tsx`

**Function/Component**: `MapView` component

**Specific Changes**:

1. **Progressive Marker Rendering Logic (Core Fix)**: Thêm `useEffect` hook để tăng dần `visibleMarkers` từ 20 lên tổng số `displayPlaces.length` qua `requestAnimationFrame`, CHỈ khi `isMobile = true` và `activeTab = 'map'`.
   ```typescript
   // Thêm sau line 695 (sau useEffect reset visibleMarkers)
   useEffect(() => {
     if (!isMobile || activeTab !== 'map' || displayPlaces.length <= 20) {
       setVisibleMarkers(displayPlaces.length); // Desktop hoặc ít markers → render full ngay
       return;
     }
     
     // Mobile + nhiều markers → progressive rendering
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

2. **Slice displayPlaces Before Mapping**: Thay đổi logic render markers từ `displayPlaces.map(...)` thành `displayPlaces.slice(0, visibleMarkers).map(...)` để chỉ render số lượng markers theo `visibleMarkers` state.
   ```typescript
   // Line 871: Thay
   // {displayPlaces.map(place => {
   // Thành:
   {displayPlaces.slice(0, visibleMarkers).map(place => {
   ```

3. **Update Initial State**: Thay đổi `useState(100)` thành `useState(20)` để bắt đầu với batch đầu tiên nhỏ hơn trên mobile.
   ```typescript
   // Line 135: Thay
   // const [visibleMarkers, setVisibleMarkers] = useState(100);
   // Thành:
   const [visibleMarkers, setVisibleMarkers] = useState(20);
   ```

4. **Update Reset Logic**: Sửa `useEffect` reset để reset về giá trị phù hợp (20 thay vì 100), hoặc reset về `displayPlaces.length` nếu không ở map tab.
   ```typescript
   // Line 691-695: Thay
   // if (activeTab !== 'map') setVisibleMarkers(100);
   // Thành:
   if (activeTab !== 'map') {
     setVisibleMarkers(isMobile ? 20 : displayPlaces.length);
   }
   ```

5. **Optional: Loading Indicator for Progressive Rendering**: Thêm một loading indicator nhỏ ở góc dưới badge số lượng địa điểm để cho biết markers đang load dần (UX improvement, không bắt buộc).
   ```typescript
   // Thêm vào badge (line ~750-770)
   {isMobile && visibleMarkers < displayPlaces.length && (
     <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
   )}
   ```

### Summary of Changes

- **3 dòng thay đổi chính**: Initial state (line 135), reset logic (line 693), slice before map (line 871)
- **1 useEffect mới**: Progressive rendering logic (~15 dòng)
- **Không thay đổi**: Desktop logic, tab khác, map features, check-in/events, filtering

## Testing Strategy

### Validation Approach

Testing chia làm 3 giai đoạn:
1. **Exploratory Bug Condition Checking**: Chạy test trên code CHƯA fix để confirm bug tồn tại
2. **Fix Checking**: Verify progressive rendering hoạt động đúng sau khi fix
3. **Preservation Checking**: Verify desktop và các tab khác không bị ảnh hưởng

### Exploratory Bug Condition Checking

**Goal**: Xác nhận bug tồn tại trên code chưa fix. Đo main thread block time khi render markers.

**Test Plan**: Simulate mobile viewport (375px width), load 100+ địa điểm, chuyển sang tab "Bản đồ", đo thời gian main thread bị block.

**Test Cases**:
1. **Mobile + 100 Places Test**: Viewport 375px, 100 places, chuyển tab map → expect main thread block >1000ms (sẽ fail trên unfixed code)
2. **Desktop + 100 Places Test**: Viewport 1200px, 100 places, chuyển tab map → expect hoạt động mượt (pass cả unfixed và fixed)
3. **Mobile + 10 Places Test**: Viewport 375px, 10 places, chuyển tab map → expect hoạt động mượt (pass cả unfixed và fixed)
4. **Progressive Rendering Not Happening**: Kiểm tra `visibleMarkers` state trên unfixed code → expect = 100 ngay lập tức (confirm bug)

**Expected Counterexamples**:
- Main thread block >1000ms trên mobile với 100+ places
- Không có progressive rendering — tất cả markers render trong một frame
- `visibleMarkers` state không tăng dần, set = 100 từ đầu

### Fix Checking

**Goal**: Verify rằng với mọi input thuộc bug condition (mobile, tab map, >50 places), hệ thống sau fix render markers dần từng batch 20.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := MapView_fixed(input)
  ASSERT visibleMarkers_frame1(result) = 20
  ASSERT visibleMarkers_frame2(result) = 40
  ASSERT visibleMarkers_frame_n(result) = displayPlaces.length
  ASSERT mainThreadBlockTime(result) < 100ms  // Không block quá 100ms liên tục
  ASSERT totalRenderTime(result) < 1000ms     // Toàn bộ quá trình < 1s
END FOR
```

**Testing Approach**: Property-based testing với Playwright/Vitest để generate nhiều test case khác nhau (50, 100, 150 places) và verify progressive rendering behavior.

**Test Cases**:
1. **50 Places Progressive**: Mobile, 50 places → expect 3 batches (20, 40, 50)
2. **100 Places Progressive**: Mobile, 100 places → expect 5 batches (20, 40, 60, 80, 100)
3. **150 Places Progressive**: Mobile, 150 places → expect 8 batches (20, 40, ..., 150)
4. **Main Thread Not Blocked**: Đo main thread block time → expect <100ms per batch
5. **First Batch Fast**: Batch đầu tiên (20 markers) phải xuất hiện trong <200ms

### Preservation Checking

**Goal**: Verify rằng với mọi input KHÔNG thuộc bug condition, hệ thống sau fix hoạt động y nguyên như trước.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT MapView_original(input) = MapView_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing để generate nhiều scenario (desktop, mobile + tab khác, mobile + ít places) và so sánh behavior trước và sau fix.

**Test Cases**:
1. **Desktop Full Render Preservation**: Viewport 1200px, 100 places → expect render full ngay lập tức (không progressive)
2. **List Tab Preservation**: Mobile, tab = 'list' → expect PlaceList component hoạt động bình thường, hiển thị đầy đủ danh sách
3. **AI Tab Preservation**: Mobile, tab = 'ai' → expect LazyAIAssistant mount đúng, không bị ảnh hưởng
4. **Rental Tab Preservation**: Mobile, tab = 'rental' → expect RentalList hoạt động bình thường
5. **Map Zoom/Pan Preservation**: Mobile, zoom/pan map sau khi render xong → expect `displayPlaces` update đúng theo bounds, không có glitch
6. **Category Filter Preservation**: Mobile, filter theo category → expect markers update đúng, progressive rendering trigger lại cho filtered list
7. **Marker Click Preservation**: Mobile, click vào marker → expect PlaceInfoBottomSheet hiển thị đúng
8. **Check-in Preservation**: Mobile, click "Check-in" button → expect CheckInModal mở đúng

### Unit Tests

- Test `visibleMarkers` state progression với mock `requestAnimationFrame`
- Test slice logic: `displayPlaces.slice(0, visibleMarkers)` trả về đúng số lượng
- Test reset logic khi chuyển tab: `visibleMarkers` reset về giá trị đúng
- Test desktop bypass: `visibleMarkers = displayPlaces.length` ngay lập tức khi `isMobile = false`
- Test edge case: ít hơn 20 places → không trigger progressive rendering

### Property-Based Tests

- Generate random `placesCount` (10–200) và verify progressive rendering hoạt động đúng
- Generate random viewport widths (300px–1920px) và verify mobile/desktop detection đúng
- Generate random `activeTab` values và verify chỉ tab 'map' trigger progressive rendering
- Test với nhiều device types (iPhone, Android, iPad, desktop) để verify performance

### Integration Tests

- Test full user flow: vào app → chuyển tab map → quan sát progressive rendering → zoom/pan → filter category → check-in
- Test switching tabs: map → list → map lại → verify progressive rendering trigger lại
- Test theme switching: dark → light trong khi progressive rendering đang chạy → verify không crash
- Test slow network: địa điểm load chậm → verify progressive rendering chờ data load xong mới bắt đầu
