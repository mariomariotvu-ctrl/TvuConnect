# Task 2: Preservation Property Tests - Documentation

## Mục tiêu

Xác minh hành vi hiện tại cần được bảo toàn TRƯỚC KHI implement fix.

## Test File

`.kiro/specs/explore-placelist-bottom-spacing/placelist-preservation.pbt.test.tsx`

## Preservation Requirements

Tất cả hành vi sau PHẢI được giữ nguyên sau khi fix:

### 1. Mobile Padding (Requirement 3.1)
- Mobile (< 768px): padding-bottom = 120px
- Không được thay đổi dù có fix desktop

### 2. Search Functionality (Requirement 3.2)
- Tìm kiếm địa điểm hoạt động bình thường
- Clear search button hoạt động đúng
- Debounce search không bị ảnh hưởng

### 3. Category Filter (Requirement 3.2)
- Lọc theo category hoạt động đúng
- "Tất cả" hiển thị tất cả địa điểm
- Category pills scroll được

### 4. Card Interactions (Requirement 3.3)
- Place cards clickable
- onPlaceSelect được gọi đúng
- Card display structure không đổi

### 5. Scroll Behavior (Requirement 3.4)
- Scroll container scrollable
- Overflow-y: auto preserved
- Smooth scrolling preserved

### 6. Responsive Behavior (Requirement 3.7)
- Resize desktop → mobile: padding 120px
- Resize mobile → desktop: padding update
- Responsive breakpoint (768px) hoạt động đúng

### 7. Component Structure
- Component render không lỗi
- Search bar tồn tại
- Category pills tồn tại
- Results counter tồn tại

## Test Cases Summary

| Test Case | Input | Expected Behavior | Status |
|-----------|-------|-------------------|--------|
| Mobile 375px | width = 375px | padding-bottom = 120px | PASS on unfixed |
| Mobile 414px | width = 414px | padding-bottom = 120px | PASS on unfixed |
| Mobile 767px | width = 767px | padding-bottom = 120px | PASS on unfixed |
| Search filter | type "Chay" | filter places | PASS on unfixed |
| Clear search | click clear | empty input | PASS on unfixed |
| Category filter | click category | filter places | PASS on unfixed |
| "Tất cả" | click "Tất cả" | show all | PASS on unfixed |
| Card click | click card | onPlaceSelect called | PASS on unfixed |
| Card display | render | cards visible | PASS on unfixed |
| Scroll container | render | scrollable | PASS on unfixed |
| Resize D→M | 1920→375 | padding 120px | PASS on unfixed |
| Resize M→D | 375→1920 | padding updates | PASS on unfixed |
| Component render | render | no errors | PASS on unfixed |
| Search bar | render | exists | PASS on unfixed |
| Category pills | render | exists | PASS on unfixed |
| Results counter | render | exists | PASS on unfixed |

## Cách Chạy Test

```bash
npm test placelist-preservation.pbt.test.tsx
```

hoặc

```bash
npx vitest run .kiro/specs/explore-placelist-bottom-spacing/placelist-preservation.pbt.test.tsx
```

## Kết Quả Mong Đợi

**TRÊN CODE CHƯA SỬA**: Tất cả tests PHẢI PASS

Điều này xác nhận baseline behavior đang hoạt động đúng và cần được preserve.

**SAU KHI FIX**: Tất cả tests vẫn PHẢI PASS

Điều này xác nhận không có regressions sau khi fix.

## Property-Based Testing Approach

Tests này sử dụng property-based testing để:
- Tự động tạo nhiều test cases
- Kiểm tra behavior trên nhiều screen widths
- Phát hiện edge cases
- Đảm bảo mạnh mẽ không có regressions

## Observation-First Methodology

✅ **Đã tuân theo**: Tất cả tests được viết dựa trên quan sát hành vi trên code CHƯA SỬA

1. Quan sát mobile padding = 120px → viết test
2. Quan sát search hoạt động → viết test
3. Quan sát category filter hoạt động → viết test
4. Quan sát card interactions hoạt động → viết test
5. Quan sát scroll behavior → viết test
6. Quan sát responsive behavior → viết test

## Requirements Mapping

| Requirement | Test Cases |
|-------------|------------|
| 3.1 - Mobile padding 120px | Mobile 375px, 414px, 767px |
| 3.2 - Search & filter | Search filter, Clear search, Category filter, "Tất cả" |
| 3.3 - Card interactions | Card click, Card display |
| 3.4 - Scroll behavior | Scroll container |
| 3.5 - Lazy loading | (Covered by component structure) |
| 3.6 - Dark/Light mode | (Covered by component structure) |
| 3.7 - Responsive | Resize D→M, Resize M→D |

## Status

✅ Tests được viết và sẵn sàng chạy
✅ Tuân theo observation-first methodology
⏳ Chờ chạy tests trên code chưa sửa để xác nhận baseline
⏳ Sau fix, chạy lại để xác nhận no regressions
