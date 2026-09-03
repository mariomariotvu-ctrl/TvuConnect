# Implementation Plan: Document Repository UI Enhancement

## Overview

This implementation plan transforms the Academic Document Repository interface with modern UI design, uploader information display, permission controls, and responsive design. The implementation follows a progressive enhancement approach: build core functionality first, then add visual polish and optimizations.

## Tasks

- [x] 1. Create Avatar component with lazy loading and fallback
  - Create `src/components/Avatar.tsx` with size variants (sm: 32px, md: 40px, lg: 48px)
  - Implement lazy loading using Intersection Observer API
  - Add error handling with fallback to first letter of name on colored background
  - Include hover effects when clickable (scale to 105%)
  - Ensure accessibility with proper alt text and aria-labels
  - _Requirements: 2.3, 2.4, 6.3, 6.4, 8.3, 11.6_

- [ ]* 1.1 Write property test for Avatar component
  - **Property 2: Avatar Image Display** - For any uploader profile with photoURL, rendered card includes img with that src
  - **Property 3: Default Avatar Fallback** - For any profile without photoURL, display default avatar with first letter
  - **Property 11: Avatar Load Failure Fallback** - For any failed image load, display default avatar
  - **Validates: Requirements 2.3, 2.4, 6.3**

- [ ]* 1.2 Write unit tests for Avatar component
  - Test image loading success and failure scenarios
  - Test fallback avatar rendering with first letter
  - Test lazy loading behavior with Intersection Observer
  - Test hover effects and click handlers
  - _Requirements: 2.3, 2.4, 6.3, 6.4_

- [x] 2. Create useUploaderProfile hook with caching
  - Create `src/hooks/useUploaderProfile.ts` custom hook
  - Implement in-memory cache with 5-minute TTL (300,000ms)
  - Fetch user profile from Firestore "users" collection by UID
  - Return profile data, loading state, and error state
  - Handle missing profiles with fallback data (displayName: "Người dùng không xác định")
  - Implement cache expiration and cleanup logic
  - _Requirements: 2.5, 6.1, 6.6_

- [ ]* 2.1 Write property test for useUploaderProfile hook
  - **Property 4: Uploader Data Fetching** - For any document with createdBy UID, query Firestore "users" collection with that UID
  - **Property 9: Profile Cache TTL** - For any profile fetched, if requested again within 5 minutes, retrieve from cache without new Firestore read
  - **Property 14: Profile Cache Reuse** - For any uploader in multiple documents, fetch profile only once and reuse
  - **Validates: Requirements 2.5, 6.1, 6.6**

- [ ]* 2.2 Write unit tests for useUploaderProfile hook
  - Test successful profile fetching from Firestore
  - Test cache hit scenario (no duplicate Firestore reads)
  - Test cache expiration after 5 minutes
  - Test error handling for missing profiles
  - Test fallback profile data structure
  - _Requirements: 2.5, 6.1, 6.6_

- [x] 3. Create UploaderInfo component
  - Create `src/components/UploaderInfo.tsx` component
  - Use useUploaderProfile hook to fetch uploader data
  - Display Avatar component with uploader's photoURL
  - Display "Đăng bởi" label followed by display name
  - Truncate display names longer than 20 characters with ellipsis
  - Make avatar and name clickable with onProfileClick callback
  - Add hover effects (underline for name, scale for avatar)
  - Display loading skeleton while fetching profile data
  - _Requirements: 2.1, 2.2, 2.6, 2.7, 6.2, 11.1, 11.2, 11.4, 11.5_

- [ ]* 3.1 Write property test for UploaderInfo component
  - **Property 1: Uploader Display Name Rendering** - For any document card with uploader profile, rendered output contains display name
  - **Property 5: Uploader Label Display** - For any document card, rendered output contains "Đăng bởi" before display name
  - **Property 6: Display Name Truncation** - For any display name longer than 20 characters, truncate with ellipsis
  - **Property 22: Avatar Click Navigation** - For any card with onProfileClick, clicking avatar invokes callback with uploader UID
  - **Property 23: Display Name Click Navigation** - For any card with onProfileClick, clicking name invokes callback with uploader UID
  - **Validates: Requirements 2.1, 2.6, 2.7, 11.1, 11.2**

- [ ]* 3.2 Write unit tests for UploaderInfo component
  - Test display name rendering
  - Test "Đăng bởi" label presence
  - Test display name truncation for long names
  - Test avatar and name click handlers
  - Test loading skeleton display
  - Test hover effects
  - _Requirements: 2.1, 2.2, 2.6, 2.7, 6.2, 11.1, 11.2_

- [x] 4. Enhance DocumentCard component with modern design
  - Update `src/components/DocumentCard.tsx` with modern styling
  - Implement rounded corners (12px mobile, 16px desktop)
  - Add subtle shadow with hover effect (scale to 102%, enhanced shadow)
  - Update spacing (padding: 16px mobile, 20px desktop)
  - Add smooth transitions (200ms duration)
  - Improve typography hierarchy (title: 18px/600, description: 14px/400)
  - Update tag design with rounded-pill style and distinct colors
  - Ensure text contrast meets WCAG AA (4.5:1 ratio)
  - Limit title to 2 lines and description to 3 lines with ellipsis
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

- [ ]* 4.1 Write unit tests for DocumentCard styling
  - Test rounded corners and shadow styles
  - Test hover effects and transitions
  - Test spacing and padding on different screen sizes
  - Test typography hierarchy
  - Test text truncation for title and description
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.6, 4.7_

- [x] 5. Integrate UploaderInfo into DocumentCard
  - Add UploaderInfo component to DocumentCard layout
  - Position uploader info at bottom of card above action buttons
  - Pass document.createdBy as uploaderId prop
  - Pass onProfileClick callback from DocumentRepository
  - Ensure proper spacing (12px margin-bottom between sections)
  - Handle loading state with skeleton
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.2, 11.3_

- [ ]* 5.1 Write property test for uploader info integration
  - **Property 10: Avatar Loading Skeleton** - For any card while uploader data is fetching, display loading skeleton in place of avatar
  - **Validates: Requirements 6.2**

- [ ]* 5.2 Write unit tests for uploader info integration
  - Test UploaderInfo rendering in DocumentCard
  - Test uploader info positioning
  - Test loading skeleton display
  - Test onProfileClick callback propagation
  - _Requirements: 2.1, 2.2, 5.2, 6.2_

- [x] 6. Implement permission-based action buttons
  - Update DocumentCard to conditionally render edit/delete buttons
  - Show edit and delete buttons only when currentUser.uid === document.createdBy
  - Hide edit and delete buttons for non-owners
  - Add client-side permission check before delete operation
  - Display error toast "Bạn không có quyền xóa tài liệu này" for unauthorized attempts
  - Ensure "Mở tài liệu" button is always visible to all users
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ]* 6.1 Write property test for permission control
  - **Property 7: Owner-Only Action Buttons** - For any document and user, delete/edit buttons visible if and only if user UID matches document.createdBy
  - **Property 8: Unauthorized Deletion Prevention** - For any document where user UID doesn't match createdBy, deletion attempt results in error message
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [ ]* 6.2 Write unit tests for permission control
  - Test delete button visibility for owner
  - Test delete button hidden for non-owner
  - Test edit button visibility for owner
  - Test edit button hidden for non-owner
  - Test unauthorized deletion error handling
  - Test "Mở tài liệu" button always visible
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement responsive grid layout
  - Update DocumentRepository grid to use CSS Grid
  - Set 1 column layout for mobile (< 768px)
  - Set 2 column layout for tablet (768px - 1024px)
  - Set 3 column layout for desktop (> 1024px)
  - Configure gap: 16px mobile, 24px desktop
  - Ensure no horizontal scrolling on any screen size
  - _Requirements: 5.1, 5.4, 5.5, 5.6, 7.4_

- [ ]* 8.1 Write unit tests for responsive layout
  - Test grid column count at different breakpoints
  - Test gap spacing at different screen sizes
  - Test no horizontal overflow
  - _Requirements: 5.1, 5.4, 5.5, 5.6_

- [x] 9. Implement mobile-specific optimizations
  - Update DocumentCard for mobile: title 16px, description 14px
  - Set Avatar size to 32px on mobile, 40px on desktop
  - Implement touch-friendly buttons (minimum 44px height)
  - Stack uploader info vertically on mobile
  - Use full-width buttons on mobile
  - Ensure minimum text size of 14px on mobile
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7_

- [ ]* 9.1 Write unit tests for mobile optimizations
  - Test font sizes on mobile vs desktop
  - Test avatar sizes on mobile vs desktop
  - Test button heights meet 44px minimum
  - Test full-width buttons on mobile
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

- [x] 10. Implement dark mode support
  - Update DocumentCard with dark mode color tokens
  - Use bg-gray-800 for card background in dark mode
  - Use text-gray-100 for titles in dark mode
  - Adjust tag colors for dark mode (e.g., bg-blue-900/50 text-blue-300)
  - Update shadows for dark mode (subtle, no harsh contrast)
  - Ensure avatar borders visible in both modes
  - Update skeleton colors for dark mode
  - Implement smooth transitions between light/dark modes
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [ ]* 10.1 Write unit tests for dark mode
  - Test dark mode color tokens applied correctly
  - Test tag colors in dark mode
  - Test shadow styles in dark mode
  - Test avatar border visibility in both modes
  - Test skeleton colors in dark mode
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7_

- [x] 11. Implement loading states and skeletons
  - Create SkeletonCard component matching DocumentCard dimensions
  - Add animated shimmer effect to skeleton
  - Display skeleton cards while loading documents
  - Display skeleton avatar while loading uploader data
  - Implement minimum 300ms display time to prevent flashing
  - Use neutral gray colors matching theme (light/dark mode)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7_

- [ ]* 11.1 Write property test for loading states
  - **Property 19: Loading Skeleton Display** - For any repository in loading state, skeleton cards rendered in place of actual cards
  - **Property 20: Minimum Skeleton Display Time** - For any loading operation completing in < 300ms, skeleton still displayed for total 300ms
  - **Property 21: Error State Display** - For any repository with loading error, rendered output includes error message and retry button
  - **Validates: Requirements 9.1, 9.5, 9.6**

- [ ]* 11.2 Write unit tests for loading states
  - Test skeleton card rendering during loading
  - Test skeleton avatar rendering during profile fetch
  - Test shimmer animation
  - Test minimum 300ms display time
  - Test error state with retry button
  - Test skeleton colors in light/dark mode
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 12. Implement accessibility features
  - Add aria-label attributes to all interactive buttons
  - Use semantic HTML (article, header, footer) in DocumentCard
  - Add alt text to all images (avatar, icons)
  - Implement keyboard navigation with visible focus indicators (2px outline)
  - Ensure color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
  - Add text alternatives for icon-only buttons (aria-label or title)
  - Test with screen readers to ensure uploader info announced clearly
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ]* 12.1 Write property test for accessibility
  - **Property 15: Button Accessibility Labels** - For any interactive button, rendered HTML includes aria-label describing action
  - **Property 16: Semantic HTML Structure** - For any document card, rendered HTML uses semantic elements (article, heading tags)
  - **Property 17: Image Alt Text** - For any image element, rendered HTML includes alt attribute with descriptive text
  - **Property 18: Icon Button Text Alternatives** - For any icon-only button, rendered HTML includes aria-label or title attribute
  - **Validates: Requirements 8.1, 8.2, 8.3, 8.6**

- [ ]* 12.2 Write unit tests for accessibility
  - Test aria-label presence on all buttons
  - Test semantic HTML structure
  - Test alt text on images
  - Test keyboard navigation and focus indicators
  - Test color contrast ratios
  - Test screen reader announcements
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement performance optimizations
  - Wrap DocumentCard with React.memo to prevent unnecessary re-renders
  - Implement custom comparison function for memo (check document.id, updatedAt, currentUser.uid)
  - Implement batch fetching for uploader profiles (group requests within 100ms window)
  - Use CSS transforms for animations instead of layout properties
  - Debounce hover effects to reduce animation overhead
  - Ensure initial 20 cards render within 2 seconds on desktop
  - _Requirements: 12.1, 12.2, 12.5, 12.6, 6.5_

- [ ]* 14.1 Write property test for performance
  - **Property 12: Avatar Lazy Loading** - For any card not visible in viewport, avatar image not loaded until card enters viewport
  - **Property 13: Batch Profile Fetching** - For any set of documents with multiple unique uploaders, batch profile fetch requests to minimize Firestore reads
  - **Property 24: Memoization Prevents Re-renders** - For any card where document data, currentUser, and callbacks unchanged, component should not re-render
  - **Validates: Requirements 6.4, 6.5, 12.2**

- [ ]* 14.2 Write unit tests for performance
  - Test React.memo prevents re-renders
  - Test batch fetching groups multiple requests
  - Test lazy loading with Intersection Observer
  - Test CSS transforms used for animations
  - Test debounced hover effects
  - Test initial render time under 2 seconds
  - _Requirements: 12.1, 12.2, 12.5, 12.6, 6.4, 6.5_

- [ ] 15. Implement virtualization for large lists (optional enhancement)
  - Install react-window library
  - Create VirtualizedDocumentGrid component
  - Implement FixedSizeGrid with responsive column count
  - Set row height to 280px, column width to 350px
  - Enable virtualization only for lists with more than 50 documents
  - Ensure smooth scrolling performance
  - _Requirements: 12.3_

- [ ]* 15.1 Write unit tests for virtualization
  - Test virtualization enabled for lists > 50 documents
  - Test virtualization disabled for lists ≤ 50 documents
  - Test responsive column count
  - Test row and column dimensions
  - _Requirements: 12.3_

- [x] 16. Update Firestore security rules
  - Update firestore.rules to enforce delete/edit permissions
  - Allow read access to all documentLinks
  - Allow create only for authenticated users with matching createdBy
  - Allow update/delete only for document owner (createdBy === auth.uid)
  - Allow read access to all user profiles (for uploader info)
  - Allow write access to user profiles only for profile owner
  - _Requirements: 3.5_

- [ ]* 16.1 Test Firestore security rules
  - Test unauthorized users cannot delete documents
  - Test unauthorized users cannot edit documents
  - Test document owners can delete their documents
  - Test document owners can edit their documents
  - Test all users can read documents
  - Test all users can read user profiles
  - _Requirements: 3.5_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (24 properties total)
- Unit tests validate specific examples and edge cases
- Implementation uses TypeScript with React and Tailwind CSS
- Firestore is used for data storage and user profiles
- The design follows mobile-first responsive approach
- All components must support both light and dark modes
- Accessibility is a first-class concern (WCAG AA compliance)
