# AI Assistant Mobile Fixes - Implementation Tasks

## Task Overview

Spec này sửa các vấn đề mobile UX nghiêm trọng trong AI Assistant component. Implementation gồm 4 tasks chính:

1. **Bug Condition Exploration** - Write property test để verify bugs tồn tại
2. **Preservation Test** - Write property test để verify desktop experience không thay đổi
3. **Implement Mobile Fixes** - Apply 9 changes từ design document
4. **Final Verification** - Manual testing trên mobile và desktop devices

**Estimated Total Time**: 4-6 hours

---

## Task 1: Write Bug Condition Exploration Property Test

**Status**: `- [ ]`

**Goal**: Tạo property-based test để verify rằng bugs TỒN TẠI trên unfixed code. Test này PHẢI FAIL trên code hiện tại để confirm root cause analysis đúng.

**File to create**: `.kiro/specs/ai-assistant-mobile-fixes/ai-assistant-mobile.pbt.test.tsx`

**Test Requirements**:

### Property 1: Mobile Input Visibility Bug

Test rằng trên unfixed code, input field BỊ CHE bởi keyboard khi user focus vào input trên mobile.

```typescript
// Pseudocode
PROPERTY mobileInputVisibilityBug
  GIVEN mobile device (width < 768px, touch enabled)
  WHEN user focuses on input field
  THEN input field is NOT visible in viewport (bug exists)
  AND viewportHeight is NOT adjusted for keyboard (no Visual Viewport API)
```

### Property 2: Aggressive Scroll-to-Top Bug

Test rằng trên unfixed code, component thực hiện MULTIPLE scroll-to-top attempts khi mount.

```typescript
// Pseudocode
PROPERTY aggressiveScrollBug
  GIVEN AI Assistant component mounts
  WHEN component initializes
  THEN scrollToTop is called MULTIPLE times (4-5 times)
  AND scroll behavior is jerky/aggressive (bug exists)
```

### Property 3: No Touch Feedback Bug

Test rằng trên unfixed code, buttons KHÔNG CÓ visual feedback khi tap trên mobile.

```typescript
// Pseudocode
PROPERTY noTouchFeedbackBug
  GIVEN mobile device
  WHEN user taps quick reply button
  THEN button does NOT have active state styling (bug exists)
  AND touch-action is NOT set to 'manipulation'
```

### Property 4: Unconditional Auto-scroll Bug

Test rằng trên unfixed code, auto-scroll LUÔN trigger khi AI responds, ngay cả khi user đang scroll đọc tin cũ.

```typescript
// Pseudocode
PROPERTY unconditionalAutoScrollBug
  GIVEN user is scrolled up 200px from bottom
  WHEN AI sends new message
  THEN auto-scroll triggers và interrupts user (bug exists)
  AND scroll position is reset to bottom
```

**Expected Result**: Test PHẢI FAIL trên unfixed code, confirming bugs tồn tại.

**Acceptance Criteria**:
- [ ] Test file created với 4 properties
- [ ] Each property tests một bug condition cụ thể
- [ ] Tests FAIL trên unfixed code (expected behavior)
- [ ] Test output shows clear counterexamples demonstrating bugs
- [ ] Tests use React Testing Library + fast-check for property-based testing

**Estimated Time**: 1.5 hours

---

## Task 2: Write Preservation Property Test

**Status**: `- [ ]`

**Goal**: Tạo property-based test để verify rằng desktop experience KHÔNG THAY ĐỔI sau khi implement fix. Test này PHẢI PASS trên cả unfixed và fixed code.

**File to create**: `.kiro/specs/ai-assistant-mobile-fixes/ai-assistant-preservation.pbt.test.tsx`

**Test Requirements**:

### Property 1: Desktop Scroll Behavior Unchanged

Test rằng trên desktop (width >= 768px), scroll behavior GIỐNG HỆT unfixed code.

```typescript
// Pseudocode
PROPERTY desktopScrollPreserved
  GIVEN desktop device (width >= 768px)
  WHEN component mounts or AI responds
  THEN scroll behavior is IDENTICAL to unfixed code
  AND no mobile-specific scroll logic runs
```

### Property 2: Desktop Height Calculation Unchanged

Test rằng trên desktop, container height vẫn sử dụng `100dvh`, KHÔNG sử dụng viewportHeight.

```typescript
// Pseudocode
PROPERTY desktopHeightPreserved
  GIVEN desktop device
  WHEN component renders
  THEN container maxHeight = '100dvh'
  AND viewportHeight is NOT used
```

### Property 3: Desktop Interactions Unchanged

Test rằng trên desktop, hover effects và mouse interactions GIỐNG HỆT unfixed code.

```typescript
// Pseudocode
PROPERTY desktopInteractionsPreserved
  GIVEN desktop device
  WHEN user hovers over buttons
  THEN hover effects work IDENTICALLY to unfixed code
  AND no touch-specific behaviors apply
```

### Property 4: AI Functionality Unchanged

Test rằng AI response logic, rate limiting, caching GIỐNG HỆT unfixed code trên cả mobile và desktop.

```typescript
// Pseudocode
PROPERTY aiFunctionalityPreserved
  GIVEN any device (mobile or desktop)
  WHEN user sends messages
  THEN AI response logic is IDENTICAL to unfixed code
  AND rate limiting works the same
  AND caching works the same
```

**Expected Result**: Test PHẢI PASS trên cả unfixed và fixed code, proving no regression.

**Acceptance Criteria**:
- [ ] Test file created với 4 preservation properties
- [ ] Each property tests một aspect của desktop experience
- [ ] Tests PASS trên unfixed code (baseline)
- [ ] Tests PASS trên fixed code (no regression)
- [ ] Tests use snapshot testing hoặc behavior comparison

**Estimated Time**: 1.5 hours

---

## Task 3: Implement Mobile Fixes

**Status**: `- [ ]`

**Goal**: Apply tất cả 9 changes từ design document vào `src/components/AIAssistant.tsx`.

**File to modify**: `src/components/AIAssistant.tsx`

**Sub-tasks**:

### 3.1: Add Mobile Detection Hook

- [ ] Add `isMobile` state (boolean)
- [ ] Add `viewportHeight` state (number | null)
- [ ] Implement `checkMobile()` function: width < 768px AND touch capability
- [ ] Add resize listener để update mobile detection
- [ ] Test: Verify mobile detection works correctly on different screen sizes

**Code Location**: Top of AIAssistant component, after existing state declarations

**Estimated Time**: 20 minutes

---

### 3.2: Integrate Visual Viewport API

- [ ] Add useEffect để listen to `window.visualViewport` events
- [ ] Update `viewportHeight` state when keyboard opens/closes
- [ ] Add event listeners for 'resize' và 'scroll' events
- [ ] Add proper cleanup in useEffect return
- [ ] Only run on mobile devices (check `isMobile`)
- [ ] Test: Verify viewportHeight updates when keyboard opens/closes

**Code Location**: After mobile detection useEffect

**Estimated Time**: 30 minutes

---

### 3.3: Replace Aggressive Scroll-to-Top

- [ ] Remove existing scroll-to-top useEffect với multiple setTimeout
- [ ] Add new simple useEffect với single scroll attempt
- [ ] Use `containerRef.current.scrollTop = 0` for container
- [ ] Use `window.scrollTo({ top: 0, behavior: 'smooth' })` for mobile
- [ ] Only run once on mount (empty dependency array)
- [ ] Test: Verify single smooth scroll, no jerky movements

**Code Location**: Replace existing scroll-to-top useEffect (around line 50-70)

**Estimated Time**: 20 minutes

---

### 3.4: Implement Conditional Auto-scroll

- [ ] Update auto-scroll useEffect (triggers on new AI message)
- [ ] Add logic to check if user is near bottom (within 100px)
- [ ] Calculate: `scrollHeight - scrollTop - clientHeight < 100`
- [ ] Only call `scrollIntoView` if user is near bottom
- [ ] Keep smooth behavior
- [ ] Test: Verify auto-scroll only when near bottom, not when scrolled up

**Code Location**: Replace existing auto-scroll useEffect (around line 80-90)

**Estimated Time**: 25 minutes

---

### 3.5: Add Input Focus Handler

- [ ] Create `handleInputFocus` function
- [ ] Check `isMobile`, return early if desktop
- [ ] Add 300ms setTimeout để wait for keyboard animation
- [ ] Call `inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })`
- [ ] Add `onFocus={handleInputFocus}` to input element
- [ ] Test: Verify input scrolls into view when focused on mobile

**Code Location**: Before return statement, add to input element props

**Estimated Time**: 20 minutes

---

### 3.6: Update Container Height Calculation

- [ ] Find container div với `height: '100%'` và `maxHeight: '100dvh'`
- [ ] Update maxHeight to conditional: `isMobile && viewportHeight ? ${viewportHeight}px : '100dvh'`
- [ ] Test: Verify mobile uses viewportHeight, desktop uses 100dvh

**Code Location**: Main container div in return statement

**Estimated Time**: 15 minutes

---

### 3.7: Add Touch Optimization CSS

- [ ] Add `touchAction: 'manipulation'` to button styles
- [ ] Add `WebkitTapHighlightColor: 'transparent'` to button styles
- [ ] Add `transition: 'transform 0.15s ease, opacity 0.15s ease'` to button styles
- [ ] Add `active:scale-95 active:opacity-80` to button className
- [ ] Apply to: Send button, quick reply buttons
- [ ] Test: Verify visual feedback on tap, no double-tap zoom

**Code Location**: Button elements (send button, quick reply buttons)

**Estimated Time**: 25 minutes

---

### 3.8: Add TypeScript Declarations

- [ ] Add `declare global` block at top of file
- [ ] Declare `Window.visualViewport` interface
- [ ] Include: height, width, addEventListener, removeEventListener
- [ ] Test: Verify no TypeScript errors

**Code Location**: Top of file, before component definition

**Estimated Time**: 10 minutes

---

### 3.9: Optimize Loading State Position

- [ ] Find loading indicator div
- [ ] Add conditional marginBottom: `isMobile ? '8px' : '0'`
- [ ] Test: Verify loading doesn't push input out of view on mobile

**Code Location**: Loading indicator div in messages area

**Estimated Time**: 15 minutes

---

**Total Task 3 Estimated Time**: 3 hours

**Acceptance Criteria**:
- [ ] All 9 sub-tasks completed
- [ ] No TypeScript errors
- [ ] No console errors or warnings
- [ ] Component compiles successfully
- [ ] Mobile detection works correctly
- [ ] Visual Viewport API integration works
- [ ] Scroll behaviors improved
- [ ] Touch feedback added
- [ ] Desktop experience unchanged

---

## Task 4: Final Verification and Testing

**Status**: `- [ ]`

**Goal**: Manual testing trên mobile và desktop devices để verify fix works và no regression.

**Sub-tasks**:

### 4.1: Mobile Testing - Bug Fixes Verification

**Devices**: iPhone 13 Safari, Android Chrome

- [ ] **Input Visibility Test**
  - Open AI tab → Tap input field → Start typing
  - ✓ Input field visible above keyboard
  - ✓ Input scrolls into view automatically
  - ✓ viewportHeight updates correctly

- [ ] **Smooth Scroll Test**
  - Switch to AI tab
  - ✓ Single smooth scroll to top
  - ✓ No jerky movements
  - ✓ No multiple scroll attempts

- [ ] **Touch Feedback Test**
  - Tap quick reply buttons, send button
  - ✓ Visual feedback (scale 0.95, opacity 0.8)
  - ✓ 150ms transition smooth
  - ✓ No double-tap zoom

- [ ] **Conditional Auto-scroll Test**
  - Scroll up 200px → Wait for AI response
  - ✓ No auto-scroll (user not near bottom)
  - Scroll to bottom → Wait for AI response
  - ✓ Auto-scroll triggers (user near bottom)

- [ ] **Layout Stability Test**
  - Open keyboard → Rotate device → Close keyboard
  - ✓ Container height adjusts correctly
  - ✓ No white space or content cut-off
  - ✓ Layout stable throughout

**Estimated Time**: 45 minutes

---

### 4.2: Desktop Testing - Preservation Verification

**Browser**: Chrome Desktop (1920x1080)

- [ ] **Scroll Behavior Preservation**
  - Switch to AI tab
  - ✓ Scroll to top on tab change (same as unfixed)
  - ✓ No mobile-specific behaviors

- [ ] **Height Calculation Preservation**
  - Open AI tab → Resize window
  - ✓ Uses 100dvh (not viewportHeight)
  - ✓ Container height behaves identically to unfixed

- [ ] **Hover Effects Preservation**
  - Hover over buttons
  - ✓ Hover effects work (same as unfixed)
  - ✓ No touch-specific behaviors

- [ ] **Auto-scroll Preservation**
  - Send message → Wait for AI response
  - ✓ Auto-scroll to bottom always (same as unfixed)
  - ✓ No conditional logic on desktop

- [ ] **AI Functionality Preservation**
  - Send various messages
  - ✓ AI responses work identically
  - ✓ Rate limiting works
  - ✓ Caching works

**Estimated Time**: 30 minutes

---

### 4.3: Cross-browser Testing

- [ ] Test trên Safari iOS (iPhone)
- [ ] Test trên Chrome Android
- [ ] Test trên Chrome Desktop
- [ ] Test trên Firefox Desktop
- [ ] Test trên Safari Desktop (Mac)

**Estimated Time**: 30 minutes

---

### 4.4: Property-Based Tests Verification

- [ ] Run bug condition exploration test
  - ✓ Test PASSES on fixed code (bugs no longer exist)
  - ✓ Counterexamples from unfixed code are now resolved

- [ ] Run preservation test
  - ✓ Test PASSES on fixed code
  - ✓ Desktop behavior identical to unfixed code

**Estimated Time**: 15 minutes

---

**Total Task 4 Estimated Time**: 2 hours

**Acceptance Criteria**:
- [ ] All mobile bugs fixed và verified
- [ ] Desktop experience unchanged và verified
- [ ] Cross-browser compatibility confirmed
- [ ] Property-based tests pass
- [ ] No regressions detected
- [ ] User experience significantly improved on mobile

---

## Summary

**Total Tasks**: 4 main tasks, 13 sub-tasks

**Total Estimated Time**: 4-6 hours

**Critical Success Factors**:
1. Bug condition exploration test MUST FAIL on unfixed code
2. Preservation test MUST PASS on both unfixed and fixed code
3. All 9 implementation changes MUST be applied correctly
4. Manual testing MUST verify fixes work on real devices
5. Desktop experience MUST remain unchanged

**Risk Mitigation**:
- Test incrementally after each sub-task
- Keep unfixed code backup for comparison
- Use property-based testing for strong guarantees
- Manual testing on real devices (not just emulators)
- Verify TypeScript types for Visual Viewport API

**Next Steps After Completion**:
1. Create summary document với before/after comparisons
2. Update AI Assistant documentation với mobile best practices
3. Consider applying similar mobile optimizations to other components
4. Monitor user feedback và analytics for mobile AI usage
