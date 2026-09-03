# Implementation Plan: Academic Document Repository

## Overview

Kế hoạch triển khai tính năng "Kho Lưu Trữ Tài Liệu Học Thuật" cho TVU Connect. Hệ thống cho phép sinh viên chia sẻ và tìm kiếm tài liệu học tập thông qua URL, không lưu trữ file thực tế. Tích hợp với hệ thống authentication, theme, và navigation hiện có.

**Simplified Design**: Bộ lọc chỉ sử dụng Ngành học (Major) để đơn giản hóa UX. Sinh viên tìm kiếm môn học/loại tài liệu qua thanh tìm kiếm.

**Công nghệ:** React + TypeScript + Vite + Firebase Firestore

**Chiến lược:** Xây dựng từ foundation (data models, utilities) → core features (CRUD, filtering, search) → UI components → integration → testing

## Tasks

- [x] 1. Thiết lập data models và types
  - Tạo file `src/types/documentLink.ts` với interface DocumentLink
  - Định nghĩa FilterState (chỉ major_id), DocumentFormData, ValidationError interfaces
  - Export tất cả types để sử dụng trong components
  - _Requirements: 1.2_
  - **Note**: Subject và Category vẫn có trong DocumentLink và DocumentFormData (cho metadata), nhưng không có trong FilterState

- [ ] 2. Implement URL validation và security utilities
  - [x] 2.1 Tạo file `src/utils/urlValidation.ts`
    - Implement function `validateURL(url: string): URLValidation`
    - Implement function `sanitizeURL(url: string): string`
    - Implement function `checkURLSecurity(url: string): URLSecurityResult`
    - Define TRUSTED_DOMAINS constant array
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 2.2 Write property test for URL validation
    - **Property 1: URL Format Validation**
    - **Validates: Requirements 1.3, 8.1**
    - Test với random URLs từ fast-check
    - Verify URLs bắt đầu bằng http:// hoặc https:// được accept
  
  - [ ]* 2.3 Write property test for trusted domain validation
    - **Property 23: Trusted Domain Validation**
    - **Validates: Requirements 8.2, 8.3**
    - Test với random domains
    - Verify trusted domains không có warning, untrusted domains có warning

- [ ] 3. Implement form validation utilities
  - [x] 3.1 Tạo file `src/utils/documentValidation.ts`
    - Implement function `validateDocumentForm(data: DocumentFormData): ValidationError[]`
    - Validate title length (3-200 characters)
    - Validate description length (max 500 characters)
    - Validate required fields presence
    - Validate URL format
    - _Requirements: 1.4, 1.5, 7.3_
  
  - [ ]* 3.2 Write property test for title validation
    - **Property 3: Title Length Validation**
    - **Validates: Requirements 1.4**
    - Test với random strings từ fast-check
    - Verify titles < 3 chars hoặc > 200 chars bị reject
  
  - [ ]* 3.3 Write property test for description validation
    - **Property 4: Description Length Validation**
    - **Validates: Requirements 1.5**
    - Test với random strings
    - Verify descriptions > 500 chars bị reject

- [ ] 4. Implement Firestore service layer
  - [x] 4.1 Tạo file `src/services/documentService.ts`
    - Implement `createDocument(data: DocumentFormData, userId: string): Promise<string>`
    - Implement `updateDocument(id: string, data: Partial<DocumentFormData>): Promise<void>`
    - Implement `deleteDocument(id: string): Promise<void>`
    - Implement `getDocuments(filters: FilterState, limit: number): Promise<DocumentLink[]>`
    - Sử dụng serverTimestamp cho createdAt
    - Sử dụng handleFirestoreError cho error handling
    - _Requirements: 1.2, 1.6, 1.7, 1.8, 7.4, 9.3, 9.5_
  
  - [ ]* 4.2 Write property test for createdBy field
    - **Property 6: CreatedBy Matches Current User**
    - **Validates: Requirements 1.8**
    - Test document creation với random user UIDs
    - Verify createdBy field luôn match với user UID
  
  - [ ]* 4.3 Write property test for required fields
    - **Property 5: Required Fields Presence**
    - **Validates: Requirements 1.2**
    - Test với random document data
    - Verify tất cả required fields có trong Firestore document

- [ ] 5. Checkpoint - Verify foundation layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement filtering logic
  - [x] 6.1 Tạo file `src/utils/documentFilters.ts`
    - Implement `buildFirestoreQuery(filters: FilterState, pageSize: number): Query` (chỉ filter major_id)
    - Implement `filterByKeyword(docs: DocumentLink[], keyword: string): DocumentLink[]` (search title, subject, category)
    - Implement helper function cho major filter only
    - _Requirements: 2.2, 2.3, 3.2, 3.4_
  
  - [ ]* 6.2 Write property test for major filter
    - **Property 7: Major Filter Accuracy**
    - **Validates: Requirements 2.2**
    - Test với random document arrays và major selections
    - Verify tất cả filtered documents có matching major_id
  
  - [ ]* 6.3 Write property test for keyword search
    - **Property 13: Case-Insensitive Keyword Search**
    - **Validates: Requirements 3.2**
    - Test với random keywords
    - Verify tất cả results contain keyword in title, subject, or category (case-insensitive)

- [ ] 7. Implement custom hook useDocuments
  - [x] 7.1 Tạo file `src/hooks/useDocuments.ts`
    - Implement hook với interface UseDocumentsResult
    - Manage loading, error, documents state
    - Implement pagination với loadMore function
    - Implement caching với localStorage (60s TTL) - cache key chỉ dựa trên major_id
    - Debounce search với 300ms delay
    - _Requirements: 2.4, 3.3, 10.1, 10.2, 10.3_
  
  - [ ]* 7.2 Write unit tests for useDocuments hook
    - Test initial loading state
    - Test major filter changes trigger new queries
    - Test pagination loadMore function
    - Test cache hit/miss scenarios

- [ ] 8. Implement DocumentCard component
  - [x] 8.1 Tạo file `src/components/DocumentCard.tsx`
    - Display title, major tag, subject tag, category tag, description
    - Implement "Truy cập tài liệu" button với window.open
    - Implement "Chỉnh sửa" và "Xóa" buttons (conditional rendering)
    - Apply tag colors: major (blue), subject (green), category (purple)
    - Truncate description tại 100 characters
    - Add hover effects và responsive styling
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.7, 9.1_
  
  - [ ]* 8.2 Write property test for external link security
    - **Property 2: External Link Security**
    - **Validates: Requirements 5.3, 8.5**
    - Test với random document data
    - Verify "Truy cập tài liệu" button có target="_blank" và rel="noopener noreferrer"
  
  - [ ]* 8.3 Write property test for description truncation
    - **Property 17: Description Truncation**
    - **Validates: Requirements 5.5**
    - Test với random descriptions
    - Verify descriptions > 100 chars được truncate với ellipsis
  
  - [ ]* 8.4 Write property test for ownership-based actions
    - **Property 22: Ownership-Based Action Visibility**
    - **Validates: Requirements 9.1**
    - Test với random user UIDs và document owners
    - Verify edit/delete buttons chỉ visible khi user owns document

- [ ] 9. Implement FilterPanel component
  - [x] 9.1 Tạo file `src/components/FilterPanel.tsx`
    - Implement major dropdown với MAJORS constant (chỉ 1 dropdown)
    - Remove subject và category dropdowns
    - Handle filter change events
    - Apply responsive styling (full width on mobile)
    - Display active filter tag (chỉ major)
    - _Requirements: 2.1, 2.6, 5.1_
  
  - [ ]* 9.2 Write unit tests for FilterPanel
    - Test major selection updates filters
    - Test filter tag removal
    - Test mobile responsive layout

- [ ] 10. Implement SearchBar component
  - [x] 10.1 Tạo file `src/components/SearchBar.tsx`
    - Implement search input với debounce (300ms)
    - Handle search keyword changes
    - Apply full-width styling on mobile
    - Add search icon và clear button
    - Add placeholder text: "Tìm kiếm theo tên, môn học, hoặc loại tài liệu..."
    - _Requirements: 3.1, 3.3, 5.1_
  
  - [ ]* 10.2 Write unit tests for SearchBar
    - Test debounce functionality
    - Test clear button resets search
    - Test mobile responsive styling

- [ ] 11. Checkpoint - Verify core components
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement CreateDocumentModal component
  - [x] 12.1 Tạo file `src/components/CreateDocumentModal.tsx`
    - Implement modal với form fields: title, major_id, subject, category, url, description
    - **Note**: Subject và Category vẫn có trong form (cho metadata), chỉ không có trong filter UI
    - Integrate validateDocumentForm for client-side validation
    - Display validation errors inline
    - Handle form submission với createDocument service
    - Show success/error toast notifications
    - Close modal on successful submission
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_
  
  - [ ]* 12.2 Write property test for form validation
    - **Property 18: Form Validation Before Submission**
    - **Validates: Requirements 6.3**
    - Test với random form data
    - Verify submission prevented khi có validation errors
  
  - [ ]* 12.3 Write unit tests for CreateDocumentModal
    - Test modal open/close behavior
    - Test validation error display
    - Test success toast on submission
    - Test form reset after submission

- [ ] 13. Implement EditDocumentModal component
  - [x] 13.1 Tạo file `src/components/EditDocumentModal.tsx`
    - Reuse form structure từ CreateDocumentModal
    - Pre-fill form với existing document data (including subject & category)
    - Handle form submission với updateDocument service
    - Show success/error toast notifications
    - _Requirements: 8.2, 8.3_
  
  - [ ]* 13.2 Write property test for document update
    - **Property 20: Document Update Persistence**
    - **Validates: Requirements 8.3**
    - Test với random document updates
    - Verify Firestore document updated với new values
  
  - [ ]* 13.3 Write unit tests for EditDocumentModal
    - Test form pre-fill với existing data
    - Test update success toast
    - Test modal close after update

- [ ] 14. Implement DocumentGrid component
  - [x] 14.1 Tạo file `src/components/DocumentGrid.tsx`
    - Render array of DocumentCard components
    - Apply responsive grid layout: 1 col (mobile), 2 cols (tablet), 3 cols (desktop)
    - Handle empty state với message "Không tìm thấy tài liệu phù hợp"
    - Handle loading state với skeleton loaders
    - _Requirements: 2.5, 4.6, 10.4_
  
  - [ ]* 14.2 Write unit tests for DocumentGrid
    - Test responsive grid layout
    - Test empty state rendering
    - Test loading skeleton display

- [ ] 15. Implement main DocumentRepository component
  - [x] 15.1 Tạo file `src/components/DocumentRepository.tsx`
    - Integrate SearchBar, FilterPanel (major only), DocumentGrid components
    - Integrate CreateDocumentModal và EditDocumentModal
    - Manage state: documents, loading, filters (major_id only), searchKeyword, modals
    - Use useDocuments hook for data fetching
    - Implement "Thêm link tài liệu" button
    - Handle edit và delete actions
    - Implement delete confirmation dialog
    - Apply ProfileCompletionBanner integration
    - _Requirements: 6.1, 8.4, 8.5, 8.6, 11.4_
  
  - [ ]* 15.2 Write property test for document creation
    - **Property 19: Document Creation Persistence**
    - **Validates: Requirements 6.4, 6.8**
    - Test với random valid form data
    - Verify document created in Firestore và appears in list
  
  - [ ]* 15.3 Write property test for document deletion
    - **Property 21: Document Deletion Persistence**
    - **Validates: Requirements 8.5**
    - Test với random documents
    - Verify document removed from Firestore và list
  
  - [ ]* 15.4 Write integration tests for DocumentRepository
    - Test complete create → display → edit → delete flow
    - Test major filter + search combination
    - Test pagination loadMore

- [ ] 16. Integrate với TVU Connect navigation
  - [x] 16.1 Update `src/App.tsx`
    - Add "Tài liệu" tab với BookOpen icon trong navigation
    - Add route case 'documents' trong renderView()
    - Render DocumentRepository component với currentUser prop
    - _Requirements: 11.1_
  
  - [ ]* 16.2 Write unit tests for navigation integration
    - Test "Tài liệu" tab click navigates to documents view
    - Test DocumentRepository receives correct props

- [x] 17. Implement Firestore security rules
  - [x] 17.1 Update `firestore.rules`
    - Add rules cho documentLinks collection
    - Allow read for authenticated users
    - Allow create for authenticated users
    - Allow update only if request.auth.uid == resource.data.createdBy
    - Allow delete only if request.auth.uid == resource.data.createdBy
    - Validate createdBy matches request.auth.uid on create
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 17.2 Write security rules tests
    - Test authenticated users can read
    - Test authenticated users can create
    - Test only owners can update/delete
    - Test createdBy validation on create

- [x] 18. Create Firestore indexes
  - [x] 18.1 Update `firestore.indexes.json`
    - Add composite index: major_id + createdAt (chỉ cần 1 index)
    - Remove subject và category indexes (không dùng cho filtering)
    - _Requirements: 10.5_
  
  - [ ]* 18.2 Document index deployment instructions
    - Create deployment guide trong README
    - Include Firebase CLI commands

- [ ] 19. Checkpoint - Verify complete integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Implement responsive design optimizations
  - [ ] 20.1 Update mobile styles
    - Ensure touch-friendly button sizes (min 44px height)
    - Prevent horizontal scrolling
    - Test filter dropdown full-width on mobile
    - Test DocumentCard single column layout on mobile
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 20.2 Write responsive design tests
    - Test mobile viewport rendering
    - Test tablet viewport rendering
    - Test desktop viewport rendering

- [ ] 21. Implement performance optimizations
  - [ ] 21.1 Add caching layer
    - Cache filter options (majors only) trong localStorage
    - Set 24-hour TTL cho cached data
    - Implement cache invalidation logic
    - _Requirements: 10.2_
  
  - [ ]* 21.2 Write property test for cache TTL
    - **Property 26: Cache TTL Enforcement**
    - **Validates: Requirements 10.2**
    - Test với random cache timestamps
    - Verify cache invalidated sau 24 hours
  
  - [ ] 21.3 Optimize Firestore queries
    - Verify pagination với 20 docs per page
    - Implement query result caching (60s TTL)
    - Add loading skeletons during fetch
    - _Requirements: 10.1, 10.3, 10.4_
  
  - [ ]* 21.4 Write property test for pagination
    - **Property 25: Pagination Page Size**
    - **Validates: Requirements 10.1**
    - Test với random query requests
    - Verify returned documents <= 20 per page

- [ ] 22. Implement theme integration
  - [ ] 22.1 Apply TVU Connect theme system
    - Use useTheme hook từ ThemeContext
    - Apply dark mode styles cho all components
    - Ensure tag colors work in both light/dark modes
    - Test color contrast ratios
    - _Requirements: 11.2_
  
  - [ ]* 22.2 Write theme integration tests
    - Test light mode rendering
    - Test dark mode rendering
    - Test theme toggle updates components

- [ ] 23. Final testing và bug fixes
  - [ ] 23.1 Run full test suite
    - Execute all unit tests
    - Execute all property-based tests
    - Execute all integration tests
    - Fix any failing tests
  
  - [ ] 23.2 Manual testing checklist
    - Test create document flow end-to-end
    - Test edit document flow
    - Test delete document flow
    - Test filtering by major, subject, category
    - Test keyword search
    - Test pagination loadMore
    - Test mobile responsive design
    - Test dark mode
    - Test error handling (network errors, validation errors)
    - Test empty states
  
  - [ ] 23.3 Performance testing
    - Verify initial load < 2 seconds on desktop
    - Verify initial load < 3 seconds on 3G mobile
    - Verify filter changes update within 500ms
    - _Requirements: 6.6, 11.6_

- [ ] 24. Final checkpoint - Production readiness
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 25. Fix header overlap và cải thiện hero section
  - [ ] 25.1 Fix header bị che bởi navigation bar
    - Thêm padding-top hoặc margin-top cho DocumentRepository component
    - Đảm bảo hero header section hiển thị đầy đủ trên mobile và desktop
    - Test trên nhiều kích thước màn hình
    - _Requirements: 5.1, 5.5_
  
  - [ ] 25.2 Cập nhật nội dung hero section
    - Thay đổi mô tả chính thành: "Sinh viên chỉ cần dán link tài liệu từ Google Drive, OneDrive, Dropbox... Tài liệu của bạn là sự đóng góp lớn trong việc giúp sinh viên TVU học tập tốt hơn!"
    - Thêm card lưu ý mới với icon ⚠️
    - Tiêu đề card: "Lưu ý quan trọng"
    - Nội dung card: "Hãy văn minh trong việc đăng link, chỉ dành cho mục đích học thuật. Nghiêm cấm các vấn đề nhạy cảm, buôn bán và các vấn đề không liên quan."
    - _Requirements: 11.1_
  
  - [ ] 25.3 Cải thiện responsive layout
    - Đảm bảo hero section responsive tốt trên mobile
    - Info cards hiển thị rõ ràng và dễ đọc
    - Test layout trên mobile (< 768px), tablet (768px-1024px), desktop (> 1024px)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 26. Checkpoint - Verify UI improvements
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All components must integrate with existing TVU Connect theme and auth systems
- Firestore indexes must be deployed before production launch
- Security rules must be tested thoroughly before deployment

## Testing Configuration

**Property-Based Testing Library**: fast-check

**Minimum Iterations**: 100 runs per property test

**Test Tagging Format**: `Property X: [Title] - Feature: academic-document-repository`

**Coverage Goals**:
- Unit Tests: 80% code coverage minimum
- Property Tests: 100% coverage of all correctness properties
- Integration Tests: All CRUD operations covered
