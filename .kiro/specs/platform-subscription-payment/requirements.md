# Requirements Document

## Introduction

Tính năng thanh toán đóng vốn sử dụng nền tảng cho phép người dùng đóng góp 3.000 VNĐ để tiếp tục sử dụng nền tảng TVU Connect sau khi hết thời gian dùng thử 5 ngày. Hệ thống sử dụng phương thức thanh toán QR code ngân hàng Agribank để xử lý giao dịch và tự động kích hoạt quyền truy cập Premium cho người dùng.

## Glossary

- **User**: Người dùng đã đăng ký tài khoản trên nền tảng TVU Connect
- **Trial_Period**: Thời gian dùng thử 5 ngày kể từ khi tạo tài khoản
- **Premium_Status**: Trạng thái đã thanh toán, cho phép tiếp tục sử dụng nền tảng
- **Subscription_System**: Hệ thống quản lý đăng ký và thanh toán
- **Payment_Gateway**: Cổng thanh toán qua QR code Agribank
- **QR_Code**: Mã QR chứa thông tin thanh toán ngân hàng
- **Transaction_ID**: Mã định danh giao dịch duy nhất (format: TVU_CONNECT_ID_[User_ID])
- **Subscription_Modal**: Giao diện hiển thị thông tin thanh toán
- **Notification_System**: Hệ thống thông báo nhắc nhở người dùng
- **Payment_Verification**: Quy trình xác minh thanh toán thành công
- **Payment_History**: Lịch sử các giao dịch thanh toán của người dùng
- **Account_Lock**: Trạng thái khóa tài khoản khi hết thời gian dùng thử và chưa thanh toán

## Requirements

### Requirement 1: Trial Period Management

**User Story:** Là một người dùng mới, tôi muốn có 5 ngày dùng thử miễn phí, để tôi có thể trải nghiệm nền tảng trước khi quyết định đóng góp.

#### Acceptance Criteria

1. WHEN a User creates an account, THE Subscription_System SHALL initialize a Trial_Period of 5 days from account creation timestamp
2. THE Subscription_System SHALL store the trial expiry date in Firestore users collection with field `trialExpiryDate`
3. WHEN the Trial_Period expires, THE Subscription_System SHALL set the User account status to require payment
4. THE Subscription_System SHALL calculate remaining trial days by comparing current timestamp with `trialExpiryDate`
5. WHILE the Trial_Period is active, THE User SHALL have full access to all platform features

### Requirement 2: Payment QR Code Generation

**User Story:** Là một người dùng, tôi muốn thanh toán qua QR code ngân hàng, để tôi có thể dễ dàng chuyển khoản bằng ứng dụng ngân hàng của mình.

#### Acceptance Criteria

1. WHEN a User requests payment information, THE Payment_Gateway SHALL generate a QR_Code with Agribank bank details
2. THE QR_Code SHALL contain the payment amount of 3.000 VNĐ
3. THE QR_Code SHALL include a unique Transaction_ID in format `TVU_CONNECT_ID_[User_ID]`
4. THE Payment_Gateway SHALL use VietQR API format: `https://img.vietqr.io/image/[BANK_ID]-[ACCOUNT_NO]-compact2.png?amount=[AMOUNT]&addInfo=[TRANSACTION_ID]&accountName=[NAME]`
5. THE QR_Code SHALL be displayable as an image within the Subscription_Modal
6. THE Transaction_ID SHALL be URL-encoded to ensure proper QR code generation

### Requirement 3: Subscription Modal Display

**User Story:** Là một người dùng, tôi muốn thấy giao diện thanh toán rõ ràng và hấp dẫn, để tôi hiểu được quyền lợi và cách thức thanh toán.

#### Acceptance Criteria

1. WHEN a User accesses a premium feature during Trial_Period, THE Subscription_System SHALL display the Subscription_Modal
2. THE Subscription_Modal SHALL show remaining trial days with Clock icon and blue highlight
3. THE Subscription_Modal SHALL list Premium benefits including: unlimited matching, fast friend connections, smart dating, and 24/7 server support
4. THE Subscription_Modal SHALL display pricing information: 3.000 VNĐ per week (7 days)
5. WHEN a User clicks "Đóng góp ngay" button, THE Subscription_Modal SHALL reveal the QR_Code
6. THE Subscription_Modal SHALL display the Transaction_ID below the QR_Code
7. THE Subscription_Modal SHALL show estimated activation time of 5-10 minutes after payment
8. THE Subscription_Modal SHALL provide a "Để sau" button to close the modal without payment

### Requirement 4: Trial Expiry Notifications

**User Story:** Là một người dùng, tôi muốn được nhắc nhở trước khi hết thời gian dùng thử, để tôi có thể chuẩn bị thanh toán và không bị gián đoạn sử dụng.

#### Acceptance Criteria

1. WHEN the Trial_Period has 2 days remaining, THE Notification_System SHALL display a warning notification to the User
2. WHEN the Trial_Period has 1 day remaining, THE Notification_System SHALL display a high-priority notification to the User
3. WHEN the Trial_Period has 0 days remaining, THE Notification_System SHALL display a critical notification requiring immediate action
4. THE Notification_System SHALL check trial status on every app launch
5. THE Notification_System SHALL check trial status when User navigates to any major feature
6. THE notification SHALL include a direct link to open the Subscription_Modal

### Requirement 5: Account Access Control After Trial

**User Story:** Là quản trị viên hệ thống, tôi muốn hạn chế quyền truy cập của người dùng chưa thanh toán sau khi hết dùng thử, để đảm bảo tính bền vững của nền tảng.

#### Acceptance Criteria

1. WHEN the Trial_Period expires AND the User has not activated Premium_Status, THE Subscription_System SHALL restrict access to core features
2. THE Subscription_System SHALL allow read-only access to user profile and settings after trial expiry
3. THE Subscription_System SHALL block access to: matching, messaging, posts, explore, and map features after trial expiry
4. WHEN a User attempts to access a blocked feature, THE Subscription_System SHALL display the Subscription_Modal
5. THE Subscription_System SHALL maintain user data integrity during restricted access period
6. WHEN Premium_Status is activated, THE Subscription_System SHALL immediately restore full access to all features

### Requirement 6: Payment Verification System

**User Story:** Là quản trị viên hệ thống, tôi muốn xác minh thanh toán tự động hoặc thủ công, để kích hoạt Premium cho người dùng đã thanh toán thành công.

#### Acceptance Criteria

1. THE Payment_Verification SHALL support manual verification by checking Transaction_ID in bank transaction history
2. WHEN an admin verifies a payment, THE Payment_Verification SHALL call `activatePremium(userId, 7)` function
3. THE Payment_Verification SHALL update Firestore users collection with `isPremium: true` and `premiumExpiryDate`
4. THE Payment_Verification SHALL calculate `premiumExpiryDate` as 7 days from activation timestamp
5. IF a User already has active Premium_Status, THE Payment_Verification SHALL extend the expiry date by adding 7 days to current `premiumExpiryDate`
6. THE Payment_Verification SHALL log all payment activations with timestamp, userId, and transaction details
7. THE Payment_Verification SHALL send a confirmation notification to the User upon successful activation

### Requirement 7: Payment History Tracking

**User Story:** Là một người dùng, tôi muốn xem lịch sử thanh toán của mình, để tôi có thể theo dõi các giao dịch và thời gian hết hạn Premium.

#### Acceptance Criteria

1. THE Subscription_System SHALL create a new document in `paymentHistory` collection for each verified payment
2. THE Payment_History document SHALL include fields: `userId`, `amount`, `transactionId`, `paymentDate`, `activationDate`, `expiryDate`, `status`
3. THE Subscription_System SHALL allow Users to view their Payment_History in the Settings page
4. THE Payment_History display SHALL show payment date, amount, and expiry date for each transaction
5. THE Payment_History SHALL be sorted by payment date in descending order (newest first)
6. THE Subscription_System SHALL display current Premium_Status and expiry date prominently in user profile

### Requirement 8: Agribank Integration Configuration

**User Story:** Là quản trị viên hệ thống, tôi muốn cấu hình thông tin tài khoản Agribank, để hệ thống tạo QR code thanh toán chính xác.

#### Acceptance Criteria

1. THE Payment_Gateway SHALL store Agribank account configuration in environment variables or secure config file
2. THE configuration SHALL include: `BANK_ID` (Agribank code), `ACCOUNT_NO`, `ACCOUNT_NAME`
3. THE Payment_Gateway SHALL validate that all required configuration fields are present before generating QR_Code
4. IF configuration is missing or invalid, THE Payment_Gateway SHALL display an error message and prevent QR_Code generation
5. THE configuration SHALL be updatable without requiring code changes (via environment variables)
6. THE Payment_Gateway SHALL mask sensitive account information in logs and error messages

### Requirement 9: Premium Status Persistence

**User Story:** Là một người dùng đã thanh toán, tôi muốn trạng thái Premium của tôi được lưu trữ an toàn, để tôi không bị mất quyền truy cập khi đăng nhập lại.

#### Acceptance Criteria

1. THE Subscription_System SHALL store Premium_Status in Firestore users collection with fields: `isPremium`, `premiumExpiryDate`, `trialExpiryDate`
2. THE Subscription_System SHALL check Premium_Status on every app initialization
3. WHEN `premiumExpiryDate` is in the future, THE Subscription_System SHALL grant full platform access
4. WHEN `premiumExpiryDate` is in the past, THE Subscription_System SHALL revoke Premium_Status and restrict access
5. THE Subscription_System SHALL use Firestore security rules to prevent unauthorized modification of Premium_Status fields
6. THE Subscription_System SHALL cache Premium_Status locally to reduce Firestore reads

### Requirement 10: Firestore Security Rules for Subscription

**User Story:** Là quản trị viên hệ thống, tôi muốn bảo vệ dữ liệu đăng ký khỏi truy cập trái phép, để đảm bảo người dùng không thể tự kích hoạt Premium mà không thanh toán.

#### Acceptance Criteria

1. THE Firestore security rules SHALL allow Users to read their own subscription data from users collection
2. THE Firestore security rules SHALL prevent Users from writing to `isPremium`, `premiumExpiryDate` fields
3. THE Firestore security rules SHALL allow Users to read their own Payment_History documents
4. THE Firestore security rules SHALL prevent Users from creating or modifying Payment_History documents
5. THE Firestore security rules SHALL allow admin accounts to write to all subscription-related fields
6. THE Firestore security rules SHALL validate that `trialExpiryDate` is only set during account creation

