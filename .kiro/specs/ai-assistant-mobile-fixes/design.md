# AI Assistant Mobile Fixes - Bugfix Design

## Overview

AI Assistant (TVU Buddy) hiện tại có nhiều vấn đề nghiêm trọng về mobile UX, đặc biệt là keyboard interaction và scroll behavior. Design này tập trung vào việc tối ưu hóa trải nghiệm mobile bằng cách:

1. **Visual Viewport API Integration** - Sử dụng `window.visualViewport` để detect và adapt với keyboard height
2. **Smart Scroll Management** - Loại bỏ aggressive scroll-to-top, implement conditional auto-scroll
3. **Touch Optimization** - Thêm visual feedback và prevent default browser behaviors
4. **Layout Stability** - Ensure input field luôn visible và accessible

**Chiến lược chính:** Detect mobile device, apply mobile-specific behaviors, preserve 100% desktop experience.

## Glossary

- **Bug_Condition (C)**: Điều kiện trigger bug - khi user sử dụng AI Assistant trên mobile device với keyboard interaction
- **Property (P)**: Behavior mong muốn - input field luôn visible, scroll smooth, touch responsive
- **Preservation**: Desktop experience và core AI functionality phải giữ nguyên 100%
- **Visual Viewport**: Browser API cung cấp thông tin về visible area (excluding keyboard)
- **visualViewport.height**: Chiều cao thực tế của viewport sau khi trừ keyboard height
- **scrollIntoView()**: DOM API để scroll element vào view, có options `behavior` và `block`
- **touch-action**: CSS property để control touch behaviors (pan, zoom, manipulation)
- **isMobile**: Boolean flag detect mobile device dựa trên screen width và touch capability

## Bug Details

### Bug Condition

Bug xảy ra khi user sử dụng AI Assistant trên mobile device và interact với keyboard. Component hiện tại không có mobile-specific handling, dẫn đến input field bị che, scroll conflicts, và poor touch experience.

**Formal Specification:**
```
FUNCTION isBugCondition(context)
  INPUT: context of type { device: string, keyboardOpen: boolean, userAction: string }
  OUTPUT: boolean
  
  RETURN context.device === 'mobile'
         AND (
           (context.keyboardOpen === true AND inputFieldNotVisible())
           OR (context.userAction === 'tab_switch' AND aggressiveScrollToTop())
           OR (context.userAction === 'touch' AND noVisualFeedback())
           OR (context.userAction === 'ai_response' AND scrollConflict())
         )
END FUNCTION
```

### Examples

**Example 1: Input Field Hidden by Keyboard**
- User: Tap vào input field trên iPhone
- Expected: Input field scroll vào view và visible above keyboard
- Actual: Keyboard mở lên che mất input field, user không thấy mình gõ gì

**Example 2: Aggressive Scroll-to-Top**
- User: Chuyển sang AI tab
- Expected: Scroll to top một lần smooth
- Actual: Component thực hiện 4-5 lần `scrollToTop` với delays khác nhau, gây jerky experience

**Example 3: No Touch Feedback**
- User: Tap vào quick reply button
- Expected: Button scale down 0.95 với transition 150ms
- Actual: Không có visual feedback, user không chắc đã tap thành công

**Example 4: Auto-scroll Interrupts Reading**
- User: Đang scroll đọc tin nhắn cũ, AI trả lời tin mới
- Expected: Auto-scroll chỉ trigger nếu user ở gần bottom
- Actual: Auto-scroll luôn trigger, interrupt user's reading

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Desktop scroll behavior (scroll to top on tab change, auto scroll on AI response)
- Desktop height calculation (100dvh without keyboard adjustments)
- Desktop hover effects và mouse interactions
- AI response logic (rate limiting, caching, error handling)
- Message sending logic và quick reply functionality
- Image rendering trong AI responses
- Theme switching (dark/light mode)
- Message history management
- Component remount behavior với `aiKey`

**Scope:**
Tất cả inputs và interactions trên desktop (screen width >= 768px) phải hoạt động CHÍNH XÁC như hiện tại. Không được có bất kỳ regression nào trên desktop experience.

## Hypothesized Root Cause

Dựa trên bug description và code analysis, các root causes chính là:

1. **No Mobile Detection**: Component không có logic phân biệt mobile vs desktop, apply same behaviors cho cả hai

2. **No Visual Viewport API**: Component sử dụng `100dvh` nhưng không listen to `visualViewport` events để adjust cho keyboard

3. **Aggressive Scroll-to-Top**: useEffect với multiple setTimeout (0, 50, 100, 200ms) thực hiện scroll-to-top aggressive, không có mobile-specific handling

4. **Unconditional Auto-scroll**: Auto-scroll to bottom luôn trigger khi AI responds, không check user's scroll position

5. **No Touch Optimization**: Buttons không có touch feedback CSS, không prevent double-tap zoom

## Correctness Properties

Property 1: Bug Condition - Mobile Keyboard Handling

_For any_ mobile user interaction where keyboard opens (input focus, typing), the fixed AIAssistant component SHALL automatically adjust viewport height using Visual Viewport API, scroll input field into view, and maintain input visibility throughout the typing session.

**Validates: Requirements 2.1, 2.2, 2.3, 2.7, 2.8**

Property 2: Preservation - Desktop Experience

_For any_ desktop user interaction (screen width >= 768px), the fixed AIAssistant component SHALL produce exactly the same scroll behavior, height calculation, and interaction patterns as the original component, preserving all existing desktop functionality without any regression.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12**

## Fix Implementation

### Changes Required

**File**: `src/components/AIAssistant.tsx`

**Function**: `AIAssistant` component

**Specific Changes**:

#### 1. Add Mobile Detection Hook

```typescript
// Add at top of component
const [isMobile, setIsMobile] = useState(false);
const [viewportHeight, setViewportHeight] = useState<number | null>(null);

useEffect(() => {
  // Detect mobile: screen width < 768px AND touch capability
  const checkMobile = () => {
    const isMobileDevice = window.innerWidth < 768 && 
                          ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    setIsMobile(isMobileDevice);
  };
  
  checkMobile();
  window.addEventListener('resize', checkMobile);
  
  return () => window.removeEventListener('resize', checkMobile);
}, []);
```

**Rationale**: Cần detect mobile để apply mobile-specific behaviors. Combine screen width và touch capability để accurate detection.

#### 2. Integrate Visual Viewport API

```typescript
useEffect(() => {
  if (!isMobile) return; // Only for mobile
  
  const handleViewportChange = () => {
    if (window.visualViewport) {
      setViewportHeight(window.visualViewport.height);
    }
  };
  
  // Check if Visual Viewport API is supported
  if (window.visualViewport) {
    handleViewportChange();
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
    
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }
}, [isMobile]);
```

**Rationale**: Visual Viewport API cung cấp accurate height sau khi trừ keyboard. Fallback gracefully nếu browser không support.

#### 3. Replace Aggressive Scroll-to-Top

**OLD CODE (Remove):**
```typescript
useEffect(() => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };
  
  scrollToTop();
  
  const timers = [
    setTimeout(scrollToTop, 0),
    setTimeout(scrollToTop, 50),
    setTimeout(scrollToTop, 100),
    setTimeout(scrollToTop, 200),
  ];
  
  return () => {
    timers.forEach(timer => clearTimeout(timer));
  };
}, []);
```

**NEW CODE (Replace with):**
```typescript
useEffect(() => {
  // Single, smooth scroll to top on mount
  if (containerRef.current) {
    containerRef.current.scrollTop = 0;
  }
  
  // For mobile, also ensure window is at top
  if (isMobile) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}, []); // Only run once on mount
```

**Rationale**: Loại bỏ multiple aggressive attempts. Single smooth scroll đủ và không gây conflicts.

#### 4. Implement Conditional Auto-scroll

**OLD CODE (Replace):**
```typescript
useEffect(() => {
  if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages]);
```

**NEW CODE:**
```typescript
useEffect(() => {
  if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
    // Check if user is near bottom (within 100px)
    const container = containerRef.current;
    if (container) {
      const isNearBottom = 
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      // Only auto-scroll if user is near bottom
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}, [messages]);
```

**Rationale**: Chỉ auto-scroll khi user đang ở gần bottom. Không interrupt nếu user đang scroll đọc tin cũ.

#### 5. Add Input Focus Handler for Mobile

```typescript
const handleInputFocus = () => {
  if (!isMobile) return;
  
  // Wait for keyboard to open (300ms delay)
  setTimeout(() => {
    inputRef.current?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
  }, 300);
};

// Update input element
<input
  ref={inputRef}
  onFocus={handleInputFocus}
  // ... other props
/>
```

**Rationale**: Khi keyboard mở, scroll input vào center của visible viewport. 300ms delay để keyboard animation hoàn tất.

#### 6. Update Container Height Calculation

**OLD CODE:**
```typescript
<div 
  className="flex flex-col overflow-hidden"
  style={{ 
    height: '100%',
    maxHeight: '100dvh'
  }}
>
```

**NEW CODE:**
```typescript
<div 
  className="flex flex-col overflow-hidden"
  style={{ 
    height: '100%',
    maxHeight: isMobile && viewportHeight 
      ? `${viewportHeight}px` 
      : '100dvh'
  }}
>
```

**Rationale**: Trên mobile, sử dụng `viewportHeight` từ Visual Viewport API. Trên desktop, giữ nguyên `100dvh`.

#### 7. Add Touch Optimization CSS

```typescript
// Add to button styles
style={{
  // ... existing styles
  touchAction: 'manipulation', // Prevent double-tap zoom
  WebkitTapHighlightColor: 'transparent', // Remove tap highlight
  transition: 'transform 0.15s ease, opacity 0.15s ease'
}}

// Add active state for touch feedback
className={`... active:scale-95 active:opacity-80`}
```

**Rationale**: `touch-action: manipulation` prevent double-tap zoom. `active:` pseudo-class provide instant visual feedback.

#### 8. Optimize Loading State Position

**Update loading indicator:**
```typescript
{isLoading && (
  <div className="flex justify-start">
    <div
      className={`rounded-xl px-3 py-2 flex items-center gap-2 ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-gray-700 to-gray-800 text-gray-100'
          : 'bg-white text-gray-900 shadow-sm'
      }`}
      style={{
        border: theme === 'light' ? '1px solid rgba(229, 231, 235, 0.8)' : 'none',
        // Ensure loading doesn't push input out of view
        marginBottom: isMobile ? '8px' : '0'
      }}
    >
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">{loadingMessage}</span>
    </div>
  </div>
)}
```

**Rationale**: Add margin-bottom trên mobile để loading message không đẩy input field ra khỏi viewport.

#### 9. Add TypeScript Type Declarations

```typescript
// Add at top of file
declare global {
  interface Window {
    visualViewport?: {
      height: number;
      width: number;
      addEventListener: (event: string, handler: () => void) => void;
      removeEventListener: (event: string, handler: () => void) => void;
    };
  }
}
```

**Rationale**: TypeScript không có built-in types cho Visual Viewport API. Cần declare để avoid type errors.

## Testing Strategy

### Validation Approach

Testing strategy gồm 3 phases:
1. **Exploratory Bug Condition Checking** - Verify bugs exist on unfixed code
2. **Fix Checking** - Verify fix works correctly on mobile
3. **Preservation Checking** - Verify desktop experience unchanged

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating bugs BEFORE implementing fix. Confirm root cause analysis.

**Test Plan**: Manual testing trên mobile devices (iPhone, Android) và desktop browsers. Document observed behaviors.

**Test Cases**:

1. **Mobile Input Visibility Test** (will fail on unfixed code)
   - Device: iPhone 13 Safari
   - Steps: Open AI tab → Tap input field → Start typing
   - Expected failure: Input field hidden by keyboard
   - Root cause confirmation: No Visual Viewport API integration

2. **Aggressive Scroll Test** (will fail on unfixed code)
   - Device: Android Chrome
   - Steps: Switch to AI tab → Observe scroll behavior
   - Expected failure: Multiple jerky scroll-to-top attempts
   - Root cause confirmation: Multiple setTimeout calls in useEffect

3. **Touch Feedback Test** (will fail on unfixed code)
   - Device: iPhone 13 Safari
   - Steps: Tap quick reply buttons
   - Expected failure: No visual feedback on tap
   - Root cause confirmation: No touch-action CSS, no active states

4. **Auto-scroll Interrupt Test** (will fail on unfixed code)
   - Device: Android Chrome
   - Steps: Scroll up to read old messages → Wait for AI response
   - Expected failure: Auto-scroll interrupts reading
   - Root cause confirmation: Unconditional scrollIntoView on AI response

**Expected Counterexamples**:
- Input field bị che bởi keyboard
- Multiple scroll-to-top attempts (4-5 lần)
- Buttons không có visual feedback khi tap
- Auto-scroll interrupt user's manual scroll

### Fix Checking

**Goal**: Verify that for all mobile inputs where bug condition holds, fixed function produces expected behavior.

**Pseudocode:**
```
FOR ALL mobileInput WHERE isBugCondition(mobileInput) DO
  result := AIAssistant_fixed(mobileInput)
  ASSERT expectedBehavior(result)
END FOR
```

**Test Plan**: Manual testing trên mobile devices sau khi implement fix.

**Test Cases**:

1. **Mobile Input Visibility - Fixed**
   - Device: iPhone 13 Safari, Android Chrome
   - Steps: Tap input → Type message → Send
   - Assert: Input field visible throughout, scrolled into view automatically
   - Assert: viewportHeight updates when keyboard opens/closes

2. **Smooth Scroll - Fixed**
   - Device: iPhone 13 Safari, Android Chrome
   - Steps: Switch to AI tab
   - Assert: Single smooth scroll to top, no jerky movements
   - Assert: No multiple setTimeout calls

3. **Touch Feedback - Fixed**
   - Device: iPhone 13 Safari, Android Chrome
   - Steps: Tap quick reply buttons, send button
   - Assert: Visual feedback (scale 0.95, opacity 0.8) with 150ms transition
   - Assert: No double-tap zoom

4. **Conditional Auto-scroll - Fixed**
   - Device: Android Chrome
   - Steps: Scroll up 200px → Wait for AI response
   - Assert: No auto-scroll (user not near bottom)
   - Steps: Scroll to bottom → Wait for AI response
   - Assert: Auto-scroll triggers (user near bottom)

5. **Visual Viewport Integration - Fixed**
   - Device: iPhone 13 Safari
   - Steps: Open keyboard → Rotate device → Close keyboard
   - Assert: Container height adjusts to viewportHeight
   - Assert: Layout stable, no white space or content cut-off

### Preservation Checking

**Goal**: Verify that for all desktop inputs where bug condition does NOT hold, fixed function produces same result as original.

**Pseudocode:**
```
FOR ALL desktopInput WHERE NOT isBugCondition(desktopInput) DO
  ASSERT AIAssistant_original(desktopInput) = AIAssistant_fixed(desktopInput)
END FOR
```

**Testing Approach**: Property-based testing recommended vì:
- Generates many test cases automatically
- Catches edge cases manual tests might miss
- Provides strong guarantees behavior unchanged

**Test Plan**: Observe behavior on UNFIXED code first for desktop, then verify identical behavior on FIXED code.

**Test Cases**:

1. **Desktop Scroll Behavior Preservation**
   - Browser: Chrome Desktop (1920x1080)
   - Steps: Switch to AI tab
   - Observe unfixed: Scroll to top on tab change
   - Verify fixed: Identical scroll behavior
   - Assert: isMobile = false, no mobile-specific code runs

2. **Desktop Height Calculation Preservation**
   - Browser: Chrome Desktop
   - Steps: Open AI tab → Resize window
   - Observe unfixed: Uses 100dvh
   - Verify fixed: Still uses 100dvh (not viewportHeight)
   - Assert: Container maxHeight = '100dvh'

3. **Desktop Hover Effects Preservation**
   - Browser: Chrome Desktop
   - Steps: Hover over buttons
   - Observe unfixed: Hover effects work
   - Verify fixed: Identical hover effects
   - Assert: No touch-specific behaviors on desktop

4. **Desktop Auto-scroll Preservation**
   - Browser: Chrome Desktop
   - Steps: Send message → Wait for AI response
   - Observe unfixed: Auto-scroll to bottom always
   - Verify fixed: Identical auto-scroll behavior
   - Assert: Conditional auto-scroll only applies to mobile

5. **AI Functionality Preservation**
   - Browser: Chrome Desktop + Mobile Safari
   - Steps: Send various messages, test rate limiting, test caching
   - Observe unfixed: AI responses, rate limits, cache hits
   - Verify fixed: Identical AI behavior
   - Assert: No changes to sendMessageToAI, rate limiting, caching logic

### Unit Tests

- Test mobile detection logic (screen width + touch capability)
- Test Visual Viewport API integration (with mock)
- Test conditional auto-scroll logic (near bottom vs far from bottom)
- Test input focus handler (mobile vs desktop)
- Test height calculation (mobile with viewportHeight vs desktop with 100dvh)

### Property-Based Tests

- Generate random screen sizes and verify correct mobile/desktop detection
- Generate random scroll positions and verify conditional auto-scroll logic
- Generate random viewport heights and verify container height calculation
- Test across many device orientations (portrait/landscape)

### Integration Tests

- Full mobile flow: Open AI tab → Type message → Send → Receive response → Type again
- Full desktop flow: Same as mobile, verify identical behavior to unfixed code
- Theme switching: Verify mobile fixes work in both dark/light mode
- Tab switching: Verify mobile fixes work when switching between tabs
- Keyboard open/close cycles: Verify stable layout throughout

