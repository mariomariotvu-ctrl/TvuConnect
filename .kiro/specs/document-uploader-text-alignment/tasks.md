# Implementation Plan

## Overview

Bugfix lỗi căn chỉnh text của uploader info (phần "Đăng bởi: Người dùng") không thẳng hàng với text mô tả tài liệu trong DocumentCard component. Text content của uploader info cần căn chỉnh left edge khớp với first character của description text trên cả desktop và mobile layout.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Uploader Info Text Alignment
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the text misalignment exists
  - **Scoped PBT Approach**: Test concrete cases where uploader info and description are both rendered with different left edge positions
  - Test implementation: Render DocumentCard with various document configurations, measure left edge positions of uploader info text vs description text
  - The test assertions should verify that `uploaderInfoLeftEdge === descriptionLeftEdge` (from Bug Condition in design)
  - Test cases to include:
    - Desktop layout with both major and subject tags
    - Mobile layout with both major and subject tags
    - Desktop layout with only major tag (no subject)
    - Mobile layout with only major tag (no subject)
    - Loading state alignment (skeleton vs description)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: specific pixel differences in left edge positions
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Functional Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for all non-alignment interactions
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Test cases to include:
    - Profile navigation: clicking uploader name navigates to profile correctly
    - Edit button: clicking edit button triggers onEdit callback with correct document
    - Delete button: clicking delete button triggers onDelete callback with correct document ID
    - Open document: clicking "Mở tài liệu" opens document URL in new tab
    - Responsive layout: desktop and mobile layouts switch correctly at md breakpoint
    - Loading state: skeleton animation displays correctly while loading
    - Dark mode: all styling works correctly in dark mode
    - Tag display: major and subject tags display with correct icons and formatting
    - Hover effects: hover states work correctly on all interactive elements
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for uploader info text alignment

  - [x] 3.1 Implement the alignment fix
    - Analyze current alignment in DocumentCard.tsx:
      - Desktop layout: `.hidden md:flex` section
      - Mobile layout: `.md:hidden` section
    - Identify description text container and its left padding/margin
    - Adjust UploaderInfo wrapper div to match description alignment:
      - Option 1: Add matching left padding/margin to UploaderInfo container
      - Option 2: Adjust icon margin to align text content
      - Option 3: Use negative margin to compensate for icon offset
    - Apply fix consistently to both desktop and mobile layouts
    - Verify text content (not icon) of "Đăng bởi: Người dùng" aligns with first character of description
    - _Bug_Condition: isBugCondition(documentCard) where uploaderInfoLeftEdge != descriptionLeftEdge_
    - _Expected_Behavior: uploaderInfoLeftEdge === descriptionLeftEdge for all rendered document cards_
    - _Preservation: All functional behaviors (profile navigation, edit/delete, open document, responsive layouts, loading states, dark mode, tag display, hover effects) remain unchanged_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Uploader Info Text Alignment
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify alignment is correct across all test cases:
      - Desktop layout with both major and subject tags
      - Mobile layout with both major and subject tags
      - Desktop layout with only major tag
      - Mobile layout with only major tag
      - Loading state alignment
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Functional Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all functional behaviors still work correctly:
      - Profile navigation works
      - Edit and delete buttons work
      - Open document button works
      - Responsive layouts work
      - Loading states work
      - Dark mode works
      - Tag display works
      - Hover effects work
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Fix áp dụng cho cả desktop layout (`.hidden md:flex`) và mobile layout (`.md:hidden`)
- Không thay đổi bất kỳ chức năng nào (navigate, edit/delete, open document)
- Chạy tests bằng `npx vitest --run`

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
