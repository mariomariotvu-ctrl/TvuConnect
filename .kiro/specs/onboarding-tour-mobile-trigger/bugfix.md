# Bugfix Requirements Document

## Introduction

Trên mobile, khi user click vào nút "Xem hướng dẫn sử dụng" trong Settings, onboarding tour không khởi động. App chuyển về Home view nhưng tour không hiển thị, khiến user không thể xem hướng dẫn sử dụng các tính năng của TVU Connect.

Bug này ảnh hưởng đến trải nghiệm người dùng mới trên mobile, vì họ không thể truy cập hướng dẫn sử dụng khi cần.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN user trên mobile (width < 768px) click vào nút "Xem hướng dẫn sử dụng" trong Settings THEN app chuyển về Home view nhưng tour KHÔNG khởi động và không có gì hiển thị

1.2 WHEN `onShowTour()` được gọi từ Settings THEN `setView('home')` được thực thi và sau 100ms `setShowOnboarding(true)` được set nhưng tour vẫn không hiển thị trên mobile

1.3 WHEN OnboardingTour component nhận `run=true` trên mobile THEN các elements với `data-tour` attributes có thể chưa render xong, dẫn đến tour không tìm thấy target elements

### Expected Behavior (Correct)

2.1 WHEN user trên mobile click vào nút "Xem hướng dẫn sử dụng" trong Settings THEN app SHALL chuyển về Home view VÀ tour SHALL khởi động hiển thị hướng dẫn từng bước

2.2 WHEN `onShowTour()` được gọi từ Settings THEN app SHALL đợi đủ thời gian để Home view render xong tất cả elements với `data-tour` attributes TRƯỚC KHI trigger tour

2.3 WHEN OnboardingTour component nhận `run=true` trên mobile THEN tour SHALL verify rằng tất cả target elements đã tồn tại trong DOM TRƯỚC KHI bắt đầu tour

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user trên desktop (width >= 768px) click vào nút "Xem hướng dẫn sử dụng" THEN tour SHALL CONTINUE TO khởi động và hiển thị bình thường như hiện tại

3.2 WHEN tour được trigger từ first-time login flow (không phải từ Settings) THEN tour SHALL CONTINUE TO hoạt động bình thường trên cả mobile và desktop

3.3 WHEN user đang ở Home view và tour được trigger THEN tour SHALL CONTINUE TO hiển thị ngay lập tức mà không cần chuyển view

3.4 WHEN tour đang chạy và user click "Bỏ qua" hoặc "Xong" THEN tour SHALL CONTINUE TO đóng và lưu trạng thái đã xem vào localStorage

3.5 WHEN các elements với `data-tour` attributes không tồn tại (ví dụ: bị ẩn bởi permissions) THEN tour SHALL CONTINUE TO skip các steps đó và chuyển sang step tiếp theo

## Bug Condition Derivation

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type TourTriggerContext {
    isMobile: boolean,
    triggerSource: 'settings' | 'first-login' | 'home',
    currentView: View,
    elementsReady: boolean
  }
  OUTPUT: boolean
  
  // Bug xảy ra khi:
  // 1. Đang trên mobile
  // 2. Trigger từ Settings (cần chuyển view)
  // 3. Elements chưa ready khi tour start
  RETURN X.isMobile = true 
    AND X.triggerSource = 'settings' 
    AND X.currentView != 'home'
    AND X.elementsReady = false
END FUNCTION
```

### Property Specification - Fix Checking

```pascal
// Property: Tour khởi động thành công trên mobile khi trigger từ Settings
FOR ALL X WHERE isBugCondition(X) DO
  result ← triggerTourFromSettings'(X)
  ASSERT result.tourStarted = true 
    AND result.elementsFound >= 7  // Tất cả 7 navigation items
    AND result.firstStepVisible = true
    AND no_error(result)
END FOR
```

### Property Specification - Preservation Checking

```pascal
// Property: Các trường hợp không bị bug vẫn hoạt động bình thường
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT triggerTourFromSettings(X) = triggerTourFromSettings'(X)
END FOR

// Cụ thể:
// - Desktop tour từ Settings: vẫn hoạt động
// - Mobile tour từ first-login: vẫn hoạt động  
// - Tour khi đã ở Home view: vẫn hoạt động
// - Tour skip/close behavior: vẫn hoạt động
```

### Counterexample

**Concrete example demonstrating the bug:**

```typescript
// Mobile user (iPhone 13, width = 390px)
const buggyInput = {
  isMobile: true,
  triggerSource: 'settings',
  currentView: 'settings',
  elementsReady: false
};

// Current behavior (buggy):
onShowTour() {
  setView('home');           // View changes
  setTimeout(() => {
    setShowOnboarding(true); // After 100ms
  }, 100);
}
// Result: Tour không hiển thị vì elements chưa render xong

// Expected behavior (fixed):
onShowTour() {
  setView('home');
  setTimeout(() => {
    // Verify elements exist first
    const elementsReady = checkTourElements();
    if (elementsReady) {
      setShowOnboarding(true);
    }
  }, 300); // Longer delay for mobile
}
// Result: Tour hiển thị thành công
```

