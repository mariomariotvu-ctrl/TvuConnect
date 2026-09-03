# Task 1: Bug Condition Exploration Test - Documentation

## Test Status: ✅ COMPLETED (Test Failed as Expected - Bug Confirmed)

## Overview

The bug condition exploration test was successfully created and run on the unfixed code. **The test failed as expected**, which confirms that the text alignment bug exists in the DocumentCard component.

## Test File

**Location:** `src/components/DocumentCard.uploader-alignment.pbt.test.tsx`

## Counterexamples Found

The test identified the following counterexamples that demonstrate the misalignment:

### 1. Desktop Layout with Both Tags
- **Viewport:** 1024px
- **Configuration:** Document with both major and subject tags
- **Result:** UploaderInfo has User icon without left alignment compensation
- **Issue:** Icon creates ~20-24px offset, text misaligned with description

### 2. Mobile Layout with Both Tags
- **Viewport:** 375px
- **Configuration:** Document with both major and subject tags
- **Result:** UploaderInfo has User icon without left alignment compensation
- **Issue:** Same icon offset issue on mobile viewport

### 3. Desktop Layout with Only Major Tag
- **Viewport:** 1024px
- **Configuration:** Document with only major tag (no subject)
- **Result:** UploaderInfo has User icon without left alignment compensation
- **Issue:** Misalignment persists regardless of tag configuration

### 4. Mobile Layout with Only Major Tag
- **Viewport:** 375px
- **Configuration:** Document with only major tag (no subject)
- **Result:** UploaderInfo has User icon without left alignment compensation
- **Issue:** Misalignment persists on mobile without subject tag

### 5. Property-Based Test Counterexample
- **Viewport:** 320px (minimum mobile width)
- **Configuration:** Various document configurations tested
- **Result:** Consistent failure across all generated test cases
- **Shrunk:** 41 times to minimal failing case

## Root Cause Analysis

### Identified Issue

The UploaderInfo component renders a User icon in a flex container with `gap-1.5`, which creates a horizontal offset for the text content. The description text, however, starts at the left edge of its container without any icon offset.

### Technical Details

**UploaderInfo Structure:**
```tsx
<div class="flex items-center gap-1.5 min-h-[20px] overflow-visible">
  <svg class="w-4 h-4 ..."><!-- User icon --></svg>
  <span>Đăng bởi:</span>
  <button>Test User</button>
</div>
```

**Description Structure:**
```tsx
<p class="text-base font-medium line-clamp-2 ...">
  This is a test description...
</p>
```

**The Problem:**
- Icon width: ~16px (w-4)
- Gap after icon: ~6px (gap-1.5)
- Total offset: ~22-24px
- Description starts at: 0px (left edge)
- **Result:** Text content of uploader info is indented ~22-24px compared to description

### Why the Test Failed (Correctly)

The test checks for compensation mechanisms (negative margin or padding adjustments) that would align the TEXT content with the description. Since no such compensation exists in the unfixed code, the test correctly fails, confirming the bug.

## Test Implementation Details

### Test Strategy

The test uses a structural approach to detect the alignment issue:

1. **Find Elements:** Locate the UploaderInfo container and description paragraph
2. **Check for Icon:** Detect if the UploaderInfo contains an SVG icon
3. **Check for Compensation:** Look for negative margin or padding adjustments
4. **Assert:** If icon exists without compensation, alignment is broken (test fails)

### Why This Approach Works

Since jsdom doesn't render actual CSS layouts, we can't measure pixel positions. Instead, we check the CSS structure:
- If there's an icon, there MUST be compensation for proper alignment
- Without compensation, the text will be visually offset
- This structural check accurately predicts the visual bug

### Test Cases Implemented

1. **Unit Tests (4 cases):**
   - Desktop with both tags
   - Mobile with both tags
   - Desktop with only major tag
   - Mobile with only major tag

2. **Property-Based Test (1 case):**
   - Generates 20 random configurations
   - Tests viewport widths from 320px to 1920px
   - Tests various document configurations
   - Ensures bug exists across all scenarios

## Expected Behavior (After Fix)

When the fix is implemented, the test should PASS because:

1. The UploaderInfo container will have negative left margin (e.g., `-ml-5` or `-ml-6`)
2. OR the container will have adjusted padding to compensate for icon width
3. OR the icon will be positioned absolutely to not affect text flow
4. The TEXT content of "Đăng bởi: [username]" will align with the first character of the description

## Next Steps

1. ✅ Task 1 Complete: Bug condition test written and run (failed as expected)
2. ⏭️ Task 2: Write preservation property tests (before implementing fix)
3. ⏭️ Task 3: Implement the alignment fix
4. ⏭️ Task 4: Verify all tests pass after fix

## Files Created

- `src/components/DocumentCard.uploader-alignment.pbt.test.tsx` - Bug condition exploration test
- `.kiro/specs/document-uploader-text-alignment/TASK_1_BUG_CONDITION_TEST_DOCUMENTATION.md` - This documentation

## Test Execution Command

```bash
npm test -- src/components/DocumentCard.uploader-alignment.pbt.test.tsx --run
```

## Conclusion

The bug condition exploration test successfully confirmed the existence of the text alignment bug. The test is well-structured, uses property-based testing for comprehensive coverage, and will serve as validation when the fix is implemented. The root cause has been clearly identified: the User icon creates a visual offset that is not compensated for, resulting in misaligned text.
