# Implementation Plan

- [x] 1. Viết bug condition exploration test
  - **Property 1: Bug Condition** - Tour Không Khởi Động Trên Mobile Từ Settings
  - **QUAN TRỌNG**: Test này PHẢI FAIL trên code chưa sửa - failure xác nhận bug tồn tại
  - **KHÔNG cố gắng sửa test hoặc code khi nó fail**
  - **LƯU Ý**: Test này encode expected behavior - nó sẽ validate fix khi pass sau khi implementation
  - **MỤC TIÊU**: Phát hiện counterexamples chứng minh bug tồn tại
  - **Scoped PBT Approach**: Scope property đến concrete failing case(s) để đảm bảo reproducibility
  - Test implementation details từ Bug Condition trong design
  - Test rằng khi user trên mobile (width < 768px) click "Xem hướng dẫn sử dụng" trong Settings, tour PHẢI khởi động thành công
  - Test assertions phải match Expected Behavior Properties từ design:
    - `result.tourStarted = true`
    - `result.elementsFound >= 7` (tất cả 7 navigation items)
    - `result.firstStepVisible = true`
    - `no_error(result)`
  - Chạy test trên code CHƯA SỬA (App.tsx với delay 100ms)
  - **KẾT QUẢ MONG ĐỢI**: Test FAILS (đây là đúng - nó chứng minh bug tồn tại)
  - Document counterexamples tìm được (ví dụ: "Tour không start, elements found: 0/7")
  - Đánh dấu task hoàn thành khi test đã viết, chạy, và failure đã được document
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Viết preservation property tests (TRƯỚC KHI implement fix)
  - **Property 2: Preservation** - Tour Hoạt Động Bình Thường Ở Các Trường Hợp Khác
  - **QUAN TRỌNG**: Tuân theo observation-first methodology
  - Quan sát hành vi trên code CHƯA SỬA cho non-buggy inputs (các trường hợp tour đang hoạt động tốt)
  - Viết property-based tests capture observed behavior patterns từ Preservation Requirements
  - Test cases:
    - Desktop tour trigger từ Settings (width >= 768px) → phải hoạt động bình thường
    - Mobile tour trigger từ first-login flow → phải hoạt động bình thường
    - Tour trigger khi đã ở Home view (không cần chuyển view) → phải hiển thị ngay
    - Tour skip/close behavior → phải lưu trạng thái vào localStorage
    - Tour step navigation (Next, Back, Skip buttons) → phải hoạt động như cũ
  - Property-based testing generates nhiều test cases tự động cho stronger guarantees
  - Chạy tests trên code CHƯA SỬA
  - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận baseline behavior cần preserve)
  - Đánh dấu task hoàn thành khi tests đã viết, chạy, và passing trên unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix tour trigger timing cho mobile

  - [x] 3.1 Implement the fix trong App.tsx
    - Mở file `src/App.tsx`, tìm `onShowTour` handler trong Settings case (khoảng line 601-607)
    - Thay đổi logic từ fixed 100ms delay sang adaptive delay dựa trên device type
    - Thêm element verification logic: check xem tất cả `[data-tour]` elements đã tồn tại trong DOM chưa
    - Implement retry mechanism: nếu elements chưa ready, retry 3-5 lần với interval 100ms
    - Tăng delay time cho mobile: 300-400ms thay vì 100ms
    - Desktop giữ nguyên hoặc dùng delay ngắn hơn: 100-150ms
    - Thêm fallback error handling: nếu sau tất cả retries vẫn không tìm thấy elements, show toast error
    - Optimize cho mobile: scroll to top, ensure bottom navigation visible
    - Code changes:
      ```typescript
      onShowTour={() => {
        setView('home');
        const isMobile = window.innerWidth < 768;
        const delay = isMobile ? 350 : 100;
        
        setTimeout(() => {
          // Verify elements exist
          const checkElements = () => {
            const elements = document.querySelectorAll('[data-tour]');
            return elements.length >= 7;
          };
          
          // Retry mechanism
          let retries = 0;
          const maxRetries = 5;
          
          const tryStartTour = () => {
            if (checkElements()) {
              setShowOnboarding(true);
            } else if (retries < maxRetries) {
              retries++;
              setTimeout(tryStartTour, 100);
            } else {
              // Fallback error
              console.error('Tour elements not found after retries');
              // Show toast error if available
            }
          };
          
          tryStartTour();
        }, delay);
      }}
      ```
    - _Bug_Condition: isBugCondition(input) where input.isMobile=true AND input.triggerSource='settings' AND input.currentView!='home' AND input.elementsReady=false_
    - _Expected_Behavior: expectedBehavior(result) from design - tour khởi động thành công với tất cả elements found_
    - _Preservation: Preservation Requirements from design - desktop, first-login, already-on-home cases không thay đổi_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test bây giờ pass
    - **Property 1: Expected Behavior** - Tour Khởi Động Thành Công Trên Mobile
    - **QUAN TRỌNG**: Chạy lại CÙNG test từ task 1 - KHÔNG viết test mới
    - Test từ task 1 encode expected behavior
    - Khi test này pass, nó xác nhận expected behavior đã được satisfy
    - Chạy bug condition exploration test từ step 1
    - **KẾT QUẢ MONG ĐỢI**: Test PASSES (xác nhận bug đã được fix)
    - Verify tour starts successfully trên mobile từ Settings
    - Verify tất cả 7 elements được tìm thấy
    - Verify first step visible
    - _Requirements: Expected Behavior Properties từ design_

  - [x] 3.3 Verify preservation tests vẫn pass
    - **Property 2: Preservation** - Tour Hoạt Động Bình Thường Ở Các Trường Hợp Khác
    - **QUAN TRỌNG**: Chạy lại CÙNG tests từ task 2 - KHÔNG viết tests mới
    - Chạy preservation property tests từ step 2
    - **KẾT QUẢ MONG ĐỢI**: Tests PASS (xác nhận không có regressions)
    - Confirm desktop tour từ Settings vẫn hoạt động
    - Confirm mobile tour từ first-login vẫn hoạt động
    - Confirm tour khi đã ở Home vẫn hiển thị ngay
    - Confirm tour skip/close vẫn lưu state
    - Confirm tour navigation buttons vẫn hoạt động

- [x] 4. Checkpoint - Đảm bảo tất cả tests pass
  - Verify tất cả bug condition tests pass (mobile tour từ Settings hoạt động)
  - Verify tất cả preservation tests pass (existing functionality không thay đổi)
  - Manual testing trên mobile device thật hoặc Chrome DevTools mobile emulation:
    - Mở Settings → Click "Xem hướng dẫn sử dụng" → Verify tour khởi động
    - Test trên nhiều device sizes: iPhone 13 (390px), Samsung Galaxy (360px), iPad Mini (768px)
    - Verify tour hiển thị đúng 7 steps targeting bottom navigation
    - Verify có thể navigate qua các steps (Next, Back)
    - Verify có thể Skip hoặc Complete tour
  - Manual testing trên desktop để verify không có regression:
    - Mở Settings → Click "Xem hướng dẫn sử dụng" → Verify tour khởi động bình thường
    - Verify tour targeting top navigation
  - Kiểm tra console logs: không có errors liên quan đến tour
  - Hỏi user nếu có câu hỏi hoặc cần testing thêm
