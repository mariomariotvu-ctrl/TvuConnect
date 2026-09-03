# Thiết Kế Sửa Lỗi: Nút Gửi Tin Nhắn Vẫn Hiển Thị Loading

## Tổng Quan

Lỗi này xảy ra khi nút gửi tin nhắn tiếp tục hiển thị icon loading (Loader2 spinner) sau khi tin nhắn đã được gửi thành công và hiển thị trong danh sách chat. Mặc dù code đã có `finally { setSending(false); }` nhưng trong một số trường hợp state `sending` không được reset đúng cách, dẫn đến nút bị "đóng băng" ở trạng thái loading.

Chiến lược sửa lỗi tập trung vào việc đảm bảo state `sending` luôn được reset về `false` sau mọi tình huống gửi tin nhắn (thành công hoặc thất bại), và xử lý các edge cases như component unmount, async state updates, và race conditions.

## Từ Điển Thuật Ngữ

- **Bug_Condition (C)**: Điều kiện kích hoạt lỗi - khi state `sending` vẫn là `true` sau khi tin nhắn đã được gửi thành công
- **Property (P)**: Hành vi mong muốn - state `sending` phải được reset về `false` ngay sau khi tin nhắn được gửi thành công hoặc thất bại
- **Preservation**: Tất cả các hành vi validation, rate limiting, content moderation, và UI interactions khác phải được giữ nguyên
- **handleSendMessage**: Hàm async trong `src/components/Chat.tsx` xử lý việc gửi tin nhắn văn bản và tin nhắn thoại
- **sending**: State boolean kiểm soát việc hiển thị loading indicator và disable/enable nút gửi
- **setSending**: State setter function để cập nhật state `sending`

## Chi Tiết Lỗi

### Điều Kiện Lỗi (Bug Condition)

Lỗi xảy ra khi người dùng gửi tin nhắn (văn bản hoặc thoại) và tin nhắn đã được thêm vào Firestore collection 'messages' thành công, nhưng state `sending` không được reset về `false`. Điều này khiến nút gửi tiếp tục hiển thị loading spinner và bị disabled, ngăn người dùng gửi tin nhắn tiếp theo.

**Đặc Tả Chính Thức:**
```
FUNCTION isBugCondition(messageEvent)
  INPUT: messageEvent gồm { messageText, audioData, sendResult }
  OUTPUT: boolean
  
  RETURN (sendResult.status == 'success')
         AND (sendResult.messageAddedToFirestore == true)
         AND (sendResult.messageVisibleInUI == true)
         AND (componentState.sending == true)
         AND (buttonState.showsLoadingSpinner == true)
         AND (buttonState.disabled == true)
END FUNCTION
```

### Các Ví Dụ Cụ Thể

- **Ví dụ 1 - Tin nhắn văn bản**: Người dùng nhập "Xin chào", nhấn nút gửi. Tin nhắn xuất hiện trong chat với timestamp và checkmark, nhưng nút gửi vẫn hiển thị Loader2 spinner thay vì icon Send.

- **Ví dụ 2 - Tin nhắn thoại**: Người dùng ghi âm 5 giây, nhấn nút gửi. Tin nhắn thoại "[Tin nhắn thoại]" xuất hiện trong chat với play button, nhưng nút gửi vẫn disabled và hiển thị loading.

- **Ví dụ 3 - Gửi nhiều tin nhắn nhanh**: Người dùng gửi tin nhắn đầu tiên thành công, nhưng không thể gửi tin nhắn thứ hai vì nút vẫn disabled do `sending` vẫn là `true`.

- **Edge case - Component unmount**: Người dùng gửi tin nhắn, sau đó nhanh chóng chuyển sang chat khác hoặc quay lại trang trước. State `sending` có thể không được reset nếu component bị unmount trước khi `finally` block được thực thi.

## Hành Vi Mong Muốn

### Yêu Cầu Bảo Toàn (Preservation Requirements)

**Các Hành Vi Không Được Thay Đổi:**
- Tất cả các validation checks (tin nhắn rỗng, kích thước file âm thanh, độ dài tin nhắn) phải tiếp tục hoạt động chính xác
- Rate limiting (10 tin nhắn/phút) phải tiếp tục được enforce
- Content moderation (kiểm tra nội dung vi phạm) phải tiếp tục hoạt động
- Kiểm tra block status (isBlockedByMe, isBlockedByThem) phải tiếp tục hoạt động
- Kiểm tra giới hạn 100 tin nhắn mỗi conversation phải tiếp tục hoạt động
- Việc cập nhật conversation document với lastMessage và lastMessageAt phải tiếp tục hoạt động
- Việc xóa typing status sau khi gửi phải tiếp tục hoạt động
- Việc xóa nội dung ô input sau khi gửi tin nhắn văn bản phải tiếp tục hoạt động
- Toast error messages cho các trường hợp lỗi phải tiếp tục hiển thị đúng
- Nút gửi phải tiếp tục disabled khi `sending` = true HOẶC tin nhắn rỗng

**Phạm Vi:**
Tất cả các inputs và tương tác KHÔNG liên quan đến việc reset state `sending` sau khi gửi tin nhắn phải hoạt động chính xác như hiện tại. Bao gồm:
- Mouse clicks và keyboard interactions với nút gửi
- Recording controls (bắt đầu, dừng, hủy ghi âm)
- Emoji picker interactions
- Profile card display và interactions
- Scroll behavior và lazy loading messages
- Block/unblock functionality
- Typing indicators

## Nguyên Nhân Gốc Rễ Giả Thuyết

Dựa trên phân tích code và bug description, các nguyên nhân có khả năng cao nhất là:

1. **Async State Update Race Condition**: Mặc dù có `finally { setSending(false); }`, nếu component bị unmount ngay sau khi tin nhắn được gửi (ví dụ: người dùng navigate away), React sẽ cảnh báo "Can't perform a React state update on an unmounted component" và state update có thể bị bỏ qua. Code hiện tại không có cleanup để xử lý trường hợp này.

2. **Return Sớm Trong Try Block**: Có một vị trí trong code (dòng 364) có `setSending(false); return;` khi đạt giới hạn 100 tin nhắn. Nếu có return sớm khác không được xử lý đúng, `finally` block sẽ không được gọi (mặc dù trong JavaScript, finally luôn chạy ngay cả khi có return).

3. **Error Handling Không Đầy Đủ**: Nếu có lỗi xảy ra TRƯỚC `try` block (ví dụ: trong các validation checks) và code vô tình gọi `setSending(true)` trước đó, state sẽ không được reset. Tuy nhiên, khi review code, tất cả validation checks đều return TRƯỚC `setSending(true)`, nên khả năng này thấp.

4. **Stale Closure hoặc State Not Updating**: Trong một số edge cases, React có thể không trigger re-render sau khi `setSending(false)` được gọi, dẫn đến UI không cập nhật mặc dù state đã thay đổi.

## Các Thuộc Tính Chính Xác (Correctness Properties)

Property 1: Bug Condition - State Sending Được Reset Sau Khi Gửi Thành Công

_For any_ tin nhắn (văn bản hoặc thoại) được gửi thành công và thêm vào Firestore collection 'messages', hàm handleSendMessage_fixed PHẢI reset state `sending` về `false` ngay lập tức trong `finally` block, đảm bảo nút gửi hiển thị icon Send và được enable lại để người dùng có thể gửi tin nhắn tiếp theo.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Validation và Error Handling Không Đổi

_For any_ input KHÔNG phải là trường hợp gửi tin nhắn thành công (tin nhắn rỗng, vi phạm validation, bị block, vượt rate limit, vượt giới hạn 100 tin nhắn, hoặc xảy ra lỗi trong quá trình gửi), hàm handleSendMessage_fixed PHẢI hoạt động giống hệt hàm handleSendMessage_original, bao gồm: return sớm trước khi gọi `setSending(true)` cho validation errors, hiển thị toast messages phù hợp, và reset `sending` về `false` trong catch/finally blocks cho runtime errors.

**Validates: Requirements 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12**

## Triển Khai Sửa Lỗi

### Các Thay Đổi Cần Thiết

Giả sử phân tích root cause của chúng ta đúng:

**File**: `src/components/Chat.tsx`

**Function**: `handleSendMessage`

**Các Thay Đổi Cụ Thể**:

1. **Thêm Mounted Check**: Sử dụng `useRef` để track trạng thái mounted của component và chỉ update state nếu component vẫn còn mounted
   - Thêm `const isMountedRef = useRef(true);` trong component
   - Thêm cleanup trong `useEffect`: `return () => { isMountedRef.current = false; }`
   - Wrap `setSending(false)` trong condition: `if (isMountedRef.current) setSending(false);`

2. **Đảm Bảo Finally Block Luôn Chạy**: Kiểm tra tất cả các đường return trong `try` block để đảm bảo không có code nào bypass `finally` block
   - Xác nhận rằng `setSending(false); return;` ở dòng 364 không cần thiết vì `finally` block sẽ tự động chạy
   - Remove `setSending(false);` trước `return` và chỉ giữ `return;`

3. **Thêm Defensive State Reset**: Thêm explicit state reset trong các vị trí quan trọng để đảm bảo robustness
   - Sau `await addDoc(...)` thành công, có thể thêm comment để clarify rằng `finally` block sẽ xử lý reset
   - Trong `catch` block, đảm bảo không có logic nào block việc thực thi tiếp tục đến `finally`

4. **Thêm Logging Để Debug**: Thêm debug logs để track state transitions
   - Log khi `setSending(true)` được gọi
   - Log khi `setSending(false)` được gọi trong `finally`
   - Log nếu component unmounted trong quá trình gửi tin nhắn

5. **Force Re-render Nếu Cần**: Trong trường hợp state update không trigger re-render, có thể cần force update
   - Sử dụng `useState` với object thay vì boolean: `const [sendingState, setSendingState] = useState({ sending: false, timestamp: 0 })`
   - Hoặc sử dụng `useReducer` để đảm bảo re-render luôn xảy ra

## Chiến Lược Testing

### Phương Pháp Validation

Chiến lược testing tuân theo phương pháp hai giai đoạn: đầu tiên, tạo counterexamples chứng minh lỗi trên code chưa sửa, sau đó xác minh fix hoạt động đúng và bảo toàn hành vi hiện có.

### Kiểm Tra Điều Kiện Lỗi Khám Phá (Exploratory Bug Condition Checking)

**Mục Tiêu**: Tạo counterexamples chứng minh lỗi TRƯỚC KHI triển khai fix. Xác nhận hoặc bác bỏ phân tích root cause. Nếu bác bỏ, chúng ta sẽ cần phân tích lại.

**Kế Hoạch Test**: Viết tests mô phỏng việc gửi tin nhắn (văn bản và thoại) và assert rằng state `sending` vẫn là `true` sau khi tin nhắn được thêm vào Firestore. Chạy tests trên code CHƯA SỬA để quan sát failures và hiểu root cause.

**Test Cases**:
1. **Test Tin Nhắn Văn Bản**: Gọi `handleSendMessage` với tin nhắn văn bản hợp lệ, mock Firestore `addDoc` thành công, assert `sending === true` sau khi promise resolve (sẽ FAIL trên unfixed code nếu lỗi tồn tại)
2. **Test Tin Nhắn Thoại**: Gọi `handleSendMessage` với audioData, mock Firestore thành công, assert `sending === true` sau promise resolve (sẽ FAIL trên unfixed code)
3. **Test Component Unmount**: Gọi `handleSendMessage`, unmount component ngay sau khi gọi `addDoc`, assert không có warning "Can't perform state update on unmounted component" (sẽ FAIL trên unfixed code)
4. **Test Gửi Nhiều Tin Nhắn Nhanh**: Gọi `handleSendMessage` hai lần liên tiếp, assert lần gọi thứ hai được reject do `sending === true` (có thể FAIL nếu state không reset)

**Counterexamples Mong Đợi**:
- State `sending` vẫn là `true` sau khi tin nhắn gửi thành công
- Nguyên nhân có thể: component unmount trước khi `finally` chạy, state update không trigger re-render, hoặc race condition trong async operations

### Kiểm Tra Fix (Fix Checking)

**Mục Tiêu**: Xác minh rằng với tất cả inputs có điều kiện lỗi, hàm đã sửa tạo ra hành vi mong muốn.

**Pseudocode:**
```
FOR ALL messageEvent WHERE isBugCondition(messageEvent) DO
  result := handleSendMessage_fixed(messageEvent)
  ASSERT result.componentState.sending == false
  ASSERT result.buttonState.showsLoadingSpinner == false
  ASSERT result.buttonState.disabled == false (nếu có tin nhắn mới)
END FOR
```

### Kiểm Tra Bảo Toàn (Preservation Checking)

**Mục Tiêu**: Xác minh rằng với tất cả inputs KHÔNG có điều kiện lỗi, hàm đã sửa tạo ra kết quả giống hệt hàm gốc.

**Pseudocode:**
```
FOR ALL messageEvent WHERE NOT isBugCondition(messageEvent) DO
  ASSERT handleSendMessage_original(messageEvent) = handleSendMessage_fixed(messageEvent)
END FOR
```

**Phương Pháp Testing**: Property-based testing được khuyến nghị cho preservation checking vì:
- Nó tự động tạo nhiều test cases trên toàn bộ input domain
- Nó bắt được các edge cases mà manual unit tests có thể bỏ sót
- Nó cung cấp đảm bảo mạnh mẽ rằng hành vi không thay đổi cho tất cả non-buggy inputs

**Kế Hoạch Test**: Quan sát hành vi trên code CHƯA SỬA trước cho các validation checks và error cases, sau đó viết property-based tests để capture hành vi đó.

**Test Cases**:
1. **Preservation - Validation Checks**: Xác minh tin nhắn rỗng, vi phạm validation, và content moderation vẫn hoạt động đúng sau fix
2. **Preservation - Rate Limiting**: Xác minh rate limiting (10 tin nhắn/phút) vẫn hoạt động đúng
3. **Preservation - Block Status**: Xác minh kiểm tra block status vẫn hoạt động và hiển thị toast đúng
4. **Preservation - Error Handling**: Xác minh các lỗi Firestore (permission-denied, unavailable) vẫn được xử lý đúng và reset `sending` về `false`

### Unit Tests

- Test state `sending` được reset về `false` sau khi gửi tin nhắn văn bản thành công
- Test state `sending` được reset về `false` sau khi gửi tin nhắn thoại thành công
- Test state `sending` được reset về `false` khi có lỗi trong quá trình gửi
- Test không có warning khi component unmount trong quá trình gửi tin nhắn
- Test nút gửi hiển thị đúng icon (Send vs Loader2) dựa trên state `sending`
- Test nút gửi disabled đúng cách (khi `sending` = true hoặc tin nhắn rỗng)

### Property-Based Tests

- Generate random tin nhắn hợp lệ và verify state `sending` luôn được reset về `false` sau khi gửi
- Generate random validation errors và verify hành vi validation không thay đổi sau fix
- Generate random error scenarios (Firestore errors, network errors) và verify error handling không thay đổi
- Test với nhiều message lengths, emoji combinations, và special characters để đảm bảo robustness

### Integration Tests

- Test toàn bộ flow gửi tin nhắn từ input đến hiển thị trong UI với state management đúng
- Test gửi nhiều tin nhắn liên tiếp và verify mỗi tin nhắn reset state đúng cách
- Test chuyển đổi giữa các conversations và verify state không bị leak giữa các conversations
- Test unmount component trong các stages khác nhau của message sending flow
