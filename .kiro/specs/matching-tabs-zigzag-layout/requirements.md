# Requirements Document: Matching Tabs Zigzag Layout

## Introduction

Tài liệu này mô tả yêu cầu chức năng và phi chức năng cho tính năng bố cục zigzag hiện đại của 4 tab matching trong TVU Connect. Tính năng này tạo trải nghiệm thị giác độc đáo với 2 tab cao xen kẽ 2 tab thấp, giữ nguyên toàn bộ chức năng hiện tại.

## Functional Requirements

### 1. Zigzag Layout Pattern

#### 1.1 Desktop Layout

1.1.1 WHEN user xem trang matching trên desktop (viewport >= 768px) THEN system SHALL hiển thị 4 tabs trong grid 4 cột với pattern zigzag

1.1.2 WHEN rendering desktop layout THEN Tab 1 "Tìm người yêu" SHALL có chiều cao h-48 (192px)

1.1.3 WHEN rendering desktop layout THEN Tab 2 "Kết nối nhanh" SHALL có chiều cao h-56 (224px)

1.1.4 WHEN rendering desktop layout THEN Tab 3 "Bạn cùng học" SHALL có chiều cao h-56 (224px)

1.1.5 WHEN rendering desktop layout THEN Tab 4 "Sở thích chung" SHALL có chiều cao h-48 (192px)

1.1.6 WHEN rendering desktop layout THEN khoảng cách giữa các tabs SHALL là gap-4 (16px)

1.1.7 WHEN rendering desktop layout THEN pattern zigzag SHALL tạo hiệu ứng thị giác: thấp-cao-cao-thấp

#### 1.2 Mobile Layout

1.2.1 WHEN user xem trang matching trên mobile (viewport < 768px) THEN system SHALL hiển thị 4 tabs trong grid 2 cột

1.2.2 WHEN rendering mobile layout THEN tất cả tabs SHALL có chiều cao h-auto để responsive

1.2.3 WHEN rendering mobile layout THEN khoảng cách giữa các tabs SHALL là gap-3 (12px)

1.2.4 WHEN rendering mobile layout THEN zigzag pattern SHALL KHÔNG được áp dụng

### 2. Tab Content và Styling

#### 2.1 Tab Structure

2.1.1 WHEN rendering any tab THEN tab SHALL hiển thị icon tương ứng với mode (Heart, Zap, BookOpen, Smile)

2.1.2 WHEN rendering any tab THEN tab SHALL hiển thị title (Tìm người yêu, Kết nối nhanh, Bạn cùng học, Sở thích chung)

2.1.3 WHEN rendering any tab THEN tab SHALL hiển thị description mô tả ngắn gọn về chức năng

2.1.4 WHEN rendering Tab 1 hoặc Tab 4 (thấp) THEN padding SHALL là pt-6 pb-6

2.1.5 WHEN rendering Tab 2 hoặc Tab 3 (cao) THEN padding SHALL là pt-8 pb-8

#### 2.2 Visual Styling

2.2.1 WHEN rendering any tab THEN tab SHALL có background trắng với border radius 24px

2.2.2 WHEN rendering any tab THEN tab SHALL có shadow-xl và border gray-100

2.2.3 WHEN rendering any tab in dark mode THEN tab SHALL có background dark và text color phù hợp

2.2.4 WHEN rendering any tab THEN icon SHALL có size w-12 h-12 và màu sắc theo theme

### 3. Tab Interaction

#### 3.1 Lock State

3.1.1 WHEN user profile chưa hoàn thiện THEN tất cả tabs SHALL bị locked

3.1.2 WHEN tab bị locked THEN tab SHALL hiển thị icon 🔒 ở góc trên phải

3.1.3 WHEN tab bị locked THEN tab SHALL có opacity giảm và cursor not-allowed

3.1.4 WHEN user profile đã hoàn thiện THEN tất cả tabs SHALL được unlocked

#### 3.2 Click Behavior

3.2.1 WHEN user click vào locked tab THEN system SHALL hiển thị toast error "Vui lòng hoàn thiện profile để mở khóa tính năng này"

3.2.2 WHEN user click vào locked tab THEN system SHALL KHÔNG navigate đến matching mode

3.2.3 WHEN user click vào unlocked tab THEN system SHALL navigate đến matching mode tương ứng

3.2.4 WHEN user click vào unlocked tab THEN system SHALL track analytics event (optional)

#### 3.3 Hover Effects

3.3.1 WHEN user hover vào unlocked tab THEN tab SHALL scale lên 1.02x

3.3.2 WHEN user hover vào unlocked tab THEN tab SHALL hiển thị shadow lớn hơn

3.3.3 WHEN user hover vào unlocked tab THEN transition SHALL mượt mà (duration 200ms)

3.3.4 WHEN user hover vào locked tab THEN hover effects SHALL KHÔNG được áp dụng

### 4. Responsive Behavior

#### 4.1 Breakpoint Handling

4.1.1 WHEN viewport width >= 768px THEN system SHALL render desktop layout với zigzag pattern

4.1.2 WHEN viewport width < 768px THEN system SHALL render mobile layout với equal heights

4.1.3 WHEN viewport resize từ desktop sang mobile THEN layout SHALL tự động chuyển đổi

4.1.4 WHEN viewport resize từ mobile sang desktop THEN layout SHALL tự động chuyển đổi

#### 4.2 Content Adaptation

4.2.1 WHEN rendering on mobile THEN font sizes SHALL được điều chỉnh phù hợp

4.2.2 WHEN rendering on mobile THEN icon sizes SHALL được điều chỉnh phù hợp

4.2.3 WHEN rendering on mobile THEN padding SHALL được điều chỉnh để tối ưu không gian

### 5. Functional Preservation

#### 5.1 Existing Features

5.1.1 WHEN implementing zigzag layout THEN tất cả chức năng matching hiện tại SHALL được giữ nguyên 100%

5.1.2 WHEN user click vào tab THEN navigation logic SHALL hoạt động giống như trước

5.1.3 WHEN user interact với tabs THEN state management SHALL hoạt động giống như trước

5.1.4 WHEN rendering tabs THEN dark mode support SHALL hoạt động giống như trước

#### 5.2 Data Flow

5.2.1 WHEN checking profile completion THEN logic SHALL sử dụng cùng API như trước

5.2.2 WHEN tracking analytics THEN events SHALL được gửi giống như trước

5.2.3 WHEN handling errors THEN error handling SHALL hoạt động giống như trước

## Non-Functional Requirements

### 6. Performance

#### 6.1 Rendering Performance

6.1.1 WHEN rendering 4 tabs THEN initial render time SHALL NOT exceed 100ms

6.1.2 WHEN switching between desktop và mobile layout THEN re-render time SHALL NOT exceed 50ms

6.1.3 WHEN hovering over tabs THEN hover effect SHALL be smooth với 60fps

6.1.4 WHEN clicking tabs THEN response time SHALL be immediate (< 16ms)

#### 6.2 Resource Usage

6.2.1 WHEN rendering tabs THEN memory usage SHALL NOT increase significantly compared to current implementation

6.2.2 WHEN using CSS classes THEN bundle size SHALL NOT increase more than 5KB

6.2.3 WHEN loading icons THEN icons SHALL be lazy loaded if possible

### 7. Usability

#### 7.1 Visual Clarity

7.1.1 WHEN viewing zigzag layout THEN pattern SHALL be immediately recognizable

7.1.2 WHEN viewing tabs THEN text SHALL be readable với contrast ratio >= 4.5:1

7.1.3 WHEN viewing locked tabs THEN lock icon SHALL be clearly visible

7.1.4 WHEN viewing tabs in dark mode THEN all elements SHALL be clearly visible

#### 7.2 Accessibility

7.2.1 WHEN using keyboard navigation THEN tabs SHALL be focusable và navigable

7.2.2 WHEN using screen reader THEN tab content SHALL be properly announced

7.2.3 WHEN tab is locked THEN screen reader SHALL announce locked state

7.2.4 WHEN hovering tabs THEN focus indicators SHALL be visible

### 8. Compatibility

#### 8.1 Browser Support

8.1.1 WHEN rendering on Chrome/Edge THEN layout SHALL work correctly

8.1.2 WHEN rendering on Firefox THEN layout SHALL work correctly

8.1.3 WHEN rendering on Safari THEN layout SHALL work correctly

8.1.4 WHEN rendering on mobile browsers THEN layout SHALL work correctly

#### 8.2 Device Support

8.2.1 WHEN viewing on desktop (>= 1024px) THEN zigzag pattern SHALL be optimal

8.2.2 WHEN viewing on tablet (768px - 1023px) THEN zigzag pattern SHALL work correctly

8.2.3 WHEN viewing on mobile (< 768px) THEN equal height layout SHALL work correctly

8.2.4 WHEN viewing on small mobile (< 375px) THEN layout SHALL still be usable

### 9. Maintainability

#### 9.1 Code Quality

9.1.1 WHEN implementing components THEN code SHALL follow React best practices

9.1.2 WHEN defining types THEN TypeScript interfaces SHALL be properly typed

9.1.3 WHEN writing styles THEN Tailwind classes SHALL be used consistently

9.1.4 WHEN adding new features THEN code SHALL be modular và reusable

#### 9.2 Documentation

9.2.1 WHEN implementing components THEN JSDoc comments SHALL be provided

9.2.2 WHEN defining complex logic THEN inline comments SHALL explain reasoning

9.2.3 WHEN creating new types THEN type definitions SHALL be documented

### 10. Testing

#### 10.1 Unit Testing

10.1.1 WHEN testing components THEN unit tests SHALL cover all props combinations

10.1.2 WHEN testing functions THEN unit tests SHALL cover all edge cases

10.1.3 WHEN testing responsive behavior THEN tests SHALL cover all breakpoints

10.1.4 WHEN testing lock state THEN tests SHALL cover locked và unlocked states

#### 10.2 Integration Testing

10.2.1 WHEN testing full flow THEN integration tests SHALL verify end-to-end behavior

10.2.2 WHEN testing navigation THEN tests SHALL verify correct routing

10.2.3 WHEN testing error handling THEN tests SHALL verify toast messages

#### 10.3 Visual Testing

10.3.1 WHEN testing layout THEN visual regression tests SHALL catch layout changes

10.3.2 WHEN testing responsive THEN tests SHALL verify layout at different viewports

10.3.3 WHEN testing dark mode THEN tests SHALL verify styling in both themes

## Acceptance Criteria

### 11. Definition of Done

11.1 Desktop zigzag layout hiển thị đúng pattern: thấp-cao-cao-thấp

11.2 Mobile layout hiển thị đúng với equal heights và 2 cột

11.3 Tất cả tabs có styling đúng theo design (colors, shadows, borders)

11.4 Lock state hoạt động đúng: locked tabs không clickable, hiển thị icon 🔒

11.5 Hover effects hoạt động mượt mà trên unlocked tabs

11.6 Click navigation hoạt động đúng cho cả locked và unlocked tabs

11.7 Responsive behavior hoạt động đúng khi resize viewport

11.8 Dark mode support hoạt động đúng cho tất cả tabs

11.9 Tất cả chức năng hiện tại được giữ nguyên 100%

11.10 Unit tests pass với coverage >= 80%

11.11 Integration tests pass cho full user flow

11.12 Visual regression tests pass cho desktop và mobile

11.13 Performance metrics đạt yêu cầu (render time, hover smoothness)

11.14 Code review approved và merged vào main branch

11.15 Documentation hoàn thiện (JSDoc, inline comments, README)

## Out of Scope

- Thêm tab thứ 5 hoặc nhiều hơn (chỉ 4 tabs như yêu cầu)
- Thay đổi logic matching bên trong mỗi mode
- Thêm animations phức tạp (chỉ hover effects đơn giản)
- Customizable tab order (thứ tự tabs cố định)
- Drag and drop để sắp xếp lại tabs
- Tab thứ 4 vẫn chưa được xác định tên cụ thể (có thể là "Sở thích chung" hoặc tên khác)

## Dependencies

- React 18+
- TypeScript 4.9+
- Tailwind CSS 3.3+
- lucide-react (icons)
- react-router-dom (navigation)
- sonner (toast notifications)
- Firebase (authentication, profile data)

## Risks and Mitigations

### Risk 1: Layout Breaking on Edge Cases
**Mitigation**: Extensive testing trên nhiều viewport sizes và devices

### Risk 2: Performance Issues with Hover Effects
**Mitigation**: Sử dụng CSS transforms thay vì JavaScript, optimize với will-change

### Risk 3: Accessibility Issues
**Mitigation**: Follow WCAG guidelines, test với screen readers và keyboard navigation

### Risk 4: Dark Mode Styling Inconsistencies
**Mitigation**: Test kỹ trong cả 2 themes, sử dụng Tailwind dark mode classes

### Risk 5: Breaking Existing Functionality
**Mitigation**: Comprehensive integration tests, careful code review, gradual rollout
