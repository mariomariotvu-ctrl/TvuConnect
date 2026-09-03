# Task 1: Bug Condition Exploration Test - Documentation

## Mục tiêu

Xác nhận bug tồn tại TRƯỚC KHI implement fix bằng cách viết test mã hóa expected behavior.

## Test File

`.kiro/specs/explore-placelist-bottom-spacing/placelist-bottom-spacing.pbt.test.tsx`

## Bug Condition

```typescript
FUNCTION isBugCondition(input)
  INPUT: input of type { screenWidth: number, component: string }
  OUTPUT: boolean
  
  RETURN input.screenWidth >= 768
         AND input.component === 'PlaceList'
         AND currentPaddingBottom === '96px'
END FUNCTION
```

## Test Cases

### 1. Desktop (1920px) - Padding Bottom Test
- **Input**: Window width = 1920px
- **Current Behavior**: padding-bottom = 96px (BUG)
- **Expected Behavior**: padding-bottom = 24px
- **Status**: EXPECTED TO FAIL on unfixed code

### 2. Laptop (1366px) - Padding Bottom Test
- **Input**: Window width = 1366px
- **Current Behavior**: padding-bottom = 96px (BUG)
- **Expected Behavior**: padding-bottom = 24px
- **Status**: EXPECTED TO FAIL on unfixed code

### 3. Tablet Landscape (1024px) - Padding Bottom Test
- **Input**: Window width = 1024px (>= 768px = desktop)
- **Current Behavior**: padding-bottom = 96px (BUG)
- **Expected Behavior**: padding-bottom = 24px
- **Status**: EXPECTED TO FAIL on unfixed code

### 4. Boundary Case (768px) - Padding Bottom Test
- **Input**: Window width = 768px (exact desktop boundary)
- **Current Behavior**: padding-bottom = 96px (BUG)
- **Expected Behavior**: padding-bottom = 24px
- **Status**: EXPECTED TO FAIL on unfixed code

### 5. Visual Space Test
- **Input**: Desktop width (1920px), scroll to bottom
- **Current Behavior**: 96px white space after last item (BUG)
- **Expected Behavior**: 24px white space after last item
- **Status**: EXPECTED TO FAIL on unfixed code

## Cách Chạy Test

```bash
npm test placelist-bottom-spacing.pbt.test.tsx
```

hoặc

```bash
npx vitest run .kiro/specs/explore-placelist-bottom-spacing/placelist-bottom-spacing.pbt.test.tsx
```

## Kết Quả Mong Đợi

**TRÊN CODE CHƯA SỬA**: Tất cả tests PHẢI FAIL

Failure messages sẽ hiển thị:
```
Expected: 24px
Received: 96px
```

Điều này xác nhận bug tồn tại và nguyên nhân gốc đúng như phân tích.

## Counterexamples

Khi tests fail, chúng ta sẽ thấy counterexamples chứng minh bug:

1. **Desktop 1920px**: padding-bottom = 96px (should be 24px)
2. **Laptop 1366px**: padding-bottom = 96px (should be 24px)
3. **Tablet 1024px**: padding-bottom = 96px (should be 24px)
4. **Boundary 768px**: padding-bottom = 96px (should be 24px)

## Sau Khi Fix

Sau khi implement fix (Task 3.1), chạy lại CÙNG test này:
- **Kết quả mong đợi**: Tất cả tests PASS
- Điều này xác nhận bug đã được fix đúng

## Lưu Ý Quan Trọng

⚠️ **KHÔNG sửa test hoặc code khi test fail**

Test này được thiết kế để fail trên code chưa sửa. Failure là ĐÚNG - nó chứng minh bug tồn tại.

Chỉ sau khi implement fix (Task 3.1), test này mới pass.

## Requirements Mapping

Test này validate các requirements sau:
- **1.1**: Desktop hiển thị padding bottom 96px (bug)
- **1.2**: Khoảng trống 96px sau địa điểm cuối cùng (bug)
- **1.3**: Danh sách ít items vẫn có padding 96px (bug)
- **2.1**: Desktop PHẢI hiển thị padding bottom 24px (expected)
- **2.2**: Khoảng cách 24px sau địa điểm cuối cùng (expected)
- **2.3**: Danh sách ít items PHẢI có padding 24px (expected)

## Status

✅ Test được viết và sẵn sàng chạy
⏳ Chờ chạy test trên code chưa sửa để xác nhận bug
