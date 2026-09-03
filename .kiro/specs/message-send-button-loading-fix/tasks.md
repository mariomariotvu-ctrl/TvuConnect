# Implementation Plan

## Overview

Lỗi này xảy ra khi nút gửi tin nhắn tiếp tục hiển thị icon loading sau khi tin nhắn đã được gửi thành công. Chiến lược sửa lỗi tập trung vào việc đảm bảo state `sending` luôn được reset về `false` sau mọi tình huống, và xử lý các edge cases như component unmount và async state updates.

## Tasks

- [x] 1. Viết bug condition exploration test
  - **Property 1: Bug Condition** - State Sending Không Reset Sau Khi Gửi Thành Công
  - **QUAN TRỌNG**: Test này PHẢI FAIL trên code chưa sửa - failure xác nhận lỗi tồn tại
  - **KHÔNG cố gắng sửa test hoặc code khi test fail**
  - **LÚU Ý**: Test này mô tả hành vi mong muốn - nó sẽ validate fix khi pass sau khi implement
  - **MỤC TIÊU**: Tạo counterexamples chứng minh lỗi tồn tại
  - **Phương pháp Scoped PBT**: Scope property vào các trường hợp cụ thể bị lỗi để đảm bảo tái hiện được
  - Test rằng sau khi gửi tin nhắn văn bản thành công (addDoc thành công), state `sending` PHẢI là `false`
  - Test rằng sau khi gửi tin nhắn thoại thành công (addDoc thành công), state `sending` PHẢI là `false`
  - Test rằng không có warning "Can't perform state update on unmounted component" khi unmount ngay sau gửi
  - Test rằng có thể gửi tin nhắn thứ hai ngay sau khi tin nhắn đầu tiên gửi thành công
  - Chạy test trên code CHƯA SỬA
  - **KẾT QUẢ MONG ĐỢI**: Test FAIL (điều này đúng - nó chứng minh lỗi tồn tại)
  - Document các counterexamples tìm được để hiểu root cause
  - Đánh dấu task hoàn thành khi test đã được viết, chạy, và failure đã được ghi lại
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Viết preservation property tests (TRƯỚC KHI implement fix)
  - **Property 2: Preservation** - Validation và Error Handling Không Đổi
  - **QUAN TRỌNG**: Tuân theo phương pháp observation-first
  - Quan sát hành vi trên code CHƯA SỬA cho các non-buggy inputs
  - Viết property-based tests capture các hành vi đã quan sát từ Preservation Requirements
  - Property-based testing tạo nhiều test cases tự động để đảm bảo mạnh mẽ hơn
  - Test validation checks: tin nhắn rỗng, content moderation, validateMessage vẫn hoạt động đúng
  - Test rate limiting: vượt quá 10 tin nhắn/phút vẫn bị reject và hiển thị toast đúng
  - Test block status: isBlockedByMe và isBlockedByThem vẫn hoạt động và hiển thị toast phù hợp
  - Test giới hạn 100 tin nhắn: vẫn hiển thị toast và KHÔNG gọi setSending(true)
  - Test error handling: permission-denied và unavailable errors vẫn hiển thị toast đúng và reset sending
  - Test UI state: nút disabled khi sending=true HOẶC tin nhắn rỗng, ô input disabled khi sending=true
  - Test side effects: setNewMessage('') cho text messages, conversation update, typing status clear
  - Chạy tests trên code CHƯA SỬA
  - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận hành vi baseline cần bảo toàn)
  - Đánh dấu task hoàn thành khi tests đã viết, chạy, và pass trên code chưa sửa
  - _Requirements: 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [x] 3. Sửa lỗi nút gửi tin nhắn vẫn hiển thị loading

  - [x] 3.1 Implement fix trong src/components/Chat.tsx
    - Thêm mounted check sử dụng useRef để track trạng thái mounted của component
    - Thêm cleanup trong useEffect: `return () => { isMountedRef.current = false; }`
    - Wrap setSending(false) trong condition: `if (isMountedRef.current) setSending(false);`
    - Kiểm tra và loại bỏ setSending(false) không cần thiết trước return statements (dòng 364) vì finally block tự động chạy
    - Đảm bảo finally block luôn được thực thi cho mọi đường return trong try block
    - Thêm debug logs để track state transitions (setSending(true), setSending(false), unmount events)
    - Xem xét sử dụng useState với object hoặc useReducer nếu cần force re-render
    - _Bug_Condition: isBugCondition(messageEvent) where messageEvent.sendResult.status == 'success' AND componentState.sending == true_
    - _Expected_Behavior: State sending PHẢI được reset về false sau khi tin nhắn gửi thành công, nút hiển thị icon Send và enabled_
    - _Preservation: Tất cả validation checks, rate limiting, content moderation, block checks, error handling, và UI interactions phải hoạt động giống hệt như trước_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [x] 3.2 Verify bug condition exploration test giờ đây pass
    - **Property 1: Expected Behavior** - State Sending Reset Đúng Cách
    - **QUAN TRỌNG**: Chạy lại test GIỐNG HỆT từ task 1 - KHÔNG viết test mới
    - Test từ task 1 mô tả hành vi mong muốn
    - Khi test này pass, nó xác nhận hành vi mong muốn đã được thỏa mãn
    - Chạy bug condition exploration test từ task 1
    - **KẾT QUẢ MONG ĐỢI**: Test PASS (xác nhận lỗi đã được sửa)
    - _Requirements: Expected Behavior Properties từ design_

  - [x] 3.3 Verify preservation tests vẫn pass
    - **Property 2: Preservation** - Validation và Error Handling Không Đổi
    - **QUAN TRỌNG**: Chạy lại tests GIỐNG HỆT từ task 2 - KHÔNG viết tests mới
    - Chạy preservation property tests từ task 2
    - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận không có regressions)
    - Xác nhận tất cả tests vẫn pass sau fix (không có regressions)

- [x] 4. Checkpoint - Đảm bảo tất cả tests pass
  - Chạy tất cả tests (bug condition + preservation) và verify tất cả đều pass
  - Test thủ công flow gửi tin nhắn: văn bản, thoại, nhiều tin nhắn liên tiếp
  - Test edge cases: unmount component, chuyển conversations, validation errors
  - Verify nút gửi hiển thị đúng icon (Send/Loader2) và enabled/disabled đúng cách
  - Verify không có console warnings về state updates on unmounted components
  - Hỏi user nếu có câu hỏi phát sinh

## Notes

- File cần sửa: `src/components/Chat.tsx`
- Dùng `useRef` để track mounted state, tránh warning "Can't perform state update on unmounted component"
- `finally` block đảm bảo `setSending(false)` luôn chạy dù success hay error
- Chạy tests bằng `npx vitest --run`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
