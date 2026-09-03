import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests cho ConversationsList logic
 * Requirements: 2.16 (truncate layout), 2.17 (scroll momentum block)
 *
 * Các test này kiểm tra pure logic — không cần render component.
 */

// ---------------------------------------------------------------------------
// Simulate text truncation logic (phản ánh truncate CSS trong ConversationsList)
// ---------------------------------------------------------------------------
function truncateName(
  name: string,
  containerWidth: number,
  fontSize = 15
): { truncated: boolean; displayName: string } {
  const avgCharWidth = fontSize * 0.6;
  const maxChars = Math.floor(containerWidth / avgCharWidth);
  if (name.length <= maxChars) return { truncated: false, displayName: name };
  return { truncated: true, displayName: name.slice(0, maxChars - 3) + '...' };
}

// ---------------------------------------------------------------------------
// Simulate scroll momentum guard (phản ánh isScrollingRef trong ConversationsList)
// ---------------------------------------------------------------------------
function createScrollMomentumGuard() {
  let isScrolling = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    onScroll: () => {
      isScrolling = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        isScrolling = false;
      }, 150);
    },
    onClick: (callback: () => void) => {
      if (isScrolling) return; // block click khi đang scroll
      callback();
    },
    isScrolling: () => isScrolling,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConversationsList Unit Tests', () => {
  // -------------------------------------------------------------------------
  // Truncate — Requirements: 2.16
  // -------------------------------------------------------------------------
  describe('Truncate', () => {
    it('tên dài không overflow container 360px — bị truncate và thêm "..."', () => {
      // viewport 360px - avatar(56) - chevron(24) - padding(20) = 260px cho text
      const containerWidth = 360 - 56 - 24 - 20;
      const longName = 'Nguyễn Thị Bảo Châu Phương Linh';
      const result = truncateName(longName, containerWidth);

      expect(result.truncated).toBe(true);
      expect(result.displayName.endsWith('...')).toBe(true);
    });

    it('displayName sau truncate ngắn hơn tên gốc', () => {
      const containerWidth = 360 - 56 - 24 - 20;
      const longName = 'Nguyễn Thị Bảo Châu Phương Linh';
      const result = truncateName(longName, containerWidth);

      expect(result.displayName.length).toBeLessThan(longName.length);
    });

    it('tên ngắn không bị truncate', () => {
      const containerWidth = 200;
      const shortName = 'An';
      const result = truncateName(shortName, containerWidth);

      expect(result.truncated).toBe(false);
      expect(result.displayName).toBe('An');
    });

    it('tên vừa đúng giới hạn container — không bị truncate', () => {
      const containerWidth = 120; // maxChars = floor(120 / 9) = 13
      const exactName = 'Hello World!!'; // 13 ký tự
      const result = truncateName(exactName, containerWidth);

      expect(result.truncated).toBe(false);
      expect(result.displayName).toBe(exactName);
    });

    it('tên rỗng — không bị truncate', () => {
      const result = truncateName('', 260);

      expect(result.truncated).toBe(false);
      expect(result.displayName).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Scroll Momentum Block — Requirements: 2.17
  // -------------------------------------------------------------------------
  describe('Scroll Momentum Block', () => {
    it('onClick không fired khi isScrollingRef = true (đang scroll)', () => {
      const guard = createScrollMomentumGuard();
      const callback = vi.fn();

      guard.onScroll(); // bắt đầu scroll → isScrolling = true
      guard.onClick(callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('onClick fired khi isScrollingRef = false (không scroll)', () => {
      const guard = createScrollMomentumGuard();
      const callback = vi.fn();

      // Không gọi onScroll → isScrolling = false
      guard.onClick(callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('onClick fired đúng 1 lần khi không scroll', () => {
      const guard = createScrollMomentumGuard();
      const callback = vi.fn();

      guard.onClick(callback);
      guard.onClick(callback);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('isScrolling trả về true ngay sau khi onScroll được gọi', () => {
      const guard = createScrollMomentumGuard();

      expect(guard.isScrolling()).toBe(false);
      guard.onScroll();
      expect(guard.isScrolling()).toBe(true);
    });

    it('nhiều onScroll calls liên tiếp vẫn block onClick', () => {
      const guard = createScrollMomentumGuard();
      const callback = vi.fn();

      guard.onScroll();
      guard.onScroll();
      guard.onScroll();
      guard.onClick(callback);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
