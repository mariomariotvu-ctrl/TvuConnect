# Implementation Plan

## Overview

Bugfix lỗi padding không đồng bộ giữa các tab matching trên desktop. Các tab "Tìm người yêu", "Bạn cùng học", "Sở thích chung" có padding-top và padding-bottom không cân bằng, khiến icon và text trông không đồng đều so với viền card. Fix tập trung đồng bộ padding để tạo spacing cân bằng trên tất cả tabs.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Unsynchronized Tab Padding on Desktop
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test that tab "Tìm người yêu" has `pt-2` causing icon to be too close to card top
  - Test that tab "Bạn cùng học" has `pb-1` while other tabs have different padding-bottom values
  - Test that tab "Sở thích chung" has `pb-1` needing adjustment for balance
  - The test assertions should match the Expected Behavior Properties from design (synchronized padding, balanced spacing)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause (e.g., "Lover tab pt-2 creates 8px top spacing, too small compared to other tabs")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Affected Elements Remain Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Tab "Kết nối nhanh" maintains h-56 and current padding (p-5)
    - Mobile layout (grid 2 columns, gap-3) works as expected
    - Click handlers navigate to correct matching modes
    - Locked state (profile incomplete) shows 🔒 icon correctly
    - Hover effects (scale, shadow) work on unlocked tabs
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - For all mobile viewports, layout and padding remain unchanged
    - For all tab states (locked/unlocked), functionality remains unchanged
    - For "Kết nối nhanh" tab, all styling remains unchanged
    - For all theme modes (light/dark), non-padding styles remain unchanged
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for matching tabs padding synchronization

  - [x] 3.1 Implement the fix
    - Adjust tab "Tìm người yêu" padding: reduce `pt-2` to `pt-1` or remove, adjust `pb-5` to `pb-4` for balance
    - Adjust tab "Bạn cùng học" padding: keep `pt-5`, change `pb-1` to `pb-4` or `pb-5` for synchronization
    - Adjust tab "Sở thích chung" padding: keep `pt-8` or reduce to `pt-6`, change `pb-1` to `pb-4` for synchronization
    - Verify visual alignment of all 4 tabs on desktop
    - Ensure icons and text have balanced spacing with card borders
    - _Bug_Condition: isBugCondition({viewport: 'desktop', tab: tab}) where tab IN ['lover', 'study', 'hobby'] AND padding is unsynchronized_
    - _Expected_Behavior: hasSynchronizedPadding(result) AND hasBalancedSpacing(result) from design_
    - _Preservation: Tab "Kết nối nhanh", mobile layout, click handlers, hover effects, locked state remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Synchronized Tab Padding on Desktop
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify all tabs have synchronized padding-top and padding-bottom
    - Verify icons and text have balanced spacing with card borders
    - _Requirements: Expected Behavior Properties from design (2.1, 2.2, 2.3)_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Affected Elements Remain Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm tab "Kết nối nhanh" unchanged
    - Confirm mobile layout unchanged
    - Confirm click handlers work correctly
    - Confirm hover effects work correctly
    - Confirm locked state displays correctly
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Chỉ sửa padding của 3 tabs bị ảnh hưởng: "Tìm người yêu", "Bạn cùng học", "Sở thích chung"
- Tab "Kết nối nhanh" giữ nguyên p-5
- Mobile layout (grid 2 cột) không bị ảnh hưởng

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
