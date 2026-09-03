/**
 * Chat Property-Based Tests
 *
 * **Validates: Requirements 2.9, 2.18**
 *
 * Property 9  — Swipe-to-Delete: logic xử lý offset vuốt ngang
 * Property 18 — Scroll Anchor: tính toán giữ vị trí scroll sau loadMore
 */

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// ─── Hằng số swipe (khớp với useSwipeToDelete trong Chat.tsx) ───────────────
const SWIPE_THRESHOLD = 80;        // px: hiện nút xóa
const SWIPE_DELETE_THRESHOLD = 150; // px: tự động xóa

// ─── Logic từ useSwipeToDelete hook ─────────────────────────────────────────
function processSwipeEnd(offset: number): {
  action: 'delete' | 'reveal' | 'snap';
  finalOffset: number;
} {
  if (offset < -SWIPE_DELETE_THRESHOLD) {
    return { action: 'delete', finalOffset: 0 };
  } else if (offset < -SWIPE_THRESHOLD) {
    return { action: 'reveal', finalOffset: -SWIPE_THRESHOLD };
  } else {
    return { action: 'snap', finalOffset: 0 };
  }
}

// ─── Logic từ handleLoadMore scroll anchor ───────────────────────────────────
function calculateScrollAnchor(
  prevScrollTop: number,
  prevScrollHeight: number,
  newScrollHeight: number,
): number {
  const heightDiff = newScrollHeight - prevScrollHeight;
  if (heightDiff > 0) {
    return prevScrollTop + heightDiff;
  }
  return prevScrollTop;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Chat Property-Based Tests', () => {

  // ── Property 9: Swipe-to-Delete ────────────────────────────────────────────

  it('Property 9: swipe offset < -150 → delete triggered', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -300, max: -151 }),
        (offset) => {
          const result = processSwipeEnd(offset);
          expect(result.action).toBe('delete');
          expect(result.finalOffset).toBe(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Property 9: swipe offset ∈ (-150, -80) → delete button revealed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -149, max: -81 }),
        (offset) => {
          const result = processSwipeEnd(offset);
          expect(result.action).toBe('reveal');
          expect(result.finalOffset).toBe(-SWIPE_THRESHOLD);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('Property 9: swipe offset >= -80 → snap back to 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -80, max: 0 }),
        (offset) => {
          const result = processSwipeEnd(offset);
          expect(result.action).toBe('snap');
          expect(result.finalOffset).toBe(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  // ── Property 18: Scroll Anchor ─────────────────────────────────────────────

  it('Property 18: scroll anchor = prevScrollTop + heightDiff sau loadMore', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),  // prevScrollTop
        fc.integer({ min: 50, max: 2000 }),   // heightDiff
        (prevScrollTop, heightDiff) => {
          const prevScrollHeight = 1000;
          const newScrollHeight = prevScrollHeight + heightDiff;
          const actualScrollTop = calculateScrollAnchor(
            prevScrollTop,
            prevScrollHeight,
            newScrollHeight,
          );
          expect(actualScrollTop).toBe(prevScrollTop + heightDiff);
        },
      ),
      { numRuns: 500 },
    );
  });
});
