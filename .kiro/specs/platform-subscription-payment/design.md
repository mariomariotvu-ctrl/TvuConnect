# Design Document: Platform Subscription Payment

## Overview

Tính năng thanh toán đóng vốn sử dụng nền tảng cho phép người dùng đóng góp 3.000 VNĐ/tuần để tiếp tục sử dụng TVU Connect sau khi hết thời gian dùng thử 5 ngày. Hệ thống sử dụng phương thức thanh toán QR code ngân hàng Agribank thông qua VietQR API, với quy trình xác minh thanh toán thủ công và tự động kích hoạt quyền Premium.

### Key Features

- **Trial Period Management**: Quản lý thời gian dùng thử 5 ngày cho người dùng mới
- **QR Code Payment**: Tạo mã QR thanh toán tự động với VietQR API
- **Access Control**: Hạn chế quyền truy cập sau khi hết trial, cho phép đầy đủ khi có Premium
- **Payment Verification**: Xác minh thanh toán thủ công qua Transaction ID
- **Premium Activation**: Kích hoạt và gia hạn Premium tự động
- **Payment History**: Lưu trữ và hiển thị lịch sử thanh toán
- **Notification System**: Thông báo nhắc nhở khi trial sắp hết hạn

### Design Goals

1. **Đơn giản và dễ sử dụng**: Quy trình thanh toán chỉ cần quét QR và chuyển khoản
2. **Bảo mật**: Ngăn chặn gian lận, bảo vệ dữ liệu thanh toán
3. **Tự động hóa**: Giảm thiểu công việc thủ công trong việc kích hoạt Premium
4. **Minh bạch**: Người dùng luôn biết trạng thái trial/premium và thời gian hết hạn
5. **Linh hoạt**: Hỗ trợ gia hạn Premium nhiều lần

## Architecture

### System Components


```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ SubscriptionModal│  │  PremiumGuard    │  │ PaymentHistory│ │
│  │  - Show QR Code  │  │  - Block Access  │  │  - Show List  │ │
│  │  - Display Info  │  │  - Show Modal    │  │  - Filter     │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           subscriptionManager.ts                         │  │
│  │  - initializeUserSubscription()                          │  │
│  │  - activatePremium()                                     │  │
│  │  - generateVietQRCode()                                  │  │
│  │  - checkTrialExpiry()                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           usePremiumStatus Hook                          │  │
│  │  - Real-time subscription status monitoring              │  │
│  │  - Calculate trial/premium days left                     │  │
│  │  - Determine hasAccess flag                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer (Firestore)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  users/{userId}  │  │ paymentHistory/  │                    │
│  │  - isPremium     │  │   {paymentId}    │                    │
│  │  - trialExpiry   │  │  - userId        │                    │
│  │  - premiumExpiry │  │  - amount        │                    │
│  └──────────────────┘  │  - transactionId │                    │
│                        │  - paymentDate   │                    │
│                        │  - status        │                    │
│                        └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   VietQR API     │  │  Agribank        │                    │
│  │  - Generate QR   │  │  - Receive       │                    │
│  │    Code Image    │  │    Payment       │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow


#### 1. User Registration Flow
```
User Signs Up → initializeUserSubscription(userId)
              → Create user document in Firestore
              → Set trialExpiryDate = now + 5 days
              → Set isPremium = false
```

#### 2. Payment Request Flow
```
User Clicks "Đóng góp ngay" → generateVietQRCode(userId, 3000)
                            → Build VietQR URL with bank details
                            → Display QR code in modal
                            → User scans and transfers money
```

#### 3. Payment Verification Flow
```
Admin Checks Bank Statement → Find Transaction ID: TVU_CONNECT_ID_[userId]
                            → Call activatePremium(userId, 7)
                            → Update isPremium = true
                            → Set premiumExpiryDate = now + 7 days
                            → Create paymentHistory record
                            → Send confirmation notification
```

#### 4. Access Control Flow
```
User Accesses Feature → usePremiumStatus(userId)
                      → Check trialExpiryDate vs now
                      → Check premiumExpiryDate vs now
                      → Calculate hasAccess flag
                      → If !hasAccess → Show PremiumGuard
                      → If hasAccess → Allow access
```

## Components and Interfaces

### 1. subscriptionManager.ts

Utility module quản lý subscription logic.


**Functions:**

```typescript
// Khởi tạo subscription cho user mới
async function initializeUserSubscription(userId: string): Promise<void>

// Kích hoạt Premium (sau khi xác minh thanh toán)
async function activatePremium(userId: string, durationDays: number = 7): Promise<void>

// Tạo URL QR code VietQR
function generateVietQRCode(userId: string, amount: number = 3000): string

// Kiểm tra và trigger notification khi trial sắp hết
function checkTrialExpiry(trialDaysLeft: number, onTrialExpiringSoon: () => void): void

// Tạo payment history record
async function createPaymentHistory(
  userId: string, 
  transactionId: string, 
  amount: number
): Promise<void>
```

**Configuration:**

```typescript
interface PaymentConfig {
  BANK_ID: string;        // Mã ngân hàng (ví dụ: "970405" cho Agribank)
  ACCOUNT_NO: string;     // Số tài khoản
  ACCOUNT_NAME: string;   // Tên chủ tài khoản
}
```

### 2. usePremiumStatus Hook

Custom React Hook theo dõi trạng thái subscription real-time.


**Interface:**

```typescript
interface PremiumStatus {
  isPremium: boolean;           // User có Premium không
  isTrialActive: boolean;       // Trial còn hiệu lực không
  trialDaysLeft: number;        // Số ngày trial còn lại
  premiumDaysLeft: number;      // Số ngày premium còn lại
  hasAccess: boolean;           // Có quyền truy cập không (trial OR premium)
  loading: boolean;             // Đang load dữ liệu
  trialExpiryDate: Date | null; // Ngày hết hạn trial
  premiumExpiryDate: Date | null; // Ngày hết hạn premium
}

function usePremiumStatus(userId: string | null): PremiumStatus
```

**Logic:**

- Sử dụng `onSnapshot` để lắng nghe thay đổi real-time từ Firestore
- Tính toán `trialDaysLeft` và `premiumDaysLeft` dựa trên timestamp hiện tại
- `hasAccess = isTrialActive OR isPremium`
- Cache kết quả để giảm Firestore reads

### 3. SubscriptionModal Component

Modal hiển thị thông tin thanh toán và QR code.


**Props:**

```typescript
interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  trialDaysLeft: number;
  featureName?: string;
}
```

**Features:**

- Hiển thị số ngày trial còn lại với icon Clock và highlight màu xanh
- Liệt kê 4 quyền lợi Premium
- Hiển thị giá: 3.000 VNĐ/tuần (7 ngày)
- Button "Đóng góp ngay" để toggle hiển thị QR code
- Hiển thị QR code image từ VietQR API
- Hiển thị Transaction ID dưới QR code
- Thông báo thời gian kích hoạt: 5-10 phút
- Button "Để sau" để đóng modal

**UI Design:**

- Glassmorphism style với backdrop blur
- Gradient header (purple to blue)
- Responsive design (mobile-first)
- Smooth animations với Framer Motion
- Dark mode support

### 4. PremiumGuard Component

Higher-Order Component bảo vệ các tính năng Premium.


**Props:**

```typescript
interface PremiumGuardProps {
  children: React.ReactNode;
  userId: string | null;
  featureName: string;
  showBlur?: boolean;
}
```

**Behavior:**

- Nếu `hasAccess = true`: Hiển thị children bình thường
- Nếu `hasAccess = false`: 
  - Hiển thị children với blur effect (nếu showBlur = true)
  - Overlay với Lock icon và thông báo
  - Button "Mở khóa ngay" để mở SubscriptionModal
- Tự động kiểm tra trial expiry và hiển thị toast notification khi còn 1 ngày

**Usage Example:**

```typescript
<PremiumGuard userId={user.uid} featureName="Ghép cặp">
  <MatchingComponent />
</PremiumGuard>
```

### 5. PaymentHistory Component

Component hiển thị lịch sử thanh toán của user.

**Interface:**

```typescript
interface PaymentHistoryItem {
  id: string;
  userId: string;
  amount: number;
  transactionId: string;
  paymentDate: Timestamp;
  activationDate: Timestamp;
  expiryDate: Timestamp;
  status: 'pending' | 'completed' | 'failed';
}
```

**Features:**

- Hiển thị danh sách các giao dịch thanh toán
- Sắp xếp theo paymentDate giảm dần (mới nhất trên cùng)
- Hiển thị: ngày thanh toán, số tiền, ngày hết hạn
- Highlight giao dịch đang active
- Filter theo status

## Data Models

### User Document (Firestore: users/{userId})


```typescript
interface UserSubscription {
  // Existing user fields...
  
  // Subscription fields
  isPremium: boolean;                    // Có Premium không
  trialExpiryDate: Timestamp;            // Ngày hết hạn trial (5 ngày từ đăng ký)
  premiumExpiryDate: Timestamp | null;   // Ngày hết hạn premium (null nếu chưa mua)
  
  // Metadata
  createdAt: Timestamp;                  // Ngày tạo tài khoản
  updatedAt: Timestamp;                  // Ngày cập nhật cuối
}
```

**Field Rules:**

- `trialExpiryDate`: Chỉ được set khi tạo tài khoản, không được update sau đó
- `isPremium`: Chỉ admin hoặc cloud function được phép update
- `premiumExpiryDate`: Chỉ admin hoặc cloud function được phép update

### Payment History Document (Firestore: paymentHistory/{paymentId})

```typescript
interface PaymentHistory {
  userId: string;                        // UID của user
  amount: number;                        // Số tiền (VNĐ)
  transactionId: string;                 // Mã giao dịch (TVU_CONNECT_ID_[userId])
  paymentDate: Timestamp;                // Ngày chuyển khoản
  activationDate: Timestamp;             // Ngày kích hoạt Premium
  expiryDate: Timestamp;                 // Ngày hết hạn Premium
  status: 'pending' | 'completed' | 'failed'; // Trạng thái
  verifiedBy: string | null;             // Admin ID người xác minh
  notes: string | null;                  // Ghi chú (nếu có)
  createdAt: Timestamp;                  // Timestamp tạo record
}
```

**Security:**

- Users chỉ được read documents của chính họ
- Users không được create/update/delete
- Chỉ admin được phép write

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

Sau khi phân tích 60 acceptance criteria, tôi đã xác định các properties có thể gộp lại:

**Redundancy Analysis:**


1. **Trial initialization properties (1.1, 1.2)** có thể gộp thành một property về việc khởi tạo user với trial period đúng
2. **QR code format properties (2.1, 2.2, 2.3, 2.4, 2.6)** có thể gộp thành một property về việc generate QR URL đúng format
3. **Access control properties (1.3, 1.5, 5.1, 5.6)** có thể gộp thành một property về logic hasAccess
4. **Premium activation properties (6.3, 6.4, 6.5)** có thể gộp thành một property về activatePremium function
5. **Date calculation properties (1.4, 9.3, 9.4)** có thể gộp thành một property về tính toán ngày hết hạn

**Properties to Keep:**

- Trial initialization round-trip
- QR code generation format
- Access control logic
- Premium activation with extension
- Payment history creation
- Firestore security rules (examples)
- UI component behaviors (examples)

### Property 1: Trial Initialization Round-Trip

*For any* user ID, when initializing a new user subscription, the system should create a Firestore document with `trialExpiryDate` set to exactly 5 days from the creation timestamp, and reading back that document should return the same expiry date.

**Validates: Requirements 1.1, 1.2**

### Property 2: QR Code URL Format Correctness

*For any* user ID and amount, the generated VietQR URL should:
- Match the pattern `https://img.vietqr.io/image/[BANK_ID]-[ACCOUNT_NO]-compact2.png?amount=[AMOUNT]&addInfo=[TRANSACTION_ID]&accountName=[NAME]`
- Contain `amount=3000` when amount is 3000
- Contain a properly URL-encoded transaction ID in format `TVU_CONNECT_ID_[userId]`
- Include all required query parameters

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**

### Property 3: Access Control Logic Consistency

*For any* user with subscription data, the `hasAccess` flag should be true if and only if:
- The current time is before `trialExpiryDate` (trial active), OR
- `isPremium` is true AND current time is before `premiumExpiryDate` (premium active)

**Validates: Requirements 1.3, 1.5, 5.1, 5.6, 9.3, 9.4**


### Property 4: Trial Days Calculation Accuracy

*For any* trial expiry date, the calculated `trialDaysLeft` should equal the ceiling of `(trialExpiryDate - currentTime) / (24 * 60 * 60 * 1000)`, with a minimum value of 0.

**Validates: Requirements 1.4**

### Property 5: Premium Activation Date Calculation

*For any* user and duration in days, calling `activatePremium(userId, durationDays)` should:
- Set `isPremium` to true
- If user has no active premium, set `premiumExpiryDate` to `currentTime + durationDays`
- If user has active premium, set `premiumExpiryDate` to `currentPremiumExpiry + durationDays`
- The calculated expiry date should be exactly `durationDays * 24 * 60 * 60 * 1000` milliseconds in the future

**Validates: Requirements 6.3, 6.4, 6.5**

### Property 6: Premium Extension Preserves Remaining Time

*For any* user with active premium (current expiry in the future), extending premium by N days should result in the new expiry being exactly N days after the previous expiry, not N days from now.

**Validates: Requirements 6.5**

### Property 7: Payment History Document Structure

*For any* created payment history document, it should contain all required fields: `userId`, `amount`, `transactionId`, `paymentDate`, `activationDate`, `expiryDate`, `status`, and all fields should have the correct data types (string, number, Timestamp, enum).

**Validates: Requirements 7.1, 7.2**

### Property 8: Payment History Sorting Order

*For any* list of payment history documents, when sorted by `paymentDate` in descending order, each document's `paymentDate` should be greater than or equal to the next document's `paymentDate`.

**Validates: Requirements 7.5**

### Property 9: Configuration Validation Before QR Generation

*For any* attempt to generate a QR code, if any required configuration field (`BANK_ID`, `ACCOUNT_NO`, `ACCOUNT_NAME`) is missing or empty, the function should throw an error and not return a URL.

**Validates: Requirements 8.3**

### Property 10: Subscription Data Persistence

*For any* user document in Firestore, it should contain the fields `isPremium`, `trialExpiryDate`, and `premiumExpiryDate` with the correct types (boolean, Timestamp, Timestamp|null).

**Validates: Requirements 9.1**

## Error Handling


### Error Scenarios

#### 1. Firestore Connection Errors

**Scenario:** Firestore không thể kết nối (offline, network issues)

**Handling:**
- `usePremiumStatus` hook sẽ sử dụng cached data từ lần load trước
- Hiển thị warning toast: "Đang sử dụng dữ liệu offline"
- Retry connection tự động khi network khôi phục
- Không block UI, cho phép user tiếp tục sử dụng với cached status

#### 2. Missing Configuration

**Scenario:** Environment variables cho bank account không được set

**Handling:**
- `generateVietQRCode()` throw error với message rõ ràng
- SubscriptionModal hiển thị error state: "Hệ thống thanh toán tạm thời không khả dụng"
- Log error chi tiết để admin debug
- Không expose sensitive config info trong error message

#### 3. Invalid User ID

**Scenario:** User ID không tồn tại hoặc null

**Handling:**
- `initializeUserSubscription()` throw error nếu userId empty
- `activatePremium()` throw error nếu user document không tồn tại
- `usePremiumStatus()` return default state với `hasAccess = false`
- Redirect user về login page nếu auth state invalid

#### 4. Payment Verification Failures

**Scenario:** Admin không tìm thấy transaction ID trong bank statement

**Handling:**
- Không tự động kích hoạt Premium
- Admin có thể manually check lại sau
- User có thể contact support với screenshot chuyển khoản
- Hệ thống log tất cả payment activation attempts

#### 5. Expired Premium Access

**Scenario:** User đang sử dụng app khi Premium hết hạn

**Handling:**
- `usePremiumStatus` hook detect thay đổi real-time
- Hiển thị toast notification: "Premium đã hết hạn"
- Redirect user về trang chính và show SubscriptionModal
- Không mất dữ liệu đang làm việc

#### 6. Concurrent Premium Activation

**Scenario:** Admin kích hoạt Premium cho cùng user nhiều lần đồng thời

**Handling:**
- Sử dụng Firestore transaction để đảm bảo atomic updates
- Mỗi activation đều extend thêm 7 ngày, không bị mất
- Log tất cả activations để audit trail

### Error Messages


**User-Facing Messages (Vietnamese):**

```typescript
const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không thể kết nối. Vui lòng kiểm tra internet.',
  CONFIG_MISSING: 'Hệ thống thanh toán tạm thời không khả dụng. Vui lòng thử lại sau.',
  TRIAL_EXPIRED: 'Thời gian dùng thử đã hết. Đóng góp 3.000 VNĐ để tiếp tục.',
  PREMIUM_EXPIRED: 'Premium đã hết hạn. Gia hạn ngay để tiếp tục sử dụng.',
  INVALID_USER: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  PAYMENT_PENDING: 'Thanh toán đang được xử lý. Vui lòng đợi 5-10 phút.',
};
```

**Developer-Facing Errors:**

```typescript
class SubscriptionError extends Error {
  constructor(
    message: string,
    public code: string,
    public userId?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

// Error codes
const ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CONFIG_MISSING: 'CONFIG_MISSING',
  FIRESTORE_ERROR: 'FIRESTORE_ERROR',
  INVALID_DURATION: 'INVALID_DURATION',
  ALREADY_PREMIUM: 'ALREADY_PREMIUM',
};
```

## Testing Strategy

### Dual Testing Approach

Hệ thống subscription payment yêu cầu cả **unit tests** và **property-based tests** để đảm bảo độ tin cậy cao:

- **Unit tests**: Kiểm tra các trường hợp cụ thể, edge cases, và error conditions
- **Property tests**: Xác minh các tính chất phổ quát với nhiều input ngẫu nhiên

### Property-Based Testing

**Library:** `fast-check` (JavaScript/TypeScript property-based testing library)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: platform-subscription-payment, Property {N}: {property_text}`


**Property Test Examples:**

```typescript
// Property 1: Trial Initialization Round-Trip
describe('Feature: platform-subscription-payment, Property 1: Trial initialization round-trip', () => {
  it('should create user with trial expiry exactly 5 days from now', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (userId) => {
        const beforeTime = Date.now();
        await initializeUserSubscription(userId);
        const afterTime = Date.now();
        
        const userDoc = await getDoc(doc(db, 'users', userId));
        const trialExpiry = userDoc.data()?.trialExpiryDate.toMillis();
        
        const expectedMin = beforeTime + 5 * 24 * 60 * 60 * 1000;
        const expectedMax = afterTime + 5 * 24 * 60 * 60 * 1000;
        
        return trialExpiry >= expectedMin && trialExpiry <= expectedMax;
      }),
      { numRuns: 100 }
    );
  });
});

// Property 2: QR Code URL Format
describe('Feature: platform-subscription-payment, Property 2: QR code URL format', () => {
  it('should generate valid VietQR URL with correct parameters', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1000, max: 100000 }), (userId, amount) => {
        const url = generateVietQRCode(userId, amount);
        
        // Check URL structure
        const urlPattern = /^https:\/\/img\.vietqr\.io\/image\/[^-]+-[^-]+-compact2\.png\?/;
        if (!urlPattern.test(url)) return false;
        
        // Check amount parameter
        if (!url.includes(`amount=${amount}`)) return false;
        
        // Check transaction ID
        const expectedTxId = `TVU_CONNECT_ID_${userId}`;
        if (!url.includes(encodeURIComponent(expectedTxId))) return false;
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// Property 3: Access Control Logic
describe('Feature: platform-subscription-payment, Property 3: Access control logic', () => {
  it('should grant access if trial OR premium is active', () => {
    fc.assert(
      fc.property(
        fc.date(),
        fc.boolean(),
        fc.date(),
        (trialExpiry, isPremium, premiumExpiry) => {
          const now = new Date();
          const isTrialActive = trialExpiry > now;
          const isPremiumActive = isPremium && premiumExpiry > now;
          
          const expectedAccess = isTrialActive || isPremiumActive;
          const actualAccess = calculateHasAccess(trialExpiry, isPremium, premiumExpiry);
          
          return expectedAccess === actualAccess;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Unit Testing


**Unit Test Coverage:**

```typescript
describe('subscriptionManager', () => {
  describe('initializeUserSubscription', () => {
    it('should create user document with trial expiry', async () => {
      // Test specific case
    });
    
    it('should not overwrite existing user', async () => {
      // Test idempotency
    });
    
    it('should throw error for empty userId', async () => {
      // Test error handling
    });
  });
  
  describe('activatePremium', () => {
    it('should activate premium for new user', async () => {
      // Test first-time activation
    });
    
    it('should extend premium for existing premium user', async () => {
      // Test extension logic
    });
    
    it('should handle expired premium correctly', async () => {
      // Test reactivation after expiry
    });
    
    it('should throw error for non-existent user', async () => {
      // Test error handling
    });
  });
  
  describe('generateVietQRCode', () => {
    it('should generate URL with default amount 3000', () => {
      // Test default parameter
    });
    
    it('should URL-encode special characters in userId', () => {
      // Test encoding
    });
    
    it('should throw error when config is missing', () => {
      // Test configuration validation
    });
  });
});

describe('usePremiumStatus', () => {
  it('should return loading state initially', () => {
    // Test loading state
  });
  
  it('should calculate trial days left correctly', () => {
    // Test date calculation
  });
  
  it('should update when Firestore data changes', async () => {
    // Test real-time updates
  });
  
  it('should handle null userId gracefully', () => {
    // Test edge case
  });
});

describe('SubscriptionModal', () => {
  it('should display trial days left', () => {
    // Test UI rendering
  });
  
  it('should toggle QR code visibility on button click', () => {
    // Test interaction
  });
  
  it('should call onClose when "Để sau" is clicked', () => {
    // Test callback
  });
});

describe('PremiumGuard', () => {
  it('should render children when hasAccess is true', () => {
    // Test access granted
  });
  
  it('should show lock overlay when hasAccess is false', () => {
    // Test access denied
  });
  
  it('should show trial warning toast when 1 day left', () => {
    // Test notification
  });
});
```

### Integration Testing


**End-to-End Scenarios:**

1. **New User Registration Flow**
   - Create account → Verify trial initialized → Access features → Check trial countdown

2. **Payment Flow**
   - Trial expires → Access blocked → Open modal → Generate QR → Verify URL format

3. **Premium Activation Flow**
   - Admin activates premium → Verify Firestore update → Check access restored → Verify payment history created

4. **Premium Extension Flow**
   - User with active premium → Admin extends → Verify expiry date extended correctly

5. **Trial Expiry Notification Flow**
   - Set trial to 1 day left → Launch app → Verify toast notification → Click action → Verify modal opens

### Manual Testing Checklist

**UI/UX Testing:**

- [ ] SubscriptionModal hiển thị đúng trên mobile và desktop
- [ ] QR code image load thành công
- [ ] Dark mode hoạt động đúng
- [ ] Animations mượt mà
- [ ] Text hiển thị đầy đủ không bị cắt
- [ ] Buttons responsive và có feedback khi click

**Payment Testing:**

- [ ] QR code có thể scan được bằng banking app
- [ ] Transaction ID hiển thị đúng format
- [ ] Chuyển khoản thành công với đúng số tiền
- [ ] Admin có thể tìm thấy transaction trong bank statement

**Access Control Testing:**

- [ ] User mới có thể truy cập tất cả features trong 5 ngày
- [ ] Sau 5 ngày, features bị block đúng cách
- [ ] Premium user có full access
- [ ] Expired premium user bị block lại

**Notification Testing:**

- [ ] Toast hiển thị khi còn 1 ngày trial
- [ ] Notification có action button hoạt động
- [ ] Không spam notifications

### Performance Testing

**Metrics to Monitor:**

- Firestore read operations per user session (target: < 10 reads)
- QR code generation time (target: < 100ms)
- Modal open animation smoothness (target: 60fps)
- Premium status check latency (target: < 200ms)

**Optimization Strategies:**

- Cache premium status locally với TTL 5 minutes
- Sử dụng Firestore onSnapshot thay vì polling
- Lazy load SubscriptionModal component
- Preload QR code image khi modal mở


## Security Considerations

### 1. Firestore Security Rules

**Rules for users collection:**

```javascript
match /users/{userId} {
  // Anyone can read user profiles (for display purposes)
  allow read: if isAuthenticated();
  
  // Users can only write their own non-premium fields
  allow update: if isAuthenticated() 
    && request.auth.uid == userId
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['isPremium', 'premiumExpiryDate']);
  
  // Only allow setting trialExpiryDate during creation
  allow create: if isAuthenticated()
    && request.auth.uid == userId
    && request.resource.data.trialExpiryDate is timestamp;
}
```

**Rules for paymentHistory collection:**

```javascript
match /paymentHistory/{paymentId} {
  // Users can only read their own payment history
  allow read: if isAuthenticated() 
    && resource.data.userId == request.auth.uid;
  
  // Users cannot create or modify payment history
  allow write: if false;
}
```

### 2. Admin-Only Operations

**Functions that require admin privileges:**

- `activatePremium()` - Chỉ admin được gọi
- Create/update paymentHistory documents - Chỉ admin hoặc Cloud Functions
- Update `isPremium` và `premiumExpiryDate` fields - Chỉ admin hoặc Cloud Functions

**Implementation:**

```typescript
// Check admin role before allowing premium activation
async function activatePremiumWithAuth(
  adminUserId: string,
  targetUserId: string,
  durationDays: number
): Promise<void> {
  // Verify admin role
  const adminDoc = await getDoc(doc(db, 'admins', adminUserId));
  if (!adminDoc.exists() || !adminDoc.data().isAdmin) {
    throw new Error('Unauthorized: Admin access required');
  }
  
  // Proceed with activation
  await activatePremium(targetUserId, durationDays);
}
```

### 3. Client-Side Validation

**Prevent tampering:**

- Không tin tưởng client-side date/time - luôn dùng `serverTimestamp()`
- Validate tất cả inputs trước khi gửi lên Firestore
- Không expose sensitive config (bank account) trong client code
- Sử dụng environment variables cho sensitive data

### 4. Transaction ID Security

**Format:** `TVU_CONNECT_ID_[userId]`

**Security measures:**

- Transaction ID là unique per user
- Không thể guess được transaction ID của user khác
- Admin verify bằng cách match transaction ID với userId
- Log tất cả payment verifications để audit

### 5. Rate Limiting

**Prevent abuse:**


```typescript
// Limit QR code generation requests
const QR_GENERATION_LIMIT = 10; // per minute
const qrGenerationCache = new Map<string, number>();

function generateVietQRCodeWithRateLimit(userId: string, amount: number): string {
  const now = Date.now();
  const lastRequest = qrGenerationCache.get(userId) || 0;
  
  if (now - lastRequest < 60000 / QR_GENERATION_LIMIT) {
    throw new Error('Too many requests. Please wait a moment.');
  }
  
  qrGenerationCache.set(userId, now);
  return generateVietQRCode(userId, amount);
}
```

## Implementation Phases

### Phase 1: Core Subscription Logic (Week 1)

**Tasks:**

1. Update `subscriptionManager.ts`:
   - Modify `initializeUserSubscription()` to use 5 days instead of 7
   - Update `generateVietQRCode()` with correct Agribank details
   - Add `createPaymentHistory()` function
   - Add configuration validation

2. Update `usePremiumStatus` hook:
   - Ensure correct calculation of trial/premium days
   - Add local caching logic
   - Handle edge cases (null values, expired dates)

3. Write unit tests for all functions

4. Write property-based tests for core properties (1-5)

**Deliverables:**
- Updated subscription manager with 5-day trial
- Comprehensive test coverage
- Documentation for functions

### Phase 2: UI Components (Week 1-2)

**Tasks:**

1. Update `SubscriptionModal`:
   - Change trial period display to 5 days
   - Update pricing display
   - Ensure QR code displays correctly
   - Add error states

2. Update `PremiumGuard`:
   - Add trial expiry notifications
   - Improve lock overlay UI
   - Add loading states

3. Create `PaymentHistory` component:
   - List view with sorting
   - Filter by status
   - Display current premium status

4. Write component tests (unit + integration)

**Deliverables:**
- Polished UI components
- Mobile-responsive design
- Component test coverage

### Phase 3: Admin Tools (Week 2)

**Tasks:**

1. Create admin panel for payment verification:
   - Search by transaction ID
   - Activate premium button
   - View payment history
   - Bulk operations

2. Add admin authentication:
   - Admin role checking
   - Secure API endpoints

3. Create admin documentation:
   - How to verify payments
   - How to handle disputes
   - Common issues and solutions

**Deliverables:**
- Admin panel UI
- Admin documentation
- Security audit

### Phase 4: Firestore Rules & Security (Week 2-3)

**Tasks:**

1. Update Firestore security rules:
   - Add rules for paymentHistory collection
   - Restrict premium field updates
   - Add validation rules

2. Deploy rules to production

3. Test rules with different user roles

4. Security audit and penetration testing

**Deliverables:**
- Production-ready security rules
- Security test report
- Deployment guide

### Phase 5: Testing & Optimization (Week 3)

**Tasks:**

1. End-to-end testing:
   - Complete user flows
   - Payment verification flow
   - Error scenarios

2. Performance optimization:
   - Reduce Firestore reads
   - Optimize caching
   - Improve load times

3. Manual QA testing:
   - UI/UX testing
   - Cross-browser testing
   - Mobile testing

4. Load testing:
   - Simulate concurrent users
   - Test Firestore quota limits

**Deliverables:**
- Test report
- Performance metrics
- Bug fixes

### Phase 6: Documentation & Launch (Week 3-4)

**Tasks:**

1. User documentation:
   - How to subscribe guide
   - FAQ
   - Troubleshooting

2. Developer documentation:
   - API reference
   - Architecture overview
   - Deployment guide

3. Monitoring setup:
   - Error tracking
   - Analytics
   - Alerts

4. Soft launch:
   - Beta testing with small group
   - Collect feedback
   - Fix issues

5. Full launch:
   - Announce to all users
   - Monitor metrics
   - Support users

**Deliverables:**
- Complete documentation
- Monitoring dashboard
- Launch announcement

## Monitoring & Analytics

### Key Metrics to Track

