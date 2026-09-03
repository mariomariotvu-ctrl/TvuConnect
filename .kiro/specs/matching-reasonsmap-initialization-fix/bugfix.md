# Bugfix Requirements Document

## Introduction

Component `Matching.tsx` gặp lỗi **ReferenceError: Cannot access 'reasonsMap' before initialization** do sử dụng biến `reasonsMap` trong `useCallback` hook trước khi biến được khai báo bằng `useMemo`.

**Vị trí lỗi:**
- **Dòng 64**: `handleProfileClick` callback sử dụng `reasonsMap` trong dependency array
- **Dòng 148**: `reasonsMap` được định nghĩa sau đó bằng `useMemo`

**Root Cause:**  
JavaScript không cho phép truy cập biến trước khi khai báo (temporal dead zone). React đọc code từ trên xuống, khi `handleProfileClick` được định nghĩa, `reasonsMap` chưa tồn tại.

**Impact:**  
- Component Matching crash khi render
- User không thể sử dụng tính năng ghép đôi
- Ảnh hưởng tất cả 4 matching modes: lover, study, hobby, quick

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN component Matching render lần đầu THEN hệ thống throw ReferenceError "Cannot access 'reasonsMap' before initialization"

1.2 WHEN React đọc code từ dòng 64 (handleProfileClick) THEN hệ thống cố gắng truy cập reasonsMap chưa được khai báo và crash

1.3 WHEN user click vào tính năng Matching (bất kỳ mode nào) THEN component không render được và hiển thị error boundary

### Expected Behavior (Correct)

2.1 WHEN component Matching render lần đầu THEN hệ thống SHALL render thành công không có lỗi initialization

2.2 WHEN React đọc code từ dòng 64 (handleProfileClick) THEN hệ thống SHALL có thể truy cập reasonsMap một cách an toàn

2.3 WHEN user click vào tính năng Matching (bất kỳ mode nào) THEN component SHALL hiển thị giao diện ghép đôi bình thường

### Unchanged Behavior (Regression Prevention)

3.1 WHEN handleProfileClick được gọi với profile hợp lệ THEN hệ thống SHALL CONTINUE TO track profile click và call onMatchFound callback

3.2 WHEN reasonsMap được sử dụng trong MatchingResults component THEN hệ thống SHALL CONTINUE TO hiển thị matching reasons chính xác

3.3 WHEN user thực hiện matching với filters THEN hệ thống SHALL CONTINUE TO tính toán matching reasons dựa trên profile và mode

3.4 WHEN component re-render do matchedProfiles hoặc mode thay đổi THEN reasonsMap SHALL CONTINUE TO được tính toán lại chính xác

---

## Bug Condition Specification

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ComponentRenderContext
  OUTPUT: boolean
  
  // Bug xảy ra khi handleProfileClick được định nghĩa trước reasonsMap
  RETURN (
    X.handleProfileClick_line < X.reasonsMap_line AND
    X.handleProfileClick_dependencies.includes('reasonsMap')
  )
END FUNCTION
```

### Property Specification

```pascal
// Property: Fix Checking - Initialization Order
FOR ALL X WHERE isBugCondition(X) DO
  result ← render_Matching_Component(X)
  ASSERT (
    no_reference_error(result) AND
    component_renders_successfully(result) AND
    handleProfileClick_can_access_reasonsMap(result)
  )
END FOR
```

### Preservation Property

```pascal
// Property: Preservation Checking - Matching Functionality
FOR ALL X WHERE NOT isBugCondition(X) DO
  original_behavior ← F(X)  // Original working behavior
  fixed_behavior ← F'(X)     // Fixed behavior
  
  ASSERT (
    fixed_behavior.handleProfileClick_logic = original_behavior.handleProfileClick_logic AND
    fixed_behavior.reasonsMap_calculation = original_behavior.reasonsMap_calculation AND
    fixed_behavior.matching_results = original_behavior.matching_results AND
    fixed_behavior.profile_click_tracking = original_behavior.profile_click_tracking
  )
END FOR
```

### Counterexample

**Concrete bug demonstration:**

```typescript
// BUG: Dòng 64 - handleProfileClick defined first
const handleProfileClick = useCallback((profile: StudentProfile) => {
  const matchScore = reasonsMap.get(profile.uid)?.length || 0;  // ❌ reasonsMap chưa tồn tại
  trackProfileClick(currentUser.uid, profile.uid, matchScore);
  onMatchFound(profile);
}, [reasonsMap, currentUser.uid, onMatchFound]);  // ❌ reasonsMap trong deps

// ... 80+ dòng code ...

// Dòng 148 - reasonsMap defined after
const reasonsMap = useMemo(() => {  // ❌ Quá muộn!
  const map = new Map<string, string[]>();
  matchedProfiles.forEach(profile => {
    const reasons = currentProfile ? getMatchingReasons(currentProfile, profile, mode) : [];
    map.set(profile.uid, reasons);
  });
  return map;
}, [matchedProfiles, currentProfile, mode]);
```

**Error Result:**
```
ReferenceError: Cannot access 'reasonsMap' before initialization
    at Matching (http://localhost:3000/src/components/Matching.tsx:19:28)
    at Suspense (<anonymous>)
    at RouteLoader (http://localhost:3000/src/components/RouteLoader.tsx:4:3)
    at div (<anonymous>)
    at MotionDOMComponent (http://localhost:3000/node_modules/.vite/deps/chunk-IYWVMA6O.js?v=3a57e1b5:8882:40)
    at PopChildMeasure (http://localhost:3000/node_modules/.vite/deps/chunk-IYWVMA6O.js?v=3a57e1b5:8021:23)
    at PopChild (http://localhost:3000/node_modules/.vite/deps/chunk-IYWVMA6O.js?v=3a57e1b5:8048:21)
    at PresenceChild (http://localhost:3000/node_modules/.vite/deps/chunk-IYWVMA6O.js?v=3a57e1b5:8098:24)
    at AnimatePresence (http://localhost:3000/node_modules/.vite/deps/chunk-IYWVMA6O.js?v=3a57e1b5:8175:26)
    at div (<anonymous>)
    at main (<anonymous>)
    at div (<anonymous>)
    at App (http://localhost:3000/src/App.tsx:36:21)
    at ThemeProvider (http://localhost:3000/src/contexts/ThemeContext.tsx:10:33)
    at ErrorBoundary (http://localhost:3000/src/components/ErrorBoundary.tsx:6:5)
```

**Lưu ý:** Stack trace báo lỗi ở dòng 19 (component declaration), nhưng root cause là ở dòng 64 (handleProfileClick sử dụng reasonsMap trước khi nó được khai báo ở dòng 148).
