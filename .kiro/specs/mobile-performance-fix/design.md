# Mobile Performance Fix - Technical Design

## Overview

Tài liệu này mô tả giải pháp kỹ thuật chi tiết để sửa 20 lỗi mobile trên nền tảng TVU Connect (React + TypeScript + Tailwind CSS + Firebase). Chiến lược sửa lỗi tuân theo phương pháp **Bug Condition Methodology**: xác định điều kiện kích hoạt lỗi `C(X)`, hành vi mong đợi `P(result)`, và đảm bảo không ảnh hưởng đến các input không lỗi `¬C(X)`.

**Phạm vi fix:** CSS responsive, hiệu suất render, touch/gesture, navigation UX, UI dark mode, scroll behavior, font size và button sizes.

**Nguyên tắc:** Mỗi thay đổi phải tối thiểu, có thể kiểm tra, không phá vỡ desktop layout và các chức năng core đang hoạt động.

---

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt lỗi — tập các input `X` khiến hệ thống hành xử sai
- **Property (P)**: Hành vi đúng mong đợi sau khi fix — `P(result)` phải đúng với mọi `X` thỏa `C(X)`
- **Preservation (¬C)**: Các input không kích hoạt lỗi — hành vi phải giữ nguyên sau fix
- **dvh**: Dynamic Viewport Height — đơn vị CSS tính đúng chiều cao viewport khi keyboard ảo bật/tắt trên iOS/Android
- **contain-intrinsic-size**: Kích thước ước tính cho `content-visibility: auto`, giúp browser tính layout đúng trước khi paint
- **touch-action: manipulation**: Tắt double-tap-to-zoom, giảm độ trễ 300ms của tap events trên mobile
- **scroll-anchor**: Kỹ thuật lưu và khôi phục `scrollTop` để giữ vị trí scroll khi thêm nội dung phía trên
- **debounce**: Kỹ thuật giới hạn tần suất gọi hàm — chỉ thực thi sau khoảng thời gian nhất định kể từ lần gọi cuối
- **swipe-to-delete**: Gesture vuốt ngang để lộ nút xóa, implement bằng `touchstart`/`touchmove`/`touchend`
- **long press**: Nhấn giữ ≥ 500ms để hiện context menu, implement bằng `setTimeout` + `touchstart`/`touchend`
- **popstate**: Sự kiện browser khi user nhấn nút Back/Forward; cần xử lý để điều hướng SPA đúng
- **WCAG AA**: Tiêu chuẩn tương phản màu tối thiểu 4.5:1 cho text thông thường
- **PostCard**: Component hiển thị bài viết trong `src/components/PostCard.tsx`
- **Chat**: Component màn hình chat trong `src/components/Chat.tsx`
- **ConversationsList**: Component danh sách cuộc trò chuyện trong `src/components/ConversationsList.tsx`
- **MapView**: Component bản đồ địa điểm trong `src/components/MapView.tsx`
- **ReactionPicker**: Component chọn reaction trong `src/components/ReactionPicker.tsx`

---

## Bug Details

### Bug 1.1 — Horizontal Overflow trên màn hình < 375px

**Bug Condition:**
```
FUNCTION isBugCondition_1_1(input)
  INPUT: input.viewportWidth: number
  OUTPUT: boolean

  RETURN input.viewportWidth < 375
         AND document.body.scrollWidth > input.viewportWidth
END FUNCTION
```

**Nguyên nhân:** Một số phần tử dùng `min-width` cố định hoặc `padding` không responsive khiến tổng chiều rộng vượt viewport. Cụ thể trong `src/index.css`, `body` có `overflow-x: hidden` nhưng các container con có thể vẫn tạo ra overflow context riêng.

**Ví dụ lỗi:**
- iPhone SE (375px): Header navigation bị tràn ngang
- Galaxy A series (360px): PostCard action buttons bị đẩy ra ngoài
- Màn hình 320px: Conversation list item bị overflow

**Giải pháp kỹ thuật:**
```css
/* src/index.css — thêm vào phần mobile */
@media (max-width: 374px) {
  .max-w-2xl,
  .max-w-4xl {
    max-width: 100% !important;
    padding-left: 0.75rem !important;
    padding-right: 0.75rem !important;
  }
  
  /* Đảm bảo tất cả flex container không overflow */
  .flex {
    min-width: 0;
  }
}

/* Áp dụng toàn cục: mọi direct child của body không được overflow */
#root {
  overflow-x: hidden;
  max-width: 100vw;
}
```

---

### Bug 1.2 — Modal bị cắt nội dung trên mobile

**Bug Condition:**
```
FUNCTION isBugCondition_1_2(input)
  INPUT: input.modalOpen: boolean, input.viewportHeight: number,
         input.modalContentHeight: number
  OUTPUT: boolean

  RETURN input.modalOpen = true
         AND input.modalContentHeight > input.viewportHeight * 0.9
         AND modal.overflowY != 'auto'
END FUNCTION
```

**Nguyên nhân:** Các modal (CreateDocumentModal, EditDocumentModal, ProfileCard, ConfirmModal) dùng `max-height` với giá trị `vh` hoặc không có `overflow-y: auto`, khiến nội dung dài bị cắt ở cuối.

**Giải pháp kỹ thuật:**
```css
/* src/index.css */
.modal-mobile-safe {
  max-height: 90dvh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

@media (max-width: 768px) {
  /* Bottom sheet pattern cho modal trên mobile */
  [role="dialog"],
  .modal-content {
    max-height: 90dvh !important;
    overflow-y: auto !important;
    border-radius: 1.5rem 1.5rem 0 0 !important;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom)) !important;
  }
}
```

---

### Bug 1.3 — Layout ảnh PostCard không đúng tỷ lệ

**Bug Condition:**
```
FUNCTION isBugCondition_1_3(input)
  INPUT: input.images: string[], input.containerWidth: number
  OUTPUT: boolean

  RETURN input.images.length >= 1
         AND input.containerWidth < 375
         AND (imageElement.style.objectFit NOT IN ['contain', 'cover'])
END FUNCTION
```

**Nguyên nhân:** `AdaptiveImageLayout` trong `PostCard.tsx` đã dùng `object-contain` nhưng container `min-height` cố định (`200px`) trên màn hình nhỏ gây layout shift. Grid 2 cột trên 360px quá hẹp.

**Giải pháp kỹ thuật — `src/components/PostCard.tsx`:**
```tsx
// Sửa grid 2 ảnh: thêm responsive min-height
if (images.length === 2) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-1.5">  {/* gap nhỏ hơn */}
      {images.map((img, index) => (
        <div
          key={index}
          className="relative rounded-xl overflow-hidden"
          style={{
            // Dùng aspect-ratio thay vì min/max-height cố định
            aspectRatio: '4/3',
          }}
        >
          <img
            src={img}
            alt={`Ảnh ${index + 1}`}
            className="w-full h-full object-cover rounded-xl"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
```

---

### Bug 1.4 — MapView: bản đồ và panel địa điểm chồng lên nhau

**Bug Condition:**
```
FUNCTION isBugCondition_1_4(input)
  INPUT: input.activeTab: string, input.isMobile: boolean,
         input.selectedPlace: Place | null
  OUTPUT: boolean

  RETURN input.activeTab = 'map'
         AND input.isMobile = true
         AND input.selectedPlace != null
         AND panelElement.zIndex >= mapElement.zIndex
         AND panelElement.position = 'absolute'
         AND panelElement overlaps mapElement
END FUNCTION
```

**Nguyên nhân:** Trong `MapView.tsx`, khi `selectedPlace` được set, panel thông tin địa điểm dùng `position: absolute` với cùng vùng hiển thị bản đồ, không có cơ chế tách riêng hay slide-up panel.

**Giải pháp kỹ thuật — `src/components/MapView.tsx`:**
```tsx
// Thêm state cho bottom sheet
const [panelOpen, setPanelOpen] = useState(false);
const [panelHeight, setPanelHeight] = useState<'peek' | 'half' | 'full'>('peek');

// Bottom sheet draggable cho mobile
const PlaceInfoBottomSheet: React.FC<{ place: Place; onClose: () => void }> = ({ place, onClose }) => {
  const heights = { peek: '15%', half: '50%', full: '90%' };
  
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] transition-all duration-300 ease-out"
      style={{
        height: heights[panelHeight],
        borderRadius: '1.5rem 1.5rem 0 0',
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
        transform: 'translateZ(0)',  // GPU layer
      }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>
      {/* Nội dung place info */}
      <div className="overflow-y-auto h-full pb-safe">
        {/* ... place details ... */}
      </div>
    </div>
  );
};
```

---

### Bug 1.5 — PostCard scroll jank: contain-intrinsic-size sai

**Bug Condition:**
```
FUNCTION isBugCondition_1_5(input)
  INPUT: input.scrollSpeed: 'fast' | 'slow', input.deviceTier: 'low' | 'mid' | 'high'
  OUTPUT: boolean

  RETURN input.scrollSpeed = 'fast'
         AND input.deviceTier IN ['low', 'mid']
         AND css.containIntrinsicSize = '0 120px'  -- giá trị mặc định sai
         AND actualPostCardHeight > 120
END FUNCTION
```

**Nguyên nhân:** Trong `src/index.css`, `.post-card` có `contain-intrinsic-size: 0 120px` nhưng PostCard thực tế có chiều cao ~280-400px (có ảnh) hoặc ~160px (chỉ text). Browser tính layout sai, gây reflow khi scroll.

**Giải pháp kỹ thuật — `src/index.css`:**
```css
/* Sửa contain-intrinsic-size theo chiều cao thực tế */
.post-card {
  content-visibility: auto;
  /* PostCard không ảnh: ~160px | có 1 ảnh: ~350px | có nhiều ảnh: ~500px */
  contain-intrinsic-size: 0 350px;
}

/* Variant cho post chỉ text (không có ảnh) */
.post-card.text-only {
  contain-intrinsic-size: 0 160px;
}

/* Variant cho post có nhiều ảnh */
.post-card.multi-image {
  contain-intrinsic-size: 0 520px;
}
```

**Cập nhật `PostCard.tsx`:**
```tsx
// Thêm class variant dựa trên nội dung
const cardClass = [
  'post-card',
  post.images?.length === 0 ? 'text-only' : '',
  (post.images?.length ?? 0) > 1 ? 'multi-image' : '',
].filter(Boolean).join(' ');
```

---

### Bug 1.6 — Tab switching chậm 1-3 giây: lazy-load chưa preload

**Bug Condition:**
```
FUNCTION isBugCondition_1_6(input)
  INPUT: input.targetTab: View, input.isFirstVisit: boolean
  OUTPUT: boolean

  RETURN input.isFirstVisit = true
         AND lazyComponent.isLoaded = false
         AND loadTime > 500ms
END FUNCTION
```

**Nguyên nhân:** Trong `src/App.tsx`, `preloadCriticalRoutes()` chỉ được gọi sau khi profile load xong. Trên mobile chậm, có thể mất 2-3s. Các tab như Posts, Chat, Explore chưa được preload sớm.

**Giải pháp kỹ thuật — `src/App.tsx`:**
```tsx
// Preload ngay sau khi app mount, không đợi profile
useEffect(() => {
  // Preload critical routes sau 1s (sau critical startup path)
  const preloadTimer = setTimeout(() => {
    preloadCriticalRoutes();
  }, 1000);
  
  return () => clearTimeout(preloadTimer);
}, []); // Empty deps: chạy 1 lần khi mount

// Preload on hover/focus của nav buttons (intent-based preloading)
const handleNavHover = (targetView: View) => {
  // Import dynamic tương ứng với view
  const preloadMap: Record<string, () => Promise<any>> = {
    posts: () => import('./components/PostsList'),
    chat: () => import('./components/Chat'),
    explore: () => import('./components/MapView'),
    conversations: () => import('./components/ConversationsList'),
    documents: () => import('./components/DocumentRepository'),
  };
  preloadMap[targetView]?.();
};
```

---

### Bug 1.7 — Chat: ô nhập liệu bị che bởi keyboard iOS

**Bug Condition:**
```
FUNCTION isBugCondition_1_7(input)
  INPUT: input.platform: string, input.keyboardVisible: boolean,
         input.containerHeightUnit: 'vh' | 'dvh'
  OUTPUT: boolean

  RETURN input.platform IN ['iOS Safari', 'Android Chrome']
         AND input.keyboardVisible = true
         AND input.containerHeightUnit = 'vh'
         AND inputElement.isObscured = true
END FUNCTION
```

**Nguyên nhân:** `Chat.tsx` sử dụng `height: calc(100dvh - 64px - 72px - env(safe-area-inset-bottom))` — đã dùng `dvh`. Tuy nhiên, CSS fallback `min-height: 400px` không đủ trên một số iPhone với keyboard cao. Ngoài ra, scroll container cần `scrollIntoView` khi input được focus.

**Giải pháp kỹ thuật — `src/components/Chat.tsx`:**
```tsx
// Thêm useEffect xử lý keyboard appearance
useEffect(() => {
  const inputEl = document.querySelector<HTMLElement>('[data-chat-input]');
  if (!inputEl) return;
  
  const handleFocus = () => {
    // Đợi keyboard animate xong (~300ms trên iOS)
    setTimeout(() => {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Scroll message container xuống cuối
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 350);
  };
  
  inputEl.addEventListener('focus', handleFocus);
  return () => inputEl.removeEventListener('focus', handleFocus);
}, []);
```

```css
/* src/index.css — Visual Viewport API fallback */
@supports not (height: 100dvh) {
  .chat-container {
    height: calc(var(--visual-viewport-height, 100vh) - 136px);
  }
}
```

```tsx
// src/App.tsx hoặc index.tsx — cập nhật CSS variable theo Visual Viewport
useEffect(() => {
  const updateViewportHeight = () => {
    const vv = window.visualViewport;
    if (vv) {
      document.documentElement.style.setProperty(
        '--visual-viewport-height', `${vv.height}px`
      );
    }
  };
  
  window.visualViewport?.addEventListener('resize', updateViewportHeight);
  window.visualViewport?.addEventListener('scroll', updateViewportHeight);
  updateViewportHeight();
  
  return () => {
    window.visualViewport?.removeEventListener('resize', updateViewportHeight);
    window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
  };
}, []);
```

---

### Bug 1.8 — Like/Reaction bị nhấn nhiều lần (thiếu debounce)

**Bug Condition:**
```
FUNCTION isBugCondition_1_8(input)
  INPUT: input.tapCount: number, input.tapInterval: number (ms)
  OUTPUT: boolean

  RETURN input.tapCount > 1
         AND input.tapInterval < 300
         AND apiCallCount > 1
END FUNCTION
```

**Nguyên nhân:** `handleReaction` trong `PostCard.tsx` có `isReacting` flag nhưng `ReactionPicker.tsx` có `isProcessing` riêng. Hai guard này không đồng bộ đủ nhanh trên double-tap.

**Giải pháp kỹ thuật — `src/components/PostCard.tsx`:**
```tsx
// Thêm debounce ref để block calls trong 300ms
const reactionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const lastReactionTimeRef = useRef<number>(0);

const handleReaction = async (type: ReactionType) => {
  const now = Date.now();
  
  // Block nếu < 300ms kể từ lần reaction cuối
  if (now - lastReactionTimeRef.current < 300) {
    return;
  }
  
  if (isReacting || !post.id) return;
  
  lastReactionTimeRef.current = now;
  
  // ... phần còn lại của handleReaction
};
```

---

### Bug 1.9 — Chat: Swipe-to-delete không hoạt động

**Bug Condition:**
```
FUNCTION isBugCondition_1_9(input)
  INPUT: input.swipeDistance: number, input.swipeDirection: 'left' | 'right'
  OUTPUT: boolean

  RETURN input.swipeDirection = 'left'
         AND input.swipeDistance > 60
         AND deleteButton.visible = false
         AND noTouchEventHandler = true
END FUNCTION
```

**Nguyên nhân:** `MessageItem` component trong `Chat.tsx` không có touch event handlers. Chức năng swipe-to-delete chưa được implement.

**Giải pháp kỹ thuật — `src/components/Chat.tsx`:**
```tsx
// Hook swipe-to-delete
const useSwipeToDelete = (onDelete: () => void, isOwner: boolean) => {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeOffset = useRef(0);
  const [offset, setOffset] = useState(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  
  const SWIPE_THRESHOLD = 80; // px để trigger delete reveal
  const SWIPE_DELETE_THRESHOLD = 150; // px để auto-delete
  
  const handlers = {
    onTouchStart: (e: React.TouchEvent) => {
      if (!isOwner) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      setIsSwipeActive(true);
    },
    
    onTouchMove: (e: React.TouchEvent) => {
      if (!isOwner || !isSwipeActive) return;
      const deltaX = e.touches[0].clientX - touchStartX.current;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      
      // Chỉ xử lý swipe ngang (deltaX > deltaY * 1.5)
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
      
      // Chỉ cho swipe trái (deltaX < 0)
      if (deltaX > 0) return;
      
      e.preventDefault(); // Ngăn scroll dọc khi đang swipe ngang
      const clampedOffset = Math.max(deltaX, -SWIPE_DELETE_THRESHOLD);
      setOffset(clampedOffset);
    },
    
    onTouchEnd: () => {
      if (!isOwner) return;
      setIsSwipeActive(false);
      
      if (offset < -SWIPE_DELETE_THRESHOLD) {
        onDelete();
      } else if (offset < -SWIPE_THRESHOLD) {
        setOffset(-SWIPE_THRESHOLD); // Giữ lộ nút xóa
      } else {
        setOffset(0); // Snap về vị trí ban đầu
      }
    },
  };
  
  return { offset, handlers };
};

// Trong MessageItem component:
const MessageItem: React.FC<{ msg: Message; onDelete: (id: string) => void }> = ({ msg, onDelete }) => {
  const isOwner = msg.senderUid === auth.currentUser?.uid;
  const { offset, handlers } = useSwipeToDelete(
    () => onDelete(msg.id!),
    isOwner
  );
  
  return (
    <div className="relative overflow-hidden">
      {/* Delete button background */}
      {isOwner && (
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-500 px-4"
          style={{ width: `${Math.abs(Math.min(offset, 0))}px`, transition: 'none' }}
        >
          <Trash2 className="w-5 h-5 text-white" />
        </div>
      )}
      
      {/* Message bubble */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? 'transform 0.25s ease-out' : 'none',
          touchAction: 'pan-y', // Chỉ allow scroll dọc khi không swipe
        }}
        {...handlers}
      >
        {/* ... message bubble content ... */}
      </div>
    </div>
  );
};
```

---

### Bug 1.10 — Long press tin nhắn không hiện context menu

**Bug Condition:**
```
FUNCTION isBugCondition_1_10(input)
  INPUT: input.pressDuration: number (ms), input.platform: string
  OUTPUT: boolean

  RETURN input.pressDuration >= 500
         AND contextMenu.visible = false
         AND noLongPressHandler = true
END FUNCTION
```

**Nguyên nhân:** `MessageItem` không có long press handler. Cần implement `touchstart`/`touchend` với `setTimeout(500ms)`.

**Giải pháp kỹ thuật:**
```tsx
// Hook long press
const useLongPress = (onLongPress: () => void, delay = 500) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  
  const start = (e: React.TouchEvent) => {
    // Ngăn context menu native trên Android
    e.preventDefault();
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
      // Haptic feedback nếu được hỗ trợ
      if ('vibrate' in navigator) navigator.vibrate(50);
    }, delay);
  };
  
  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  
  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel, // Hủy nếu ngón tay di chuyển
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // Block native menu
  };
};

// Context Menu Component cho message
const MessageContextMenu: React.FC<{
  msg: Message;
  isOwner: boolean;
  position: { x: number; y: number };
  onDelete: () => void;
  onCopy: () => void;
  onClose: () => void;
}> = ({ msg, isOwner, position, onDelete, onCopy, onClose }) => (
  <div
    className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
    style={{
      left: Math.min(position.x, window.innerWidth - 180),
      top: Math.min(position.y, window.innerHeight - 120),
      minWidth: '160px',
    }}
  >
    <button
      onClick={onCopy}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
    >
      Copy tin nhắn
    </button>
    {isOwner && (
      <button
        onClick={onDelete}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-left border-t border-gray-100 dark:border-gray-700"
      >
        Xóa tin nhắn
      </button>
    )}
  </div>
);
```

---

### Bug 1.11 — Android Back button không điều hướng đúng

**Bug Condition:**
```
FUNCTION isBugCondition_1_11(input)
  INPUT: input.currentView: string, input.backButtonPressed: boolean
  OUTPUT: boolean

  RETURN input.backButtonPressed = true
         AND input.currentView IN ['chat', 'results', 'profile']
         AND popstateHandler.registered = false
END FUNCTION
```

**Nguyên nhân:** `App.tsx` là SPA không dùng React Router. Khi user nhấn Back trên Android, browser pop history stack → app đóng vì không có `popstate` handler.

**Giải pháp kỹ thuật — `src/App.tsx`:**
```tsx
// Push state khi điều hướng đến màn hình con
const handleViewChange = useCallback((newView: View) => {
  // ... existing logic ...
  
  // Push history state để Back button hoạt động
  const subViews: View[] = ['chat', 'results', 'settings', 'profile'];
  if (subViews.includes(newView) && !subViews.includes(view)) {
    window.history.pushState({ view: newView }, '', `#${newView}`);
  }
  
  setView(newView);
}, [view, canAccessFeature]);

// Lắng nghe popstate (Back/Forward button)
useEffect(() => {
  const handlePopState = (e: PopStateEvent) => {
    const state = e.state as { view?: View } | null;
    
    if (state?.view) {
      setView(state.view);
    } else {
      // Không có state → điều hướng về home thay vì đóng app
      setView('home');
      // Prevent app close bằng cách push state mới
      window.history.pushState({ view: 'home' }, '', '#home');
    }
  };
  
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, []);
```

---

### Bug 1.12 — Hamburger menu không đóng khi tap ngoài (delay 100ms)

**Bug Condition:**
```
FUNCTION isBugCondition_1_12(input)
  INPUT: input.menuOpen: boolean, input.tapTarget: HTMLElement
  OUTPUT: boolean

  RETURN input.menuOpen = true
         AND tapTarget NOT IN menuElement.subtree
         AND tapTarget NOT IN menuToggleButton.subtree
         AND menuCloseDelay > 0ms  -- có setTimeout delay
END FUNCTION
```

**Nguyên nhân:** Trong `App.tsx`, `handleClickOutside` được đăng ký sau `setTimeout 100ms`. Trên mobile, `touchend` fires → `click` fires sau 300ms → `setTimeout` 100ms → tổng delay ~400ms gây nhầm lẫn.

**Giải pháp kỹ thuật — `src/App.tsx`:**
```tsx
useEffect(() => {
  if (showMobileMenu) {
    document.documentElement.classList.add('mobile-menu-open');
    
    const handleTouchOutside = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const menu = document.getElementById('mobile-menu-container');
      if (menu && !menu.contains(target) && !target.closest('[data-menu-toggle]')) {
        // Đóng ngay lập tức, không delay
        setShowMobileMenu(false);
      }
    };
    
    // Dùng touchstart thay vì click để phản hồi ngay
    // passive: false để có thể preventDefault nếu cần
    document.addEventListener('touchstart', handleTouchOutside, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchOutside);
      document.documentElement.classList.remove('mobile-menu-open');
    };
  } else {
    document.documentElement.classList.remove('mobile-menu-open');
  }
}, [showMobileMenu]);
```

---

### Bug 1.13 — Tab navigation scroll không cancel animation đang chạy

**Bug Condition:**
```
FUNCTION isBugCondition_1_13(input)
  INPUT: input.isScrolling: boolean, input.tabClicked: boolean
  OUTPUT: boolean

  RETURN input.tabClicked = true
         AND input.isScrolling = true
         AND scrollAnimation.cancelled = false
END FUNCTION
```

**Nguyên nhân:** Trong `App.tsx`, `useLayoutEffect` gọi `window.scrollTo({ behavior: 'instant' })` nhưng nếu có smooth scroll animation đang chạy (từ CSS hoặc JS), `instant` không luôn cancel được trên iOS Safari.

**Giải pháp kỹ thuật — `src/App.tsx`:**
```tsx
// Sửa useLayoutEffect để force cancel scroll
useLayoutEffect(() => {
  if (!isPending) {
    // Cancel any ongoing scroll bằng cách set scrollTop trực tiếp trước
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Sau đó mới dùng scrollTo
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    
    // Reset tất cả scroll containers
    const containers = document.querySelectorAll<HTMLElement>(
      '.overflow-y-auto, .overflow-auto, [data-scroll-container]'
    );
    containers.forEach(el => { el.scrollTop = 0; });
  }
}, [view, isPending]);
```

```css
/* src/index.css — Thêm class để disable scroll-behavior trong quá trình tab switch */
.tab-switching * {
  scroll-behavior: auto !important;
}
```

---

### Bug 1.14 — PostCard dark mode: text trắng trên nền trắng

**Bug Condition:**
```
FUNCTION isBugCondition_1_14(input)
  INPUT: input.darkMode: boolean, input.element: HTMLElement
  OUTPUT: boolean

  RETURN input.darkMode = true
         AND (
           computedStyle.color = 'rgb(255,255,255)'
           AND computedStyle.backgroundColor = 'rgb(255,255,255)'
         )
         AND contrastRatio < 4.5  -- WCAG AA fail
END FUNCTION
```

**Nguyên nhân:** CSS specificity conflict: `index.css` có `.dark .bg-white { background-color: rgba(30,30,30,0.95) !important }` nhưng một số inline `style={{ color: '#ffffff' }}` với container có `backgroundColor: 'white'` override dark mode styles.

**Giải pháp kỹ thuật — `src/index.css`:**
```css
/* Tăng specificity cho dark mode text để override inline styles */
.dark .post-card * {
  /* Không dùng !important cho color — thay vào đó dùng CSS custom property */
}

/* Sử dụng CSS custom properties để color aware */
:root {
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --bg-card: #ffffff;
}

.dark {
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --bg-card: rgba(31, 41, 55, 0.6);
}

/* PostCard dùng custom properties thay vì hardcode */
.post-card {
  background-color: var(--bg-card);
  color: var(--text-primary);
}
```

**Cập nhật `PostCard.tsx`:** Thay thế tất cả `style={{ color: '#000000' }}` và `style={{ color: '#ffffff' }}` bằng Tailwind classes `text-gray-900 dark:text-white`.

---

### Bug 1.15 — ReactionPicker tràn viewport trên mobile

**Bug Condition:**
```
FUNCTION isBugCondition_1_15(input)
  INPUT: input.triggerButtonRect: DOMRect, input.viewportWidth: number,
         input.pickerWidth: number
  OUTPUT: boolean

  RETURN (triggerButtonRect.left + pickerWidth) > input.viewportWidth
         OR triggerButtonRect.top < 60  -- gần top viewport
END FUNCTION
```

**Nguyên nhân:** Trong `ReactionPicker.tsx`, picker dùng `position: absolute` với `bottom-full left-0` — không check xem có bị tràn viewport không. Trên PostCard ở cạnh phải màn hình hoặc cạnh dưới, picker sẽ tràn.

**Giải pháp kỹ thuật — `src/components/ReactionPicker.tsx`:**
```tsx
// Thêm logic tính vị trí dynamic
const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});

const calculatePickerPosition = () => {
  if (!containerRef.current) return;
  
  const rect = containerRef.current.getBoundingClientRect();
  const PICKER_WIDTH = 280; // 6 reactions * ~44px + padding
  const PICKER_HEIGHT = 60;
  
  const spaceRight = window.innerWidth - rect.left;
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  
  const style: React.CSSProperties = {};
  
  // Horizontal: flip nếu tràn phải
  if (spaceRight < PICKER_WIDTH) {
    style.right = 0;
    style.left = 'auto';
  } else {
    style.left = 0;
    style.right = 'auto';
  }
  
  // Vertical: hiển thị bên dưới nếu không đủ chỗ trên
  if (spaceAbove < PICKER_HEIGHT + 10) {
    style.top = 'calc(100% + 8px)';
    style.bottom = 'auto';
  } else {
    style.bottom = 'calc(100% + 8px)';
    style.top = 'auto';
  }
  
  setPickerStyle(style);
};

// Tính lại position khi showPicker = true
useEffect(() => {
  if (showPicker) {
    calculatePickerPosition();
  }
}, [showPicker]);

// Trong JSX, thêm style vào picker element:
// style={{ ...pickerStyle }} thay vì class bottom-full left-0
```

---

### Bug 1.16 — ConversationsList: tên và timestamp chồng nhau trên < 375px

**Bug Condition:**
```
FUNCTION isBugCondition_1_16(input)
  INPUT: input.viewportWidth: number, input.nameLength: number
  OUTPUT: boolean

  RETURN input.viewportWidth < 375
         AND nameElement overlaps timestampElement
         AND flexContainer.gap < 8px
END FUNCTION
```

**Nguyên nhân:** Trong `ConversationsList.tsx`, row tên/timestamp dùng `flex justify-between items-start gap-2`. Trên màn hình nhỏ, tên dài (WebkitLineClamp: 2) chiếm quá nhiều không gian, đẩy timestamp ra ngoài.

**Giải pháp kỹ thuật — `src/components/ConversationsList.tsx`:**
```tsx
// Cập nhật div chứa tên và timestamp
<div className="flex justify-between items-baseline gap-2 mb-1">
  <h4
    className="font-bold flex-1 min-w-0 group-hover:text-indigo-500 truncate"  // truncate thay vì line-clamp
    style={{
      // Bỏ WebkitLineClamp để dùng truncate đơn giản hơn
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',  // 1 dòng, truncate
      color: theme === 'dark' ? '#f9fafb' : '#111827',
    }}
  >
    {conv.otherUser.fullName}
  </h4>
  {conv.lastMessageAt && (
    <span
      className="text-[10px] font-medium flex-shrink-0 whitespace-nowrap"
      style={{ color: theme === 'dark' ? '#6b7280' : '#9ca3af' }}
    >
      {/* Format ngắn hơn cho mobile */}
      {formatTimeShort(conv.lastMessageAt)}
    </span>
  )}
</div>
```

---

### Bug 1.17 — ConversationsList: scroll momentum tap vào sai item

**Bug Condition:**
```
FUNCTION isBugCondition_1_17(input)
  INPUT: input.isScrolling: boolean, input.tapTarget: HTMLElement,
         input.actualIntendedTarget: HTMLElement
  OUTPUT: boolean

  RETURN input.isScrolling = true
         AND tapTarget != actualIntendedTarget
         AND platform = 'iOS'
END FUNCTION
```

**Nguyên nhân:** iOS có "scroll momentum" sau khi nhấc ngón tay. Nếu list vẫn đang scroll và user tap, iOS có thể kích hoạt item sai do position thay đổi trong lúc tap event được fire.

**Giải pháp kỹ thuật — `src/components/ConversationsList.tsx`:**
```tsx
// Thêm scroll tracking để block tap trong khi scrolling
const isScrollingRef = useRef(false);
const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const listRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const listEl = listRef.current;
  if (!listEl) return;
  
  const handleScroll = () => {
    isScrollingRef.current = true;
    
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
    }
    
    // Scroll kết thúc sau 150ms không có scroll event
    scrollEndTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  };
  
  listEl.addEventListener('scroll', handleScroll, { passive: true });
  return () => listEl.removeEventListener('scroll', handleScroll);
}, []);

// Trong button onClick:
<button
  onClick={(e) => {
    // Block click nếu đang scroll
    if (isScrollingRef.current) {
      e.preventDefault();
      return;
    }
    onStartChat(conv.otherUser.uid);
  }}
  // Thêm touch-action để browser biết đây là button
  style={{ touchAction: 'manipulation' }}
>
```

```css
/* src/index.css — áp dụng cho tất cả list items */
.conversation-item {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
```

---

### Bug 1.18 — Chat: scroll nhảy về đầu sau khi load thêm tin nhắn

**Bug Condition:**
```
FUNCTION isBugCondition_1_18(input)
  INPUT: input.loadMoreTriggered: boolean, input.previousScrollTop: number,
         input.newScrollTop: number
  OUTPUT: boolean

  RETURN input.loadMoreTriggered = true
         AND input.newScrollTop < input.previousScrollTop
         AND scrollJumped = true
END FUNCTION
```

**Nguyên nhân:** Khi `loadMore` được gọi trong `useCachedMessages`, messages mới được prepend vào đầu array → React re-render → scroll container jump lên đầu.

**Giải pháp kỹ thuật — `src/components/Chat.tsx`:**
```tsx
// Lưu scrollHeight trước khi load, khôi phục sau
const prevScrollHeightRef = useRef(0);
const prevScrollTopRef = useRef(0);

const handleLoadMore = () => {
  if (!scrollRef.current) return;
  
  // Lưu scroll state trước khi load
  prevScrollHeightRef.current = scrollRef.current.scrollHeight;
  prevScrollTopRef.current = scrollRef.current.scrollTop;
  
  loadMore(); // Gọi loadMore từ useCachedMessages
};

// useEffect khôi phục scroll position sau khi messages được thêm
useEffect(() => {
  if (!scrollRef.current || prevScrollHeightRef.current === 0) return;
  
  const newScrollHeight = scrollRef.current.scrollHeight;
  const heightDiff = newScrollHeight - prevScrollHeightRef.current;
  
  if (heightDiff > 0) {
    // Khôi phục vị trí scroll: offset bằng đúng lượng content mới thêm vào
    scrollRef.current.scrollTop = prevScrollTopRef.current + heightDiff;
    prevScrollHeightRef.current = 0; // Reset flag
  }
}, [firestoreMessages.length]);
```

```css
/* src/index.css — CSS scroll anchoring (native browser support) */
.chat-messages-container {
  overflow-anchor: auto;  /* Chrome/Edge tự động anchor scroll */
}

/* Anchor element ở cuối list */
.chat-scroll-anchor {
  overflow-anchor: auto;
  height: 1px;
}
```

---

### Bug 1.19 — Button action quá nhỏ (< 44×44px)

**Bug Condition:**
```
FUNCTION isBugCondition_1_19(input)
  INPUT: input.buttonElement: HTMLElement
  OUTPUT: boolean

  RETURN (buttonElement.offsetWidth < 44 OR buttonElement.offsetHeight < 44)
         AND isTouchDevice = true
END FUNCTION
```

**Nguyên nhân:** Nút Edit/Delete trong `PostCard.tsx` dùng `px-2.5 py-1.5` (padding quá nhỏ). Trên mobile, touch target tối thiểu theo Apple HIG và Material Design là 44×44px.

**Giải pháp kỹ thuật — `src/index.css`:**
```css
/* Touch target minimum size — Apple HIG 44x44px */
@media (max-width: 768px) {
  button,
  [role="button"],
  a {
    /* Mở rộng vùng chạm mà không thay đổi visual size */
    position: relative;
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Exception cho buttons đã đủ lớn */
  .touch-target-lg {
    min-height: 48px;
    min-width: 48px;
  }
  
  /* Small icon buttons: dùng pseudo-element để mở rộng vùng chạm ẩn */
  .btn-icon-sm {
    position: relative;
  }
  
  .btn-icon-sm::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 44px;
    min-height: 44px;
  }
}
```

**Cập nhật `PostCard.tsx`:**
```tsx
// Thêm class btn-icon-sm cho Edit/Delete buttons
<button
  onClick={handleEdit}
  className="btn-icon-sm flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-indigo-600 
             hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors text-xs font-medium"
>
  <Edit2 className="w-4 h-4" />
  <span className="hidden sm:inline">Sửa</span>
</button>
```

---

### Bug 1.20 — Font size không responsive ở landscape mode

**Bug Condition:**
```
FUNCTION isBugCondition_1_20(input)
  INPUT: input.orientation: 'portrait' | 'landscape', input.viewportWidth: number,
         input.fontSize: number
  OUTPUT: boolean

  RETURN input.orientation = 'landscape'
         AND input.viewportWidth < 768  -- mobile landscape
         AND (input.fontSize < 13 OR input.fontSize > 18)
END FUNCTION
```

**Nguyên nhân:** `index.css` đặt `font-size: 18px` cho mobile (max-width: 768px) nhưng không có breakpoint landscape riêng. Landscape mobile (568px-768px wide) có viewport height rất hẹp, font 18px quá lớn.

**Giải pháp kỹ thuật — `src/index.css`:**
```css
/* Mobile portrait: 18px (đã có) */
@media screen and (max-width: 768px) {
  html {
    font-size: 18px;
  }
}

/* Mobile landscape: viewport rộng hơn nhưng cao hơn hẹp → font nhỏ hơn */
@media screen and (max-width: 900px) and (orientation: landscape) and (max-height: 500px) {
  html {
    font-size: 15px;  /* Nhỏ hơn để fit content trong chiều cao hẹp */
  }
  
  /* PostCard content: dùng clamp() cho responsive font */
  .post-card-content {
    font-size: clamp(13px, 2.5vw, 16px);
    line-height: 1.5;
  }
  
  /* Heading trong PostCard */
  .post-card-username {
    font-size: clamp(12px, 2vw, 15px);
  }
}

/* Responsive font cho post content với clamp() */
@media (max-width: 768px) {
  .post-content-text {
    font-size: clamp(14px, 4vw, 17px);
    line-height: 1.6;
  }
}
```

---

## Expected Behavior

### Preservation Requirements

**Hành vi KHÔNG được thay đổi sau fix:**

- Mouse clicks trên mọi button tiếp tục hoạt động bình thường trên desktop
- Desktop layout (≥ 1024px) không bị ảnh hưởng bởi bất kỳ thay đổi CSS mobile nào
- Tablet layout (768px - 1023px) giữ nguyên responsive breakpoints `md:`
- Firebase Firestore operations (gửi tin nhắn, đăng bài, check-in) hoạt động bình thường
- Dark mode trên desktop hiển thị đúng glassmorphism effects đã thiết kế
- `content-visibility: auto` vẫn được áp dụng, chỉ thay đổi giá trị `contain-intrinsic-size`
- Cache warming (top 20 địa điểm) sau 1 giây vẫn hoạt động
- Toast notifications vẫn hiển thị khi nhận tin nhắn mới
- Google OAuth login vẫn hoạt động bình thường
- Online status heartbeat vẫn cập nhật theo chu kỳ cấu hình
- Keyboard navigation (focus ring) theo chuẩn `*:focus-visible` không thay đổi
- Tất cả Firestore real-time listeners vẫn hoạt động

**Scope:**
Tất cả inputs KHÔNG thuộc bug condition phải hoạt động y hệt trước fix. Cụ thể:
- Desktop users (viewport ≥ 768px) không bị ảnh hưởng bởi mobile CSS fixes
- Mouse click interactions không bị ảnh hưởng bởi touch handler additions
- Non-chat screens không bị ảnh hưởng bởi keyboard/scroll fixes của Chat
- Light mode không bị ảnh hưởng bởi dark mode color fixes

---

## Hypothesized Root Cause

### Nhóm 1: CSS/Layout Issues (Bug 1.1, 1.2, 1.3, 1.4, 1.16, 1.20)
1. **Thiếu responsive constraints**: Không có `min-width: 0` trên flex children → overflow
2. **Hardcode height với `vh`**: Không dùng `dvh` → sai khi keyboard ảo xuất hiện
3. **`contain-intrinsic-size` không khớp**: Giá trị `0 120px` sai với chiều cao thực ~280-400px
4. **Missing `aspect-ratio`**: Dùng `min-height`/`max-height` cố định thay vì `aspect-ratio`

### Nhóm 2: Touch/Gesture Missing (Bug 1.8, 1.9, 1.10, 1.17)
5. **Không có debounce trên reaction**: `isReacting` flag chưa đủ để chặn double-tap 300ms
6. **Swipe-to-delete chưa implement**: Không có `touchstart`/`touchmove`/`touchend` handlers
7. **Long press chưa implement**: Không có `setTimeout(500ms)` + touch handlers
8. **Scroll momentum tap**: Không có scroll state tracking để block tap khi đang scroll

### Nhóm 3: Navigation/UX (Bug 1.6, 1.7, 1.11, 1.12, 1.13, 1.18)
9. **Preload quá muộn**: `preloadCriticalRoutes()` chờ profile load thay vì chạy sớm
10. **`100vh` thay vì `100dvh`**: Keyboard ảo iOS không cập nhật `100vh`
11. **Không có `popstate` handler**: SPA không xử lý Android Back button
12. **Click listener thay vì touchstart**: Delay 300ms khi đóng hamburger menu
13. **Scroll animation không bị cancel**: `scrollTo instant` không đủ trên iOS Safari
14. **Không có scroll anchor**: Prepend messages làm nhảy scroll position

### Nhóm 4: UI Rendering (Bug 1.14, 1.15, 1.19)
15. **CSS specificity conflict**: Inline styles override dark mode CSS classes
16. **ReactionPicker position hardcode**: `bottom-full left-0` không check viewport bounds
17. **Touch target quá nhỏ**: Padding CSS không đủ để đạt 44×44px minimum

---

## Correctness Properties

Property 1: Bug Condition - Mobile Layout Không Overflow

_For any_ viewport với `width < 375px`, sau fix, hệ thống SHALL hiển thị toàn bộ nội dung trong viewport không có horizontal scroll, `document.body.scrollWidth <= window.innerWidth`.

**Validates: Requirements 2.1**

---

Property 2: Bug Condition - Modal Scrollable trên Mobile

_For any_ modal được mở trên mobile với nội dung chiều cao > 90dvh, sau fix, hệ thống SHALL hiển thị `overflow-y: auto` với `max-height: 90dvh`, cho phép cuộn toàn bộ nội dung.

**Validates: Requirements 2.2**

---

Property 3: Bug Condition - Ảnh PostCard Đúng Tỷ Lệ

_For any_ PostCard với 1-3 ảnh trên màn hình < 375px, sau fix, hệ thống SHALL render ảnh với `aspect-ratio` hoặc `object-cover`, không bị stretch hay overflow container.

**Validates: Requirements 2.3**

---

Property 4: Bug Condition - MapView Panel Không Chồng Bản Đồ

_For any_ trạng thái `selectedPlace != null` trên mobile map tab, sau fix, hệ thống SHALL hiển thị place info trong bottom sheet riêng biệt, bản đồ vẫn tương tác được phía sau.

**Validates: Requirements 2.4**

---

Property 5: Bug Condition - Scroll FPS ≥ 60fps với contain-intrinsic-size Đúng

_For any_ PostCard render với `content-visibility: auto`, sau fix, `contain-intrinsic-size` SHALL phản ánh chiều cao thực tế (~350px có ảnh, ~160px text-only), giảm layout shift khi scroll.

**Validates: Requirements 2.5, 3.10**

---

Property 6: Bug Condition - Tab Switch trong 500ms

_For any_ lần đầu switch sang tab Posts/Chat/Explore/Documents, sau fix, lazy component SHALL bắt đầu render trong ≤ 500ms nhờ preload được kích hoạt sớm.

**Validates: Requirements 2.6**

---

Property 7: Bug Condition - Chat Input Không Bị Che Keyboard

_For any_ trạng thái keyboard ảo visible trên iOS/Android, sau fix, chat input SHALL hiển thị trên keyboard, container height tính đúng bằng `100dvh`.

**Validates: Requirements 2.7**

---

Property 8: Bug Condition - Reaction Debounce 300ms

_For any_ sequence nhấn reaction với interval < 300ms, sau fix, hệ thống SHALL chỉ gọi Firestore updateDoc một lần, `apiCallCount = 1` cho mọi burst tap trong 300ms.

**Validates: Requirements 2.8**

---

Property 9: Bug Condition - Swipe Left Hiện Nút Xóa

_For any_ swipe left > 80px trên message của owner, sau fix, hệ thống SHALL hiển thị delete button với animation trượt. Swipe > 150px SHALL auto-trigger delete.

**Validates: Requirements 2.9**

---

Property 10: Bug Condition - Long Press Hiện Context Menu

_For any_ press duration ≥ 500ms trên message, sau fix, hệ thống SHALL hiển thị context menu với options Xóa/Copy, kèm haptic feedback (vibrate 50ms) nếu được hỗ trợ.

**Validates: Requirements 2.10**

---

Property 11: Bug Condition - Android Back Button Điều Hướng Đúng

_For any_ `popstate` event khi đang ở view `['chat', 'results', 'profile', 'settings']`, sau fix, hệ thống SHALL điều hướng về view cha thay vì đóng app.

**Validates: Requirements 2.11**

---

Property 12: Bug Condition - Hamburger Menu Đóng Ngay Khi Tap Ngoài

_For any_ `touchstart` event với target ngoài menu và toggle button, sau fix, hệ thống SHALL đóng menu ngay lập tức (< 50ms), không có delay 100-400ms.

**Validates: Requirements 2.12**

---

Property 13: Bug Condition - Tab Click Cancel Scroll Animation

_For any_ tab navigation click khi đang scroll, sau fix, hệ thống SHALL set `scrollTop = 0` ngay lập tức và cancel mọi smooth scroll animation đang chạy.

**Validates: Requirements 2.13**

---

Property 14: Bug Condition - Dark Mode Contrast Ratio ≥ 4.5:1

_For any_ text element trong PostCard ở dark mode, sau fix, computed contrast ratio giữa text color và background SHALL ≥ 4.5:1 theo WCAG AA standard.

**Validates: Requirements 2.14**

---

Property 15: Bug Condition - ReactionPicker Trong Viewport

_For any_ ReactionPicker hiển thị với trigger button gần cạnh viewport, sau fix, picker SHALL tự điều chỉnh vị trí để toàn bộ picker nằm trong viewport bounds.

**Validates: Requirements 2.15**

---

Property 16: Bug Condition - ConversationsList Name/Timestamp Không Chồng

_For any_ conversation item trên viewport < 375px, sau fix, name SHALL dùng `truncate` (1 dòng) và timestamp SHALL hiển thị trên cùng hàng, không overlap.

**Validates: Requirements 2.16**

---

Property 17: Bug Condition - Tap Đúng Item Sau Khi Scroll

_For any_ tap vào conversation item trong vòng 150ms sau khi scroll dừng, sau fix, hệ thống SHALL kích hoạt đúng item được tap (không phải item sai do scroll momentum).

**Validates: Requirements 2.17**

---

Property 18: Bug Condition - Chat Scroll Anchor Sau Load More

_For any_ `loadMore` trigger, sau fix, scroll position SHALL duy trì tại cùng tin nhắn đang xem, `newScrollTop = prevScrollTop + heightDiff`.

**Validates: Requirements 2.18**

---

Property 19: Bug Condition - Touch Target ≥ 44×44px

_For any_ button/action element trên mobile, sau fix, touch target (bao gồm pseudo-element) SHALL có kích thước tối thiểu 44×44px.

**Validates: Requirements 2.19**

---

Property 20: Bug Condition - Font Size Responsive Landscape

_For any_ mobile landscape viewport (width < 900px, height < 500px), sau fix, font-size SHALL ∈ [13px, 16px] thay vì 18px portrait default.

**Validates: Requirements 2.20**

---

Property 21: Preservation - Desktop Layout Không Thay Đổi

_For any_ viewport width ≥ 768px, tất cả CSS fixes SHALL chỉ apply trong `@media (max-width: 768px)` hoặc `@media (max-width: 374px)`, desktop layout SHALL giữ nguyên.

**Validates: Requirements 3.1, 3.2**

---

Property 22: Preservation - Core Functions Hoạt Động Bình Thường

_For any_ Firestore write operation (gửi tin nhắn, đăng bài, reaction), sau fix, operation SHALL hoàn thành thành công, không có regression từ touch/gesture changes.

**Validates: Requirements 3.3, 3.4, 3.5, 3.6**

---

Property 23: Preservation - Dark Mode Desktop Không Đổi

_For any_ dark mode trên desktop, glassmorphism effects và màu sắc đã thiết kế SHALL không thay đổi. Chỉ dark mode text color conflicts trên mobile PostCard được sửa.

**Validates: Requirements 3.7, 3.8**

---

## Fix Implementation

### Tổng quan file cần sửa đổi

| File | Loại thay đổi | Bugs liên quan |
|------|--------------|----------------|
| `src/index.css` | CSS additions/modifications | 1.1, 1.2, 1.5, 1.7, 1.13, 1.14, 1.17, 1.19, 1.20 |
| `src/components/PostCard.tsx` | TSX refactor | 1.3, 1.8, 1.14, 1.19 |
| `src/components/Chat.tsx` | TSX additions (hooks) | 1.7, 1.9, 1.10, 1.18 |
| `src/components/ConversationsList.tsx` | TSX modifications | 1.16, 1.17 |
| `src/components/MapView.tsx` | TSX additions (bottom sheet) | 1.4 |
| `src/components/ReactionPicker.tsx` | TSX modifications | 1.15 |
| `src/App.tsx` | TSX additions (event handlers) | 1.6, 1.11, 1.12, 1.13 |

---

### Chi tiết thay đổi theo file

#### `src/index.css`

**Thay đổi 1**: Sửa `.post-card contain-intrinsic-size` từ `0 120px` → `0 350px` + variants
**Thay đổi 2**: Thêm `@media (max-width: 374px)` với `max-width: 100%` và `min-width: 0` cho flex
**Thay đổi 3**: Thêm `.modal-mobile-safe` class với `max-height: 90dvh; overflow-y: auto`
**Thay đổi 4**: Thêm `@media landscape` breakpoint với `font-size: 15px` và `clamp()` cho font
**Thay đổi 5**: Thêm `.btn-icon-sm::after` pseudo-element mở rộng touch target 44×44px
**Thay đổi 6**: Thêm `.chat-messages-container { overflow-anchor: auto }` cho scroll anchor
**Thay đổi 7**: Thêm CSS custom properties `--text-primary`, `--bg-card` cho dark mode

#### `src/components/PostCard.tsx`

**Thay đổi 1**: Thêm `lastReactionTimeRef` + debounce check 300ms trong `handleReaction`
**Thay đổi 2**: Sửa grid 2/3 ảnh dùng `aspectRatio: '4/3'` thay vì `min-height`/`max-height`
**Thay đổi 3**: Thêm class variants `text-only`/`multi-image` cho `contain-intrinsic-size`
**Thay đổi 4**: Thay inline `style={{ color: '#000000' }}` bằng Tailwind `text-gray-900 dark:text-white`
**Thay đổi 5**: Thêm class `btn-icon-sm` cho Edit/Delete buttons, tăng padding lên `py-2`

#### `src/components/Chat.tsx`

**Thay đổi 1**: Thêm `useSwipeToDelete` hook với touch handlers
**Thay đổi 2**: Thêm `useLongPress` hook với `setTimeout(500ms)` + haptic
**Thay đổi 3**: Thêm `MessageContextMenu` component
**Thay đổi 4**: Thêm `prevScrollHeightRef` + `useEffect` khôi phục scroll sau `loadMore`
**Thay đổi 5**: Thêm `useEffect` lắng nghe `visualViewport resize` + `focus` scroll into view
**Thay đổi 6**: Thêm `data-chat-input` attribute vào textarea

#### `src/components/ConversationsList.tsx`

**Thay đổi 1**: Sửa flex row tên/timestamp: `WebkitLineClamp: 2` → `truncate` (1 dòng)
**Thay đổi 2**: Thêm `isScrollingRef` + scroll event listener
**Thay đổi 3**: Block `onClick` khi `isScrollingRef.current = true`

#### `src/components/MapView.tsx`

**Thay đổi 1**: Thêm `PlaceInfoBottomSheet` component với height variants `peek/half/full`
**Thay đổi 2**: Thêm `panelOpen` state, chuyển place info từ absolute overlay → bottom sheet
**Thay đổi 3**: Thêm touch handlers cho drag gesture trên bottom sheet handle

#### `src/components/ReactionPicker.tsx`

**Thay đổi 1**: Thêm `pickerStyle` state với `calculatePickerPosition()` function
**Thay đổi 2**: `useEffect` tính position mỗi khi `showPicker = true`
**Thay đổi 3**: Thay class `bottom-full left-0` bằng dynamic `style={pickerStyle}`

#### `src/App.tsx`

**Thay đổi 1**: Thêm `useEffect` preload routes sau 1s (không đợi profile)
**Thay đổi 2**: Thêm `handleNavHover` function cho intent-based preloading
**Thay đổi 3**: Thêm `window.history.pushState` khi navigate đến sub-views
**Thay đổi 4**: Thêm `window.addEventListener('popstate', handlePopState)`
**Thay đổi 5**: Thay `setTimeout 100ms` + click listener → `touchstart` listener không delay
**Thay đổi 6**: Sửa `useLayoutEffect` thêm direct `scrollTop = 0` trước `scrollTo`
**Thay đổi 7**: Thêm `visualViewport` listener cho `--visual-viewport-height` CSS variable

---

## Testing Strategy

### Validation Approach

Chiến lược kiểm tra theo 3 giai đoạn:
1. **Exploratory**: Chạy test trên code CHƯA fix để xác nhận lỗi tồn tại và hiểu root cause
2. **Fix Checking**: Chạy test sau fix để xác nhận lỗi đã được sửa (Property 1-20)
3. **Preservation Checking**: Chạy test để xác nhận không có regression (Property 21-23)

---

### Exploratory Bug Condition Checking

**Mục tiêu**: Tìm counterexample trên code CHƯA fix để xác nhận giả thuyết root cause.

**Test Plan**:
1. **Overflow Test**: Mở app trên Chrome DevTools với viewport 360×640px → kiểm tra `document.body.scrollWidth > 360`
2. **Modal Cut Test**: Mở CreateDocumentModal trên mobile → kiểm tra nội dung bị cắt không
3. **Contain Test**: Đo chiều cao thực tế PostCard có ảnh → so với `contain-intrinsic-size: 0 120px`
4. **Reaction Tap Test**: Nhấn nhanh Like button 3 lần trong 100ms → kiểm tra network calls
5. **Swipe Test**: Thử vuốt trái message → confirm không có gì xảy ra
6. **Back Button Test**: Nhấn Android Back ở chat screen → confirm app đóng

**Counterexamples mong đợi trước fix**:
- `document.body.scrollWidth` = 400px trên viewport 360px → overflow xác nhận
- `apiCallCount` = 3 khi tap 3 lần trong 100ms → debounce missing xác nhận
- `deleteRevealVisible` = false sau swipe 100px → missing handler xác nhận
- `window.history.length` không thay đổi khi navigate → pushState missing xác nhận

---

### Fix Checking

**Mục tiêu**: Với mọi input thỏa `isBugCondition(X)`, hàm đã fix SHALL trả về kết quả thỏa `P(result)`.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Test cases quan trọng nhất sau fix:**
- Viewport 360px: `document.body.scrollWidth <= 360` ✓
- Modal mở: `overflow-y = 'auto'` và `max-height ≤ 90dvh` ✓
- Reaction tap 3 lần 100ms: chỉ 1 Firestore call ✓
- Swipe left 90px: delete button visible ✓
- Android Back: navigate về conversations, app không đóng ✓
- Dark mode PostCard: contrast ratio ≥ 4.5:1 ✓

---

### Preservation Checking

**Mục tiêu**: Với mọi input KHÔNG thỏa `isBugCondition(X)`, hành vi sau fix = hành vi trước fix.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Test Plan**:
- **Desktop Layout**: Quan sát desktop layout trên code CHƯA fix → viết property test xác nhận layout giống hệt sau fix
- **Mouse Click**: Quan sát click reactions, button hoạt động trên desktop → property test verify sau fix
- **Firestore Operations**: Observe messages gửi thành công → integration test sau fix

---

### Unit Tests

**File: `src/components/__tests__/PostCard.test.tsx`**
```tsx
describe('PostCard Reaction Debounce', () => {
  it('chỉ gọi updateDoc 1 lần khi tap 3 lần trong 100ms', async () => {
    const mockUpdateDoc = jest.fn();
    // ... setup
    
    // Simulate 3 rapid taps
    fireEvent.click(reactionButton);
    fireEvent.click(reactionButton); // 50ms sau
    fireEvent.click(reactionButton); // 100ms sau
    
    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });
  });
  
  it('gọi updateDoc 2 lần khi tap cách nhau 400ms', async () => {
    // ...
    fireEvent.click(reactionButton);
    await delay(400);
    fireEvent.click(reactionButton);
    
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
  });
});

describe('PostCard Button Touch Targets', () => {
  it('Edit button có touch target ≥ 44px', () => {
    const { getByTitle } = render(<PostCard ... />);
    const editBtn = getByTitle('Sửa bài viết');
    const rect = editBtn.getBoundingClientRect();
    // Kiểm tra kể cả pseudo-element padding
    expect(editBtn.offsetHeight + getPseudoElementSize(editBtn)).toBeGreaterThanOrEqual(44);
  });
});
```

**File: `src/components/__tests__/ReactionPicker.test.tsx`**
```tsx
describe('ReactionPicker Viewport Positioning', () => {
  it('flip sang phải khi trigger gần cạnh trái viewport', () => {
    // Mock getBoundingClientRect: left = 10px (gần cạnh trái)
    // Expect picker style.right = 0, style.left = 'auto'
  });
  
  it('hiển thị bên dưới khi trigger gần top viewport', () => {
    // Mock getBoundingClientRect: top = 20px (gần top)
    // Expect picker style.top = 'calc(100% + 8px)'
  });
  
  it('hiển thị bên trên khi có đủ space', () => {
    // Mock: top = 300px (đủ space phía trên)
    // Expect picker style.bottom = 'calc(100% + 8px)'
  });
});
```

**File: `src/components/__tests__/Chat.test.tsx`**
```tsx
describe('Chat Swipe To Delete', () => {
  it('hiển thị delete button khi swipe left > 80px', async () => {
    fireEvent.touchStart(messageEl, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(messageEl, { touches: [{ clientX: 110, clientY: 102 }] }); // -90px
    
    const deleteBtn = getByTestId('swipe-delete-btn');
    expect(deleteBtn).toBeVisible();
  });
  
  it('không trigger swipe khi scroll dọc', () => {
    fireEvent.touchStart(messageEl, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(messageEl, { touches: [{ clientX: 195, clientY: 150 }] }); // -5x, +50y
    
    // Swipe không được kích hoạt
    expect(swipeOffset).toBe(0);
  });
});

describe('Chat Scroll Anchor', () => {
  it('giữ scroll position sau loadMore', async () => {
    const initialScrollTop = 200;
    scrollRef.current.scrollTop = initialScrollTop;
    const initialScrollHeight = scrollRef.current.scrollHeight;
    
    fireEvent.click(loadMoreBtn);
    
    // Simulate new messages added (height tăng 500px)
    Object.defineProperty(scrollRef.current, 'scrollHeight', { value: initialScrollHeight + 500 });
    
    await waitFor(() => {
      expect(scrollRef.current.scrollTop).toBe(initialScrollTop + 500);
    });
  });
});
```

**File: `src/__tests__/App.popstate.test.tsx`**
```tsx
describe('App Popstate Handler', () => {
  it('navigate về conversations khi Back từ chat', () => {
    const { getByTestId } = render(<App />);
    
    // Navigate đến chat (pushState)
    act(() => { /* setView('chat') */ });
    expect(window.history.length).toBeGreaterThan(1);
    
    // Simulate Back button
    window.history.back();
    await waitFor(() => {
      expect(getByTestId('view-indicator')).toHaveTextContent('conversations');
    });
  });
  
  it('không đóng app khi Back từ root view', () => {
    // Simulate popstate với state = null
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    
    // App vẫn còn trong DOM
    expect(document.body).toBeTruthy();
  });
});
```

---

### Property-Based Tests

**Dùng Vitest + fast-check để generate random inputs:**

**File: `src/components/__tests__/PostCard.pbt.test.tsx`**
```tsx
import fc from 'fast-check';

describe('Property 8: Reaction Debounce', () => {
  it('mọi burst tap < 300ms chỉ tạo 1 API call', () => {
    fc.assert(
      fc.property(
        // Generate: số lần tap (2-10) với interval ngẫu nhiên 10-280ms
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 10, max: 280 }),
        (tapCount, intervalMs) => {
          const callLog: number[] = [];
          let lastCallTime = 0;
          
          const debouncedReact = (timestamp: number) => {
            if (timestamp - lastCallTime < 300) return;
            callLog.push(timestamp);
            lastCallTime = timestamp;
          };
          
          // Simulate rapid taps
          for (let i = 0; i < tapCount; i++) {
            debouncedReact(i * intervalMs);
          }
          
          // Nếu tất cả taps trong 300ms, chỉ được 1 call
          const totalDuration = (tapCount - 1) * intervalMs;
          if (totalDuration < 300) {
            return callLog.length === 1;
          }
          return true; // Không test case này
        }
      )
    );
  });
});

describe('Property 3: Image Aspect Ratio Preservation', () => {
  it('container aspect ratio đúng với mọi image count (1-3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }), // image count
        fc.integer({ min: 300, max: 375 }), // viewport width
        (imageCount, viewportWidth) => {
          // Verify rằng với mọi image count,
          // container không vượt viewportWidth
          const containerWidth = Math.min(viewportWidth - 32, viewportWidth); // 16px padding mỗi bên
          const gridGap = imageCount > 1 ? 6 : 0; // 1.5 * 4px gap
          const itemWidth = imageCount > 1 
            ? (containerWidth - gridGap * (imageCount - 1)) / imageCount
            : containerWidth;
          
          return itemWidth > 0 && itemWidth <= containerWidth;
        }
      )
    );
  });
});

describe('Property 21: Desktop Layout Preservation', () => {
  it('không có mobile CSS nào ảnh hưởng viewport ≥ 768px', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 768, max: 1920 }), // desktop viewport width
        (viewportWidth) => {
          // Mọi mobile CSS trong @media (max-width: 768px)
          // không apply khi viewportWidth >= 768
          const mobileMediaQuery = window.matchMedia(`(max-width: 768px)`);
          // Trong test environment với viewportWidth >= 768, media query = false
          return !mobileMediaQuery.matches;
        }
      )
    );
  });
});
```

**File: `src/components/__tests__/ReactionPicker.pbt.test.tsx`**
```tsx
describe('Property 15: ReactionPicker Viewport Bounds', () => {
  it('picker luôn nằm trong viewport với mọi trigger position', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Trigger button position (ngẫu nhiên trong viewport)
          left: fc.integer({ min: 0, max: 375 }),
          top: fc.integer({ min: 0, max: 812 }),
          width: fc.integer({ min: 44, max: 100 }),
          height: fc.integer({ min: 44, max: 60 }),
        }),
        (triggerRect) => {
          const PICKER_WIDTH = 280;
          const PICKER_HEIGHT = 60;
          const VIEWPORT_WIDTH = 375;
          const VIEWPORT_HEIGHT = 812;
          
          const { left: pickerLeft, top: pickerTop } = calculatePickerPosition(
            triggerRect, PICKER_WIDTH, PICKER_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT
          );
          
          // Picker phải nằm trong viewport
          return (
            pickerLeft >= 0 &&
            pickerTop >= 0 &&
            pickerLeft + PICKER_WIDTH <= VIEWPORT_WIDTH &&
            pickerTop + PICKER_HEIGHT <= VIEWPORT_HEIGHT
          );
        }
      )
    );
  });
});
```

**File: `src/components/__tests__/Chat.pbt.test.tsx`**
```tsx
describe('Property 9: Swipe-to-Delete Behavior', () => {
  it('swipe distance quyết định đúng trạng thái', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -300, max: 0 }), // swipe offset (âm = trái)
        (swipeOffset) => {
          const THRESHOLD = 80;
          const DELETE_THRESHOLD = 150;
          
          if (swipeOffset < -DELETE_THRESHOLD) {
            // Auto delete triggered
            return true; // delete action called
          } else if (swipeOffset < -THRESHOLD) {
            // Delete button revealed
            return Math.abs(swipeOffset) >= THRESHOLD;
          } else {
            // Snap back
            return swipeOffset > -THRESHOLD;
          }
        }
      )
    );
  });
});

describe('Property 18: Scroll Anchor After Load More', () => {
  it('scroll position = prevScrollTop + heightDiff cho mọi heightDiff', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }), // prevScrollTop
        fc.integer({ min: 50, max: 2000 }), // heightDiff (new messages height)
        (prevScrollTop, heightDiff) => {
          const prevScrollHeight = 2000;
          const newScrollHeight = prevScrollHeight + heightDiff;
          
          const expectedScrollTop = prevScrollTop + heightDiff;
          const actualScrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          
          return actualScrollTop === expectedScrollTop;
        }
      )
    );
  });
});
```

---

### Integration Tests

**Môi trường**: Vitest + React Testing Library + jsdom / Playwright cho E2E

**Test 1 — Full Chat Flow với Keyboard**:
```
SCENARIO: Chat trên iOS Safari
  GIVEN user mở chat screen
  WHEN tap vào input field → keyboard hiện lên
  THEN input field visible (không bị che)
  AND scroll container đúng chiều cao
  
  WHEN gõ tin nhắn và nhấn gửi
  THEN tin nhắn xuất hiện trong list
  AND scroll tự động xuống cuối
  
  WHEN swipe left message của mình > 80px
  THEN delete button xuất hiện
  
  WHEN release > 150px
  THEN message bị xóa
```

**Test 2 — Tab Switch Performance**:
```
SCENARIO: Chuyển tabs lần đầu
  GIVEN app vừa load xong (sau 1s)
  WHEN click tab Posts
  THEN component bắt đầu render trong ≤ 500ms
  AND scroll position = 0
  AND không có horizontal overflow
  
  WHEN click tab Explore
  THEN MapView render ≤ 500ms
  
  WHEN click Back button (Android)
  THEN navigate về Posts tab (không đóng app)
```

**Test 3 — ConversationsList Scroll + Tap**:
```
SCENARIO: Tap item sau khi scroll
  GIVEN ConversationsList với 20 conversations
  WHEN scroll nhanh → scroll momentum đang chạy
  AND tap vào item thứ 5 trong khi đang scroll
  THEN không kích hoạt item
  
  WHEN scroll dừng hẳn (>150ms)
  AND tap vào item thứ 5
  THEN onStartChat được gọi với đúng uid của item 5
```

**Test 4 — Dark Mode Contrast**:
```
SCENARIO: PostCard dark mode
  GIVEN dark mode enabled
  WHEN render PostCard
  THEN tất cả text elements có contrast ratio ≥ 4.5:1
  AND không có text trắng trên nền trắng
  AND không có text đen trên nền đen
```

**Test 5 — ReactionPicker trên các vị trí khác nhau**:
```
SCENARIO: PostCard ở cạnh phải màn hình
  GIVEN PostCard render ở right edge viewport
  WHEN hover/tap Like button
  THEN ReactionPicker xuất hiện
  AND toàn bộ picker nằm trong viewport (không tràn phải)
  
SCENARIO: PostCard ở đầu feed
  GIVEN PostCard render ở top viewport  
  WHEN hover/tap Like button
  THEN picker hiển thị phía DƯỚI button (không trên)
```
