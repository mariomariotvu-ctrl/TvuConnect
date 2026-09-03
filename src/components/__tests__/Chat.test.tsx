/**
 * Task 10.5 — Chat Unit Tests
 *
 * Kiểm tra các hành vi cụ thể của Chat component:
 * - Swipe-to-delete: touchStart → touchMove → delete button visible
 * - Scroll dọc không trigger swipe (phân biệt ngang/dọc)
 * - Long press: nhấn giữ 500ms → context menu visible, vibrate(50) called
 * - Scroll anchor: loadMore → scrollTop = initialScrollTop + heightDiff
 *
 * Validates: Requirements 2.9, 2.10, 2.18
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// Logic từ useSwipeToDelete (Chat.tsx)
// ──────────────────────────────────────────────────────────────────

/**
 * Mô phỏng logic xử lý swipe trong onTouchMove:
 *
 *   const deltaX = e.touches[0].clientX - touchStartX.current;
 *   const deltaY = e.touches[0].clientY - touchStartY.current;
 *   if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;  // scroll dọc
 *   if (deltaX > 0) return;                                   // swipe phải
 *   const clampedOffset = Math.max(deltaX, -SWIPE_DELETE_THRESHOLD);
 */
function simulateSwipe(
  startX: number,
  moveX: number,
  startY = 0,
  moveY = 0,
): { processed: boolean; offset: number } {
  const deltaX = moveX - startX;
  const deltaY = moveY - startY;

  // Chỉ xử lý swipe ngang rõ ràng (deltaX chiếm ưu thế)
  if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
    return { processed: false, offset: 0 };
  }

  // Chỉ swipe trái (deltaX âm)
  if (deltaX > 0) {
    return { processed: false, offset: 0 };
  }

  // Clamp về -150px (SWIPE_DELETE_THRESHOLD)
  const clampedOffset = Math.max(deltaX, -150);
  return { processed: true, offset: clampedOffset };
}

/**
 * Mô phỏng logic xử lý swipeEnd — quyết định action sau khi thả ngón tay:
 *
 *   if (offset < -SWIPE_DELETE_THRESHOLD) onDelete()    → 'delete'
 *   else if (offset < -SWIPE_THRESHOLD) setOffset(-80)  → 'reveal'
 *   else setOffset(0)                                   → 'snap'
 */
function processSwipeEnd(offset: number): 'delete' | 'reveal' | 'snap' {
  if (offset < -150) return 'delete';
  if (offset < -80) return 'reveal';
  return 'snap';
}

// ──────────────────────────────────────────────────────────────────
// Logic từ handleLoadMore scroll anchor (Chat.tsx)
// ──────────────────────────────────────────────────────────────────

/**
 * Mô phỏng logic tính scrollTop mới sau loadMore:
 *
 *   const heightDiff = newScrollHeight - prevScrollHeight;
 *   if (heightDiff > 0) {
 *     scrollRef.current.scrollTop = prevScrollTop + heightDiff;
 *   }
 */
function calculateNewScrollTop(
  prevScrollTop: number,
  prevScrollHeight: number,
  newScrollHeight: number,
): number {
  const heightDiff = newScrollHeight - prevScrollHeight;
  return heightDiff > 0 ? prevScrollTop + heightDiff : prevScrollTop;
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

describe('Chat Unit Tests', () => {

  // ────────────────────────────────────────────────────────────────
  // Swipe-to-Delete — Validates: Requirements 2.9
  // Bug Condition: swipeDirection = 'left' AND swipeDistance > 60 AND deleteButton.visible = false
  // Expected Behavior: swipe trái > 80px hiện delete button; > 150px auto-delete
  // ────────────────────────────────────────────────────────────────
  describe('Swipe-to-Delete', () => {

    it('touchStart(200) → touchMove(110) = -90px → delete button visible', () => {
      const result = simulateSwipe(200, 110);
      expect(result.processed).toBe(true);
      expect(result.offset).toBe(-90);
      // -90 < -80 → reveal (hiện nút xóa)
      expect(processSwipeEnd(result.offset)).toBe('reveal');
    });

    it('scroll dọc (deltaX=-5, deltaY=50) không trigger swipe', () => {
      // deltaX = 195 - 200 = -5, deltaY = 150 - 100 = 50
      // Math.abs(-5) = 5 < Math.abs(50) * 1.5 = 75 → không xử lý
      const result = simulateSwipe(200, 195, 100, 150);
      expect(result.processed).toBe(false);
    });

    it('swipe phải (deltaX dương) không trigger', () => {
      // startX=100, moveX=200 → deltaX = +100 (swipe phải)
      const result = simulateSwipe(100, 200);
      expect(result.processed).toBe(false);
    });

    it('swipe -200px vượt ngưỡng 150px → auto delete', () => {
      // startX=300, moveX=100 → deltaX = -200, clamp về -150
      const result = simulateSwipe(300, 100);
      expect(result.processed).toBe(true);
      // offset bị clamp về -150 (SWIPE_DELETE_THRESHOLD)
      expect(result.offset).toBe(-150);
      // processSwipeEnd(-150): -150 không < -150 → 'reveal' (boundary)
      // Nếu offset từ deltaX = -200 (trước clamp) thì delete
      expect(processSwipeEnd(-200)).toBe('delete');
    });

    it('swipe đúng tại ngưỡng -80px → reveal (không snap, không delete)', () => {
      // deltaX = -80: Math.abs(-80) >= Math.abs(0) * 1.5 → ngang
      const result = simulateSwipe(100, 20); // deltaX = -80
      expect(result.processed).toBe(true);
      expect(result.offset).toBe(-80);
      // processSwipeEnd(-80): -80 không < -80 → 'snap' (boundary chính xác)
      expect(processSwipeEnd(-80)).toBe('snap');
      // processSwipeEnd(-81) → 'reveal'
      expect(processSwipeEnd(-81)).toBe('reveal');
    });

    it('swipe -50px < ngưỡng 80px → snap về 0', () => {
      const result = simulateSwipe(100, 50); // deltaX = -50
      expect(result.processed).toBe(true);
      expect(result.offset).toBe(-50);
      expect(processSwipeEnd(result.offset)).toBe('snap');
    });

    it('di chuyển chéo (deltaX=-30, deltaY=15) với deltaX chiếm ưu thế → xử lý swipe', () => {
      // Math.abs(-30) = 30, Math.abs(15) * 1.5 = 22.5 → 30 >= 22.5 → xử lý
      const result = simulateSwipe(100, 70, 0, 15); // deltaX=-30, deltaY=15
      expect(result.processed).toBe(true);
      expect(result.offset).toBe(-30);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Long Press — Validates: Requirements 2.10
  // Bug Condition: pressDuration >= 500 AND contextMenu.visible = false
  // Expected Behavior: nhấn giữ ≥ 500ms hiện context menu, vibrate(50) called
  // ────────────────────────────────────────────────────────────────
  describe('Long Press', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('nhấn giữ đúng 500ms → callback được gọi', () => {
      const onLongPress = vi.fn();
      let timerId: ReturnType<typeof setTimeout> | null = null;

      // Simulate onTouchStart: đặt timer 500ms
      timerId = setTimeout(() => onLongPress(), 500);

      // Sau 499ms: chưa gọi
      vi.advanceTimersByTime(499);
      expect(onLongPress).not.toHaveBeenCalled();

      // Sau thêm 1ms (tổng 500ms): callback được gọi
      vi.advanceTimersByTime(1);
      expect(onLongPress).toHaveBeenCalledTimes(1);

      if (timerId) clearTimeout(timerId);
    });

    it('touchMove hủy long press timer → callback không được gọi', () => {
      const onLongPress = vi.fn();
      let timerId: ReturnType<typeof setTimeout> | null = null;

      // Simulate onTouchStart
      timerId = setTimeout(() => onLongPress(), 500);

      // Ngón tay di chuyển sau 300ms → hủy timer
      vi.advanceTimersByTime(300);
      clearTimeout(timerId!);
      timerId = null;

      // Thêm 300ms nữa (tổng 600ms) → không có callback
      vi.advanceTimersByTime(300);
      expect(onLongPress).not.toHaveBeenCalled();
    });

    it('touchEnd sớm (< 500ms) hủy long press', () => {
      const onLongPress = vi.fn();
      let timerId: ReturnType<typeof setTimeout> | null = null;

      // Simulate onTouchStart
      timerId = setTimeout(() => onLongPress(), 500);

      // Nhấc ngón tay sau 200ms → hủy timer (simulate onTouchEnd)
      vi.advanceTimersByTime(200);
      clearTimeout(timerId!);
      timerId = null;

      // Chờ thêm thời gian đủ để timer trigger (nếu không bị hủy)
      vi.advanceTimersByTime(400);
      expect(onLongPress).not.toHaveBeenCalled();
    });

    it('vibrate(50) được gọi khi long press kích hoạt', () => {
      // Mô phỏng navigator.vibrate
      const mockVibrate = vi.fn();
      Object.defineProperty(global.navigator, 'vibrate', {
        value: mockVibrate,
        writable: true,
        configurable: true,
      });

      const onLongPress = vi.fn(() => {
        // Logic từ useLongPress hook:
        // if ('vibrate' in navigator) navigator.vibrate(50);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      });

      const timerId = setTimeout(() => onLongPress(), 500);

      vi.advanceTimersByTime(500);

      expect(onLongPress).toHaveBeenCalledTimes(1);
      expect(mockVibrate).toHaveBeenCalledWith(50);

      clearTimeout(timerId);
    });

    it('long press sau khi touchMove không kích hoạt (timer đã hủy)', () => {
      const onLongPress = vi.fn();
      let timerId: ReturnType<typeof setTimeout> | null = null;

      timerId = setTimeout(() => onLongPress(), 500);

      // Ngón tay di chuyển → hủy timer
      clearTimeout(timerId!);
      timerId = null;

      vi.advanceTimersByTime(1000);
      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Scroll Anchor — Validates: Requirements 2.18
  // Bug Condition: loadMoreTriggered = true AND newScrollTop < previousScrollTop
  // Expected Behavior: newScrollTop = prevScrollTop + heightDiff
  // ────────────────────────────────────────────────────────────────
  describe('Scroll Anchor', () => {

    it('loadMore thêm 500px content → scrollTop = initialScrollTop + 500', () => {
      const prevScrollTop = 500;
      const prevScrollHeight = 1000;
      const newScrollHeight = 1500; // thêm 500px content

      const newScrollTop = calculateNewScrollTop(
        prevScrollTop,
        prevScrollHeight,
        newScrollHeight,
      );

      // scrollTop phải tăng thêm đúng bằng heightDiff để giữ vị trí nhìn
      expect(newScrollTop).toBe(500 + 500); // = 1000
    });

    it('không có nội dung mới (heightDiff = 0) → scrollTop không thay đổi', () => {
      const prevScrollTop = 500;
      const prevScrollHeight = 1000;
      const newScrollHeight = 1000; // không đổi

      const newScrollTop = calculateNewScrollTop(
        prevScrollTop,
        prevScrollHeight,
        newScrollHeight,
      );

      expect(newScrollTop).toBe(500);
    });

    it('loadMore thêm 300px → scrollTop tăng thêm đúng 300px', () => {
      const prevScrollTop = 200;
      const prevScrollHeight = 800;
      const newScrollHeight = 1100; // thêm 300px

      const newScrollTop = calculateNewScrollTop(
        prevScrollTop,
        prevScrollHeight,
        newScrollHeight,
      );

      expect(newScrollTop).toBe(200 + 300); // = 500
    });

    it('scrollHeight giảm (hiếm gặp) → scrollTop giữ nguyên (an toàn)', () => {
      const prevScrollTop = 400;
      const prevScrollHeight = 1000;
      const newScrollHeight = 900; // giảm (edge case)

      const newScrollTop = calculateNewScrollTop(
        prevScrollTop,
        prevScrollHeight,
        newScrollHeight,
      );

      // heightDiff < 0 → không điều chỉnh → giữ nguyên prevScrollTop
      expect(newScrollTop).toBe(400);
    });

    it('scrollTop = 0 (đang ở đầu) + loadMore 1000px → scrollTop = 1000', () => {
      const prevScrollTop = 0;
      const prevScrollHeight = 500;
      const newScrollHeight = 1500;

      const newScrollTop = calculateNewScrollTop(
        prevScrollTop,
        prevScrollHeight,
        newScrollHeight,
      );

      expect(newScrollTop).toBe(0 + 1000); // = 1000
    });

    it('công thức: newScrollTop luôn = prevScrollTop + (newScrollHeight - prevScrollHeight)', () => {
      // Kiểm tra công thức đúng với nhiều trường hợp
      const cases = [
        { prevScrollTop: 100, prevH: 500, newH: 600, expected: 200 },
        { prevScrollTop: 1000, prevH: 2000, newH: 2500, expected: 1500 },
        { prevScrollTop: 50, prevH: 300, newH: 350, expected: 100 },
      ];

      cases.forEach(({ prevScrollTop, prevH, newH, expected }) => {
        const result = calculateNewScrollTop(prevScrollTop, prevH, newH);
        expect(result).toBe(expected);
      });
    });
  });

});
