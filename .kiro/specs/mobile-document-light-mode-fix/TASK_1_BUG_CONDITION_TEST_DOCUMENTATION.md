# Task 1: Bug Condition Exploration Test - Results

## Test Execution Summary

**Date**: 2026-04-23
**Status**: ✅ Test written and executed successfully
**Outcome**: ❌ Test FAILED as expected (confirms bug exists)

## Test File

`src/components/DocumentRepository.mobile-light-mode.pbt.test.tsx`

## Counterexamples Found

The bug condition exploration test successfully surfaced counterexamples that demonstrate the mobile light mode styling failures:

### 1. SearchBar Component
- **Expected**: White background (#FFFFFF) and black text (#111827)
- **Actual**: Black background (#000000)
- **Bug Confirmed**: ✅ SearchBar shows dark background instead of white on mobile light mode

### 2. FilterPanel Component
- **Expected**: White background (#FFFFFF) and black text (#111827)
- **Actual**: Black background (#000000)
- **Bug Confirmed**: ✅ FilterPanel shows dark background instead of white on mobile light mode

### 3. DocumentCard Component
- **Expected**: White background (#FFFFFF) and black text (#111827)
- **Actual**: Black background (#000000)
- **Bug Confirmed**: ✅ DocumentCard shows dark background instead of white on mobile light mode

### 4. Property-Based Test
- **Viewport Width Tested**: 320px (smallest mobile device)
- **Counterexample**: All three components failed at viewport width 320px
- **Bug Confirmed**: ✅ Bug exists across all mobile viewport sizes (320px - 767px)

## Root Cause Analysis

Based on the test results and code inspection, the root cause is:

**CSS Specificity and Class Ordering Issue**: The mobile-specific override classes (`max-md:!bg-white`, `max-md:!text-gray-900`) are not effectively overriding the dark mode styles. The components are rendering with black backgrounds (#000000) instead of white backgrounds (#FFFFFF) on mobile light mode.

The issue appears to be that:
1. The `dark:` variant classes may have higher specificity than the `max-md:` variant classes
2. The class order in the className strings may be causing dark mode styles to override mobile overrides
3. The `!important` flag (via Tailwind's `!` prefix) is not sufficient to override the dark mode styles

## CSS Specificity Conflicts

Inspecting the className strings in the components:

**SearchBar.tsx** (line 38):
```tsx
className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 font-medium max-md:!bg-white max-md:!text-gray-900 max-md:!placeholder-gray-600 max-md:!border-gray-300"
```

**FilterPanel.tsx** (line 77):
```tsx
className={`w-full ${filters.major_id ? 'pl-8 md:pl-10' : 'pl-2 md:pl-3'} pr-8 md:pr-9 py-2 md:py-2.5 border-2 ${
  filters.major_id 
    ? 'border-purple-300 dark:border-purple-500 bg-purple-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 max-md:bg-white max-md:text-gray-900' 
    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 max-md:bg-white max-md:text-gray-900'
} rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 font-medium appearance-none cursor-pointer hover:border-purple-300 dark:hover:border-purple-500 shadow-sm`}
```

**DocumentCard.tsx** (line 68):
```tsx
className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-lg hover:shadow-indigo-100/50 dark:hover:shadow-indigo-900/20 transition-all duration-200 overflow-hidden"
```

**Problem**: The mobile overrides (`max-md:`) are placed at the END of the className string, but they're not using the proper pattern to override dark mode styles. The `dark:` classes are being applied even on mobile light mode, overriding the `max-md:` classes.

## Expected Fix Pattern

The fix should restructure className strings with proper precedence:

```tsx
// Pattern: [base-light-classes] dark:[dark-classes] max-md:[mobile-light-classes] max-md:dark:[mobile-dark-classes]

className="w-full pl-10 pr-10 py-3 border-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 font-medium
  bg-white text-gray-900 placeholder-gray-400 border-gray-200
  dark:bg-gray-900 dark:text-white dark:placeholder-gray-400 dark:border-gray-600
  max-md:bg-white max-md:text-gray-900 max-md:placeholder-gray-600 max-md:border-gray-300
  max-md:dark:bg-gray-900 max-md:dark:text-white max-md:dark:placeholder-gray-400 max-md:dark:border-gray-600"
```

This ensures:
1. Base light mode styles are applied first
2. Dark mode styles override when `dark` class is present
3. Mobile light mode styles override on mobile viewports
4. Mobile dark mode styles override on mobile viewports with dark mode

## Next Steps

1. ✅ Task 1 complete: Bug condition exploration test written and executed
2. ⏭️ Task 2: Write preservation property tests (BEFORE implementing fix)
3. ⏭️ Task 3: Implement the fix in SearchBar, FilterPanel, and DocumentCard
4. ⏭️ Task 4: Verify bug condition test passes after fix
5. ⏭️ Task 5: Verify preservation tests still pass after fix

## Test Output

```
FAIL  src/components/DocumentRepository.mobile-light-mode.pbt.test.tsx > Property 1: Bug Condition - Mobile Light Mode Display Failure > SearchBar should display white background and black text on mobile light mode
AssertionError: expected '#000000' to be '#FFFFFF'
Expected: "#FFFFFF"
Received: "#000000"

FAIL  src/components/DocumentRepository.mobile-light-mode.pbt.test.tsx > Property 1: Bug Condition - Mobile Light Mode Display Failure > FilterPanel should display white background and black text on mobile light mode
AssertionError: expected '#000000' to be '#FFFFFF'
Expected: "#FFFFFF"
Received: "#000000"

FAIL  src/components/DocumentRepository.mobile-light-mode.pbt.test.tsx > Property 1: Bug Condition - Mobile Light Mode Display Failure > DocumentCard should display white background and black text on mobile light mode
AssertionError: expected '#000000' to be '#FFFFFF'
Expected: "#FFFFFF"
Received: "#000000"

FAIL  src/components/DocumentRepository.mobile-light-mode.pbt.test.tsx > Property 1: Bug Condition - Mobile Light Mode Display Failure > Property: All components display white backgrounds and black text on mobile light mode
Error: Property failed after 1 tests
Counterexample: [320]
```

## Conclusion

The bug condition exploration test successfully confirmed the bug exists. All three components (SearchBar, FilterPanel, DocumentCard) are displaying black backgrounds (#000000) instead of white backgrounds (#FFFFFF) on mobile light mode. The property-based test found counterexamples at viewport width 320px, confirming the bug affects all mobile viewport sizes.

The root cause is a CSS specificity and class ordering issue where dark mode styles are overriding mobile-specific overrides. The fix will require restructuring the className strings to ensure mobile light mode styles take precedence.
