# Implementation Plan

## Overview

Bugfix layout centering trên desktop: nội dung trang home bị dồn lên trên cùng thay vì được căn giữa theo chiều dọc. Fix thêm `md:flex md:items-center md:justify-center` vào main container khi `view === 'home'`.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Desktop Home View Vertical Centering
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Manual Testing Approach**: Since this is a visual layout bug, manual testing is most appropriate
  - Test that home view on desktop (1920x1080, 1366x768, 2560x1440) has vertically centered content
  - Test implementation details from Bug Condition in design: view === 'home' AND screenWidth >= 768 AND mainContainerLacksFlexCentering()
  - The test assertions should match the Expected Behavior Properties from design: content should be vertically and horizontally centered
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: content appears at top of viewport with large white space below
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Desktop-Home Layout Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (mobile home view, other views on any screen size)
  - Write manual test cases capturing observed behavior patterns from Preservation Requirements
  - Manual testing is recommended for visual layout verification
  - Test cases:
    - Mobile home view (375x667, 414x896) - should flow normally from top
    - Desktop profile view - should use normal flow layout
    - Desktop matching view - should use normal flow layout
    - Desktop explore view - should exclude padding as specified
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for desktop home layout centering

  - [x] 3.1 Implement the fix
    - **Step 1**: Modify the main container className at line 1375 in `src/App.tsx`
      - Add conditional flex centering for home view on desktop: `${view === 'home' ? 'md:flex md:items-center md:justify-center' : ''}`
      - Insert the conditional after `min-h-[calc(100dvh-5rem)]` and before the explore view conditional
      - Final className structure: `max-w-7xl mx-auto mb-24 md:mb-0 min-h-[calc(100dvh-5rem)] ${view === 'home' ? 'md:flex md:items-center md:justify-center' : ''} ${view === 'explore' ? '' : 'px-4 sm:px-6 lg:px-8 py-4 md:py-12'}`
      - Ensure the `md:` prefix is used so flex centering only applies at desktop breakpoint (768px and above)
    - **Step 2**: Remove unnecessary padding from home view content div (line 717)
      - Remove `py-4 md:py-12` from the div className
      - Keep only: `max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center`
      - Reason: Main container already has flex centering, padding creates unwanted whitespace at top
    - _Bug_Condition: isBugCondition(input) where input.view === 'home' AND input.screenWidth >= 768_
    - _Expected_Behavior: Content should be vertically and horizontally centered within viewport on desktop_
    - _Preservation: Mobile home view and all other views must maintain existing layout_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Desktop Home View Vertical Centering
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Test on desktop resolutions (1920x1080, 1366x768, 2560x1440)
    - Verify content is vertically centered in viewport
    - Verify 5 feature cards and welcome text appear in the middle of the screen
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Desktop-Home Layout Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation tests from step 2:
      - Mobile home view (375x667, 414x896) - verify content flows normally from top
      - Desktop profile view - verify normal flow layout maintained
      - Desktop matching view - verify normal flow layout maintained
      - Desktop explore view - verify padding exclusion maintained
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Verify desktop home view is vertically centered on all tested resolutions
  - Verify mobile home view maintains normal flow layout
  - Verify all other views maintain their existing layouts
  - Verify no visual regressions in navigation, footer, or other UI components
  - Ask the user if questions arise

## Notes

- Fix chỉ apply tại `md:` breakpoint (≥768px), mobile không bị ảnh hưởng
- File cần sửa: `src/App.tsx` dòng 1375 và dòng 717

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
