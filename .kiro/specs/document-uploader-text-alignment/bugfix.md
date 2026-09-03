# Bugfix Requirements Document

## Introduction

Trong Document Repository, phần thông tin người đăng tải ("Đăng bởi: Người dùng") hiện tại không được căn chỉnh đồng bộ với phần mô tả (description) ở phía dưới cùng trong DocumentCard. Điều này tạo ra sự không nhất quán về visual alignment và ảnh hưởng đến trải nghiệm đọc của người dùng.

Vấn đề xảy ra trong component DocumentCard.tsx và UploaderInfo.tsx, nơi hiển thị thông tin người đăng tải và các thông tin khác của tài liệu.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN viewing a document card in Document Repository THEN the "Đăng bởi: Người dùng" text is not aligned with the description text below it

1.2 WHEN comparing text alignment across different sections of the document card THEN there is inconsistent left padding/margin between the uploader info section and the description section

### Expected Behavior (Correct)

2.1 WHEN viewing a document card in Document Repository THEN the "Đăng bởi: Người dùng" text SHALL be aligned consistently with the description text below it

2.2 WHEN comparing text alignment across different sections of the document card THEN all text content (uploader info, tags, description) SHALL have consistent left alignment

### Unchanged Behavior (Regression Prevention)

3.1 WHEN viewing the document card on desktop layout THEN the system SHALL CONTINUE TO display the horizontal layout with all content properly spaced

3.2 WHEN viewing the document card on mobile layout THEN the system SHALL CONTINUE TO display the vertical stacking layout with proper spacing

3.3 WHEN clicking on the uploader name THEN the system SHALL CONTINUE TO navigate to the uploader's profile (if onProfileClick is provided)

3.4 WHEN viewing the uploader info while loading THEN the system SHALL CONTINUE TO show the loading skeleton animation

3.5 WHEN viewing document cards with and without subject tags THEN the system SHALL CONTINUE TO display tags correctly with appropriate icons

3.6 WHEN interacting with edit/delete buttons (for document owners) THEN the system SHALL CONTINUE TO function correctly

3.7 WHEN clicking "Mở tài liệu" button THEN the system SHALL CONTINUE TO open the document link in a new tab
