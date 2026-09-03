# Requirements Document

## Introduction

Tính năng "Kho Lưu Trữ Tài Liệu Học Thuật" (Academic Document Repository) là một hệ thống quản lý và hiển thị các đường link (URL) dẫn đến tài liệu học tập theo từng ngành học, giúp sinh viên Đại học Trà Vinh tìm kiếm tài liệu nhanh chóng mà không tốn dung lượng lưu trữ trên server. Hệ thống chỉ lưu trữ metadata và URL của tài liệu, không lưu trữ file thực tế.

**Simplified Design**: Hệ thống sử dụng bộ lọc đơn giản chỉ theo Ngành học (Major) để tối ưu trải nghiệm người dùng. Sinh viên có thể tìm kiếm môn học hoặc loại tài liệu cụ thể thông qua thanh tìm kiếm.

## Glossary

- **Document_Repository**: Hệ thống quản lý kho tài liệu học thuật
- **Document_Link**: Một bản ghi chứa thông tin và URL của tài liệu học tập
- **Filter_System**: Hệ thống bộ lọc cho phép lọc tài liệu theo ngành và môn học
- **Search_Engine**: Công cụ tìm kiếm tài liệu theo từ khóa
- **Document_Card**: Thẻ hiển thị thông tin tài liệu trong giao diện
- **Firestore**: Cơ sở dữ liệu Firebase Firestore được sử dụng trong TVU Connect
- **Major**: Ngành học (ví dụ: CNTT, Kinh tế, Luật)
- **Subject**: Môn học cụ thể trong một ngành
- **Category**: Loại tài liệu (Đề thi, Slide bài giảng, Sách PDF, v.v.)

## Requirements

### Requirement 1: Document Link Data Structure

**User Story:** As a system administrator, I want to store document link information in Firestore, so that students can access organized academic resources.

#### Acceptance Criteria

1. THE Document_Repository SHALL store Document_Link records in Firestore collection named "documentLinks"
2. WHEN a Document_Link is created, THE Document_Repository SHALL include the following fields: id (string), title (string), major_id (string), subject (string), category (string), url (string), description (string), createdAt (timestamp), createdBy (string)
3. THE Document_Repository SHALL validate that url field contains a valid URL format before storing
4. THE Document_Repository SHALL validate that title field has minimum 3 characters and maximum 200 characters
5. THE Document_Repository SHALL validate that description field has maximum 500 characters
6. WHEN a Document_Link is created, THE Document_Repository SHALL automatically generate a unique id using Firestore auto-generated document ID
7. THE Document_Repository SHALL store createdAt timestamp using Firestore serverTimestamp
8. THE Document_Repository SHALL store createdBy field with the authenticated user's UID

### Requirement 2: Major Filtering

**User Story:** As a student, I want to filter documents by major, so that I can quickly find relevant study materials for my field of study.

#### Acceptance Criteria

1. THE Filter_System SHALL provide a dropdown selector for Major field with predefined options
2. WHEN a Major is selected, THE Filter_System SHALL query Firestore for Document_Link records where major_id matches the selected value
3. WHEN no filter is applied, THE Filter_System SHALL display all Document_Link records ordered by createdAt descending
4. THE Filter_System SHALL update the document list within 500ms after filter selection changes
5. WHEN filter returns zero results, THE Filter_System SHALL display a message "Không tìm thấy tài liệu phù hợp"
6. THE Filter_System SHALL display an active filter tag showing the currently selected major
7. WHEN the filter tag is clicked, THE Filter_System SHALL remove the filter and update the document list

### Requirement 3: Keyword Search

**User Story:** As a student, I want to search documents by keyword, so that I can find specific materials including subjects, categories, or document titles without browsing through filters.

#### Acceptance Criteria

1. THE Search_Engine SHALL provide a search input field at the top of the document repository page
2. WHEN a user types in the search field, THE Search_Engine SHALL filter Document_Link records where title, subject, or category contains the search keyword (case-insensitive)
3. THE Search_Engine SHALL debounce search input with 300ms delay to optimize performance
4. THE Search_Engine SHALL combine search results with active major filter using AND logic
5. WHEN search keyword is empty, THE Search_Engine SHALL display all documents matching current major filter
6. THE Search_Engine SHALL highlight matching keywords in document titles in search results

### Requirement 4: Document Card Display

**User Story:** As a student, I want to see document information in an organized card layout, so that I can easily browse and access study materials.

#### Acceptance Criteria

1. THE Document_Card SHALL display the following information: title, major tag, subject tag, category tag, description preview (maximum 100 characters)
2. THE Document_Card SHALL include an "Truy cập tài liệu" button that opens the document URL in a new browser tab
3. WHEN the "Truy cập tài liệu" button is clicked, THE Document_Card SHALL open the url field value using window.open with target="_blank" and rel="noopener noreferrer"
4. THE Document_Card SHALL display tags with distinct colors: major (blue), subject (green), category (purple)
5. THE Document_Card SHALL truncate description text with ellipsis if longer than 100 characters
6. THE Document_Card SHALL display in a responsive grid layout: 1 column on mobile, 2 columns on tablet, 3 columns on desktop
7. THE Document_Card SHALL show a hover effect with subtle shadow and scale transformation on desktop

### Requirement 5: Mobile Responsive Design

**User Story:** As a mobile user, I want the document repository to work well on my phone, so that I can access study materials on the go.

#### Acceptance Criteria

1. THE Document_Repository SHALL display search bar with full width on mobile devices (screen width < 768px)
2. THE Document_Repository SHALL stack filter dropdowns vertically on mobile devices
3. THE Document_Repository SHALL display Document_Card components in a single column on mobile devices
4. THE Document_Repository SHALL use touch-friendly button sizes with minimum 44px height on mobile
5. THE Document_Repository SHALL prevent horizontal scrolling on all screen sizes
6. THE Document_Repository SHALL load and display within 3 seconds on 3G mobile connections

### Requirement 6: Document Link Creation

**User Story:** As an authenticated user, I want to add new document links to the repository, so that I can share useful study materials with other students.

#### Acceptance Criteria

1. THE Document_Repository SHALL provide a "Thêm tài liệu" button visible to authenticated users
2. WHEN the "Thêm tài liệu" button is clicked, THE Document_Repository SHALL display a modal form with input fields for: title, major_id, subject, category, url, description
3. THE Document_Repository SHALL validate all required fields (title, major_id, subject, category, url) before submission
4. WHEN the form is submitted with valid data, THE Document_Repository SHALL create a new Document_Link record in Firestore
5. WHEN the Document_Link is successfully created, THE Document_Repository SHALL display a success toast notification "Đã thêm tài liệu thành công"
6. WHEN the Document_Link creation fails, THE Document_Repository SHALL display an error toast notification with the error message
7. THE Document_Repository SHALL close the modal form after successful submission
8. THE Document_Repository SHALL refresh the document list to include the newly added document

### Requirement 7: URL Validation and Security

**User Story:** As a system administrator, I want to validate document URLs, so that students only access safe and valid links.

#### Acceptance Criteria

1. THE Document_Repository SHALL validate that url field matches URL pattern: https?://.*
2. THE Document_Repository SHALL accept URLs from trusted domains: Google Drive, OneDrive, Dropbox, GitHub, and tvu.edu.vn
3. WHEN a URL from an untrusted domain is submitted, THE Document_Repository SHALL display a warning message "URL này chưa được xác minh. Vui lòng kiểm tra kỹ trước khi truy cập"
4. THE Document_Repository SHALL sanitize URL input to prevent XSS attacks by encoding special characters
5. WHEN opening external links, THE Document_Repository SHALL use rel="noopener noreferrer" attribute for security

### Requirement 8: Document Link Management

**User Story:** As a document creator, I want to edit or delete my uploaded documents, so that I can keep the repository information accurate and up-to-date.

#### Acceptance Criteria

1. WHEN viewing a Document_Card, THE Document_Repository SHALL display "Chỉnh sửa" and "Xóa" buttons IF the current user's UID matches the createdBy field
2. WHEN the "Chỉnh sửa" button is clicked, THE Document_Repository SHALL open the edit modal with pre-filled form data
3. WHEN the edit form is submitted, THE Document_Repository SHALL update the Document_Link record in Firestore
4. WHEN the "Xóa" button is clicked, THE Document_Repository SHALL display a confirmation dialog "Bạn có chắc muốn xóa tài liệu này?"
5. WHEN deletion is confirmed, THE Document_Repository SHALL delete the Document_Link record from Firestore
6. WHEN deletion is successful, THE Document_Repository SHALL display a success toast "Đã xóa tài liệu" and remove the card from the list

### Requirement 9: Firestore Security Rules

**User Story:** As a system administrator, I want to secure the document repository data, so that only authorized users can create, edit, or delete documents.

#### Acceptance Criteria

1. THE Document_Repository SHALL allow read access to documentLinks collection for all authenticated users
2. THE Document_Repository SHALL allow create access to documentLinks collection for all authenticated users
3. THE Document_Repository SHALL allow update access to a Document_Link record only IF request.auth.uid matches resource.data.createdBy
4. THE Document_Repository SHALL allow delete access to a Document_Link record only IF request.auth.uid matches resource.data.createdBy
5. THE Document_Repository SHALL validate that createdBy field in create requests matches request.auth.uid

**Note**: Subject and Category fields remain in the data model for metadata purposes but are not used for filtering in the UI.

### Requirement 10: Performance and Caching

**User Story:** As a student, I want the document repository to load quickly, so that I can access study materials without waiting.

#### Acceptance Criteria

1. THE Document_Repository SHALL implement Firestore query pagination with 20 documents per page
2. THE Document_Repository SHALL cache filter options (majors only) in localStorage for 24 hours
3. WHEN scrolling to the bottom of the document list, THE Document_Repository SHALL load the next page of results automatically
4. THE Document_Repository SHALL display a loading skeleton while fetching documents from Firestore
5. THE Document_Repository SHALL use Firestore index for optimized queries on major_id field
6. THE Document_Repository SHALL complete initial page load within 2 seconds on desktop connections

### Requirement 11: Integration with TVU Connect

**User Story:** As a TVU Connect user, I want to access the document repository from the main navigation, so that I can easily find study materials while using other features.

#### Acceptance Criteria

1. THE Document_Repository SHALL be accessible via a new navigation tab labeled "Tài liệu" with BookOpen icon
2. THE Document_Repository SHALL use the existing TVU Connect theme system (light/dark mode)
3. THE Document_Repository SHALL use the existing TVU Connect authentication system
4. THE Document_Repository SHALL display the ProfileCompletionBanner IF the user's profile is incomplete
5. THE Document_Repository SHALL use the existing toast notification system from TVU Connect
6. THE Document_Repository SHALL follow TVU Connect's responsive design patterns and color scheme

**Note**: The simplified single-filter design (Major only) reduces UI complexity while maintaining full metadata in the data model.
