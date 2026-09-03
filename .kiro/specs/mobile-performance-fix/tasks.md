# Implementation Plan: Mobile Performance Fix

## Overview

Bugfix này sửa 20 lỗi mobile trên TVU Connect, phân nhóm theo 7 file cần sửa đổi.
Thứ tự thực hiện: **Khám phá lỗi → Kiểm tra bảo toàn → Triển khai fix → Kiểm chứng**.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "description": "Viết tests TRƯỚC khi fix (Bug Condition + Preservation)" },
    { "wave": 2, "tasks": ["3", "4", "5", "6", "7", "8", "9"], "description": "Triển khai fix theo từng file" },
    { "wave": 3, "tasks": ["10"], "description": "Viết test files đầy đủ (PBT + Unit Tests)" },
    { "wave": 4, "tasks": ["11", "12"], "description": "Kiểm chứng và checkpoint cuối" }
  ]
}
```

## Tasks

---

- [x] 1. Viết test khám phá bug condition (TRƯỚC khi fix)
  - **Property 1: Bug Condition** - Mobile Layout, Touch & Navigation Bugs
  - **QUAN TRỌNG**: Viết các property-based test NÀY TRƯỚC KHI triển khai fix
  - **MỤC TIÊU**: Xác nhận các lỗi tồn tại, tìm counterexample và hiểu root cause
  - **Phương pháp Scoped PBT**: Thu hẹp về các input cụ thể gây lỗi để đảm bảo tính tái lập
  - **Test 1.A** — Horizontal Overflow: `document.body.scrollWidth > window.innerWidth` khi viewport < 375px
  - **Test 1.B** — Reaction debounce thiếu: tap nhanh 3 lần trong 100ms → ghi nhận `apiCallCount > 1`
  - **Test 1.C** — Swipe-to-delete thiếu: swipe trái 100px trên message → xác nhận không có phản hồi
  - **Test 1.D** — Scroll momentum tap: tap vào item khi list đang scroll → xác nhận kích hoạt sai item
  - **Test 1.E** — Scroll anchor thiếu: `loadMore` → `scrollTop` nhảy về 0 thay vì giữ nguyên
  - **Test 1.F** — ReactionPicker tràn viewport: trigger ở cạnh phải → picker bị cắt ngoài viewport
  - Chạy test trên code CHƯA FIX — **KỲ VỌNG: THẤT BẠI** (xác nhận bug tồn tại)
  - Ghi lại counterexample tìm được để hiểu root cause
  - Đánh dấu task hoàn thành khi tests đã viết, chạy và thất bại đã được ghi lại
  - _Requirements: 1.1, 1.8, 1.9, 1.16, 1.17, 1.18_


- [x] 2. Viết property test bảo toàn (TRƯỚC khi fix)
  - **Property 2: Preservation** - Desktop Layout & Core Functions Không Thay Đổi
  - **QUAN TRỌNG**: Tuân theo phương pháp observation-first
  - **Bước 1 — Quan sát trên code CHƯA FIX**:
    - Quan sát desktop layout (viewport ≥ 768px): không có overflow, glassmorphism đúng
    - Quan sát mouse click reactions hoạt động bình thường trên desktop
    - Quan sát gửi tin nhắn Firestore thành công
    - Quan sát dark mode desktop hiển thị đúng glassmorphism effects
  - **Bước 2 — Viết property test**:
    - Property: với mọi viewport ≥ 768px, `window.matchMedia('(max-width: 768px)').matches === false`
    - Property: với mọi mouse click trên desktop, `onClick` fired đúng 1 lần, không bị ảnh hưởng bởi touch handlers
    - Property: với mọi `updateDoc` call trên desktop, không bị block bởi debounce (interval > 300ms)
  - **Bước 3 — Chạy trên code CHƯA FIX**
  - **KỲ VỌNG: PASS** (xác nhận hành vi baseline cần bảo toàn)
  - Đánh dấu task hoàn thành khi tests đã viết, chạy và pass trên code chưa fix
  - _Requirements: 3.1, 3.2, 3.3, 3.7, 3.10_


---

- [x] 3. Fix `src/index.css` — CSS Responsive & Performance

  - [x] 3.1 Sửa `contain-intrinsic-size` cho `.post-card`
    - Thay đổi `contain-intrinsic-size: 0 120px` → `0 350px` (chiều cao thực tế PostCard có ảnh)
    - Thêm variant `.post-card.text-only { contain-intrinsic-size: 0 160px }`
    - Thêm variant `.post-card.multi-image { contain-intrinsic-size: 0 520px }`
    - _Bug_Condition: `css.containIntrinsicSize = '0 120px' AND actualPostCardHeight > 120`_
    - _Expected_Behavior: `contain-intrinsic-size` khớp chiều cao thực tế, giảm layout shift khi scroll_
    - _Preservation: `content-visibility: auto` vẫn được áp dụng, chỉ sửa giá trị `contain-intrinsic-size`_
    - _Requirements: 2.5, 3.10_

  - [x] 3.2 Thêm `@media (max-width: 374px)` — chặn horizontal overflow
    - Thêm `max-width: 100% !important; padding-left: 0.75rem !important` cho `.max-w-2xl`, `.max-w-4xl`
    - Thêm `.flex { min-width: 0 }` để flex children không tạo overflow
    - Thêm `#root { overflow-x: hidden; max-width: 100vw }`
    - _Bug_Condition: `viewportWidth < 375 AND document.body.scrollWidth > viewportWidth`_
    - _Expected_Behavior: `document.body.scrollWidth <= window.innerWidth` trên mọi viewport < 375px_
    - _Preservation: Desktop layout không bị ảnh hưởng (chỉ apply trong `@media max-width: 374px`)_
    - _Requirements: 2.1, 3.1_

  - [x] 3.3 Thêm `.modal-mobile-safe` và `@media` modal styles
    - Thêm class `.modal-mobile-safe { max-height: 90dvh; overflow-y: auto; -webkit-overflow-scrolling: touch }`
    - Thêm `@media (max-width: 768px)` cho `[role="dialog"], .modal-content` với `max-height: 90dvh !important`
    - Thêm `border-radius: 1.5rem 1.5rem 0 0` (bottom sheet pattern)
    - _Bug_Condition: `modalOpen = true AND modalContentHeight > viewportHeight * 0.9 AND overflow != 'auto'`_
    - _Expected_Behavior: Modal cuộn được toàn bộ nội dung, không bị cắt_
    - _Requirements: 2.2_

  - [x] 3.4 Thêm `@media landscape` — font size responsive
    - Thêm `@media screen and (max-width: 900px) and (orientation: landscape) and (max-height: 500px)`
    - Set `html { font-size: 15px }` thay vì 18px portrait default
    - Thêm `.post-card-content { font-size: clamp(13px, 2.5vw, 16px) }`
    - Thêm `.post-content-text { font-size: clamp(14px, 4vw, 17px) }` cho portrait
    - _Bug_Condition: `orientation = 'landscape' AND viewportWidth < 768 AND (fontSize < 13 OR fontSize > 18)`_
    - _Expected_Behavior: `font-size ∈ [13px, 16px]` trên mobile landscape_
    - _Requirements: 2.20_

  - [x] 3.5 Thêm `.btn-icon-sm::after` — mở rộng touch target ẩn
    - Thêm `@media (max-width: 768px) { button, [role="button"], a { min-height: 44px; min-width: 44px } }`
    - Thêm `.btn-icon-sm::after { content: ''; position: absolute; min-width: 44px; min-height: 44px }`
    - _Bug_Condition: `buttonElement.offsetWidth < 44 OR buttonElement.offsetHeight < 44 AND isTouchDevice`_
    - _Expected_Behavior: Mọi touch target ≥ 44×44px kể cả pseudo-element_
    - _Requirements: 2.19_

  - [x] 3.6 Thêm CSS scroll anchor và dark mode custom properties
    - Thêm `.chat-messages-container { overflow-anchor: auto }` và `.chat-scroll-anchor { overflow-anchor: auto; height: 1px }`
    - Thêm CSS custom properties: `--text-primary`, `--text-secondary`, `--bg-card` cho light và dark mode
    - Thêm `.post-card { background-color: var(--bg-card); color: var(--text-primary) }`
    - Thêm `.tab-switching * { scroll-behavior: auto !important }`
    - Thêm `.conversation-item { touch-action: manipulation; -webkit-tap-highlight-color: transparent }`
    - _Requirements: 2.14, 2.13, 2.17, 2.18_


---

- [x] 4. Fix `src/components/PostCard.tsx` — Ảnh, Debounce, Dark Mode, Touch Target

  - [x] 4.1 Sửa grid ảnh dùng `aspectRatio: '4/3'`
    - Thay `min-height`/`max-height` cố định bằng `style={{ aspectRatio: '4/3' }}` cho grid 2 ảnh
    - Đổi gap grid từ `gap-2` sang `gap-1.5` cho màn hình nhỏ
    - Áp dụng `object-cover` nhất quán cho tất cả ảnh trong grid
    - _Bug_Condition: `images.length >= 1 AND containerWidth < 375 AND objectFit NOT IN ['contain', 'cover']`_
    - _Expected_Behavior: Ảnh render đúng tỷ lệ gốc, không bị stretch hay overflow container_
    - _Requirements: 2.3_

  - [x] 4.2 Thêm debounce 300ms cho `handleReaction`
    - Thêm `lastReactionTimeRef = useRef<number>(0)`
    - Thêm guard: `if (now - lastReactionTimeRef.current < 300) return` ở đầu `handleReaction`
    - Update `lastReactionTimeRef.current = now` trước khi gọi API
    - _Bug_Condition: `tapCount > 1 AND tapInterval < 300 AND apiCallCount > 1`_
    - _Expected_Behavior: Chỉ 1 Firestore `updateDoc` call trong mọi burst tap < 300ms_
    - _Preservation: Reaction hoạt động bình thường khi tap cách nhau > 300ms (desktop mouse click)_
    - _Requirements: 2.8, 3.3_

  - [x] 4.3 Thêm class variants `text-only` / `multi-image` cho `contain-intrinsic-size`
    - Tính `cardClass` dựa trên `post.images?.length`
    - Apply `post-card text-only` khi không có ảnh, `post-card multi-image` khi > 1 ảnh
    - _Requirements: 2.5_

  - [x] 4.4 Sửa dark mode text — thay inline styles bằng Tailwind classes
    - Thay tất cả `style={{ color: '#000000' }}` → `className="text-gray-900 dark:text-white"`
    - Thay tất cả `style={{ color: '#ffffff' }}` → `className="text-white dark:text-gray-900"`
    - Xóa inline color styles conflict với dark mode CSS
    - _Bug_Condition: `darkMode = true AND computedStyle.color = '#fff' AND backgroundColor = '#fff' AND contrastRatio < 4.5`_
    - _Expected_Behavior: Contrast ratio ≥ 4.5:1 trên mọi text element ở dark mode_
    - _Requirements: 2.14_

  - [x] 4.5 Thêm class `btn-icon-sm` và tăng padding cho Edit/Delete buttons
    - Thêm `btn-icon-sm` vào className của Edit và Delete buttons
    - Tăng padding từ `py-1.5` lên `py-2`, từ `px-2.5` lên `px-3`
    - _Bug_Condition: `buttonElement.offsetWidth < 44 OR buttonElement.offsetHeight < 44`_
    - _Expected_Behavior: Touch target ≥ 44×44px kể cả pseudo-element padding ẩn_
    - _Requirements: 2.19_


---

- [x] 5. Fix `src/components/Chat.tsx` — Keyboard, Swipe, Long Press, Scroll Anchor

  - [x] 5.1 Implement `useSwipeToDelete` hook
    - Tạo hook với refs: `touchStartX`, `touchStartY`, `swipeOffset`
    - `onTouchStart`: lưu vị trí bắt đầu
    - `onTouchMove`: tính `deltaX`, chỉ xử lý khi `Math.abs(deltaX) > Math.abs(deltaY) * 1.5` (swipe ngang), chỉ swipe trái (`deltaX < 0`), gọi `e.preventDefault()`
    - `onTouchEnd`: nếu offset < -150px → gọi `onDelete`, nếu < -80px → giữ lộ nút xóa, còn lại snap về 0
    - Áp dụng `useSwipeToDelete` vào `MessageItem` component
    - _Bug_Condition: `swipeDirection = 'left' AND swipeDistance > 60 AND deleteButton.visible = false`_
    - _Expected_Behavior: Swipe trái > 80px hiện delete button; > 150px auto-delete_
    - _Preservation: Scroll dọc không bị ảnh hưởng (chỉ xử lý khi swipe ngang rõ ràng)_
    - _Requirements: 2.9_

  - [x] 5.2 Implement `useLongPress` hook và `MessageContextMenu` component
    - Hook `useLongPress(onLongPress, delay = 500)`: dùng `setTimeout(500ms)` + `touchstart`/`touchend`/`touchmove`
    - Thêm haptic feedback: `if ('vibrate' in navigator) navigator.vibrate(50)`
    - Tạo `MessageContextMenu` component với options "Copy tin nhắn" và "Xóa tin nhắn" (chỉ cho owner)
    - Xử lý `position` để menu không tràn viewport
    - Gọi `e.preventDefault()` trên `onContextMenu` để block native menu Android
    - _Bug_Condition: `pressDuration >= 500 AND contextMenu.visible = false`_
    - _Expected_Behavior: Nhấn giữ ≥ 500ms hiện context menu trên mọi iOS và Android_
    - _Requirements: 2.10_

  - [x] 5.3 Sửa keyboard/viewport height cho iOS Safari
    - Thêm `useEffect` lắng nghe `visualViewport resize` và `scroll`
    - Update CSS variable: `document.documentElement.style.setProperty('--visual-viewport-height', vv.height + 'px')`
    - Thêm `useEffect` scroll-into-view khi input được focus (delay 350ms để đợi keyboard animate)
    - Thêm attribute `data-chat-input` vào textarea
    - _Bug_Condition: `platform IN ['iOS Safari'] AND keyboardVisible = true AND containerHeightUnit = 'vh'`_
    - _Expected_Behavior: Chat input luôn hiển thị trên bàn phím, container height tính đúng bằng `dvh`_
    - _Requirements: 2.7_

  - [x] 5.4 Implement scroll anchor sau `loadMore`
    - Thêm refs: `prevScrollHeightRef`, `prevScrollTopRef`
    - Trong `handleLoadMore`: lưu `scrollHeight` và `scrollTop` trước khi gọi `loadMore()`
    - Thêm `useEffect` theo dõi `firestoreMessages.length`: tính `heightDiff`, khôi phục `scrollTop = prevScrollTop + heightDiff`
    - _Bug_Condition: `loadMoreTriggered = true AND newScrollTop < previousScrollTop`_
    - _Expected_Behavior: `newScrollTop = prevScrollTop + heightDiff` sau mọi `loadMore` trigger_
    - _Requirements: 2.18_


---

- [x] 6. Fix `src/components/ConversationsList.tsx` — Layout & Scroll Momentum

  - [x] 6.1 Sửa flex row tên/timestamp — dùng `truncate` thay vì `WebkitLineClamp`
    - Thay `WebkitLineClamp: 2` bằng `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'`
    - Đổi `items-start` → `items-baseline` trên flex container
    - Thêm `flex-1 min-w-0` cho tên, `flex-shrink-0 whitespace-nowrap` cho timestamp
    - _Bug_Condition: `viewportWidth < 375 AND nameElement overlaps timestampElement`_
    - _Expected_Behavior: Tên truncate 1 dòng, timestamp trên cùng hàng, không overlap_
    - _Requirements: 2.16_

  - [x] 6.2 Thêm scroll momentum tracking để block tap khi đang scroll
    - Thêm refs: `isScrollingRef`, `scrollEndTimerRef`, `listRef`
    - Thêm `useEffect` đăng ký `scroll` listener trên `listRef.current`: set `isScrollingRef = true`, reset sau 150ms không có scroll event
    - Block `onClick` khi `isScrollingRef.current = true` (`e.preventDefault(); return`)
    - Thêm `style={{ touchAction: 'manipulation' }}` vào mỗi conversation button
    - _Bug_Condition: `isScrolling = true AND tapTarget != actualIntendedTarget AND platform = 'iOS'`_
    - _Expected_Behavior: Tap đúng item được kích hoạt, không bị lệch do scroll momentum_
    - _Preservation: Tap bình thường (khi không đang scroll) vẫn hoạt động_
    - _Requirements: 2.17_

---

- [x] 7. Fix `src/components/MapView.tsx` — Bottom Sheet cho Place Info

  - [x] 7.1 Tạo `PlaceInfoBottomSheet` component
    - Component với prop `place: Place` và `onClose: () => void`
    - State `panelHeight: 'peek' | 'half' | 'full'` với heights `{ peek: '15%', half: '50%', full: '90%' }`
    - Style: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000`
    - `border-radius: 1.5rem 1.5rem 0 0`, `transform: translateZ(0)` (GPU layer)
    - Drag handle: `<div className="w-10 h-1 bg-gray-300 rounded-full" />`
    - Nội dung `overflow-y: auto; height: 100%; padding-bottom: safe-area-inset-bottom`
    - _Bug_Condition: `activeTab = 'map' AND isMobile = true AND selectedPlace != null AND panel overlaps map`_
    - _Expected_Behavior: Place info trong bottom sheet riêng, bản đồ vẫn tương tác được phía sau_
    - _Requirements: 2.4_

  - [x] 7.2 Tích hợp `PlaceInfoBottomSheet` thay thế absolute overlay
    - Thêm state `panelOpen: boolean`
    - Khi `selectedPlace` được set: render `<PlaceInfoBottomSheet>` thay vì panel `position: absolute`
    - Bản đồ giữ nguyên kích thước đầy đủ (không bị thu nhỏ)
    - _Requirements: 2.4_


---

- [x] 8. Fix `src/components/ReactionPicker.tsx` — Vị Trí Động Trong Viewport

  - [x] 8.1 Thêm `calculatePickerPosition()` và dynamic `pickerStyle`
    - Thêm state `pickerStyle: React.CSSProperties`
    - Thêm ref `containerRef` vào container element
    - Implement `calculatePickerPosition()`:
      - `PICKER_WIDTH = 280, PICKER_HEIGHT = 60`
      - Horizontal: nếu `spaceRight < PICKER_WIDTH` → `right: 0, left: 'auto'`; ngược lại `left: 0`
      - Vertical: nếu `spaceAbove < PICKER_HEIGHT + 10` → `top: 'calc(100% + 8px)'`; ngược lại `bottom: 'calc(100% + 8px)'`
    - Gọi `calculatePickerPosition()` trong `useEffect` khi `showPicker = true`
    - Thay class cứng `bottom-full left-0` bằng `style={pickerStyle}`
    - _Bug_Condition: `(triggerRect.left + pickerWidth) > viewportWidth OR triggerRect.top < 60`_
    - _Expected_Behavior: Picker tự flip ngang/dọc để toàn bộ nằm trong viewport_
    - _Preservation: Picker vẫn hiển thị đúng khi trigger ở giữa màn hình_
    - _Requirements: 2.15_

---

- [x] 9. Fix `src/App.tsx` — Preload, Back Button, Menu, Scroll Cancel, Viewport

  - [x] 9.1 Preload routes sớm hơn (không đợi profile)
    - Thêm `useEffect(() => { const timer = setTimeout(preloadCriticalRoutes, 1000); return () => clearTimeout(timer); }, [])`
    - Implement `handleNavHover(targetView: View)` với dynamic import map cho mỗi view
    - Gắn `onMouseEnter`/`onFocus` vào nav buttons để preload theo intent
    - _Bug_Condition: `isFirstVisit = true AND lazyComponent.isLoaded = false AND loadTime > 500ms`_
    - _Expected_Behavior: Lazy component bắt đầu render ≤ 500ms nhờ preload sớm_
    - _Requirements: 2.6_

  - [x] 9.2 Thêm `popstate` handler cho Android Back button
    - Trong `handleViewChange`: gọi `window.history.pushState({ view: newView }, '', '#' + newView)` khi navigate đến sub-views
    - Thêm `useEffect` đăng ký `window.addEventListener('popstate', handlePopState)`
    - `handlePopState`: nếu `state?.view` → `setView(state.view)`; nếu không → `setView('home')` + `pushState` mới để tránh đóng app
    - _Bug_Condition: `backButtonPressed = true AND currentView IN ['chat', 'results', 'profile'] AND popstateHandler.registered = false`_
    - _Expected_Behavior: Back button điều hướng về view cha, không đóng app_
    - _Requirements: 2.11_

  - [x] 9.3 Sửa hamburger menu đóng ngay khi tap ngoài (không delay)
    - Thay `setTimeout 100ms` + `click` listener bằng `touchstart` listener đăng ký ngay lập tức
    - Dùng `{ passive: true }` cho event listener
    - Điều kiện đóng: target không nằm trong `#mobile-menu-container` và không phải `[data-menu-toggle]`
    - _Bug_Condition: `menuOpen = true AND tapTarget NOT IN menuElement AND menuCloseDelay > 0`_
    - _Expected_Behavior: Menu đóng < 50ms sau touchstart ngoài menu_
    - _Requirements: 2.12_

  - [x] 9.4 Sửa `useLayoutEffect` cancel scroll animation triệt để
    - Thêm `document.documentElement.scrollTop = 0; document.body.scrollTop = 0` TRƯỚC khi gọi `scrollTo`
    - Query và reset tất cả `.overflow-y-auto, .overflow-auto, [data-scroll-container]`
    - _Bug_Condition: `tabClicked = true AND isScrolling = true AND scrollAnimation.cancelled = false`_
    - _Expected_Behavior: `scrollTop = 0` ngay lập tức, mọi animation bị cancel_
    - _Requirements: 2.13_

  - [x] 9.5 Thêm `visualViewport` listener cho CSS variable
    - Thêm `useEffect` lắng nghe `window.visualViewport` resize và scroll
    - Update `--visual-viewport-height` CSS variable: `vv.height + 'px'`
    - Cleanup khi unmount
    - _Requirements: 2.7_


---

- [x] 10. Viết test files — PBT và Unit Tests

  - [x] 10.1 `src/components/__tests__/PostCard.pbt.test.tsx` — Property-Based Tests
    - **Property 8** — Reaction Debounce: dùng `fast-check`, generate số tap (2-10) với interval (10-280ms), assert `apiCallCount = 1` khi `totalDuration < 300ms`
    - **Property 3** — Image Aspect Ratio: generate `imageCount (1-3)` và `viewportWidth (300-375)`, assert `itemWidth > 0 AND itemWidth <= containerWidth`
    - **Property 21** — Desktop Preservation: generate `viewportWidth (768-1920)`, assert `matchMedia('max-width: 768px').matches === false`
    - _Requirements: 2.8, 2.3, 3.1_

  - [x] 10.2 `src/components/__tests__/ReactionPicker.pbt.test.tsx` — Property-Based Tests
    - **Property 15** — Viewport Bounds: generate `triggerRect` ngẫu nhiên trong viewport, extract `calculatePickerPosition` function, assert `pickerLeft >= 0 AND pickerLeft + PICKER_WIDTH <= VIEWPORT_WIDTH AND pickerTop >= 0 AND pickerTop + PICKER_HEIGHT <= VIEWPORT_HEIGHT`
    - Test flip ngang khi trigger gần cạnh phải
    - Test hiển thị bên dưới khi trigger gần top
    - _Requirements: 2.15_

  - [x] 10.3 `src/components/__tests__/Chat.pbt.test.tsx` — Property-Based Tests
    - **Property 9** — Swipe-to-Delete: generate `swipeOffset ∈ [-300, 0]`, assert: `offset < -150` → delete triggered; `offset < -80` → button revealed; `offset > -80` → snap back
    - **Property 18** — Scroll Anchor: generate `prevScrollTop (100-5000)`, `heightDiff (50-2000)`, assert `actualScrollTop === prevScrollTop + heightDiff`
    - _Requirements: 2.9, 2.18_

  - [x] 10.4 `src/components/__tests__/PostCard.test.tsx` — Unit Tests
    - Test debounce: tap 3 lần trong 100ms → `mockUpdateDoc` called 1 lần
    - Test debounce: tap 2 lần cách nhau 400ms → `mockUpdateDoc` called 2 lần
    - Test touch target: Edit/Delete button `offsetHeight` + pseudo-element ≥ 44px
    - Test dark mode: contrast ratio ≥ 4.5:1 cho text elements ở dark mode
    - _Requirements: 2.8, 2.14, 2.19_

  - [x] 10.5 `src/components/__tests__/Chat.test.tsx` — Unit Tests
    - Test swipe: `touchStart(200) → touchMove(110)` (-90px) → delete button visible
    - Test swipe: scroll dọc không trigger swipe (`deltaX=-5, deltaY=50`)
    - Test long press: `touchStart` → 500ms → context menu visible, `vibrate(50)` called
    - Test scroll anchor: `loadMore` → `scrollTop = initialScrollTop + 500`
    - _Requirements: 2.9, 2.10, 2.18_

  - [x] 10.6 `src/components/__tests__/ConversationsList.test.tsx` — Unit Tests
    - Test truncate: tên dài không overlap timestamp trên viewport 360px
    - Test scroll momentum block: `onClick` không fired khi `isScrollingRef = true`
    - Test bình thường: `onClick` fired khi `isScrollingRef = false`
    - _Requirements: 2.16, 2.17_

  - [x] 10.7 `src/__tests__/App.popstate.test.tsx` — Unit Tests
    - Test: navigate đến chat → `window.history.pushState` được gọi
    - Test: `popstate` event với `state.view = 'chat'` → `setView('chat')` được gọi
    - Test: `popstate` với `state = null` → `setView('home')`, app không đóng
    - Test: hamburger menu đóng khi `touchstart` ngoài menu (không delay)
    - _Requirements: 2.11, 2.12_

  - [x] 10.8 `src/components/__tests__/ReactionPicker.test.tsx` — Unit Tests
    - Test: trigger gần cạnh phải (spaceRight < 280) → `pickerStyle.right = 0`
    - Test: trigger gần top (top = 20px) → `pickerStyle.top = 'calc(100% + 8px)'`
    - Test: trigger ở giữa → `pickerStyle.bottom = 'calc(100% + 8px)'`
    - _Requirements: 2.15_


---

- [x] 11. Kiểm chứng — Property 1 sau fix

  - [x] 11.1 Chạy lại bug condition exploration tests — xác nhận đã fix
    - **Property 1: Expected Behavior** - Mobile Layout, Touch & Navigation Bugs
    - **QUAN TRỌNG**: Chạy lại CÙNG CÁC TEST từ task 1 — KHÔNG viết test mới
    - Chạy Test 1.A (overflow) → `document.body.scrollWidth <= window.innerWidth` trên viewport 360px
    - Chạy Test 1.B (debounce) → `apiCallCount = 1` khi tap 3 lần trong 100ms
    - Chạy Test 1.C (swipe) → delete button visible sau swipe trái 100px
    - Chạy Test 1.D (scroll tap) → đúng item được kích hoạt sau scroll dừng
    - Chạy Test 1.E (scroll anchor) → `scrollTop` giữ nguyên sau `loadMore`
    - Chạy Test 1.F (ReactionPicker) → picker nằm trong viewport
    - **KỲ VỌNG: PASS** (xác nhận bugs đã được sửa)
    - _Requirements: 2.1, 2.8, 2.9, 2.16, 2.17, 2.18, 2.15_

  - [x] 11.2 Chạy lại preservation tests — xác nhận không có regression
    - **Property 2: Preservation** - Desktop Layout & Core Functions
    - **QUAN TRỌNG**: Chạy lại CÙNG CÁC TEST từ task 2 — KHÔNG viết test mới
    - Property desktop layout ≥ 768px → PASS
    - Property mouse click desktop → PASS
    - Property Firestore operations → PASS
    - **KỲ VỌNG: PASS** (xác nhận không có regression)
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

---

- [x] 12. Checkpoint cuối — Tất cả tests pass

  - Chạy toàn bộ test suite: `npx vitest --run`
  - Xác nhận tất cả unit tests trong `src/components/__tests__/` pass
  - Xác nhận tất cả property-based tests (fast-check) pass
  - Kiểm tra manual trên Chrome DevTools với viewport 360×640px:
    - Không có horizontal overflow
    - Modal có thể scroll
    - Reaction không bị gọi nhiều lần
    - Swipe-to-delete hoạt động
    - Back button Android điều hướng đúng
  - Đảm bảo desktop layout (1440×900px) không bị ảnh hưởng
  - Hỏi người dùng nếu có vấn đề phát sinh

## Notes

- Chạy test bằng `npx vitest --run` (không dùng watch mode)
- Cài `fast-check` nếu chưa có: `npm install --save-dev fast-check`
- Kiểm tra manual trên Chrome DevTools: Device Toolbar → chọn iPhone SE (375px) hoặc custom 360px
- Thứ tự ưu tiên fix: Bug 1.8 (debounce), 1.1 (overflow), 1.5 (scroll performance), 1.7 (keyboard) trước
- Tất cả CSS changes trong `@media (max-width: 768px)` để không ảnh hưởng desktop
- Không dùng `!important` ngoại trừ nơi cần override specificity rõ ràng (đã ghi chú trong design.md)
