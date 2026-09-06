/**
 * formatLastSeen.test.ts
 *
 * Property-based tests và unit tests cho hàm formatLastSeen.
 *
 * **Validates: Requirements 3.4, 4.4, 10.4**
 *
 * Property 4: `formatLastSeen` không bao giờ trả về chuỗi chứa giá trị lỗi.
 * Với mọi `timestamp` nguyên dương hợp lệ ≤ `Date.now()`, kết quả:
 *   - Không chứa "NaN", "undefined", "null", "Invalid Date"
 *   - Không rỗng (.length > 0)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { formatLastSeen } from './formatLastSeen';

// ─── Hằng số ──────────────────────────────────────────────────────────────────

const MS_30_SECONDS = 30_000;
const MS_1_MINUTE   = 60_000;
const MS_1_HOUR     = 3_600_000;
const MS_24_HOURS   = 86_400_000;
const MS_48_HOURS   = 172_800_000;
const MS_7_DAYS     = 604_800_000;

// Các chuỗi lỗi cần kiểm tra
const ERROR_STRINGS = ['NaN', 'undefined', 'null', 'Invalid Date'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Kiểm tra một chuỗi kết quả không chứa giá trị lỗi và không rỗng.
 */
function assertNoErrorValues(result: string): void {
  expect(result.length).toBeGreaterThan(0);
  for (const err of ERROR_STRINGS) {
    expect(result).not.toContain(err);
  }
}

// ─── Property-Based Tests ─────────────────────────────────────────────────────

describe('Property 4: formatLastSeen không bao giờ trả về chuỗi chứa giá trị lỗi', () => {
  /**
   * **Validates: Requirements 3.4, 4.4, 10.4**
   *
   * Với mọi timestamp nguyên dương hợp lệ ≤ Date.now(),
   * formatLastSeen phải trả về chuỗi không rỗng và không chứa giá trị lỗi.
   */
  it('với mọi timestamp hợp lệ (0 ≤ ts ≤ Date.now()), kết quả không chứa giá trị lỗi và không rỗng', () => {
    fc.assert(
      fc.property(
        // Sinh timestamp nguyên dương hợp lệ trong khoảng [0, Date.now()]
        fc.integer({ min: 0, max: Date.now() }),
        (timestampMs) => {
          const result = formatLastSeen(new Date(timestampMs));
          assertNoErrorValues(result);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('với mọi timestamp trong quá khứ xa (hơn 7 ngày trước), kết quả là "Không hoạt động"', () => {
    fc.assert(
      fc.property(
        // Sinh timestamp ít nhất 7 ngày trước
        fc.integer({ min: 0, max: Date.now() - MS_7_DAYS - 1 }),
        (timestampMs) => {
          const result = formatLastSeen(new Date(timestampMs));
          expect(result).toBe('Không hoạt động');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('với mọi timestamp trong vòng 30 giây qua, kết quả là "Vừa hoạt động"', () => {
    fc.assert(
      fc.property(
        // Sinh diff trong khoảng [0, 30s)
        fc.integer({ min: 0, max: MS_30_SECONDS - 1 }),
        (diffMs) => {
          const timestamp = Date.now() - diffMs;
          const result = formatLastSeen(new Date(timestamp));
          expect(result).toBe('Vừa hoạt động');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit Tests: Edge Cases ───────────────────────────────────────────────────

describe('formatLastSeen — edge cases', () => {
  it('null → "Không hoạt động"', () => {
    expect(formatLastSeen(null)).toBe('Không hoạt động');
  });

  it('diff < 0 (clock skew — timestamp trong tương lai) → "Không hoạt động"', () => {
    // Giả lập clock skew: server trả về timestamp ở tương lai
    const futureDate = new Date(Date.now() + 10_000);
    expect(formatLastSeen(futureDate)).toBe('Không hoạt động');
  });

  it('diff âm lớn → "Không hoạt động"', () => {
    const farFutureDate = new Date(Date.now() + MS_7_DAYS);
    expect(formatLastSeen(farFutureDate)).toBe('Không hoạt động');
  });

  it('new Date(NaN) → "Không hoạt động"', () => {
    expect(formatLastSeen(new Date(NaN))).toBe('Không hoạt động');
  });

  it('new Date(Infinity) → "Không hoạt động"', () => {
    expect(formatLastSeen(new Date(Infinity))).toBe('Không hoạt động');
  });
});

// ─── Unit Tests: 7 mức thời gian ─────────────────────────────────────────────

describe('formatLastSeen — 7 mức thời gian', () => {
  it('diff = 0ms → "Vừa hoạt động"', () => {
    expect(formatLastSeen(new Date(Date.now()))).toBe('Vừa hoạt động');
  });

  it('diff = 15s (< 30s) → "Vừa hoạt động"', () => {
    const date = new Date(Date.now() - 15_000);
    expect(formatLastSeen(date)).toBe('Vừa hoạt động');
  });

  it('diff = 29s (< 30s) → "Vừa hoạt động"', () => {
    const date = new Date(Date.now() - 29_000);
    expect(formatLastSeen(date)).toBe('Vừa hoạt động');
  });

  it('diff = 30s → "Hoạt động vài giây trước"', () => {
    const date = new Date(Date.now() - MS_30_SECONDS);
    expect(formatLastSeen(date)).toBe('Hoạt động vài giây trước');
  });

  it('diff = 45s (≥ 30s, < 60s) → "Hoạt động vài giây trước"', () => {
    const date = new Date(Date.now() - 45_000);
    expect(formatLastSeen(date)).toBe('Hoạt động vài giây trước');
  });

  it('diff = 59s (< 60s) → "Hoạt động vài giây trước"', () => {
    const date = new Date(Date.now() - 59_000);
    expect(formatLastSeen(date)).toBe('Hoạt động vài giây trước');
  });

  it('diff = 1 phút (60s) → "Hoạt động 1 phút trước"', () => {
    const date = new Date(Date.now() - MS_1_MINUTE);
    expect(formatLastSeen(date)).toBe('Hoạt động 1 phút trước');
  });

  it('diff = 5 phút → "Hoạt động 5 phút trước"', () => {
    const date = new Date(Date.now() - 5 * MS_1_MINUTE);
    expect(formatLastSeen(date)).toBe('Hoạt động 5 phút trước');
  });

  it('diff = 59 phút → "Hoạt động 59 phút trước"', () => {
    const date = new Date(Date.now() - 59 * MS_1_MINUTE);
    expect(formatLastSeen(date)).toBe('Hoạt động 59 phút trước');
  });

  it('diff = 1 giờ → "Hoạt động 1 giờ trước"', () => {
    const date = new Date(Date.now() - MS_1_HOUR);
    expect(formatLastSeen(date)).toBe('Hoạt động 1 giờ trước');
  });

  it('diff = 6 giờ → "Hoạt động 6 giờ trước"', () => {
    const date = new Date(Date.now() - 6 * MS_1_HOUR);
    expect(formatLastSeen(date)).toBe('Hoạt động 6 giờ trước');
  });

  it('diff = 23 giờ (< 24h) → "Hoạt động 23 giờ trước"', () => {
    const date = new Date(Date.now() - 23 * MS_1_HOUR);
    expect(formatLastSeen(date)).toBe('Hoạt động 23 giờ trước');
  });

  it('diff = 24 giờ (= 1 ngày) → "Hoạt động hôm qua"', () => {
    const date = new Date(Date.now() - MS_24_HOURS);
    expect(formatLastSeen(date)).toBe('Hoạt động hôm qua');
  });

  it('diff = 36 giờ (≥ 24h, < 48h) → "Hoạt động hôm qua"', () => {
    const date = new Date(Date.now() - 36 * MS_1_HOUR);
    expect(formatLastSeen(date)).toBe('Hoạt động hôm qua');
  });

  it('diff = 47 giờ (< 48h) → "Hoạt động hôm qua"', () => {
    const date = new Date(Date.now() - 47 * MS_1_HOUR);
    expect(formatLastSeen(date)).toBe('Hoạt động hôm qua');
  });

  it('diff = 48 giờ (= 2 ngày) → "Hoạt động 2 ngày trước"', () => {
    const date = new Date(Date.now() - MS_48_HOURS);
    expect(formatLastSeen(date)).toBe('Hoạt động 2 ngày trước');
  });

  it('diff = 3 ngày → "Hoạt động 3 ngày trước"', () => {
    const date = new Date(Date.now() - 3 * MS_24_HOURS);
    expect(formatLastSeen(date)).toBe('Hoạt động 3 ngày trước');
  });

  it('diff = 6 ngày (< 7 ngày) → "Hoạt động 6 ngày trước"', () => {
    const date = new Date(Date.now() - 6 * MS_24_HOURS);
    expect(formatLastSeen(date)).toBe('Hoạt động 6 ngày trước');
  });

  it('diff = 7 ngày (= 7 * 24h) → "Không hoạt động"', () => {
    const date = new Date(Date.now() - MS_7_DAYS);
    expect(formatLastSeen(date)).toBe('Không hoạt động');
  });

  it('diff = 30 ngày → "Không hoạt động"', () => {
    const date = new Date(Date.now() - 30 * MS_24_HOURS);
    expect(formatLastSeen(date)).toBe('Không hoạt động');
  });

  it('diff = 1 năm → "Không hoạt động"', () => {
    const date = new Date(Date.now() - 365 * MS_24_HOURS);
    expect(formatLastSeen(date)).toBe('Không hoạt động');
  });
});

// ─── Unit Tests: Không có giá trị lỗi trong kết quả ─────────────────────────

describe('formatLastSeen — đảm bảo không có giá trị lỗi trong kết quả', () => {
  const testCases: Array<[string, Date | null]> = [
    ['null', null],
    ['new Date(NaN)', new Date(NaN)],
    ['Date hiện tại', new Date()],
    ['5 phút trước', new Date(Date.now() - 5 * MS_1_MINUTE)],
    ['2 giờ trước', new Date(Date.now() - 2 * MS_1_HOUR)],
    ['2 ngày trước', new Date(Date.now() - 2 * MS_24_HOURS)],
    ['10 ngày trước', new Date(Date.now() - 10 * MS_24_HOURS)],
    ['timestamp = 0 (epoch)', new Date(0)],
    ['timestamp = 1 (gần epoch)', new Date(1)],
  ];

  for (const [label, input] of testCases) {
    it(`${label} → kết quả không chứa giá trị lỗi, không rỗng`, () => {
      const result = formatLastSeen(input);
      assertNoErrorValues(result);
    });
  }
});
