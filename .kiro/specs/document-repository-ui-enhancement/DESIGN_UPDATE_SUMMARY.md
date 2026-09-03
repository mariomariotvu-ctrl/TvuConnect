# Design Document Update Summary

## Ngày cập nhật: 23/4/2026

## Tổng quan

Design document cho spec "document-repository-ui-enhancement" đã được cập nhật để phản ánh các requirements mới về visual consistency cho UploaderInfo component.

## Các thay đổi chính

### 1. UploaderInfo Component Specifications (Mục 2)

**Đã thêm:**
- Props Interface mở rộng với `iconSize`, `showIcon`, `className`
- Visual Specifications chi tiết:
  - Icon size: 16px (text 14px), 18px (text 16px)
  - Icon color: gray-500 (light), gray-400 (dark)
  - Spacing: gap-2 (8px) icon-label, gap-1.5 (6px) label-username
  - Font-weight: 600 (semibold) cho cả label và username
  - Vertical alignment: items-center
  - Padding-y: 2px
- Fallback Behavior function:
  ```typescript
  function getDisplayName(profile: UserProfile): string {
    if (profile.displayName) return profile.displayName;
    if (profile.username) return profile.username;
    return "Người dùng không xác định";
  }
  ```
- Implementation Example với code đầy đủ

**Layout Diagram mới:**
```
┌────────────────────────────────────────────────┐
│  [Icon]  Đăng bởi:  Display Name               │
│   16px   ↑ 8px gap  ↑ 6px gap                  │
│  gray-500  gray-500  gray-700                  │
│           font-600   font-600                  │
└────────────────────────────────────────────────┘
```

### 2. Dark Mode Implementation - Color Tokens

**Đã thêm:**
```typescript
uploaderInfo: {
  icon: {
    light: 'text-gray-500',
    dark: 'text-gray-400'
  },
  label: {
    light: 'text-gray-500',
    dark: 'text-gray-400'
  },
  username: {
    light: 'text-gray-700',
    dark: 'text-gray-300'
  }
}
```

### 3. Typography Scale

**Đã thêm cột mới:**
- Font-weight column
- Color (Light) column
- Color (Dark) column
- Uploader Icon row: 16px, gray-500 (light), gray-400 (dark)

**Cập nhật:**
- Uploader Name: font-weight 600 (thay vì 500)
- Label: font-weight 600 (thay vì 400)

### 4. Data Models - UserProfile

**Đã cập nhật:**
```typescript
interface UserProfile {
  uid: string;
  displayName?: string; // Primary display name (optional)
  username?: string; // Fallback display name (optional)
  photoURL?: string;
  email?: string;
  major?: string;
  yearOfStudy?: string;
  createdAt: Timestamp;
}

// Display name resolution logic
function resolveDisplayName(profile: UserProfile): string {
  return profile.displayName || profile.username || "Người dùng không xác định";
}
```

### 5. Accessibility Implementation

**Đã cập nhật Semantic HTML:**
```html
<footer class="uploader-info" role="group" aria-label="Thông tin người đăng">
  <svg aria-hidden="true" class="icon">...</svg>
  <span class="label">Đăng bởi:</span>
  <button 
    aria-label="Xem hồ sơ của {displayName}"
    onClick={handleProfileClick}
  >
    {displayName}
  </button>
</footer>
```

### 6. Correctness Properties

**Đã thêm 6 properties mới:**

- **Property 6a: Dynamic Display Name Fallback**
  - Validates: Requirements 2.8, 2.9, 2.10
  - For any user profile, displayed name follows fallback hierarchy

- **Property 25: Icon Size Consistency**
  - Validates: Requirements 14.8, 19.1, 19.2
  - Icon size matches text size (16px for 14px text, 18px for 16px text)

- **Property 26: Icon Color Consistency**
  - Validates: Requirements 14.9, 19.3, 19.11, 19.12
  - Icon color matches label color in both light and dark modes

- **Property 27: Spacing Consistency**
  - Validates: Requirements 19.4, 19.5
  - Gap-2 (8px) between icon-label, gap-1.5 (6px) between label-username

- **Property 28: Font-weight Balance**
  - Validates: Requirements 14.7, 14.8, 19.7, 19.8
  - Both label and username use font-weight 600

- **Property 29: Vertical Alignment**
  - Validates: Requirements 14.13, 19.6
  - All elements vertically center-aligned with flexbox

- **Property 30: Color Contrast Compliance**
  - Validates: Requirements 14.11, 19.9
  - Label color has 4.5:1 contrast ratio for WCAG AA

**Tổng số properties:** 30 (24 original + 6 new)

### 7. Testing Strategy

**Đã thêm Property Tests:**
- Property 6a: Dynamic Display Name Fallback test
- Property 25: Icon Size Consistency test
- Property 27: Spacing Consistency test

**Đã thêm Unit Tests:**
- Test displayName fallback to username
- Test fallback to "Người dùng không xác định"
- Test icon size for different text sizes
- Test spacing between elements
- Test vertical alignment

**Cập nhật Test Coverage Goals:**
- Property Tests: All 30 properties (thay vì 24)

## Requirements được validate

### Requirement 2 (Uploader Information Display)
- AC 2.8: Display display_name when available ✓
- AC 2.9: Fallback to username when display_name missing ✓
- AC 2.10: Show "Người dùng không xác định" when both missing ✓

### Requirement 14 (Enhanced Uploader Visibility)
- AC 14.8: Icon size matches text size ✓
- AC 14.9: Icon color matches label color ✓
- AC 14.11: Color contrast 4.5:1 for WCAG AA ✓
- AC 14.13: Vertical center alignment ✓

### Requirement 19 (Visual Consistency for Uploader Info Section)
- AC 19.1: Icon 16px for 14px text ✓
- AC 19.2: Icon 18px for 16px text ✓
- AC 19.3: Icon color matches label ✓
- AC 19.4: Gap-2 (8px) icon-label ✓
- AC 19.5: Gap-1.5 (6px) label-username ✓
- AC 19.6: Vertical center alignment ✓
- AC 19.7: Label font-weight 600 ✓
- AC 19.8: Username font-weight 600 ✓
- AC 19.9: Color contrast 4.5:1 ✓
- AC 19.10: Consistent font-family ✓
- AC 19.11: Dark mode icon gray-500 ✓
- AC 19.12: Dark mode label gray-400 ✓
- AC 19.13: Padding-y 2px ✓

## Các file đã cập nhật

1. `.kiro/specs/document-repository-ui-enhancement/design.md`
   - UploaderInfo Component Specifications
   - Color Tokens
   - Typography Scale
   - Data Models
   - Accessibility Implementation
   - Correctness Properties (6 properties mới)
   - Testing Strategy

## Bước tiếp theo

1. Cập nhật tasks.md để phản ánh các property tests mới
2. Implement các property tests cho 6 properties mới
3. Implement unit tests cho fallback behavior và visual consistency
4. Verify implementation matches design specifications

## Ghi chú

- Tất cả specifications đã có đơn vị đo lường cụ thể (px, gap-2, etc.)
- Code examples đã được thêm cho implementation
- Diagrams đã được cập nhật
- Consistency với existing design patterns đã được đảm bảo
