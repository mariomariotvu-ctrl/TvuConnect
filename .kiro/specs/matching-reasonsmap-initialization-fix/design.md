# Matching ReasonsMap Initialization Fix - Bugfix Design

## Overview

Bug này xảy ra do vi phạm quy tắc temporal dead zone trong JavaScript - biến `reasonsMap` được sử dụng trong `handleProfileClick` callback (dòng 64) trước khi nó được khai báo bằng `useMemo` hook (dòng 148). Điều này gây ra ReferenceError và crash component Matching, khiến user không thể sử dụng tính năng ghép đôi.

Chiến lược fix: Di chuyển khai báo `reasonsMap` lên trước `handleProfileClick`, hoặc loại bỏ dependency `reasonsMap` khỏi `handleProfileClick` bằng cách tính toán matching score trực tiếp trong callback.

## Glossary

- **Bug_Condition (C)**: Tình huống `handleProfileClick` callback được định nghĩa trước khi `reasonsMap` được khai báo, dẫn đến ReferenceError
- **Property (P)**: Component render thành công và `handleProfileClick` có thể truy cập `reasonsMap` an toàn
- **Preservation**: Tất cả logic matching, tracking analytics, và hiển thị matching reasons phải hoạt động giống hệt như trước
- **reasonsMap**: Map chứa matching reasons cho mỗi profile, được tính bằng `getMatchingReasons()`
- **handleProfileClick**: Event handler callback xử lý khi user click vào profile card
- **Temporal Dead Zone (TDZ)**: Vùng code từ đầu scope đến nơi biến được khai báo, trong đó biến không thể truy cập được

## Bug Details

### Bug Condition

Bug xuất hiện khi component Matching render và React đọc code từ trên xuống. `handleProfileClick` callback được định nghĩa ở dòng 64 với dependency array bao gồm `reasonsMap`, nhưng `reasonsMap` mới được khai báo ở dòng 148 (sau 84 dòng code). JavaScript không cho phép truy cập biến trước khi khai báo (temporal dead zone), nên component crash với ReferenceError.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ComponentRenderContext
  OUTPUT: boolean
  
  RETURN input.handleProfileClick_line < input.reasonsMap_line
         AND input.handleProfileClick_dependencies.includes('reasonsMap')
         AND component_is_rendering
END FUNCTION
```

### Examples

- **Ví dụ 1 (Bug)**: User vào tab "Tìm người yêu" → Component Matching render → React đọc dòng 64 (handleProfileClick) → Tìm dependency reasonsMap → reasonsMap chưa tồn tại → ReferenceError → Crash
- **Ví dụ 2 (Bug)**: User vào tab "Bạn cùng học" → Tương tự crash với ReferenceError vì initialization order
- **Ví dụ 3 (Bug)**: User vào tab "Sở thích chung" → Component không render được → Error boundary hiển thị
- **Ví dụ 4 (Bug)**: User vào tab "Kết nối nhanh" → Matching mode = 'quick' → Vẫn crash vì lỗi initialization

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- handleProfileClick phải tiếp tục track analytics với matchScore chính xác (số lượng matching reasons)
- handleProfileClick phải tiếp tục gọi onMatchFound(profile) để navigate đến profile detail
- reasonsMap phải tiếp tục được tính toán từ getMatchingReasons() với đúng currentProfile, profile, và mode
- MatchingResults component phải tiếp tục nhận reasonsMap prop và hiển thị matching reasons chính xác
- Khi matchedProfiles, currentProfile, hoặc mode thay đổi, reasonsMap phải được re-compute

**Scope:**
Tất cả các hành vi không liên quan đến initialization order của reasonsMap phải hoàn toàn không thay đổi:
- Logic tính toán matching reasons (getMatchingReasons function)
- Tracking analytics (trackProfileClick với matchScore)
- Navigation behavior (onMatchFound callback)
- Re-rendering behavior (useMemo dependencies)
- Display behavior trong MatchingResults component

## Hypothesized Root Cause

Dựa trên phân tích code và error stack trace, root cause chính xác là:

1. **Initialization Order Violation**: Code được tổ chức theo thứ tự logic (event handlers trước, derived state sau), nhưng JavaScript yêu cầu khai báo biến trước khi sử dụng. Đây là conflict giữa code organization preference và language constraint.

2. **React Hook Dependencies**: `useCallback` hook ở dòng 64 có dependency array `[reasonsMap, currentUser.uid, onMatchFound]`. React đọc dependency này khi component render, nhưng `reasonsMap` chưa được khai báo nên gây ReferenceError.

3. **useMemo Placement**: `reasonsMap` được khai báo bằng `useMemo` ở dòng 148, quá xa so với nơi nó được sử dụng lần đầu (dòng 64). Khoảng cách 84 dòng code làm tăng risk của loại lỗi này.

4. **No TypeScript/ESLint Warning**: TypeScript và ESLint không warning về vấn đề này trong development vì chúng không enforce initialization order cho React hooks. Bug chỉ xuất hiện khi runtime execution.

## Correctness Properties

Property 1: Bug Condition - Component Renders Without ReferenceError

_For any_ component render context where handleProfileClick is defined before reasonsMap, the fixed component SHALL successfully render without throwing ReferenceError, and handleProfileClick SHALL be able to access matching score data when invoked.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Matching Functionality Unchanged

_For any_ profile click event where the bug condition does NOT apply (runtime behavior), the fixed handleProfileClick SHALL produce exactly the same tracking analytics and navigation behavior as the original code, preserving matchScore calculation accuracy and onMatchFound callback invocation.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming root cause analysis đúng (initialization order violation):

**File**: `src/components/Matching.tsx`

**Function**: Component body - Reorder hooks and callbacks

**Specific Changes**:

**Solution Option 1: Move reasonsMap before handleProfileClick** (RECOMMENDED)

1. **Di chuyển useMemo reasonsMap**: Move block code từ dòng 148-156 lên vị trí sau `useCachedMatching` hook (khoảng dòng 55)
   - Giữ nguyên logic: `getMatchingReasons(currentProfile, profile, mode)` cho mỗi profile
   - Giữ nguyên dependencies: `[matchedProfiles, currentProfile, mode]`
   - Đảm bảo `matchedProfiles` và `currentProfile` đã available ở vị trí mới

2. **Verify dependencies order**: Đảm bảo `matchedProfiles` (từ useCachedMatching) và `currentProfile` (từ useEffect) đã được khai báo trước reasonsMap
   - useCachedMatching hook ở dòng 46-52 → matchedProfiles available
   - currentProfile state ở dòng 41 → available
   - Có thể di chuyển an toàn

3. **Keep handleProfileClick unchanged**: Giữ nguyên callback ở dòng 64-69 với dependency [reasonsMap, currentUser.uid, onMatchFound]

**Solution Option 2: Remove reasonsMap dependency** (ALTERNATIVE)

1. **Refactor handleProfileClick**: Thay vì dùng `reasonsMap.get(profile.uid)`, tính toán trực tiếp:
   ```typescript
   const matchScore = currentProfile 
     ? getMatchingReasons(currentProfile, profile, mode).length 
     : 0;
   ```

2. **Update dependencies**: Thay [reasonsMap, ...] thành [currentProfile, mode, ...]

3. **Trade-off**: Tính toán lại mỗi lần click thay vì lookup từ Map (nhưng impact minimal vì chỉ 1 profile per click)

**Recommended Solution**: Option 1 - Di chuyển reasonsMap lên trước handleProfileClick. Lý do:
- Giữ nguyên performance optimization (Map lookup thay vì re-calculate)
- Ít thay đổi code hơn (chỉ di chuyển, không refactor logic)
- Clear separation: derived state (reasonsMap) trước event handlers (handleProfileClick)
- Phù hợp với best practice: khai báo dependencies trước khi sử dụng

## Testing Strategy

### Validation Approach

Testing strategy sử dụng two-phase approach: trước tiên chạy exploratory tests trên UNFIXED code để surface counterexamples và confirm root cause, sau đó verify fix works và không introduce regression.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating bug trên unfixed code. Confirm rằng initialization order là root cause thực sự.

**Test Plan**: Viết tests simulate component render với các matching modes khác nhau. Run trên UNFIXED code để observe ReferenceError. Verify rằng error xuất hiện chính xác khi handleProfileClick được call hoặc dependencies được read.

**Test Cases**:
1. **Render Lover Mode Test**: Mount component với mode='lover' → Expect ReferenceError (will fail on unfixed code)
2. **Render Study Mode Test**: Mount component với mode='study' → Expect ReferenceError (will fail on unfixed code)
3. **Render Hobby Mode Test**: Mount component với mode='hobby' → Expect ReferenceError (will fail on unfixed code)
4. **Profile Click Test**: Render thành công (nếu có) và simulate profile click → Expect crash khi access reasonsMap (may fail on unfixed code)

**Expected Counterexamples**:
- Component mount throws ReferenceError: "Cannot access 'reasonsMap' before initialization"
- Error stack trace points đến handleProfileClick callback definition
- Possible causes: initialization order, temporal dead zone, React hook dependency reading

### Fix Checking

**Goal**: Verify rằng với mọi render context where bug condition holds (handleProfileClick trước reasonsMap), fixed component render thành công.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := render_Matching_Component_Fixed(input)
  ASSERT no_reference_error(result)
  ASSERT component_renders_successfully(result)
  ASSERT handleProfileClick_can_access_reasonsMap(result)
END FOR
```

### Preservation Checking

**Goal**: Verify rằng với mọi runtime behavior (profile clicks, matching, etc), fixed component produces same result như original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleProfileClick_original(input) = handleProfileClick_fixed(input)
  ASSERT reasonsMap_calculation_original(input) = reasonsMap_calculation_fixed(input)
  ASSERT matching_results_display_original(input) = matching_results_display_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing recommended cho preservation checking vì:
- Generates nhiều test cases tự động across different profiles, modes, filters
- Catches edge cases mà manual tests có thể miss (empty profiles, null currentProfile, etc)
- Provides strong guarantee rằng matching logic unchanged cho all input combinations

**Test Plan**: Observe behavior trên UNFIXED code (nếu có thể mount được bằng cách mock reasonsMap), sau đó write property-based tests capturing behavior đó.

**Test Cases**:
1. **handleProfileClick Preservation**: Observe rằng trackProfileClick được gọi với correct matchScore, sau đó verify behavior continues after fix
2. **reasonsMap Calculation Preservation**: Observe rằng getMatchingReasons được gọi cho mỗi profile, sau đó verify same calculation after fix
3. **MatchingResults Display Preservation**: Observe rằng reasons được hiển thị đúng trong UI, sau đó verify same display after fix
4. **Re-render Preservation**: Observe rằng reasonsMap re-compute khi matchedProfiles thay đổi, sau đó verify same behavior after fix

### Unit Tests

- Test component renders successfully với các modes: lover, study, hobby, quick
- Test handleProfileClick calls trackProfileClick với correct matchScore
- Test handleProfileClick calls onMatchFound với correct profile
- Test reasonsMap được tính toán correctly từ getMatchingReasons
- Test edge case: currentProfile = null → reasonsMap has empty arrays

### Property-Based Tests

- Generate random profiles và verify reasonsMap contains correct reasons for each
- Generate random modes (lover, study, hobby, quick) và verify matching reasons calculation
- Generate random currentProfile states và verify handleProfileClick behavior consistent
- Test với nhiều matchedProfiles counts (0, 1, 10, 100) để verify performance

### Integration Tests

- Test full matching flow: start matching → profiles loaded → click profile → navigate to detail
- Test analytics tracking: verify trackProfileClick called với correct matchScore từ reasonsMap
- Test re-render behavior: change filters → new profiles → reasonsMap updates → click works correctly
- Test với real Firebase data để verify end-to-end functionality preserved
