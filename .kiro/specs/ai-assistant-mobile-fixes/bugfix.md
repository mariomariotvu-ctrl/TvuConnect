# Bugfix Requirements Document

## Introduction

Tính năng AI Assistant (TVU Buddy) trong tab Khám phá có nhiều vấn đề về trải nghiệm người dùng trên mobile, đặc biệt liên quan đến keyboard interaction, scroll behavior, và layout stability. Các vấn đề này ảnh hưởng nghiêm trọng đến khả năng sử dụng của người dùng khi chat với AI trên thiết bị di động.

**Tác động:**
- User không thấy được input field khi gõ tin nhắn
- Scroll behavior gây khó chịu và không tự nhiên
- Layout shift khi keyboard mở/đóng
- Touch interactions không mượt mà như native app
- Loading state có thể che mất input area

**File liên quan:**
- `src/components/AIAssistant.tsx` - Component chính chứa UI và logic
- `src/components/MapView.tsx` - Container component với tab switching
- `src/utils/geminiAI.ts` - AI API logic (không cần sửa)

## Bug Analysis

### Current Behavior (Defect)

#### 1. Input Field Visibility Issues

1.1 WHEN user taps vào input field trên mobile THEN keyboard mở lên và che mất input field, user không thấy mình đang gõ gì

1.2 WHEN keyboard đang mở và user đang gõ THEN input field bị ẩn phía dưới keyboard, user phải scroll thủ công để thấy

1.3 WHEN user gửi tin nhắn và keyboard vẫn mở THEN input field vẫn bị che, user không thấy được kết quả

#### 2. Scroll Behavior Conflicts

1.4 WHEN user chuyển sang AI tab THEN component thực hiện nhiều lần `scrollToTop` aggressive (4-5 lần với các delay khác nhau), gây conflict với scroll tự nhiên

1.5 WHEN user đang scroll đọc tin nhắn cũ THEN scroll bị reset về top một cách bất ngờ do các timer `scrollToTop` vẫn đang chạy

1.6 WHEN AI trả lời tin nhắn mới THEN auto scroll to bottom xung đột với user's manual scroll, gây trải nghiệm không mượt

#### 3. Height Calculation Issues

1.7 WHEN keyboard mở trên mobile THEN component sử dụng `100dvh` nhưng không adjust cho keyboard height, gây layout shift và content bị che

1.8 WHEN keyboard đóng lại THEN height không được recalculate đúng, để lại white space hoặc content bị cắt

1.9 WHEN user rotate device (portrait ↔ landscape) THEN height calculation không update, gây layout broken

#### 4. Touch Interaction Issues

1.10 WHEN user tap vào quick reply buttons THEN không có visual feedback (ripple effect, scale animation), cảm giác không responsive

1.11 WHEN user tap vào send button THEN không có touch feedback, user không chắc đã tap thành công

1.12 WHEN user double-tap vào text THEN browser zoom in (default behavior chưa bị prevent), gây khó chịu

#### 5. Loading State Overlap

1.13 WHEN AI đang trả lời (loading state visible) THEN loading indicator có thể che mất input area, user không thể gửi tin nhắn tiếp

1.14 WHEN loading message hiển thị THEN nó có thể đẩy input field ra khỏi viewport, user phải scroll để thấy

### Expected Behavior (Correct)

#### 1. Input Field Always Visible

2.1 WHEN user taps vào input field trên mobile THEN input field SHALL automatically scroll into view và remain visible above keyboard

2.2 WHEN keyboard đang mở và user đang gõ THEN input field SHALL stay visible và centered trong viewport available space

2.3 WHEN user gửi tin nhắn và keyboard vẫn mở THEN input field SHALL remain visible và ready cho tin nhắn tiếp theo

#### 2. Smooth Scroll Behavior

2.4 WHEN user chuyển sang AI tab THEN component SHALL thực hiện scroll to top một lần duy nhất, không có multiple aggressive attempts

2.5 WHEN user đang scroll đọc tin nhắn cũ THEN scroll SHALL không bị interrupt hoặc reset bất ngờ

2.6 WHEN AI trả lời tin nhắn mới THEN auto scroll to bottom SHALL chỉ trigger nếu user đang ở gần bottom (within 100px), không interrupt manual scroll

#### 3. Stable Height Calculation

2.7 WHEN keyboard mở trên mobile THEN component height SHALL adjust to `window.visualViewport.height` để account cho keyboard

2.8 WHEN keyboard đóng lại THEN height SHALL smoothly transition về full viewport height without jarring layout shift

2.9 WHEN user rotate device THEN height SHALL recalculate immediately và maintain scroll position

#### 4. Optimized Touch Interactions

2.10 WHEN user tap vào quick reply buttons THEN SHALL show immediate visual feedback (scale down 0.95, opacity 0.8) với transition 150ms

2.11 WHEN user tap vào send button THEN SHALL show touch feedback và disable button during loading để prevent double-tap

2.12 WHEN user double-tap vào text THEN SHALL prevent default browser zoom behavior với `touch-action: manipulation`

#### 5. Non-Blocking Loading State

2.13 WHEN AI đang trả lời THEN loading indicator SHALL display trong messages area, không che input field

2.14 WHEN loading message hiển thị THEN input area SHALL remain fixed at bottom và always accessible

### Unchanged Behavior (Regression Prevention)

#### 1. Desktop Experience

3.1 WHEN user sử dụng AI Assistant trên desktop THEN scroll behavior SHALL CONTINUE TO work như hiện tại (scroll to top on tab change, auto scroll on AI response)

3.2 WHEN user sử dụng AI Assistant trên desktop THEN height calculation SHALL CONTINUE TO use `100dvh` without keyboard adjustments

3.3 WHEN user sử dụng AI Assistant trên desktop THEN hover effects và mouse interactions SHALL CONTINUE TO work normally

#### 2. Core AI Functionality

3.4 WHEN user gửi tin nhắn THEN AI response logic SHALL CONTINUE TO work exactly như hiện tại (rate limiting, caching, error handling)

3.5 WHEN user click quick reply buttons THEN message sending logic SHALL CONTINUE TO work như hiện tại

3.6 WHEN AI trả lời với markdown images THEN image rendering SHALL CONTINUE TO work như hiện tại

#### 3. Theme và Styling

3.7 WHEN user switch giữa dark/light mode THEN AI Assistant styling SHALL CONTINUE TO adapt correctly

3.8 WHEN component renders THEN gradient header, bot icon, và status indicator SHALL CONTINUE TO display như hiện tại

3.9 WHEN messages display THEN message bubbles styling (colors, borders, shadows) SHALL CONTINUE TO render correctly

#### 4. Message History

3.10 WHEN user gửi nhiều tin nhắn THEN message history SHALL CONTINUE TO be maintained correctly

3.11 WHEN user reload page THEN messages SHALL CONTINUE TO reset (current behavior - no persistence)

3.12 WHEN user switch tabs và quay lại THEN AI component SHALL CONTINUE TO remount với fresh state (current behavior với `aiKey`)
