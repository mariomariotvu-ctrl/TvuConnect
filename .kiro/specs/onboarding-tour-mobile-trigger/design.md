# Onboarding Tour Mobile Trigger Bugfix Design

## Overview

Bug này xảy ra khi user trên mobile (width < 768px) click vào nút "Xem hướng dẫn sử dụng" trong Settings. App chuyển về Home view nhưng onboarding tour không khởi động, khiến user không thể xem hướng dẫn sử dụng các tính năng.

Root cause chính là timing issue: khi chuyển từ Settings view sang Home view, các navigation elements với `data-tour` attributes chưa kịp render xong trong DOM trước khi tour được trigger. Delay hiện tại (100ms) quá ngắn cho mobile devices, dẫn đến tour không tìm thấy target elements và không khởi động.

Fix approach: Tăng delay time cho mobile và thêm verification logic để đảm bảo tất cả target elements đã tồn tại trong DOM trước khi start tour.

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt bug - khi user trên mobile trigger tour từ Settings, cần chuyển view và elements chưa ready
- **Property (P)**: Hành vi mong muốn - tour phải khởi động thành công và hiển thị step đầu tiên
- **Preservation**: Các trường hợp tour hoạt động bình thường (desktop, first-login, already on home) phải không bị ảnh hưởng
- **onShowTour**: Handler function trong App.tsx được gọi khi user click "Xem hướng dẫn sử dụng" trong Settings
- **setShowOnboarding**: State setter để trigger OnboardingTour component
- **data-tour**: HTML attribute được dùng để đánh dấu target elements cho tour steps
- **isMobile**: Boolean flag xác định device type dựa trên window.innerWidth < 768px

## Bug Details

### Bug Condition

Bug xảy ra khi user trên mobile click vào nút "Xem hướng dẫn sử dụng" trong Settings. App thực hiện `setView('home')` để chuyển về Home view, sau đó sau 100ms gọi `setShowOnboarding(true)` để trigger tour. Tuy nhiên, 100ms không đủ thời gian để Home view render xong tất cả navigation elements trên mobile, dẫn đến OnboardingTour component không tìm thấy target elements và tour không khởi động.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type TourTriggerContext {
    isMobile: boolean,
    triggerSource: 'settings' | 'first-login' | 'home',
    currentView: View,
    elementsReady: boolean
  }
  OUTPUT: boolean
  
  // Bug xảy ra khi:
  // 1. Đang trên mobile (width < 768px)
  // 2. Trigger từ Settings (cần chuyển view)
  // 3. Current view không phải home (cần navigation)
  // 4. Elements chưa ready khi tour start
  RETURN input.isMobile = true 
    AND input.triggerSource = 'settings' 
    AND input.currentView != 'home'
    AND input.elementsReady = false
END FUNCTION
```

### Examples

**Example 1: Mobile user triggers tour from Settings (BUG)**
- Device: iPhone 13 (width = 390px)
- Current view: Settings
- Action: Click "Xem hướng dẫn sử dụng"
- Expected: Tour khởi động và hiển thị step đầu tiên
- Actual: App chuyển về Home nhưng tour không hiển thị gì

**Example 2: Mobile user triggers tour from Settings (BUG)**
- Device: Samsung Galaxy S21 (width = 360px)
- Current view: Settings
- Action: Click "Xem hướng dẫn sử dụng"
- Expected: Tour khởi động với 7 steps targeting bottom navigation
- Actual: Console log shows "✅ Elements: 0/7" - không tìm thấy elements

**Example 3: Desktop user triggers tour from Settings (WORKS)**
- Device: MacBook Pro (width = 1440px)
- Current view: Settings
- Action: Click "Xem hướng dẫn sử dụng"
- Expected: Tour khởi động và hiển thị step đầu tiên
- Actual: Tour hoạt động bình thường

**Example 4: Mobile user already on Home view (WORKS)**
- Device: iPhone 13 (width = 390px)
- Current view: Home
- Action: Trigger tour programmatically
- Expected: Tour khởi động ngay lập tức
- Actual: Tour hoạt động bình thường vì elements đã có sẵn

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Desktop tour trigger từ Settings phải tiếp tục hoạt động bình thường
- Tour trigger từ first-time login flow phải hoạt động bình thường trên cả mobile và desktop
- Tour trigger khi đã ở Home view phải hiển thị ngay lập tức
- Tour skip/close behavior phải tiếp tục lưu trạng thái vào localStorage
- Tour step navigation (Next, Back, Skip) phải hoạt động như cũ

**Scope:**
Tất cả các trường hợp KHÔNG liên quan đến mobile + Settings trigger phải hoạt động y như hiện tại. Fix này chỉ tập trung vào timing issue khi chuyển view trên mobile.

## Hypothesized Root Cause

Dựa trên bug description và code analysis, các nguyên nhân có thể:

1. **Insufficient Delay Time**: Delay 100ms quá ngắn cho mobile devices để render navigation elements. Mobile thường chậm hơn desktop do:
   - CPU/GPU yếu hơn
   - React re-render phức tạp hơn với responsive layout
   - Bottom navigation có animation/transition effects

2. **No Element Verification**: Code hiện tại không verify xem elements đã tồn tại trong DOM trước khi start tour. OnboardingTour component có debug log nhưng chỉ chạy SAU KHI tour đã được trigger.

3. **Race Condition**: `setView('home')` và `setShowOnboarding(true)` chạy gần như đồng thời (chỉ cách nhau 100ms), tạo race condition giữa view rendering và tour initialization.

4. **Mobile-Specific Rendering**: Mobile navigation (bottom bar) có thể có rendering path khác với desktop navigation (top bar), dẫn đến timing khác nhau.

## Correctness Properties

Property 1: Bug Condition - Tour khởi động thành công trên mobile khi trigger từ Settings

_For any_ tour trigger context where user is on mobile device, triggers tour from Settings view, and needs to navigate to Home view, the fixed onShowTour handler SHALL wait for all navigation elements to be rendered in DOM, then successfully start the tour with first step visible and all 7 target elements found.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-buggy tour triggers hoạt động không thay đổi

_For any_ tour trigger context where the bug condition does NOT hold (desktop from Settings, mobile from first-login, already on Home view, or other scenarios), the fixed code SHALL produce exactly the same tour behavior as the original code, preserving all existing functionality including tour display, step navigation, and state persistence.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Giả sử root cause analysis đúng, chúng ta cần thay đổi:

**File**: `src/App.tsx`

**Function**: `onShowTour` handler trong Settings case

**Specific Changes**:

1. **Tăng Delay Time cho Mobile**: Thay đổi từ 100ms lên 300-400ms để đảm bảo elements đã render xong
   - Desktop: giữ nguyên hoặc dùng delay ngắn hơn (100-150ms)
   - Mobile: dùng delay dài hơn (300-400ms)

2. **Thêm Element Verification Logic**: Trước khi `setShowOnboarding(true)`, verify rằng tất cả 7 target elements đã tồn tại trong DOM
   - Query tất cả `[data-tour]` selectors
   - Đếm số elements tìm thấy
   - Chỉ start tour khi đủ 7 elements (hoặc số minimum cần thiết)

3. **Implement Retry Mechanism**: Nếu elements chưa ready sau delay đầu tiên, retry thêm vài lần với interval ngắn
   - Max retries: 3-5 lần
   - Retry interval: 100ms
   - Total max wait time: ~500-700ms

4. **Add Fallback Error Handling**: Nếu sau tất cả retries vẫn không tìm thấy elements, show toast error cho user
   - Toast message: "Không thể khởi động hướng dẫn. Vui lòng thử lại."
   - Log error để debug

5. **Optimize for Mobile**: Có thể cần thêm logic đặc biệt cho mobile như:
   - Force scroll to top trước khi start tour
   - Ensure bottom navigation visible
   - Disable animations temporarily

## Testing Strategy

### Validation Approach

Testing strategy theo hai giai đoạn: đầu tiên chạy exploratory tests trên UNFIXED code để confirm bug và hiểu root cause, sau đó verify fix hoạt động đúng và không break existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating bug TRƯỚC KHI implement fix. Confirm hoặc refute root cause hypothesis.

**Test Plan**: Viết tests simulate mobile environment và trigger tour từ Settings. Chạy trên UNFIXED code để observe failures.

**Test Cases**:
1. **Mobile Settings to Home Tour Test**: Simulate mobile (width=390px), current view=Settings, click "Xem hướng dẫn sử dụng" (sẽ fail trên unfixed code - tour không start)
2. **Element Timing Test**: Measure thời gian từ khi setView('home') được gọi đến khi tất cả 7 elements xuất hiện trong DOM (sẽ show > 100ms trên mobile)
3. **Race Condition Test**: Log timing của setView và setShowOnboarding calls để confirm race condition (sẽ show chúng chạy quá gần nhau)
4. **Mobile vs Desktop Comparison**: So sánh rendering time giữa mobile và desktop để confirm mobile chậm hơn (sẽ show mobile cần thời gian dài hơn)

**Expected Counterexamples**:
- Tour không khởi động trên mobile khi trigger từ Settings
- Console log shows "✅ Elements: 0/7" hoặc số nhỏ hơn 7
- Timing measurements show elements cần > 100ms để render trên mobile
- Possible causes: insufficient delay, no verification, race condition

### Fix Checking

**Goal**: Verify rằng với mọi input thỏa bug condition, fixed function tạo ra expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := onShowTour_fixed(input)
  ASSERT result.tourStarted = true
  ASSERT result.elementsFound >= 7
  ASSERT result.firstStepVisible = true
  ASSERT no_error(result)
END FOR
```

**Test Cases**:
1. **Mobile iPhone 13 (390px)**: Trigger từ Settings → Tour phải start thành công
2. **Mobile Samsung Galaxy (360px)**: Trigger từ Settings → Tour phải start thành công
3. **Mobile iPad Mini (768px)**: Edge case at breakpoint → Tour phải start thành công
4. **Slow Mobile Device**: Simulate slow rendering → Tour phải wait và start thành công

### Preservation Checking

**Goal**: Verify rằng với mọi input KHÔNG thỏa bug condition, fixed function tạo ra kết quả giống hệt original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT onShowTour_original(input) = onShowTour_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing recommended vì:
- Tự động generate nhiều test cases across input domain
- Catch edge cases mà manual tests có thể miss
- Provide strong guarantees về preservation behavior

**Test Plan**: Observe behavior trên UNFIXED code trước cho các non-buggy cases, sau đó viết property-based tests capture behavior đó.

**Test Cases**:
1. **Desktop Tour from Settings**: Observe trên unfixed code → Verify fixed code giữ nguyên behavior
2. **Mobile First-Login Tour**: Observe trên unfixed code → Verify fixed code giữ nguyên behavior
3. **Already on Home Tour**: Observe trên unfixed code → Verify fixed code giữ nguyên behavior
4. **Tour Skip/Close Behavior**: Observe trên unfixed code → Verify fixed code giữ nguyên localStorage logic
5. **Tour Step Navigation**: Observe trên unfixed code → Verify fixed code giữ nguyên Next/Back/Skip buttons

### Unit Tests

- Test `onShowTour` handler với different device widths (mobile vs desktop)
- Test element verification logic với different DOM states
- Test retry mechanism với simulated delays
- Test fallback error handling khi elements không tìm thấy
- Test timing calculations cho mobile vs desktop

### Property-Based Tests

- Generate random device widths và verify tour behavior consistent
- Generate random view states và verify tour trigger logic correct
- Generate random element availability scenarios và verify verification logic
- Test preservation: generate random non-buggy inputs và verify behavior unchanged

### Integration Tests

- Test full flow: Settings → Click button → Home view → Tour starts trên mobile
- Test full flow trên desktop để verify không bị regression
- Test tour completion flow (Next → Next → ... → Done) sau khi fix
- Test tour skip flow (Skip button) sau khi fix
- Test visual feedback: verify first step tooltip hiển thị đúng vị trí trên mobile
