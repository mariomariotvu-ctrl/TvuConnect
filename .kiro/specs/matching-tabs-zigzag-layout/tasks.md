# Tasks: Matching Tabs Zigzag Layout

## Phase 1: Setup và Preparation

### 1.1 Create Component Structure
- [x] 1.1.1 Tạo file `src/components/matching/ZigzagMatchingTabs.tsx`
- [x] 1.1.2 Tạo file `src/components/matching/MatchingTabCard.tsx`
- [x] 1.1.3 Tạo types file `src/types/matchingTabs.ts` cho interfaces
- [x] 1.1.4 Export components từ `src/components/matching/index.ts`

### 1.2 Define Types và Interfaces
- [x] 1.2.1 Define `MatchingTabConfig` interface trong `src/types/matchingTabs.ts`
- [x] 1.2.2 Define `ZigzagLayoutProps` interface
- [x] 1.2.3 Define `TabCardProps` interface
- [x] 1.2.4 Define `LayoutConfig` interface cho responsive settings

### 1.3 Setup Utility Functions
- [x] 1.3.1 Tạo file `src/utils/zigzagLayout.ts`
- [x] 1.3.2 Implement `getZigzagPattern()` function
- [x] 1.3.3 Implement `calculateTabHeight()` function
- [x] 1.3.4 Implement `isTabLocked()` function
- [x] 1.3.5 Export utility functions

## Phase 2: Core Component Implementation

### 2.1 Implement MatchingTabCard Component
- [ ] 2.1.1 Create basic component structure với props
- [ ] 2.1.2 Implement icon rendering với dynamic import
- [ ] 2.1.3 Implement title và description rendering
- [ ] 2.1.4 Implement lock icon (🔒) conditional rendering
- [ ] 2.1.5 Apply height classes (h-48 hoặc h-56) từ props
- [ ] 2.1.6 Apply padding classes (pt-6 pb-6 hoặc pt-8 pb-8)
- [ ] 2.1.7 Implement base styling (background, border, shadow)
- [ ] 2.1.8 Add dark mode support với Tailwind dark: classes

### 2.2 Implement Hover Effects
- [ ] 2.2.1 Add hover scale effect (scale-102) cho unlocked tabs
- [ ] 2.2.2 Add hover shadow effect cho unlocked tabs
- [ ] 2.2.3 Add transition classes (transition-all duration-200)
- [ ] 2.2.4 Disable hover effects cho locked tabs
- [ ] 2.2.5 Test hover smoothness trên different browsers

### 2.3 Implement Click Handlers
- [ ] 2.3.1 Add onClick handler với locked state check
- [ ] 2.3.2 Implement toast error cho locked tabs
- [ ] 2.3.3 Implement navigation cho unlocked tabs
- [ ] 2.3.4 Add analytics tracking (optional)
- [ ] 2.3.5 Add keyboard support (Enter key)

## Phase 3: Layout Implementation

### 3.1 Implement ZigzagMatchingTabs Component
- [ ] 3.1.1 Create component structure với props
- [ ] 3.1.2 Define tab configurations array với 4 tabs
- [ ] 3.1.3 Implement profile completion check
- [ ] 3.1.4 Implement lock state logic cho từng tab
- [ ] 3.1.5 Setup navigation handler

### 3.2 Implement Desktop Layout
- [ ] 3.2.1 Create grid container với `grid grid-cols-4 gap-4`
- [ ] 3.2.2 Apply zigzag pattern: Tab 1 (h-48), Tab 2 (h-56), Tab 3 (h-56), Tab 4 (h-48)
- [ ] 3.2.3 Apply responsive classes với `md:` prefix
- [ ] 3.2.4 Verify visual alignment của 4 tabs
- [ ] 3.2.5 Test trên different desktop screen sizes

### 3.3 Implement Mobile Layout
- [ ] 3.3.1 Create grid container với `grid-cols-2 gap-3`
- [ ] 3.3.2 Apply h-auto cho tất cả tabs trên mobile
- [ ] 3.3.3 Adjust padding cho mobile (nếu cần)
- [ ] 3.3.4 Verify layout trên different mobile screen sizes
- [ ] 3.3.5 Test responsive transition từ desktop sang mobile

## Phase 4: Styling và Polish

### 4.1 Implement Visual Styling
- [ ] 4.1.1 Apply background colors (white, dark mode)
- [ ] 4.1.2 Apply border radius (rounded-[24px])
- [ ] 4.1.3 Apply shadows (shadow-xl)
- [ ] 4.1.4 Apply borders (border border-gray-100)
- [ ] 4.1.5 Style icons với proper size và colors

### 4.2 Implement Dark Mode Support
- [ ] 4.2.1 Add dark:bg-gray-800 cho tab background
- [ ] 4.2.2 Add dark:text-gray-100 cho text
- [ ] 4.2.3 Add dark:border-gray-700 cho borders
- [ ] 4.2.4 Test dark mode trên tất cả tabs
- [ ] 4.2.5 Verify contrast ratios trong dark mode

### 4.3 Implement Lock State Styling
- [ ] 4.3.1 Add opacity-60 cho locked tabs
- [ ] 4.3.2 Add cursor-not-allowed cho locked tabs
- [ ] 4.3.3 Position lock icon (🔒) ở góc trên phải
- [ ] 4.3.4 Style lock icon với proper size và color
- [ ] 4.3.5 Test lock state visual feedback

## Phase 5: Integration

### 5.1 Integrate với Existing Code
- [ ] 5.1.1 Import ZigzagMatchingTabs vào App.tsx hoặc matching page
- [ ] 5.1.2 Replace existing tabs grid với ZigzagMatchingTabs component
- [ ] 5.1.3 Pass required props (currentUser, onModeSelect, isProfileComplete)
- [ ] 5.1.4 Verify navigation vẫn hoạt động đúng
- [ ] 5.1.5 Verify profile completion check vẫn hoạt động

### 5.2 Preserve Existing Functionality
- [ ] 5.2.1 Verify matching logic vẫn hoạt động giống như trước
- [ ] 5.2.2 Verify analytics tracking vẫn hoạt động
- [ ] 5.2.3 Verify error handling vẫn hoạt động
- [ ] 5.2.4 Verify state management vẫn hoạt động
- [ ] 5.2.5 Run regression tests

## Phase 6: Testing

### 6.1 Unit Tests
- [ ] 6.1.1 Test `getZigzagPattern()` returns correct pattern
- [ ] 6.1.2 Test `calculateTabHeight()` với different viewports
- [ ] 6.1.3 Test `isTabLocked()` với different profile states
- [ ] 6.1.4 Test MatchingTabCard renders correctly với different props
- [ ] 6.1.5 Test hover effects chỉ apply cho unlocked tabs
- [ ] 6.1.6 Test click handlers với locked và unlocked states
- [ ] 6.1.7 Achieve >= 80% code coverage

### 6.2 Integration Tests
- [ ] 6.2.1 Test full render flow: load page → render tabs → verify layout
- [ ] 6.2.2 Test click flow: click locked tab → toast error
- [ ] 6.2.3 Test click flow: click unlocked tab → navigate
- [ ] 6.2.4 Test responsive flow: resize viewport → layout changes
- [ ] 6.2.5 Test dark mode flow: toggle theme → styling updates

### 6.3 Visual Regression Tests
- [ ] 6.3.1 Capture baseline screenshots cho desktop layout
- [ ] 6.3.2 Capture baseline screenshots cho mobile layout
- [ ] 6.3.3 Capture baseline screenshots cho dark mode
- [ ] 6.3.4 Capture baseline screenshots cho locked state
- [ ] 6.3.5 Run visual regression tests trên CI/CD

### 6.4 Property-Based Tests
- [ ] 6.4.1 Test zigzag pattern property với random viewports >= 768px
- [ ] 6.4.2 Test mobile equality property với random viewports < 768px
- [ ] 6.4.3 Test lock state property với random profile states
- [ ] 6.4.4 Test gap constraint property với random layouts
- [ ] 6.4.5 Test functional preservation property với random interactions

### 6.5 Manual Testing
- [ ] 6.5.1 Test trên Chrome desktop và mobile
- [ ] 6.5.2 Test trên Firefox desktop và mobile
- [ ] 6.5.3 Test trên Safari desktop và mobile
- [ ] 6.5.4 Test trên Edge desktop
- [ ] 6.5.5 Test keyboard navigation
- [ ] 6.5.6 Test screen reader compatibility
- [ ] 6.5.7 Test với real user profiles (complete và incomplete)

## Phase 7: Performance Optimization

### 7.1 Optimize Rendering
- [ ] 7.1.1 Memoize tab configurations với useMemo
- [ ] 7.1.2 Memoize utility functions nếu cần
- [ ] 7.1.3 Optimize re-renders với React.memo
- [ ] 7.1.4 Measure initial render time (target: < 100ms)
- [ ] 7.1.5 Measure re-render time (target: < 50ms)

### 7.2 Optimize Hover Effects
- [ ] 7.2.1 Use CSS transforms thay vì JavaScript
- [ ] 7.2.2 Add will-change: transform cho hover elements
- [ ] 7.2.3 Test hover smoothness với 60fps target
- [ ] 7.2.4 Profile performance với Chrome DevTools
- [ ] 7.2.5 Optimize nếu có performance issues

### 7.3 Optimize Bundle Size
- [ ] 7.3.1 Lazy load icons nếu possible
- [ ] 7.3.2 Tree-shake unused Tailwind classes
- [ ] 7.3.3 Measure bundle size increase (target: < 5KB)
- [ ] 7.3.4 Optimize imports (named imports thay vì default)
- [ ] 7.3.5 Run bundle analyzer

## Phase 8: Documentation

### 8.1 Code Documentation
- [ ] 8.1.1 Add JSDoc comments cho ZigzagMatchingTabs component
- [ ] 8.1.2 Add JSDoc comments cho MatchingTabCard component
- [ ] 8.1.3 Add JSDoc comments cho utility functions
- [ ] 8.1.4 Add inline comments cho complex logic
- [ ] 8.1.5 Document type definitions

### 8.2 User Documentation
- [ ] 8.2.1 Create README.md cho zigzag layout feature
- [ ] 8.2.2 Document usage examples
- [ ] 8.2.3 Document props và interfaces
- [ ] 8.2.4 Add screenshots cho desktop và mobile layouts
- [ ] 8.2.5 Document troubleshooting tips

### 8.3 Developer Documentation
- [ ] 8.3.1 Document component architecture
- [ ] 8.3.2 Document responsive breakpoints
- [ ] 8.3.3 Document styling conventions
- [ ] 8.3.4 Document testing strategy
- [ ] 8.3.5 Add migration guide từ old layout

## Phase 9: Deployment

### 9.1 Pre-Deployment Checks
- [ ] 9.1.1 Run all tests và verify pass
- [ ] 9.1.2 Run linter và fix issues
- [ ] 9.1.3 Run type checker và fix errors
- [ ] 9.1.4 Review code với team
- [ ] 9.1.5 Test trên staging environment

### 9.2 Deployment
- [ ] 9.2.1 Create feature branch
- [ ] 9.2.2 Commit changes với descriptive messages
- [ ] 9.2.3 Push to remote repository
- [ ] 9.2.4 Create pull request
- [ ] 9.2.5 Address review comments
- [ ] 9.2.6 Merge to main branch
- [ ] 9.2.7 Deploy to production

### 9.3 Post-Deployment
- [ ] 9.3.1 Monitor error logs
- [ ] 9.3.2 Monitor performance metrics
- [ ] 9.3.3 Monitor user feedback
- [ ] 9.3.4 Fix any critical issues immediately
- [ ] 9.3.5 Document lessons learned

## Phase 10: Validation và Sign-off

### 10.1 Acceptance Testing
- [ ] 10.1.1 Verify desktop zigzag layout hiển thị đúng
- [ ] 10.1.2 Verify mobile equal height layout hiển thị đúng
- [ ] 10.1.3 Verify lock state hoạt động đúng
- [ ] 10.1.4 Verify hover effects hoạt động mượt
- [ ] 10.1.5 Verify click navigation hoạt động đúng
- [ ] 10.1.6 Verify responsive behavior hoạt động đúng
- [ ] 10.1.7 Verify dark mode support hoạt động đúng
- [ ] 10.1.8 Verify tất cả existing functionality preserved

### 10.2 Stakeholder Review
- [ ] 10.2.1 Demo feature cho product owner
- [ ] 10.2.2 Demo feature cho design team
- [ ] 10.2.3 Demo feature cho QA team
- [ ] 10.2.4 Address feedback và concerns
- [ ] 10.2.5 Get final approval

### 10.3 Sign-off
- [ ] 10.3.1 Product owner sign-off
- [ ] 10.3.2 Tech lead sign-off
- [ ] 10.3.3 QA sign-off
- [ ] 10.3.4 Update project status
- [ ] 10.3.5 Close feature ticket

## Notes

- Tất cả tasks phải được test kỹ trước khi move sang phase tiếp theo
- Nếu có issues, quay lại phase trước để fix
- Maintain communication với team throughout implementation
- Document any deviations từ original plan
- Prioritize user experience và performance
