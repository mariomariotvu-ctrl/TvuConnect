# Task 2: Preservation Property Tests - Documentation

## Overview

Task 2 has been completed successfully. Preservation property tests have been written, run on UNFIXED code, and all tests PASS, confirming the baseline behavior that must be preserved after implementing the fix.

## Test File Created

**File**: `src/components/DocumentRepository.preservation.pbt.test.tsx`

## Test Approach

Following the observation-first methodology specified in the task requirements:

1. **Observed behavior on UNFIXED code** for non-buggy inputs:
   - Desktop light mode (1920x1080, light mode)
   - Desktop dark mode (1920x1080, dark mode)
   - Mobile dark mode (375px, dark mode)
   - Tablet breakpoint (768px, both modes)

2. **Recorded actual styling** for each scenario by checking className attributes

3. **Wrote property-based tests** capturing observed behavior patterns from Preservation Requirements (3.1, 3.2, 3.3, 3.4)

4. **Ran tests on UNFIXED code** - All tests PASS ✅

## Test Strategy

### Why className Checking Instead of Computed Styles

The tests check `className` attributes rather than computed styles because:
- jsdom (the test environment) doesn't fully compute Tailwind CSS
- Checking className attributes validates that the correct CSS classes are applied
- This approach is more reliable and directly tests what matters for preservation
- The actual visual rendering is validated by the CSS framework (Tailwind)

### Helper Functions

Created helper functions to check for:
- `hasLightModeBackground()` - Checks for `bg-white`, `bg-gray-50`, `bg-gray-100`
- `hasDarkModeBackground()` - Checks for `bg-gray-800`, `bg-gray-900`, `dark:bg-gray-*`
- `hasLightModeText()` - Checks for `text-gray-900`, `text-gray-800`, `text-black`
- `hasDarkModeText()` - Checks for `text-white`, `text-gray-100`, `dark:text-*`

Special handling for DocumentCard: The `<article>` element doesn't have text classes directly, so we infer text styling from background classes.

## Test Coverage

### Unit Tests (9 tests)

1. **Desktop Light Mode Preservation (3 tests)**
   - SearchBar should have light mode classes on desktop ✅
   - FilterPanel should have light mode classes on desktop ✅
   - DocumentCard should have light mode classes on desktop ✅

2. **Desktop Dark Mode Preservation (3 tests)**
   - SearchBar should have dark mode classes on desktop ✅
   - FilterPanel should have dark mode classes on desktop ✅
   - DocumentCard should have dark mode classes on desktop ✅

3. **Mobile Dark Mode Preservation (3 tests)**
   - SearchBar should have dark mode classes on mobile ✅
   - FilterPanel should have dark mode classes on mobile ✅
   - DocumentCard should have dark mode classes on mobile ✅

### Tablet Breakpoint Tests (2 tests)

4. **Tablet Breakpoint Preservation (2 tests)**
   - Components should have desktop light mode classes at 768px in light mode ✅
   - Components should have desktop dark mode classes at 768px in dark mode ✅

### Property-Based Tests (4 tests)

5. **Desktop Viewport Sizes (2 tests)**
   - Desktop light mode classes are consistent across viewport sizes (768px-2560px, 10 runs) ✅
   - Desktop dark mode classes are consistent across viewport sizes (768px-2560px, 10 runs) ✅

6. **Mobile Dark Mode (1 test)**
   - Mobile dark mode classes are consistent across mobile viewport sizes (320px-767px, 10 runs) ✅

7. **All Components Across Scenarios (1 test)**
   - All components maintain correct classes for non-mobile-light-mode scenarios (20 runs) ✅
   - Tests SearchBar, FilterPanel, and DocumentCard together
   - Covers viewport widths 320px-2560px
   - Covers both light and dark modes
   - Skips mobile light mode (the bug condition)

## Test Results

**Status**: ✅ ALL TESTS PASS (15/15)

```
Test Files  1 passed (1)
Tests  15 passed (15)
Duration  1.66s
```

## Observations Recorded

### Desktop Light Mode (1920x1080, light mode)
- **SearchBar**: `bg-white`, `text-gray-900`, `dark:bg-gray-900`, `dark:text-white`
- **FilterPanel**: `bg-white`, `text-gray-900`, `dark:bg-gray-900`, `dark:text-gray-100`
- **DocumentCard**: `bg-white`, `dark:bg-gray-800`

### Desktop Dark Mode (1920x1080, dark mode)
- **SearchBar**: `dark:bg-gray-900`, `dark:text-white`
- **FilterPanel**: `dark:bg-gray-900`, `dark:text-gray-100`
- **DocumentCard**: `dark:bg-gray-800`, `dark:text-gray-100`

### Mobile Dark Mode (375px, dark mode)
- **SearchBar**: `dark:bg-gray-900`, `dark:text-white`
- **FilterPanel**: `dark:bg-gray-900`, `dark:text-gray-100`
- **DocumentCard**: `dark:bg-gray-800`, `dark:text-gray-100`

### Tablet Breakpoint (768px)
- At 768px, desktop styles apply (not mobile overrides)
- Light mode: Same as desktop light mode
- Dark mode: Same as desktop dark mode

## Requirements Validated

✅ **Requirement 3.1**: Mobile dark mode styling remains unchanged
✅ **Requirement 3.2**: Desktop light mode styling remains unchanged
✅ **Requirement 3.3**: Desktop dark mode styling remains unchanged
✅ **Requirement 3.4**: Tablet breakpoint behavior remains unchanged

## Expected Outcome After Fix

When the fix is implemented in Task 3:
- These preservation tests MUST continue to pass
- If any preservation test fails, it indicates a regression
- The fix should ONLY affect mobile light mode (viewport < 768px, light mode)
- All other scenarios must remain exactly as observed and tested here

## Next Steps

Task 3 will implement the fix for mobile light mode styling. After the fix:
1. Re-run these preservation tests to verify no regressions
2. Run the bug condition exploration tests from Task 1 to verify the fix works
3. Both test suites should pass

## Files Modified

- Created: `src/components/DocumentRepository.preservation.pbt.test.tsx`

## Testing Framework

- **Framework**: Vitest
- **Property-Based Testing**: fast-check
- **Rendering**: @testing-library/react
- **Test Environment**: jsdom

## Conclusion

Task 2 is complete. All preservation property tests pass on unfixed code, confirming the baseline behavior that must be preserved. The tests are ready to validate that the fix in Task 3 does not introduce regressions.
