# Implementation Plan: Platform Subscription Payment

## Overview

Tính năng thanh toán đóng vốn cho phép người dùng đóng góp 3.000 VNĐ/tuần qua QR code Agribank để tiếp tục sử dụng TVU Connect sau 5 ngày dùng thử. Kế hoạch triển khai bao gồm việc xây dựng hệ thống quản lý subscription, giao diện thanh toán, xác minh thanh toán thủ công, và bảo mật dữ liệu.

## Tasks

- [ ] 1. Thiết lập cấu hình Agribank và environment variables
  - Tạo file cấu hình cho thông tin tài khoản Agribank (BANK_ID, ACCOUNT_NO, ACCOUNT_NAME)
  - Thêm environment variables vào `.env.local` và `.env.example`
  - Implement validation logic để kiểm tra config trước khi generate QR code
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [ ] 2. Implement core subscription manager
  - [ ] 2.1 Tạo file `src/utils/subscriptionManager.ts`
    - Implement `initializeUserSubscription(userId)` với trial period 5 ngày
    - Implement `generateVietQRCode(userId, amount)` theo VietQR API format
    - Implement `activatePremium(userId, durationDays)` với logic extend premium
    - Implement `createPaymentHistory()` để tạo payment records
    - Implement `checkTrialExpiry()` cho notification logic
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.6, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2_

  - [ ]* 2.2 Write property test for trial initialization
    - **Property 1: Trial Initialization Round-Trip**
    - **Validates: Requirements 1.1, 1.2**
    - Test với fast-check: user document có trialExpiryDate đúng 5 ngày từ now

  - [ ]* 2.3 Write property test for QR code generation
    - **Property 2: QR Code URL Format Correctness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**
    - Test format URL, amount parameter, transaction ID encoding

  - [ ]* 2.4 Write property test for access control logic
    - **Property 3: Access Control Logic Consistency**
    - **Validates: Requirements 1.3, 1.5, 5.1, 5.6, 9.3, 9.4**
    - Test hasAccess = (isTrialActive OR isPremiumActive)

  - [ ]* 2.5 Write property test for trial days calculation
    - **Property 4: Trial Days Calculation Accuracy**
    - **Validates: Requirements 1.4**
    - Test ceiling calculation của (trialExpiry - now) / milliseconds_per_day

  - [ ]* 2.6 Write property test for premium activation
    - **Property 5: Premium Activation Date Calculation**
    - **Validates: Requirements 6.3, 6.4, 6.5**
    - Test expiry date calculation cho first-time và extension

  - [ ]* 2.7 Write property test for premium extension
    - **Property 6: Premium Extension Preserves Remaining Time**
    - **Validates: Requirements 6.5**
    - Test extend thêm N days vào current expiry, không phải từ now

  - [ ]* 2.8 Write unit tests for subscriptionManager
    - Test error handling cho invalid userId, missing config
    - Test idempotency của initializeUserSubscription
    - Test URL encoding đặc biệt trong transaction ID
    - Test rate limiting logic

- [ ] 3. Checkpoint - Kiểm tra core logic
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement usePremiumStatus hook
  - [ ] 4.1 Tạo file `src/hooks/usePremiumStatus.ts`
    - Implement hook với onSnapshot để listen real-time changes
    - Calculate trialDaysLeft và premiumDaysLeft
    - Calculate hasAccess flag
    - Implement local caching với TTL 5 minutes
    - Handle null userId và loading states
    - _Requirements: 1.3, 1.4, 1.5, 9.2, 9.3, 9.4, 9.6_

  - [ ]* 4.2 Write unit tests for usePremiumStatus
    - Test loading state
    - Test trial/premium days calculation
    - Test real-time updates khi Firestore thay đổi
    - Test null userId handling
    - Test caching behavior

- [ ] 5. Implement SubscriptionModal component
  - [ ] 5.1 Tạo file `src/components/SubscriptionModal.tsx`
    - Implement modal với glassmorphism design
    - Display trial days left với Clock icon và blue highlight
    - List 4 premium benefits
    - Display pricing: 3.000 VNĐ/tuần (7 ngày)
    - Button "Đóng góp ngay" toggle QR code visibility
    - Display QR code image từ VietQR URL
    - Display Transaction ID dưới QR code
    - Display thông báo "Kích hoạt sau 5-10 phút"
    - Button "Để sau" để close modal
    - Responsive design với mobile-first
    - Dark mode support
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 5.2 Write property test for payment history structure
    - **Property 7: Payment History Document Structure**
    - **Validates: Requirements 7.1, 7.2**
    - Test tất cả required fields và data types

  - [ ]* 5.3 Write property test for payment history sorting
    - **Property 8: Payment History Sorting Order**
    - **Validates: Requirements 7.5**
    - Test descending order của paymentDate

  - [ ]* 5.4 Write unit tests for SubscriptionModal
    - Test trial days display
    - Test QR code toggle
    - Test onClose callback
    - Test error state khi config missing

- [ ] 6. Implement PremiumGuard component
  - [ ] 6.1 Tạo file `src/components/PremiumGuard.tsx`
    - Implement HOC wrapper cho protected features
    - Show children khi hasAccess = true
    - Show blur overlay + lock icon khi hasAccess = false
    - Button "Mở khóa ngay" mở SubscriptionModal
    - Trigger notification toast khi trial còn 1 ngày
    - Handle loading states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 4.4, 4.5_

  - [ ]* 6.2 Write property test for configuration validation
    - **Property 9: Configuration Validation Before QR Generation**
    - **Validates: Requirements 8.3**
    - Test throw error khi missing BANK_ID, ACCOUNT_NO, ACCOUNT_NAME

  - [ ]* 6.3 Write unit tests for PremiumGuard
    - Test render children khi hasAccess = true
    - Test show overlay khi hasAccess = false
    - Test notification trigger khi trial = 1 day
    - Test modal opening

- [ ] 7. Checkpoint - Kiểm tra UI components
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement PaymentHistory component
  - [ ] 8.1 Tạo file `src/components/PaymentHistory.tsx`
    - Display danh sách payment history từ Firestore
    - Sort by paymentDate descending
    - Display: payment date, amount, expiry date
    - Highlight current active premium
    - Filter by status (pending/completed/failed)
    - Show current premium status và expiry date prominently
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [ ]* 8.2 Write property test for subscription data persistence
    - **Property 10: Subscription Data Persistence**
    - **Validates: Requirements 9.1**
    - Test user document có đúng fields: isPremium, trialExpiryDate, premiumExpiryDate với đúng types

  - [ ]* 8.3 Write unit tests for PaymentHistory
    - Test sorting logic
    - Test filtering by status
    - Test empty state
    - Test highlight active premium

- [ ] 9. Implement notification system
  - [ ] 9.1 Thêm trial expiry notifications vào app
    - Check trial status on app launch
    - Check trial status khi navigate major features
    - Display warning khi còn 2 ngày
    - Display high-priority khi còn 1 ngày
    - Display critical khi còn 0 ngày
    - Include link để mở SubscriptionModal
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 9.2 Write unit tests for notification system
    - Test notification triggers theo days remaining
    - Test notification priority levels
    - Test link action

- [ ] 10. Implement access control integration
  - [ ] 10.1 Wrap các protected features với PremiumGuard
    - Wrap Matching component
    - Wrap Chat/Messages component
    - Wrap Posts component
    - Wrap Explore component
    - Wrap Map component
    - Maintain data integrity during restricted access
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 10.2 Write integration tests cho access control
    - Test block access sau trial expiry
    - Test restore access sau premium activation
    - Test read-only profile access

- [ ] 11. Update Firestore security rules
  - [ ] 11.1 Thêm rules cho users collection
    - Allow read authenticated users
    - Allow update own profile (exclude isPremium, premiumExpiryDate)
    - Allow create với trialExpiryDate
    - Validate trialExpiryDate chỉ set during creation
    - _Requirements: 10.1, 10.2, 10.5, 10.6_

  - [ ] 11.2 Thêm rules cho paymentHistory collection
    - Allow read own payment history
    - Deny all write operations from users
    - Admin-only write access
    - _Requirements: 10.3, 10.4, 10.5_

  - [ ] 11.3 Deploy Firestore rules
    - Test rules với Firebase Emulator
    - Deploy lên production
    - Verify rules hoạt động đúng

- [ ] 12. Checkpoint - Kiểm tra security
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement admin payment verification tools
  - [ ] 13.1 Tạo admin panel component
    - Search payment by transaction ID
    - Button activate premium
    - Display payment history list
    - Bulk operations support
    - _Requirements: 6.1, 6.2, 6.6_

  - [ ] 13.2 Implement admin authentication
    - Check admin role trước khi allow activatePremium
    - Secure admin-only operations
    - Log all admin actions
    - _Requirements: 6.6_

  - [ ]* 13.3 Write unit tests cho admin tools
    - Test transaction ID search
    - Test premium activation
    - Test unauthorized access blocking

- [ ] 14. Implement rate limiting và security measures
  - [ ] 14.1 Add rate limiting cho QR code generation
    - Limit 10 requests per minute per user
    - Cache để track requests
    - Error message khi exceed limit
    - _Requirements: 8.4_

  - [ ] 14.2 Add security measures
    - Transaction ID security (unique per user)
    - Mask sensitive info trong logs và error messages
    - Validate all inputs
    - Use serverTimestamp() thay vì client-side dates
    - _Requirements: 8.6, 9.5_

  - [ ]* 14.3 Write unit tests cho security features
    - Test rate limiting
    - Test transaction ID uniqueness
    - Test input validation

- [ ] 15. Implement error handling
  - [ ] 15.1 Add error handling cho tất cả scenarios
    - Firestore connection errors → use cached data
    - Missing configuration → display error message
    - Invalid user ID → redirect to login
    - Payment verification failures → log và notify admin
    - Expired premium → toast notification và redirect
    - Concurrent premium activation → use Firestore transaction
    - _Design Error Handling section_

  - [ ]* 15.2 Write error handling tests
    - Test offline behavior
    - Test missing config error
    - Test invalid userId handling
    - Test concurrent updates

- [ ] 16. Integration và wiring
  - [ ] 16.1 Wire subscription system vào existing app
    - Initialize subscription cho new users trong registration flow
    - Add subscription status check vào App.tsx
    - Add SubscriptionModal trigger points
    - Add PaymentHistory vào Settings page
    - Update user profile display với premium badge
    - _Requirements: 1.1, 3.1, 7.3, 7.6_

  - [ ]* 16.2 Write end-to-end integration tests
    - Test complete registration → trial → payment → premium flow
    - Test trial expiry → block → payment → restore flow
    - Test premium extension flow

- [ ] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Implementation language: **TypeScript**
- Design sử dụng VietQR API để generate QR code images
- Payment verification là manual process (admin check bank statement)
- Trial period: 5 ngày
- Premium duration: 7 ngày per payment
- Payment amount: 3.000 VNĐ
