# Design Document: Mobile Document Repository Optimization

## Overview

This design document specifies the technical implementation for optimizing the mobile user interface of the Academic Document Repository feature in TVU Connect. The optimization focuses on improving information density, touch accessibility, and visual hierarchy on mobile devices while preserving the existing desktop experience.

### Problem Statement

The current implementation uses a horizontal card layout that works well on desktop but is suboptimal for mobile devices. Mobile users experience:
- Low information density (only 1-2 cards visible per screen)
- Excessive scrolling required to browse documents
- Suboptimal touch target sizing and positioning
- Inefficient use of vertical screen space

### Solution Approach

Implement a responsive design that:
1. Maintains the current desktop layout unchanged (≥768px viewports)
2. Introduces a compact, vertical-stacked mobile layout (<768px viewports)
3. Uses Tailwind CSS responsive utilities for clean, maintainable code
4. Preserves all existing functionality and component architecture
5. Optimizes for one-handed mobile usage patterns

### Key Design Principles

- **Desktop Preservation**: Zero changes to desktop experience
- **Mobile-First Optimization**: Compact cards showing 3+ documents per screen
- **Touch-Friendly**: 44x44px minimum touch targets with adequate spacing
- **Visual Hierarchy**: Title → Uploader → Tags → Actions
- **Performance**: Smooth 60fps scrolling, lazy loading, memoization
- **Accessibility**: WCAG 2.1 Level AA compliance maintained

## Architecture

### Component Structure

The implementation leverages existing components with responsive styling enhancements:

```
DocumentRepository (Container)
├── SearchBar (Unchanged)
├── FilterPanel (Mobile-optimized padding/sizing)
├── DocumentGrid (Unchanged wrapper)
│   └── DocumentCard (Responsive layout logic)
│       ├── Desktop Layout (md: breakpoint, horizontal)
│       └── Mobile Layout (default, vertical/stacked)
└── Modals (CreateDocumentModal, EditDocumentModal - Unchanged)
```

### Responsive Breakpoint Strategy

**Breakpoint**: 768px (Tailwind's `md:` prefix)

- **Mobile**: `< 768px` - Vertical stacked layout, compact spacing
- **Desktop**: `≥ 768px` - Horizontal layout, current implementation

**Implementation Pattern**:
```tsx
// Mobile-first: default classes apply to mobile
// Desktop: md: prefix overrides for desktop
<div className="mobile-class md:desktop-class">
```

### State Management

No changes to existing state management:
- `useDocuments` hook - unchanged
- `useUploaderProfile` hook - unchanged
- Component state (filters, modals) - unchanged
- Event handlers - unchanged

### Data Flow

```
User Interaction
    ↓
DocumentRepository (filters, search)
    ↓
useDocuments hook (fetch/filter)
    ↓
DocumentGrid (map documents)
    ↓
DocumentCard (render with responsive layout)
    ↓
useUploaderProfile (fetch uploader data)
    ↓
UploaderInfo (display avatar/name)
```

## Components and Interfaces

### DocumentCard Component

The primary component requiring modification for mobile optimization.

#### Current Structure
```tsx
interface DocumentCardProps {
  document: DocumentLink;
  currentUser: User;
  onEdit: (document: DocumentLink) => void;
  onDelete: (id: string) => void;
  onProfileClick?: (uid: string) => void;
}
```

**No interface changes required** - only styling modifications.

#### Desktop Layout (≥768px)

Preserved exactly as current implementation:
- Horizontal flex layout
- Content on left, actions on right
- All information visible
- Hover effects maintained

#### Mobile Layout (<768px)

New compact vertical layout:

**Structure**:
```
┌─────────────────────────────────┐
│ Title                  [Edit][X]│  ← Title + inline actions
│ 👤 Uploader Name               │  ← Uploader info
│ 🎓 Major  📖 Subject           │  ← Tags with icons
│ ┌───────────────────────────┐ │
│ │   📤 Mở tài liệu          │ │  ← Full-width button
│ └───────────────────────────┘ │
└─────────────────────────────────┘
```

**Key Measurements**:
- Card padding: 16px (p-4)
- Title font: 16px (text-base), semibold
- Uploader font: 14px (text-sm)
- Tag font: 14px (text-sm)
- Button height: 44px minimum (py-3)
- Vertical spacing: 12px between sections (mb-3)
- Edit/Delete buttons: 40x40px touch targets

**Removed on Mobile**:
- Description text (hidden to reduce height)
- Horizontal spacing between content and actions

### FilterPanel Component

Minor mobile optimizations:

**Desktop (≥768px)**: Current implementation
- Padding: 16px (p-4)
- Icon size: 20px (w-5 h-5)

**Mobile (<768px)**:
- Padding: 12px (p-3)
- Icon size: 16px (w-4 h-4)
- Dropdown height: 44px minimum
- Clear button: 40x40px touch target

### SearchBar Component

**No structural changes** - already mobile-optimized with:
- Input height: 44px minimum
- Clear touch targets
- Appropriate mobile keyboard type

### UploaderInfo Component

**No changes required** - already displays:
- Avatar (32px)
- Name with profile link
- Loading states
- Fallback handling

## Data Models

### Existing Types (Unchanged)

```typescript
interface DocumentLink {
  id: string;
  title: string;
  description: string;
  url: string;
  major_id: string;
  subject?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface FilterState {
  major_id: string | null;
  subject: string | null;
  category: string | null;
}

interface DocumentFormData {
  title: string;
  description: string;
  url: string;
  major_id: string;
  subject?: string;
}
```

**No data model changes required** - purely presentational optimization.

## Implementation Details

### Responsive Class Strategy

Using Tailwind's mobile-first approach:

```tsx
// Pattern: mobile-default md:desktop-override
className="flex-col md:flex-row"  // Vertical mobile, horizontal desktop
className="p-4 md:p-5"             // Less padding mobile, more desktop
className="text-base md:text-lg"   // Smaller text mobile, larger desktop
className="hidden md:block"        // Hide on mobile, show desktop
className="md:hidden"              // Show on mobile, hide desktop
```

### DocumentCard Mobile Layout Implementation


**Key Implementation Points**:

1. **Dual Layout Structure**: Maintain both desktop and mobile layouts in same component
2. **Conditional Rendering**: Use `hidden md:flex` and `md:hidden` for layout switching
3. **Touch Target Sizing**: Ensure all interactive elements meet 44x44px minimum
4. **Visual Hierarchy**: Use font size, weight, and spacing to guide attention
5. **Performance**: Leverage existing memoization in DocumentCard

**Mobile-Specific Classes**:

```tsx
// Mobile container
<div className="md:hidden p-4">
  
  // Title row with inline edit/delete
  <div className="flex items-start justify-between gap-2 mb-2">
    <h3 className="flex-1 text-base font-semibold line-clamp-2">
      {document.title}
    </h3>
    
    {isOwner && (
      <div className="flex items-center gap-1">
        <button className="p-2 min-h-[40px] min-w-[40px]">
          <Edit2 className="w-4 h-4" />
        </button>
        <button className="p-2 min-h-[40px] min-w-[40px]">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
  
  // Uploader info
  <div className="mb-2">
    <UploaderInfo uploaderId={document.createdBy} />
  </div>
  
  // Tags
  <div className="flex flex-wrap gap-1.5 mb-3">
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-sm">
      <MajorIcon className="w-3 h-3" />
      {formattedMajor}
    </span>
  </div>
  
  // Full-width action button
  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px]">
    <ExternalLink className="w-4 h-4" />
    <span>Mở tài liệu</span>
  </button>
</div>
```

### FilterPanel Mobile Optimization

**Changes**:
- Reduce padding from `p-4` to `p-3` on mobile
- Reduce icon sizes from `w-5 h-5` to `w-4 h-4` on mobile
- Maintain dropdown functionality and touch targets

```tsx
<div className="p-3 md:p-4">
  <div className="flex items-center gap-2 md:gap-3">
    <div className="p-1.5 md:p-2.5">
      <GraduationCap className="w-4 h-4 md:w-5 md:h-5" />
    </div>
    <select className="py-2 md:py-2.5 text-xs md:text-sm">
      {/* Options */}
    </select>
  </div>
</div>
```

### Performance Optimizations

**Existing Optimizations (Preserved)**:
- DocumentCard memoization with custom comparison
- useDocuments hook with dependency tracking
- Lazy loading of uploader profiles

**Additional Mobile Considerations**:
- Images already lazy-loaded via UploaderInfo
- Smooth scrolling maintained via CSS
- No layout shifts (consistent card heights)

### Dark Mode Support

**No changes required** - existing dark mode classes work for both layouts:
- `dark:bg-gray-800` - card backgrounds
- `dark:text-gray-100` - text colors
- `dark:border-gray-700` - borders
- `dark:hover:bg-indigo-950/30` - hover states

All dark mode styling is viewport-agnostic and applies to both layouts.

### Accessibility Implementation

**Maintained Standards**:
- Semantic HTML: `<article>`, `<h3>`, `<button>`
- ARIA labels: `aria-label` on all buttons
- Keyboard navigation: All buttons focusable
- Screen reader support: Logical reading order
- Contrast ratios: WCAG 2.1 Level AA compliant

**Mobile-Specific Considerations**:
- Touch targets: 44x44px minimum (exceeds WCAG 2.5.5)
- Spacing: 8px minimum between targets (exceeds WCAG 2.5.8)
- Text size: 14px minimum (exceeds WCAG 1.4.4)

## Testing Strategy

### Unit Testing

**Focus Areas**:
1. Component rendering at different viewport sizes
2. Responsive class application
3. Touch target sizing validation
4. Event handler preservation
5. Dark mode styling

**Example Tests**:

```typescript
describe('DocumentCard Mobile Layout', () => {
  it('should render mobile layout for viewports < 768px', () => {
    // Test mobile layout visibility
  });
  
  it('should render desktop layout for viewports >= 768px', () => {
    // Test desktop layout visibility
  });
  
  it('should maintain touch target minimum size of 44x44px', () => {
    // Test button dimensions
  });
  
  it('should preserve all event handlers in mobile layout', () => {
    // Test onEdit, onDelete, onProfileClick
  });
  
  it('should display uploader info in mobile layout', () => {
    // Test UploaderInfo rendering
  });
});

describe('FilterPanel Mobile Optimization', () => {
  it('should reduce padding on mobile viewports', () => {
    // Test responsive padding
  });
  
  it('should reduce icon sizes on mobile viewports', () => {
    // Test responsive icon sizing
  });
  
  it('should maintain dropdown functionality on mobile', () => {
    // Test filter selection
  });
});
```

### Property-Based Testing

Property-based testing is not applicable for this feature as it involves purely presentational UI changes without complex business logic or data transformations. The requirements focus on:
- Visual layout and styling (not algorithmically testable)
- Responsive breakpoints (deterministic, not requiring randomization)
- Touch target sizing (static measurements)
- Component rendering (snapshot/visual regression testing more appropriate)

**Rationale**: Property-based testing excels at validating invariants across random inputs (e.g., "for any valid document, parsing then serializing returns the same document"). This feature has no such universal properties - it's about specific visual presentations at specific breakpoints with specific measurements.

**Appropriate Testing Approaches**:
- Unit tests for component rendering and behavior
- Visual regression tests for layout verification
- Manual testing on real devices for touch interaction
- Accessibility audits for WCAG compliance

### Integration Testing

**Scenarios**:
1. **Viewport Resize**: Verify smooth transition between layouts
2. **Filter Application**: Ensure mobile layout updates correctly
3. **Document Actions**: Test edit/delete flows on mobile
4. **Profile Navigation**: Verify uploader profile clicks work
5. **Modal Interactions**: Test create/edit modals on mobile

### Manual Testing Checklist

**Mobile Devices** (< 768px):
- [ ] iPhone SE (375x667) - 3+ cards visible
- [ ] iPhone 12 (390x844) - 3+ cards visible
- [ ] Samsung Galaxy S21 (360x800) - 3+ cards visible
- [ ] iPad Mini portrait (768x1024) - Should use desktop layout

**Desktop Devices** (≥ 768px):
- [ ] iPad landscape (1024x768) - Desktop layout
- [ ] Laptop (1366x768) - Desktop layout
- [ ] Desktop (1920x1080) - Desktop layout

**Functional Tests**:
- [ ] All buttons have 44x44px touch targets
- [ ] Edit/Delete buttons work correctly
- [ ] Open document button opens in new tab
- [ ] Uploader profile navigation works
- [ ] Filter panel dropdown works on mobile
- [ ] Search bar functions correctly
- [ ] Dark mode styling correct in both layouts
- [ ] Smooth scrolling performance (60fps)
- [ ] No layout shifts during load

### Performance Testing

**Metrics**:
- First Contentful Paint (FCP): < 1.5s on 3G
- Scrolling FPS: 60fps with 50 cards
- Cumulative Layout Shift (CLS): < 0.1
- Time to Interactive (TTI): < 3s on 3G

**Tools**:
- Chrome DevTools Performance tab
- Lighthouse mobile audit
- React DevTools Profiler
- Network throttling (Fast 3G)

## Error Handling

### Responsive Layout Errors

**Scenario**: Browser doesn't support CSS media queries
**Handling**: Mobile layout serves as fallback (mobile-first approach)
**Impact**: Desktop users see mobile layout (degraded but functional)

**Scenario**: Viewport width exactly 768px
**Handling**: Desktop layout displays (≥768px condition)
**Impact**: None - clear breakpoint definition

### Touch Interaction Errors

**Scenario**: Touch target too small (< 44x44px)
**Handling**: Minimum size enforced via `min-h-[44px] min-w-[44px]`
**Impact**: Prevented at design time

**Scenario**: Accidental touch on adjacent buttons
**Handling**: 8px minimum spacing between targets
**Impact**: Reduced false touches

### Component Rendering Errors

**Scenario**: UploaderInfo fails to load
**Handling**: Existing error boundary and fallback in UploaderInfo
**Impact**: Shows fallback avatar/name, card still functional

**Scenario**: Document data missing required fields
**Handling**: Existing validation in DocumentCard
**Impact**: Graceful degradation with empty states

### Performance Degradation

**Scenario**: Slow network on mobile
**Handling**: 
- Skeleton loading states (existing)
- Lazy loading of images (existing)
- Memoization prevents re-renders (existing)
**Impact**: Smooth loading experience maintained

**Scenario**: Low-end mobile device
**Handling**:
- CSS transitions kept minimal (200-300ms)
- No heavy animations
- Efficient Tailwind classes
**Impact**: Acceptable performance on budget devices

## Deployment Considerations

### Build Process

**No changes required**:
- Tailwind CSS already configured
- Responsive utilities included in build
- No new dependencies needed
- No build script modifications

### Browser Compatibility

**Target Browsers**:
- Chrome/Edge 90+ (mobile & desktop)
- Safari 14+ (iOS & macOS)
- Firefox 88+ (mobile & desktop)
- Samsung Internet 14+

**CSS Features Used**:
- Flexbox (universal support)
- CSS Grid (universal support)
- Media queries (universal support)
- CSS custom properties (universal support)

**Fallback Strategy**:
- Mobile-first approach ensures basic functionality
- Progressive enhancement for modern features
- No critical dependencies on cutting-edge CSS

### Testing in Production

**Staged Rollout**:
1. Deploy to staging environment
2. Test on real devices (iOS, Android)
3. Verify analytics (viewport sizes, interactions)
4. Monitor error rates
5. Deploy to production

**Monitoring**:
- Track viewport size distribution
- Monitor mobile vs desktop usage
- Track interaction rates (button clicks)
- Monitor performance metrics (FCP, CLS)

### Rollback Plan

**If issues detected**:
1. Identify affected viewport range
2. Add temporary CSS override to force desktop layout
3. Investigate and fix issue
4. Remove override and redeploy

**Rollback is low-risk** because:
- Desktop layout unchanged (majority of users unaffected)
- Mobile layout is additive (can be disabled via CSS)
- No data model or API changes
- No database migrations

## Future Enhancements

### Potential Improvements

1. **Tablet-Specific Layout** (768-1024px)
   - Hybrid layout between mobile and desktop
   - 2-column grid on tablets
   - Optimized for iPad usage

2. **Swipe Gestures**
   - Swipe left to reveal edit/delete
   - Swipe right to open document
   - Native mobile app feel

3. **Infinite Scroll**
   - Load more documents on scroll
   - Reduce initial load time
   - Better for large document sets

4. **Card Animations**
   - Subtle entrance animations
   - Smooth expand/collapse
   - Enhanced visual polish

5. **Offline Support**
   - Cache document list
   - Offline viewing of metadata
   - Sync when online

### Scalability Considerations

**Current Design Scales Well**:
- Memoization prevents re-render issues
- Lazy loading handles large lists
- Responsive approach works at any viewport size
- No hardcoded dimensions

**Potential Bottlenecks**:
- Very large document lists (100+)
  - Solution: Implement pagination or infinite scroll
- Slow uploader profile fetches
  - Solution: Batch profile requests
- High-resolution images
  - Solution: Implement image optimization service

## Appendix

### Tailwind CSS Responsive Utilities Reference

```css
/* Mobile-first breakpoints */
sm: 640px   /* Small devices */
md: 768px   /* Medium devices (tablets) */
lg: 1024px  /* Large devices (desktops) */
xl: 1280px  /* Extra large devices */
2xl: 1536px /* 2X large devices */
```

**This design uses**: `md:` prefix (768px) as the primary breakpoint

### Touch Target Size Guidelines

**WCAG 2.5.5 (Level AAA)**: 44x44 CSS pixels minimum
**Apple HIG**: 44x44 points minimum
**Material Design**: 48x48 dp minimum
**This Design**: 44x44px minimum (meets all standards)

### Color Contrast Ratios

**WCAG 2.1 Level AA Requirements**:
- Normal text (< 18px): 4.5:1 minimum
- Large text (≥ 18px): 3.0:1 minimum
- UI components: 3.0:1 minimum

**This Design**:
- Body text (14px): Uses gray-600/gray-400 (> 4.5:1)
- Titles (16-18px): Uses gray-900/gray-100 (> 7:1)
- Buttons: High contrast gradients (> 4.5:1)
- Tags: Colored backgrounds with dark text (> 4.5:1)

### Mobile Viewport Sizes Reference

**Common Mobile Devices**:
- iPhone SE: 375x667 (target: 3+ cards)
- iPhone 12/13: 390x844 (target: 3+ cards)
- iPhone 12/13 Pro Max: 428x926 (target: 4+ cards)
- Samsung Galaxy S21: 360x800 (target: 3+ cards)
- Google Pixel 5: 393x851 (target: 3+ cards)

**Tablet Devices** (should use desktop layout):
- iPad Mini: 768x1024 (portrait) - Desktop layout
- iPad Air: 820x1180 (portrait) - Desktop layout
- iPad Pro 11": 834x1194 (portrait) - Desktop layout

### Component File Locations

```
src/
├── components/
│   ├── DocumentRepository.tsx    (Minor: FAB positioning)
│   ├── DocumentCard.tsx          (Major: Mobile layout)
│   ├── FilterPanel.tsx           (Minor: Mobile sizing)
│   ├── SearchBar.tsx             (No changes)
│   ├── UploaderInfo.tsx          (No changes)
│   ├── DocumentGrid.tsx          (No changes)
│   ├── CreateDocumentModal.tsx   (No changes)
│   └── EditDocumentModal.tsx     (No changes)
├── hooks/
│   ├── useDocuments.ts           (No changes)
│   └── useUploaderProfile.ts     (No changes)
├── types/
│   └── documentLink.ts           (No changes)
└── services/
    └── documentService.ts        (No changes)
```

### Research Sources

**Mobile UI Best Practices**:
- Apple Human Interface Guidelines (iOS)
- Material Design Guidelines (Android)
- WCAG 2.1 Accessibility Standards
- Nielsen Norman Group Mobile Usability Research

**Responsive Design Patterns**:
- Tailwind CSS Documentation (Responsive Design)
- MDN Web Docs (Media Queries)
- CSS-Tricks (Responsive Design Patterns)

**Touch Interaction Design**:
- Luke Wroblewski's "Mobile First" principles
- Josh Clark's "Designing for Touch"
- Steven Hoober's "Designing Mobile Interfaces"

**Performance Optimization**:
- Google Web Vitals
- React Performance Optimization Guide
- Tailwind CSS Performance Best Practices



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following testable properties and examples. Many criteria focus on visual design, specific measurements, or subjective qualities that are better validated through visual regression testing and manual QA rather than property-based testing.

**Properties Identified** (universal rules):
- Touch target sizing (all buttons ≥44x44px)
- Touch target spacing (all adjacent targets ≥8px apart)
- Border radius consistency (all cards 8-12px)
- Spacing grid consistency (all spacing multiples of 4px)
- Contrast ratios (all text meets WCAG requirements)
- ARIA labels (all interactive elements have labels)
- Keyboard accessibility (all interactive elements focusable)
- Permission-based actions (owners see edit/delete)
- Uploader info display (all cards show uploader)
- Icon mapping (all majors have correct icons)
- Icon sizing (all icons 12-16px)
- Font sizing (all body text ≥14px)
- Line height (all multi-line text 1.4-1.6)
- Card padding consistency (12-16px)
- Card spacing consistency (16-20px)
- Event handler preservation (all handlers work identically)

**Examples Identified** (specific test cases):
- Viewport breakpoint behavior (768px threshold)
- Layout switching (mobile vs desktop)
- Specific element positioning
- Specific measurements
- Dark mode color values
- Component structure

**Redundancy Analysis**:
1. **Touch Target Properties**: 5.1 (minimum size) and 5.2 (spacing) are distinct and both valuable
2. **Contrast Properties**: 9.3 (dark mode) and 10.3 (general) can be combined into one comprehensive property
3. **Accessibility Properties**: 10.1 (ARIA), 10.3 (contrast), 10.5 (keyboard) are distinct aspects
4. **Consistency Properties**: 7.1 (border radius), 7.4 (spacing grid), 13.4 (padding), 13.5 (card spacing) are all distinct measurements
5. **Icon Properties**: 14.1 (mapping), 14.4 (sizing), 14.5 (contrast) are distinct aspects
6. **Typography Properties**: 15.1 (minimum size) and 15.3 (line height) are distinct

**Properties to Combine**:
- 9.3 and 10.3 → Single comprehensive contrast ratio property
- 13.4 and 13.5 → Can be tested together as card spacing consistency

### Property 1: Touch Target Minimum Size

*For any* interactive button in the mobile layout, its dimensions SHALL be at least 44x44 CSS pixels to ensure comfortable touch interaction.

**Validates: Requirements 5.1**

### Property 2: Touch Target Spacing

*For any* pair of adjacent interactive elements in the mobile layout, the spacing between them SHALL be at least 8 CSS pixels to prevent accidental touches.

**Validates: Requirements 5.2**

### Property 3: Border Radius Consistency

*For any* document card in the mobile layout, its border radius SHALL be between 8px and 12px to maintain consistent visual design.

**Validates: Requirements 7.1**

### Property 4: Spacing Grid Consistency

*For any* spacing value (margin, padding, gap) in the mobile layout, it SHALL be a multiple of 4px to maintain consistent visual rhythm.

**Validates: Requirements 7.4**

### Property 5: Text Contrast Ratios

*For any* text element in the mobile layout (in both light and dark modes), the contrast ratio between text and background SHALL meet WCAG 2.1 Level AA requirements (4.5:1 for normal text <18px, 3.0:1 for large text ≥18px).

**Validates: Requirements 9.3, 10.3**

### Property 6: ARIA Label Presence

*For any* interactive element (button, link, input) in the mobile layout, it SHALL have an appropriate ARIA label or accessible name for screen reader users.

**Validates: Requirements 10.1**

### Property 7: Keyboard Accessibility

*For any* interactive element in the mobile layout, it SHALL be keyboard accessible (focusable and operable via keyboard) to support users with external keyboards.

**Validates: Requirements 10.5**

### Property 8: Permission-Based Action Visibility

*For any* document card in the mobile layout, edit and delete buttons SHALL be visible if and only if the current user is the document owner.

**Validates: Requirements 11.3, 11.5**

### Property 9: Uploader Information Display

*For any* document card in the mobile layout, it SHALL display uploader information (avatar and name) using the UploaderInfo component.

**Validates: Requirements 12.1**

### Property 10: Major Icon Mapping

*For any* document card in the mobile layout, the major tag SHALL display the correct icon based on the major type (e.g., Stethoscope for medical, Code for IT).

**Validates: Requirements 14.1**

### Property 11: Icon Size Consistency

*For any* icon in the mobile layout, its size SHALL be between 12px and 16px for optimal mobile visibility.

**Validates: Requirements 14.4**

### Property 12: Icon Contrast

*For any* icon in the mobile layout (in both light and dark modes), it SHALL have sufficient contrast (minimum 3:1) against its background.

**Validates: Requirements 14.5**

### Property 13: Minimum Body Text Size

*For any* body text element in the mobile layout, its font size SHALL be at least 14px to ensure readability without zooming.

**Validates: Requirements 15.1**

### Property 14: Line Height Consistency

*For any* multi-line text element in the mobile layout, its line height SHALL be between 1.4 and 1.6 for optimal readability.

**Validates: Requirements 15.3**

### Property 15: Card Spacing Consistency

*For any* document card in the mobile layout, its internal padding SHALL be between 12px and 16px, and vertical spacing between cards SHALL be between 16px and 20px.

**Validates: Requirements 13.4, 13.5**

### Property 16: Event Handler Preservation

*For any* interactive element in the mobile layout, its event handlers (onEdit, onDelete, onProfileClick) SHALL function identically to the desktop layout.

**Validates: Requirements 16.5**

### Property 17: Desktop Layout Functional Preservation

*For all* desktop viewport sizes (≥768px), all interactive functionality (filtering, searching, editing, deleting, profile navigation) SHALL work identically to the current implementation.

**Validates: Requirements 1.5**

