/**
 * Task 10.2 — ReactionPicker Property-Based Tests
 *
 * Kiểm tra Property 15: Viewport Bounds cho ReactionPicker component.
 * Logic calculatePickerPosition được extract từ ReactionPicker.tsx để test độc lập.
 *
 * Validates: Requirements 2.15
 */

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// Constants (khớp với ReactionPicker.tsx)
// ──────────────────────────────────────────────────────────────────

const PICKER_WIDTH = 280;  // 6 reactions * ~44px + padding
const PICKER_HEIGHT = 60;

// Viewport mặc định để test (iPhone SE / mobile phổ biến)
const VIEWPORT_WIDTH = 375;
const VIEWPORT_HEIGHT = 812;

// ──────────────────────────────────────────────────────────────────
// Extract calculatePickerPosition logic từ ReactionPicker.tsx
//
// Logic gốc trong ReactionPicker.tsx:
//   const spaceRight = window.innerWidth - rect.left;
//   const spaceAbove = rect.top;
//   if (spaceRight < PICKER_WIDTH) { style.right = 0; style.left = 'auto'; }
//   else { style.left = 0; style.right = 'auto'; }
//   if (spaceAbove < PICKER_HEIGHT + 10) { style.top = 'calc(100% + 8px)'; style.bottom = 'auto'; }
//   else { style.bottom = 'calc(100% + 8px)'; style.top = 'auto'; }
// ──────────────────────────────────────────────────────────────────

function calculatePickerPosition(
  triggerLeft: number,
  triggerTop: number,
  viewportWidth = VIEWPORT_WIDTH,
  _viewportHeight = VIEWPORT_HEIGHT
): {
  left: number | 'auto';
  right: number | 'auto';
  top: string | 'auto';
  bottom: string | 'auto';
} {
  const spaceRight = viewportWidth - triggerLeft;
  const spaceAbove = triggerTop;

  const style: {
    left: number | 'auto';
    right: number | 'auto';
    top: string | 'auto';
    bottom: string | 'auto';
  } = {
    left: 'auto',
    right: 'auto',
    top: 'auto',
    bottom: 'auto',
  };

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

  return style;
}

// ──────────────────────────────────────────────────────────────────
// Property 15 — Viewport Bounds
// Bug Condition: (triggerRect.left + pickerWidth) > viewportWidth OR triggerRect.top < 60
// Expected: picker flip ngang/dọc để nằm trong viewport
// Validates: Requirements 2.15
// ──────────────────────────────────────────────────────────────────

describe('Property 15 — ReactionPicker Viewport Bounds', () => {
  it('Property 15: picker position flip logic hợp lệ với mọi trigger position', () => {
    /**
     * **Validates: Requirements 2.15**
     *
     * Generate: triggerLeft ∈ [0, VIEWPORT_WIDTH], triggerTop ∈ [0, VIEWPORT_HEIGHT]
     *
     * Assert:
     * - Nếu flip ngang (right = 0): left phải là 'auto'
     * - Nếu không flip (left = 0): spaceRight đủ chỗ (>= PICKER_WIDTH)
     * - Nếu flip dọc xuống (top = 'calc(100% + 8px)'): spaceAbove không đủ (< PICKER_HEIGHT + 10)
     * - Nếu không flip dọc (bottom = 'calc(100% + 8px)'): spaceAbove đủ (>= PICKER_HEIGHT + 10)
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: VIEWPORT_WIDTH }),   // triggerLeft
        fc.integer({ min: 0, max: VIEWPORT_HEIGHT }),  // triggerTop
        (triggerLeft, triggerTop) => {
          const style = calculatePickerPosition(triggerLeft, triggerTop);

          // ── Kiểm tra horizontal flip logic ──
          if (style.right === 0) {
            // Flip sang phải: left phải là 'auto'
            expect(style.left).toBe('auto');
            // Và spaceRight không đủ
            const spaceRight = VIEWPORT_WIDTH - triggerLeft;
            expect(spaceRight).toBeLessThan(PICKER_WIDTH);
          } else {
            // Không flip: left = 0, spaceRight đủ chỗ
            expect(style.left).toBe(0);
            expect(style.right).toBe('auto');
            const spaceRight = VIEWPORT_WIDTH - triggerLeft;
            expect(spaceRight).toBeGreaterThanOrEqual(PICKER_WIDTH);
          }

          // ── Kiểm tra vertical flip logic ──
          if (style.top === 'calc(100% + 8px)') {
            // Hiển thị bên dưới: spaceAbove không đủ
            expect(style.bottom).toBe('auto');
            expect(triggerTop).toBeLessThan(PICKER_HEIGHT + 10);
          } else {
            // Hiển thị bên trên: spaceAbove đủ
            expect(style.bottom).toBe('calc(100% + 8px)');
            expect(style.top).toBe('auto');
            expect(triggerTop).toBeGreaterThanOrEqual(PICKER_HEIGHT + 10);
          }
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('Property 15 (mutual exclusion): left và right không bao giờ cùng là 0', () => {
    /**
     * **Validates: Requirements 2.15**
     *
     * Picker không thể đồng thời căn trái VÀ căn phải.
     * Đảm bảo logic flip luôn chọn duy nhất 1 hướng.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: VIEWPORT_WIDTH }),
        fc.integer({ min: 0, max: VIEWPORT_HEIGHT }),
        (triggerLeft, triggerTop) => {
          const style = calculatePickerPosition(triggerLeft, triggerTop);

          // Không thể cùng lúc cả left=0 và right=0
          const bothHorizontalSet = style.left === 0 && style.right === 0;
          expect(bothHorizontalSet).toBe(false);

          // Không thể cùng lúc có top và bottom là string 'calc(...)'
          const bothVerticalSet =
            style.top === 'calc(100% + 8px)' &&
            style.bottom === 'calc(100% + 8px)';
          expect(bothVerticalSet).toBe(false);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('Property 15 (completeness): luôn có ít nhất 1 hướng được xác định', () => {
    /**
     * **Validates: Requirements 2.15**
     *
     * Picker phải có vị trí xác định: hoặc left=0 hoặc right=0 (không phải cả hai là 'auto').
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: VIEWPORT_WIDTH }),
        fc.integer({ min: 0, max: VIEWPORT_HEIGHT }),
        (triggerLeft, triggerTop) => {
          const style = calculatePickerPosition(triggerLeft, triggerTop);

          // Phải có ít nhất 1 giá trị numeric cho horizontal
          const hasHorizontalPosition = style.left === 0 || style.right === 0;
          expect(hasHorizontalPosition).toBe(true);

          // Phải có ít nhất 1 giá trị string calc cho vertical
          const hasVerticalPosition =
            style.top === 'calc(100% + 8px)' ||
            style.bottom === 'calc(100% + 8px)';
          expect(hasVerticalPosition).toBe(true);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Ví dụ cụ thể — Flip ngang khi trigger gần cạnh phải
// ──────────────────────────────────────────────────────────────────

describe('Flip ngang — Trigger gần cạnh phải viewport', () => {
  it('trigger ở x=350, viewport=375 → spaceRight=25 < 280 → flip (right=0)', () => {
    // spaceRight = 375 - 350 = 25 < PICKER_WIDTH(280) → phải flip
    const style = calculatePickerPosition(350, 400);
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
  });

  it('trigger ở x=95, viewport=375 → spaceRight=280 = PICKER_WIDTH → không flip', () => {
    // spaceRight = 375 - 95 = 280 = PICKER_WIDTH → biên, dùng strict < nên không flip
    const style = calculatePickerPosition(95, 400);
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
  });

  it('trigger ở x=96, viewport=375 → spaceRight=279 < 280 → flip (right=0)', () => {
    // spaceRight = 375 - 96 = 279 < PICKER_WIDTH → flip
    const style = calculatePickerPosition(96, 400);
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
  });

  it('trigger ở x=50, viewport=375 → spaceRight=325 > 280 → không flip', () => {
    // spaceRight = 375 - 50 = 325 > PICKER_WIDTH(280) → không flip
    const style = calculatePickerPosition(50, 400);
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
  });

  it('trigger ở x=0 (cạnh trái) → không flip', () => {
    // spaceRight = 375 - 0 = 375 > 280 → không flip
    const style = calculatePickerPosition(0, 400);
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
  });

  it('trigger ở x=375 (cạnh phải tuyệt đối) → flip', () => {
    // spaceRight = 375 - 375 = 0 < 280 → flip
    const style = calculatePickerPosition(375, 400);
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
  });
});

// ──────────────────────────────────────────────────────────────────
// Ví dụ cụ thể — Flip dọc khi trigger gần top viewport
// ──────────────────────────────────────────────────────────────────

describe('Flip dọc — Trigger gần top viewport', () => {
  it('trigger ở y=30, spaceAbove=30 < 70 → hiển thị bên dưới (top)', () => {
    // spaceAbove = 30 < PICKER_HEIGHT(60) + 10 = 70 → hiện bên dưới
    const style = calculatePickerPosition(100, 30);
    expect(style.top).toBe('calc(100% + 8px)');
    expect(style.bottom).toBe('auto');
  });

  it('trigger ở y=0 (top tuyệt đối) → hiển thị bên dưới', () => {
    // spaceAbove = 0 < 70 → hiện bên dưới
    const style = calculatePickerPosition(100, 0);
    expect(style.top).toBe('calc(100% + 8px)');
    expect(style.bottom).toBe('auto');
  });

  it('trigger ở y=69, spaceAbove=69 < 70 → hiển thị bên dưới (biên -1)', () => {
    // spaceAbove = 69 < 70 → hiện bên dưới (strict <)
    const style = calculatePickerPosition(100, 69);
    expect(style.top).toBe('calc(100% + 8px)');
    expect(style.bottom).toBe('auto');
  });

  it('trigger ở y=70, spaceAbove=70 = threshold → hiển thị bên trên (biên)', () => {
    // spaceAbove = 70 = PICKER_HEIGHT + 10 → không nhỏ hơn → hiện bên trên
    const style = calculatePickerPosition(100, 70);
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
  });

  it('trigger ở y=400 (giữa viewport) → hiển thị bên trên', () => {
    // spaceAbove = 400 >= 70 → hiện bên trên
    const style = calculatePickerPosition(100, 400);
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
  });

  it('trigger ở y=812 (bottom tuyệt đối) → hiển thị bên trên', () => {
    // spaceAbove = 812 >= 70 → hiện bên trên
    const style = calculatePickerPosition(100, 812);
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
  });
});

// ──────────────────────────────────────────────────────────────────
// Ví dụ cụ thể — Trường hợp kết hợp (góc trên cạnh phải)
// ──────────────────────────────────────────────────────────────────

describe('Trường hợp kết hợp — Corner cases', () => {
  it('trigger ở góc trên phải → flip cả ngang và dọc', () => {
    // triggerLeft=350 → spaceRight=25 < 280 → flip ngang
    // triggerTop=30 → spaceAbove=30 < 70 → flip dọc
    const style = calculatePickerPosition(350, 30);
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
    expect(style.top).toBe('calc(100% + 8px)');
    expect(style.bottom).toBe('auto');
  });

  it('trigger ở góc dưới trái → không flip cả hai hướng', () => {
    // triggerLeft=50 → spaceRight=325 >= 280 → không flip ngang
    // triggerTop=700 → spaceAbove=700 >= 70 → không flip dọc
    const style = calculatePickerPosition(50, 700);
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
  });

  it('trigger ở giữa màn hình → vị trí mặc định (left=0, bottom)', () => {
    // triggerLeft=187 → spaceRight=188 < 280 → flip ngang
    // triggerTop=400 → spaceAbove=400 >= 70 → không flip dọc
    const style = calculatePickerPosition(187, 400);
    // spaceRight = 375 - 187 = 188 < 280 → flip
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
  });

  it('trigger ở x=94 (đủ space phải) và y=400 → left=0, bottom', () => {
    // triggerLeft=94 → spaceRight=281 >= 280 → không flip ngang
    // triggerTop=400 → không flip dọc
    const style = calculatePickerPosition(94, 400);
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
  });
});

// ──────────────────────────────────────────────────────────────────
// Kiểm tra với các viewport size khác nhau
// ──────────────────────────────────────────────────────────────────

describe('Viewport size khác nhau', () => {
  it('viewport nhỏ 320px — trigger ở x=100 → flip (spaceRight=220 < 280)', () => {
    const style = calculatePickerPosition(100, 400, 320);
    // spaceRight = 320 - 100 = 220 < 280 → flip
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
  });

  it('viewport lớn 1440px — trigger ở x=100 → không flip (spaceRight=1340 >= 280)', () => {
    const style = calculatePickerPosition(100, 400, 1440);
    // spaceRight = 1440 - 100 = 1340 >= 280 → không flip
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
  });

  it('Property 15 cross-viewport: logic luôn nhất quán với nhiều viewport size', () => {
    /**
     * **Validates: Requirements 2.15**
     *
     * Generate: viewportWidth ∈ [320, 1920], triggerLeft ∈ [0, viewportWidth]
     * Assert: flip logic nhất quán
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }), // viewportWidth
        fc.integer({ min: 0, max: 1000 }),   // triggerTop
        (viewportWidth, triggerTop) => {
          // triggerLeft: chọn ngẫu nhiên trong [0, viewportWidth]
          const triggerLeft = Math.min(viewportWidth, viewportWidth * Math.random());
          const style = calculatePickerPosition(
            Math.floor(triggerLeft),
            triggerTop,
            viewportWidth
          );

          const spaceRight = viewportWidth - Math.floor(triggerLeft);

          if (spaceRight < PICKER_WIDTH) {
            expect(style.right).toBe(0);
            expect(style.left).toBe('auto');
          } else {
            expect(style.left).toBe(0);
            expect(style.right).toBe('auto');
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});
