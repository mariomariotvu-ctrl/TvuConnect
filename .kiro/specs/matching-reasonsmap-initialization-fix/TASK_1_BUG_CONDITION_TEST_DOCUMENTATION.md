# Task 1: Bug Condition Exploration Test - Documentation

## Test Execution Summary

**Date**: 2026-06-19
**Status**: ✅ **PASSED** (Test FAIL như mong đợi - xác nhận bug tồn tại)
**Test File**: `.kiro/specs/matching-reasonsmap-initialization-fix/matching-reasonsmap-initialization.pbt.test.tsx`

## Objective

Viết bug condition exploration test để xác nhận lỗi ReasonsMap initialization order tồn tại TRƯỚC KHI implement fix. Test này được thiết kế để FAIL trên code chưa sửa, chứng minh bug condition đúng như đã phân tích.

## Test Results

### Summary
- **Total Tests**: 8 scenarios
- **Failed Tests**: 7 (như mong đợi)
- **Passed Tests**: 1 (Scenario 7 - Console Error Check)
- **Test Duration**: 2.21s

### Counterexamples Discovered

#### 1. Scenario 1: Mode "lover"
```
❌ Component crashed: ReferenceError: Cannot access 'reasonsMap' before initialization
   at Matching (C:/Users/Admin/Documents/tvu-student-connect/src/components/Matching.tsx:73:7)
```

**Analysis**: Component Matching với mode='lover' crash ngay khi render. Error xảy ra ở dòng 73 trong file Matching.tsx - đây là nơi React đọc dependency array của handleProfileClick callback.

#### 2. Scenario 2: Mode "study"  
```
❌ Component crashed: ReferenceError: Cannot access 'reasonsMap' before initialization
   at Matching (C:/Users/Admin/Documents/tvu-student-connect/src/components/Matching.tsx:73:7)
```

**Analysis**: Tương tự scenario 1, mode 'study' cũng crash với cùng lỗi ở cùng vị trí.

#### 3. Scenario 3: Mode "hobby"
```
❌ Component crashed: ReferenceError: Cannot access 'reasonsMap' before initialization
   at Matching (C:/Users/Admin/Documents/tvu-student-connect/src/components/Matching.tsx:73:7)
```

**Analysis**: Mode 'hobby' cũng bị crash với cùng pattern.

#### 4. Scenario 4: Mode "quick"
```
❌ Component crashed: ReferenceError: Cannot access 'reasonsMap' before initialization
   at Matching (C:/Users/Admin/Documents/tvu-student-connect/src/components/Matching.tsx:73:7)
```

**Analysis**: Mode 'quick' cũng bị lỗi tương tự. Tất cả 4 matching modes đều bị ảnh hưởng, xác nhận bug có tính universal.

#### 5. Scenario 5: handleProfileClick Cannot Access ReasonsMap
```
❌ Profile click crashed: ReferenceError: Cannot access 'reasonsMap' before initialization
   at Matching (C:/Users/Admin/Documents/tvu-student-connect/src/components/Matching.tsx:73:7)
```

**Analysis**: Component crash ngay từ initialization phase, không đến được phase có thể click profile. Điều này chứng tỏ lỗi xảy ra sớm hơn runtime execution - xảy ra khi React thiết lập component.

#### 6. Scenario 6: Property-Based Test - All Modes
```
Error: Property failed after 1 tests
Counterexample: ["lover"]
Shrunk 1 time(s)

Encountered failures were:
- ["study"]
- ["lover"]
```

**Analysis**: Fast-check property test xác nhận bug xảy ra với mọi mode. Test chạy với 20 iterations và fail ngay test đầu tiên với mode "study", sau đó shrink về mode "lover" đơn giản nhất.

#### 7. Scenario 8: Component Mount Lifecycle Failed
```
❌ Component mount failed: ReferenceError: Cannot access 'reasonsMap' before initialization
🐛 Lifecycle log: [
  'Render started',
  "Mount failed: Cannot access 'reasonsMap' before initialization"
]
```

**Analysis**: Component không hoàn thành mount lifecycle. Chỉ đến "Render started" rồi crash, không đến được "Component mounted" hay "UseEffect completed". Điều này xác nhận lỗi xảy ra trong initialization phase, không phải runtime phase.

## Root Cause Analysis

### Confirmed Root Cause

Từ các counterexamples thu thập được, root cause được xác nhận là:

1. **Temporal Dead Zone Violation**: 
   - `handleProfileClick` callback được định nghĩa ở dòng 64 (trong useCallback hook)
   - Dependency array của useCallback bao gồm `reasonsMap`
   - `reasonsMap` mới được khai báo bằng useMemo ở dòng 148 (84 dòng sau)
   - JavaScript không cho phép truy cập biến trước khi khai báo (Temporal Dead Zone)

2. **React Hook Execution Order**:
   - Khi component render, React đọc code từ trên xuống
   - React đọc useCallback ở dòng 64 và kiểm tra dependency array
   - React cố gắng truy cập `reasonsMap` để track dependency
   - `reasonsMap` chưa tồn tại trong scope → ReferenceError

3. **Error Location**:
   - Error chính xác ở dòng 73 (trong handleProfileClick useCallback)
   - Đây là nơi dependency array được declare: `[reasonsMap, currentUser.uid, onMatchFound]`
   - React engine đọc array này và cố gắng capture `reasonsMap` reference

4. **Universal Impact**:
   - Bug ảnh hưởng đến TẤT CẢ 4 matching modes (lover, study, hobby, quick)
   - Bug xảy ra ở initialization phase, trước khi component mount
   - Không có cách nào user có thể sử dụng tính năng matching

### Code Evidence

**Current Code Structure** (Matching.tsx):
```typescript
// Line 46-52: useCachedMatching hook
const {
  profiles: matchedProfiles,
  // ...
} = useCachedMatching(currentUser.uid, filters, blockedSet, mode, currentProfile);

// Line 64-69: handleProfileClick - USES reasonsMap
const handleProfileClick = useCallback((profile: StudentProfile) => {
  const matchScore = reasonsMap.get(profile.uid)?.length || 0; // ❌ reasonsMap not yet defined
  trackProfileClick(currentUser.uid, profile.uid, matchScore);
  onMatchFound(profile);
}, [reasonsMap, currentUser.uid, onMatchFound]); // ❌ reasonsMap in dependency array

// ... 80+ lines of code ...

// Line 148-156: reasonsMap - DEFINED TOO LATE
const reasonsMap = useMemo(() => {
  const map = new Map<string, string[]>();
  matchedProfiles.forEach(profile => {
    const reasons = currentProfile ? getMatchingReasons(currentProfile, profile, mode) : [];
    map.set(profile.uid, reasons);
  });
  return map;
}, [matchedProfiles, currentProfile, mode]);
```

**Problem**: 84 dòng code giữa nơi `reasonsMap` được sử dụng (dòng 64) và nơi nó được khai báo (dòng 148).

## Bug Condition Specification

### Formal Specification

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ComponentRenderContext
  OUTPUT: boolean
  
  RETURN (
    X.handleProfileClick_line < X.reasonsMap_line AND
    X.handleProfileClick_dependencies.includes('reasonsMap') AND
    X.component_is_rendering
  )
END FUNCTION
```

### Concrete Values

Trong Matching.tsx hiện tại:
- `handleProfileClick_line = 64`
- `reasonsMap_line = 148`
- `handleProfileClick_dependencies = ['reasonsMap', 'currentUser.uid', 'onMatchFound']`
- `component_is_rendering = true` (khi user vào tab Matching)

**Result**: `64 < 148 AND true AND true` → **BUG CONDITION = TRUE** ✅

## Expected Behavior After Fix

Sau khi implement fix (Task 3), tests này phải PASS với expected behaviors:

1. ✅ Component Matching render thành công với mode='lover' (no ReferenceError)
2. ✅ Component Matching render thành công với mode='study' (no ReferenceError)
3. ✅ Component Matching render thành công với mode='hobby' (no ReferenceError)
4. ✅ Component Matching render thành công với mode='quick' (no ReferenceError)
5. ✅ handleProfileClick callback có thể access reasonsMap an toàn khi được gọi
6. ✅ Property-based test: Tất cả modes render thành công
7. ✅ Console không có ReferenceError
8. ✅ Component hoàn thành mount lifecycle successfully

## Test Implementation Details

### Testing Framework
- **Framework**: Vitest
- **Property-Based Testing**: fast-check
- **React Testing**: @testing-library/react

### Test Structure
- 8 scenarios testing different aspects of the bug
- Property-based test với 20 iterations
- Comprehensive mocking của Firebase và React hooks
- Lifecycle tracking để verify component mount phase

### Key Test Strategies

1. **Scoped PBT Approach**: Focus vào 4 matching modes cụ thể bị lỗi
2. **Lifecycle Testing**: Track component mount lifecycle để xác định phase lỗi xảy ra
3. **Property Testing**: Verify bug universal across all modes
4. **Console Monitoring**: Capture ReferenceError trong console logs

## Conclusion

✅ **Task 1 Complete**: Bug condition exploration test đã được viết, chạy, và FAIL như mong đợi trên code chưa sửa.

### Counterexamples Summary
- **Primary Counterexample**: `ReferenceError: Cannot access 'reasonsMap' before initialization`
- **Error Location**: Matching.tsx, line 73 (handleProfileClick dependency array)
- **Affected Modes**: ALL 4 modes (lover, study, hobby, quick)
- **Impact Phase**: Initialization phase, before component mount

### Next Steps
- ✅ Task 1: Complete (bug confirmed)
- ⏭️ Task 2: Viết preservation property tests
- ⏭️ Task 3: Implement fix (di chuyển reasonsMap lên trước handleProfileClick)
- ⏭️ Task 4: Verify cả bug condition và preservation tests đều PASS sau fix

---

**Documentation Created**: 2026-06-19  
**Test Status**: Confirmed bug exists ✅  
**Ready for**: Task 2 - Preservation Tests
