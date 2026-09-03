# Requirements Document

## Introduction

Tính năng "Cải thiện Giao diện Kho Tài Liệu" (Document Repository UI Enhancement) là một bản nâng cấp toàn diện về giao diện và trải nghiệm người dùng cho hệ thống Academic Document Repository hiện có. Mục tiêu chính là tạo ra một giao diện hiện đại, sạch sẽ, đẹp mắt với card design được đơn giản hóa, giảm visual clutter, hiển thị thông tin người đăng tài liệu rõ ràng hơn, và cải thiện phân quyền xóa tài liệu để chỉ người đăng mới có quyền xóa.

**Nguyên tắc thiết kế chính:**
- **Đơn giản hóa màu sắc**: Giảm số lượng màu sắc, sử dụng 1-2 màu chủ đạo thay vì nhiều màu
- **Giảm visual clutter**: Loại bỏ các hiệu ứng phức tạp, gradient không cần thiết
- **Tăng khả năng đọc**: Làm nổi bật thông tin quan trọng (tiêu đề, người đăng)
- **Hiện đại và tối giản**: Theo xu hướng Material Design 3 / iOS Human Interface Guidelines

## Glossary

- **Document_Card**: Thẻ hiển thị thông tin tài liệu trong giao diện
- **Uploader_Info**: Thông tin người đăng tài liệu (tên, avatar)
- **Delete_Permission**: Quyền xóa tài liệu chỉ dành cho người đăng
- **Modern_UI**: Giao diện hiện đại với spacing, typography, và visual hierarchy được cải thiện
- **User_Profile**: Thông tin hồ sơ người dùng từ Firestore collection "users"
- **Avatar**: Ảnh đại diện của người dùng
- **Display_Name**: Tên hiển thị của người dùng
- **Responsive_Design**: Thiết kế đáp ứng hoạt động tốt trên mọi kích thước màn hình
- **Accessibility**: Khả năng tiếp cận cho người dùng khuyết tật

## Requirements

### Requirement 1: Simplified Modern Card Design

**User Story:** As a student, I want to see documents in clean, simple cards without visual clutter, so that I can focus on the content and find information quickly.

#### Acceptance Criteria

1. THE Document_Card SHALL use white background (light mode) or dark-gray background (dark mode) without colored backgrounds
2. THE Document_Card SHALL use subtle border (1px solid gray-200) instead of heavy shadows
3. THE Document_Card SHALL use rounded corners with border-radius of 8-12px for modern look
4. THE Document_Card SHALL display only 1-2 most important tags (ngành học + môn học) to reduce clutter
5. THE Document_Card SHALL use simple solid color icon instead of gradient icons
6. THE Document_Card SHALL increase uploader info size (avatar 40px, name 14px font-size) for better visibility
7. THE Document_Card SHALL use consistent spacing with padding of 16px on mobile and 20px on desktop
8. WHEN a user hovers over a Document_Card on desktop, THE Document_Card SHALL show subtle border color change (not scale animation)

### Requirement 2: Uploader Information Display

**User Story:** As a student, I want to see who uploaded each document, so that I can identify trusted contributors and contact them if needed.

#### Acceptance Criteria

1. THE Document_Card SHALL display the uploader's Display_Name at the bottom of the card
2. THE Document_Card SHALL display the uploader's Avatar image with size of 32px on mobile and 40px on desktop
3. WHEN the uploader has an Avatar in their User_Profile, THE Document_Card SHALL display the Avatar image
4. WHEN the uploader does not have an Avatar, THE Document_Card SHALL display a default avatar with the first letter of their Display_Name
5. THE Document_Card SHALL fetch uploader information from Firestore "users" collection using the createdBy UID
6. THE Document_Card SHALL display "Đăng bởi" label before the uploader's name
7. WHEN the uploader's Display_Name is longer than 20 characters, THE Document_Card SHALL truncate it with ellipsis
8. WHEN the User_Profile contains display_name field, THE Uploader_Info SHALL display the display_name value
9. WHEN the User_Profile does not contain display_name field, THE Uploader_Info SHALL display the username field value
10. WHEN the User_Profile contains neither display_name nor username, THE Uploader_Info SHALL display "Người dùng không xác định"

### Requirement 3: Delete Permission Control

**User Story:** As a document uploader, I want only me to be able to delete my documents, so that my contributions are protected from unauthorized deletion.

#### Acceptance Criteria

1. THE Document_Card SHALL display the delete button only WHEN the current user's UID matches the document's createdBy field
2. THE Document_Card SHALL hide the delete button WHEN the current user's UID does not match the document's createdBy field
3. WHEN a user attempts to delete a document they do not own, THE Document_Repository SHALL prevent the deletion and display error message "Bạn không có quyền xóa tài liệu này"
4. THE Document_Card SHALL display the edit button only WHEN the current user's UID matches the document's createdBy field
5. THE Document_Card SHALL use Firestore security rules to enforce delete permission at the database level

### Requirement 4: Enhanced Typography

**User Story:** As a student, I want text to be clear and easy to read, so that I can quickly scan through document information.

#### Acceptance Criteria

1. THE Document_Card SHALL use font-weight of 600 or bold for document titles
2. THE Document_Card SHALL use font-weight of 400 or normal for descriptions
3. THE Document_Card SHALL use line-height of 1.5 for description text for better readability
4. THE Document_Card SHALL use text color with sufficient contrast ratio of at least 4.5:1 for WCAG AA compliance
5. THE Document_Card SHALL use consistent font-family matching TVU Connect's design system
6. THE Document_Card SHALL limit title to 2 lines with ellipsis overflow on mobile
7. THE Document_Card SHALL limit description to 3 lines with ellipsis overflow

### Requirement 5: Improved Spacing and Layout

**User Story:** As a student, I want the document cards to have better spacing, so that the interface feels less cluttered and more organized.

#### Acceptance Criteria

1. THE Document_Repository SHALL use gap of 16px between cards on mobile and 24px on desktop
2. THE Document_Card SHALL use margin-bottom of 12px between internal sections
3. THE Document_Card SHALL use padding of 16px on mobile and 20px on desktop
4. THE Document_Repository SHALL display cards in 1 column on mobile (width < 768px)
5. THE Document_Repository SHALL display cards in 2 columns on tablet (width 768px-1024px)
6. THE Document_Repository SHALL display cards in 3 columns on desktop (width > 1024px)
7. THE Document_Card SHALL maintain aspect ratio consistency across all cards in the grid

### Requirement 6: Avatar Loading and Caching

**User Story:** As a student, I want uploader avatars to load quickly, so that I don't experience delays when browsing documents.

#### Acceptance Criteria

1. THE Document_Card SHALL cache uploader User_Profile data in memory for 5 minutes
2. THE Document_Card SHALL display a loading skeleton for Avatar while fetching user data
3. WHEN Avatar image fails to load, THE Document_Card SHALL display the default avatar with first letter
4. THE Document_Card SHALL use lazy loading for Avatar images to improve initial page load performance
5. THE Document_Card SHALL fetch uploader data in batches to minimize Firestore reads
6. THE Document_Card SHALL reuse cached User_Profile data for the same uploader across multiple cards

### Requirement 7: Responsive Mobile Design

**User Story:** As a mobile user, I want the enhanced UI to work perfectly on my phone, so that I can browse documents comfortably on any device.

#### Acceptance Criteria

1. THE Document_Card SHALL use touch-friendly button sizes with minimum height of 44px on mobile
2. THE Document_Card SHALL stack uploader information vertically on mobile for better space utilization
3. THE Document_Card SHALL use full-width buttons on mobile for easier tapping
4. THE Document_Repository SHALL prevent horizontal scrolling on all screen sizes
5. THE Document_Card SHALL use appropriate font-sizes: title 16px, description 14px on mobile
6. THE Document_Card SHALL maintain readability with minimum text size of 14px on mobile
7. WHEN viewing on mobile, THE Document_Card SHALL display Avatar at 32px size to save space

### Requirement 8: Accessibility Enhancements

**User Story:** As a user with disabilities, I want the document repository to be accessible, so that I can use it with assistive technologies.

#### Acceptance Criteria

1. THE Document_Card SHALL include aria-label attributes for all interactive buttons
2. THE Document_Card SHALL use semantic HTML elements (article, header, footer) for proper structure
3. THE Document_Card SHALL ensure all images have alt text describing the content
4. THE Document_Card SHALL support keyboard navigation with visible focus indicators
5. THE Document_Card SHALL use color contrast ratios meeting WCAG AA standards (4.5:1 for normal text)
6. THE Document_Card SHALL provide text alternatives for icon-only buttons
7. WHEN using screen readers, THE Document_Card SHALL announce uploader information clearly

### Requirement 9: Loading States and Skeletons

**User Story:** As a student, I want to see loading indicators, so that I know the system is working when fetching data.

#### Acceptance Criteria

1. THE Document_Repository SHALL display skeleton cards while loading documents from Firestore
2. THE Document_Card SHALL display a skeleton Avatar while fetching uploader information
3. THE skeleton card SHALL match the dimensions and layout of actual Document_Card
4. THE skeleton SHALL use animated shimmer effect to indicate loading progress
5. THE Document_Repository SHALL display loading skeletons for minimum 300ms to avoid flashing
6. WHEN loading fails, THE Document_Repository SHALL display error message with retry button
7. THE skeleton SHALL use neutral gray colors matching the theme (light/dark mode)

### Requirement 10: Dark Mode Support

**User Story:** As a student who prefers dark mode, I want the enhanced UI to look good in dark mode, so that I can browse comfortably at night.

#### Acceptance Criteria

1. THE Document_Card SHALL use dark background color (gray-800) in dark mode
2. THE Document_Card SHALL use light text color (gray-100) for titles in dark mode
3. THE Document_Card SHALL adjust tag colors for dark mode with appropriate contrast
4. THE Document_Card SHALL use subtle shadows in dark mode without harsh contrast
5. THE Document_Card SHALL ensure Avatar borders are visible in both light and dark modes
6. THE Document_Repository SHALL transition smoothly between light and dark modes
7. THE skeleton loading state SHALL adapt colors for dark mode

### Requirement 11: Uploader Profile Click Navigation

**User Story:** As a student, I want to click on the uploader's name or avatar, so that I can view their profile and see other documents they've shared.

#### Acceptance Criteria

1. WHEN a user clicks on the uploader's Avatar, THE Document_Card SHALL navigate to the uploader's profile page
2. WHEN a user clicks on the uploader's Display_Name, THE Document_Card SHALL navigate to the uploader's profile page
3. THE Document_Card SHALL use the onProfileClick callback prop to handle navigation
4. THE Document_Card SHALL display a pointer cursor when hovering over Avatar or Display_Name
5. THE Document_Card SHALL add hover effect (underline) to Display_Name to indicate clickability
6. THE Avatar SHALL have a subtle scale effect on hover to indicate interactivity
7. THE Document_Card SHALL pass the uploader's UID to the onProfileClick callback

### Requirement 12: Performance Optimization

**User Story:** As a student, I want the document repository to load quickly, so that I can access materials without waiting.

#### Acceptance Criteria

1. THE Document_Repository SHALL render initial 20 cards within 2 seconds on desktop
2. THE Document_Card SHALL use React.memo to prevent unnecessary re-renders
3. THE Document_Repository SHALL implement virtualization for lists with more than 50 documents
4. THE Document_Card SHALL lazy load Avatar images using Intersection Observer API
5. THE Document_Repository SHALL batch Firestore queries for uploader data to minimize reads
6. THE Document_Card SHALL debounce hover effects to reduce animation overhead
7. THE Document_Repository SHALL use CSS transforms for animations instead of layout properties



### Requirement 13: Simplified Color System

**User Story:** As a student, I want a clean color scheme that doesn't overwhelm me, so that I can focus on finding documents without visual fatigue.

#### Acceptance Criteria

1. THE Document_Card SHALL use maximum 2 accent colors (primary blue/purple for actions, neutral gray for text)
2. THE Document_Card SHALL remove per-major color themes (no green for dược, red for y khoa, etc.)
3. THE Document_Card SHALL use neutral icon colors (gray-600 in light mode, gray-400 in dark mode)
4. THE Document_Card SHALL use subtle tag colors (gray-100 background with gray-700 text in light mode)
5. THE Document_Card SHALL remove gradient effects from icons and buttons
6. THE Document_Card SHALL use consistent primary color (indigo-600) for all action buttons
7. THE Document_Card SHALL ensure color contrast ratio of 4.5:1 minimum for accessibility

### Requirement 14: Enhanced Uploader Visibility

**User Story:** As a student, I want to easily see who uploaded each document, so that I can identify trusted contributors quickly.

#### Acceptance Criteria

1. THE Document_Card SHALL display uploader info prominently with larger avatar (40px) and name (14px font-size)
2. THE Document_Card SHALL position uploader info near the top of the card for better visibility
3. THE Document_Card SHALL use medium font-weight (500) for uploader name to make it stand out
4. THE Document_Card SHALL add subtle background (gray-50) to uploader section to separate it visually
5. THE Document_Card SHALL display "Đăng bởi" label in smaller, lighter text (12px, gray-500)
6. THE Document_Card SHALL ensure uploader avatar has clear border (2px) for definition
7. WHEN hovering over uploader info, THE Document_Card SHALL show subtle background color change
8. THE Uploader_Info icon SHALL match the font-size of surrounding text (14px icon for 14px text)
9. THE Uploader_Info icon SHALL use the same color as the text (gray-700 in light mode, gray-300 in dark mode)
10. THE Uploader_Info SHALL use consistent font-family matching the card's description and tag text
11. THE "Đăng bởi" label SHALL have color contrast ratio of at least 4.5:1 for WCAG AA compliance
12. THE Uploader_Info SHALL use gap of 8px between icon and label, and 4px between label and username
13. THE icon, label, and username SHALL be vertically center-aligned within the Uploader_Info container

### Requirement 15: Reduced Tag Complexity

**User Story:** As a student, I want to see only the most important information at a glance, so that I'm not overwhelmed by too many tags and labels.

#### Acceptance Criteria

1. THE Document_Card SHALL display maximum 2 tags: major (ngành học) and subject (môn học)
2. THE Document_Card SHALL hide category tag by default to reduce clutter
3. THE Document_Card SHALL use simple pill-shaped tags with neutral colors (not bright colors)
4. THE Document_Card SHALL use consistent tag styling: gray-100 background, gray-700 text, 12px font-size
5. THE Document_Card SHALL limit tag text to 15 characters with ellipsis overflow
6. THE Document_Card SHALL align tags horizontally with 8px gap between them
7. THE Document_Card SHALL position tags below the title for clear visual hierarchy

### Requirement 16: Simplified Icon Design

**User Story:** As a student, I want simple, clear icons that don't distract from the content, so that I can focus on the document information.

#### Acceptance Criteria

1. THE Document_Card SHALL use solid color icons (no gradients, no shadows)
2. THE Document_Card SHALL use consistent icon size (20px) across all cards
3. THE Document_Card SHALL use neutral icon color (gray-600) instead of per-major colors
4. THE Document_Card SHALL remove glow effects and animated sparkles from icons
5. THE Document_Card SHALL use simple outline icons from lucide-react library
6. THE Document_Card SHALL position icon on the left side of the card for consistency
7. THE Document_Card SHALL ensure icon has sufficient padding (12px) from card edges

### Requirement 17: Clean Button Design

**User Story:** As a student, I want action buttons to be clear and simple, so that I know what they do without being distracted by fancy effects.

#### Acceptance Criteria

1. THE Document_Card SHALL use solid color buttons (no gradients)
2. THE Document_Card SHALL use consistent button styling: indigo-600 background, white text
3. THE Document_Card SHALL remove floating particles and shimmer effects from buttons
4. THE Document_Card SHALL use simple hover state: darker background color (indigo-700)
5. THE Document_Card SHALL use clear button labels: "Mở tài liệu" instead of just "Mở"
6. THE Document_Card SHALL ensure buttons have minimum height of 40px for touch targets
7. THE Document_Card SHALL align buttons to the right side of the card for consistency

### Requirement 18: Improved Visual Hierarchy

**User Story:** As a student, I want to quickly identify the most important information (title, uploader), so that I can scan through documents efficiently.

#### Acceptance Criteria

1. THE Document_Card SHALL use font-size hierarchy: title 18px, uploader 14px, tags 12px, description 13px
2. THE Document_Card SHALL use font-weight hierarchy: title 600 (semibold), uploader 500 (medium), description 400 (normal)
3. THE Document_Card SHALL use color hierarchy: title black/white, uploader gray-700/gray-300, description gray-600/gray-400
4. THE Document_Card SHALL position elements in order of importance: title → uploader → tags → description → actions
5. THE Document_Card SHALL use consistent spacing: 12px between title and uploader, 8px between uploader and tags
6. THE Document_Card SHALL limit title to 2 lines and description to 2 lines with ellipsis
7. THE Document_Card SHALL ensure adequate white space (16px padding) around all elements

### Requirement 19: Visual Consistency for Uploader Info Section

**User Story:** As a student, I want the uploader information section to look cohesive and professional, so that I can trust the platform and easily read who uploaded each document.

#### Acceptance Criteria

1. THE Uploader_Info icon SHALL have size of 16px WHEN the surrounding text font-size is 14px
2. THE Uploader_Info icon SHALL have size of 18px WHEN the surrounding text font-size is 16px
3. THE Uploader_Info icon SHALL use color matching the "Đăng bởi" label color (gray-500 in light mode, gray-400 in dark mode)
4. THE Uploader_Info SHALL use consistent horizontal spacing with gap-2 (8px) between icon and label
5. THE Uploader_Info SHALL use consistent horizontal spacing with gap-1.5 (6px) between label and username
6. THE Uploader_Info SHALL vertically center-align all elements (icon, label, username) using flexbox items-center
7. THE "Đăng bởi" label SHALL use font-weight of 600 (semibold) to create visual balance with the username
8. THE username SHALL use font-weight of 600 (semibold) to ensure readability and prominence
9. THE "Đăng bởi" label SHALL use color with contrast ratio of at least 4.5:1 against background (gray-500 minimum)
10. THE Uploader_Info SHALL use the same font-family as the card's description text for consistency
11. WHEN in dark mode, THE Uploader_Info icon SHALL use gray-500 color to maintain visibility
12. WHEN in dark mode, THE "Đăng bởi" label SHALL use gray-400 color for sufficient contrast
13. THE Uploader_Info container SHALL use padding-y of 2px to ensure proper vertical spacing within the card
