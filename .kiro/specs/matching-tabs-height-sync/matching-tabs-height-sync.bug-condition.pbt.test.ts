/**
 * Bug Condition Exploration Test: Matching Tabs Height Sync
 *
 * **Validates: Requirements 2.1, 2.2, 2.3**
 *
 * MỤC TIÊU BAN ĐẦU (Task 1): Xác nhận bug tồn tại TRƯỚC KHI implement fix
 * - Test này ĐÃ FAIL trên code chưa sửa, chứng minh bug tồn tại
 * - COUNTEREXAMPLES đã ghi nhận từ code chưa sửa:
 *   * Tab "Tìm người yêu" (lover) có pt-2 ≠ p-5 → icon quá gần đỉnh card
 *   * Tab "Bạn cùng học" (study) có pb-1 ≠ p-5 → text quá gần đáy card
 *   * Tab "Sở thích chung" (hobby) có pb-1 ≠ p-5 → text quá gần đáy card
 *
 * GIAI ĐOẠN HIỆN TẠI (Task 3.2): Verify test PASS sau khi fix
 * - Test encode expected behavior, PHẢI PASS trên code đã fix
 * - Pass xác nhận fix hoạt động đúng
 *
 * Bug Condition:
 * - isBugCondition({viewport: 'desktop', tab: 'lover'}) → paddingTop = 'pt-2' (quá nhỏ)
 * - isBugCondition({viewport: 'desktop', tab: 'study'}) → paddingBottom = 'pb-1' (không đồng bộ)
 * - isBugCondition({viewport: 'desktop', tab: 'hobby'}) → paddingBottom = 'pb-1' (không đồng bộ)
 *
 * Expected Behavior sau khi fix:
 * - Tất cả 3 tab đều có padding đồng bộ 'p-5'
 * - Tab "Kết nối nhanh" (quick) vẫn giữ 'p-5' (không thay đổi)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getTabDesktopPadding, isTabLocked } from '../../../src/utils/zigzagLayout';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

type TabId = 'lover' | 'quick' | 'study' | 'hobby';

const AFFECTED_TABS: TabId[] = ['lover', 'study', 'hobby'];
const ALL_TABS: TabId[] = ['lover', 'quick', 'study', 'hobby'];

/**
 * Kiểm tra xem padding có được đồng bộ (balanced) không
 * Padding đồng bộ là 'p-5' (uniform padding tất cả các phía)
 */
function hasSynchronizedPadding(paddingClass: string): boolean {
  return paddingClass === 'p-5';
}

/**
 * Kiểm tra xem padding không có giá trị bất cân đối
 * Bug cũ: pt-2 (quá nhỏ) hoặc pb-1 (quá nhỏ)
 */
function hasUnbalancedPadding(paddingClass: string): boolean {
  return paddingClass.includes('pt-2') || paddingClass.includes('pb-1');
}

// ──────────────────────────────────────────────────────────────────
// Property 1: Bug Condition - Synchronized Tab Padding on Desktop
// ──────────────────────────────────────────────────────────────────

describe('Property 1: Bug Condition - Synchronized Tab Padding on Desktop', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * PROPERTY: Với bất kỳ tab nào trong ['lover', 'study', 'hobby'] trên desktop,
   * padding PHẢI là 'p-5' (synchronized) sau khi fix.
   *
   * TẠI SAO TEST NÀY XÁC NHẬN FIX:
   * - Trước fix: lover có 'pt-2 pb-5', study có 'pt-5 pb-1', hobby có 'pt-8 pb-1'
   * - Sau fix: tất cả đều có 'p-5' (đồng bộ, cân đối)
   */
  describe('Requirement 2.1: Tab "Tìm người yêu" có padding cân đối sau fix', () => {
    it('Lover tab phải có padding đồng bộ p-5 (không còn pt-2)', () => {
      const padding = getTabDesktopPadding('lover');
      expect(hasSynchronizedPadding(padding)).toBe(true);
      expect(hasUnbalancedPadding(padding)).toBe(false);
    });

    it('Lover tab padding phải bằng p-5', () => {
      expect(getTabDesktopPadding('lover')).toBe('p-5');
    });

    it('[PBT] Với bất kỳ isProfileComplete nào, lover tab luôn có padding đồng bộ', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isProfileComplete
          (isProfileComplete) => {
            const padding = getTabDesktopPadding('lover');
            // Padding không phụ thuộc vào trạng thái profile
            expect(hasSynchronizedPadding(padding)).toBe(true);
          }
        )
      );
    });
  });

  describe('Requirement 2.2: Tab "Bạn cùng học" có padding đồng bộ sau fix', () => {
    it('Study tab phải có padding đồng bộ p-5 (không còn pb-1)', () => {
      const padding = getTabDesktopPadding('study');
      expect(hasSynchronizedPadding(padding)).toBe(true);
      expect(hasUnbalancedPadding(padding)).toBe(false);
    });

    it('Study tab padding phải bằng p-5', () => {
      expect(getTabDesktopPadding('study')).toBe('p-5');
    });

    it('[PBT] Với bất kỳ isProfileComplete nào, study tab luôn có padding đồng bộ', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isProfileComplete
          (isProfileComplete) => {
            const padding = getTabDesktopPadding('study');
            expect(hasSynchronizedPadding(padding)).toBe(true);
          }
        )
      );
    });
  });

  describe('Requirement 2.3: Tab "Sở thích chung" có padding đồng bộ sau fix', () => {
    it('Hobby tab phải có padding đồng bộ p-5 (không còn pb-1)', () => {
      const padding = getTabDesktopPadding('hobby');
      expect(hasSynchronizedPadding(padding)).toBe(true);
      expect(hasUnbalancedPadding(padding)).toBe(false);
    });

    it('Hobby tab padding phải bằng p-5', () => {
      expect(getTabDesktopPadding('hobby')).toBe('p-5');
    });

    it('[PBT] Với bất kỳ isProfileComplete nào, hobby tab luôn có padding đồng bộ', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isProfileComplete
          (isProfileComplete) => {
            const padding = getTabDesktopPadding('hobby');
            expect(hasSynchronizedPadding(padding)).toBe(true);
          }
        )
      );
    });
  });

  describe('Tất cả 3 tab bị ảnh hưởng có cùng padding (đồng bộ)', () => {
    it('Lover, study, hobby đều có cùng giá trị padding', () => {
      const loverPadding = getTabDesktopPadding('lover');
      const studyPadding = getTabDesktopPadding('study');
      const hobbyPadding = getTabDesktopPadding('hobby');

      expect(loverPadding).toBe(studyPadding);
      expect(studyPadding).toBe(hobbyPadding);
      expect(loverPadding).toBe('p-5');
    });

    it('[PBT] Với bất kỳ 2 tab affected nào, padding đều bằng nhau', () => {
      const affectedTabArb = fc.constantFrom<TabId>('lover', 'study', 'hobby');

      fc.assert(
        fc.property(
          affectedTabArb,
          affectedTabArb,
          (tab1, tab2) => {
            const padding1 = getTabDesktopPadding(tab1);
            const padding2 = getTabDesktopPadding(tab2);
            // Tất cả affected tabs phải có cùng padding sau khi fix
            expect(padding1).toBe(padding2);
          }
        )
      );
    });
  });

  describe('Visual Balance: Icon và text có khoảng cách cân đối với viền card', () => {
    it('[PBT] Tất cả tab trên desktop đều có padding hợp lệ (p-4 hoặc p-5)', () => {
      const allTabArb = fc.constantFrom<TabId>('lover', 'quick', 'study', 'hobby');

      fc.assert(
        fc.property(
          allTabArb,
          (tabId) => {
            const padding = getTabDesktopPadding(tabId);
            // Padding phải là một trong các giá trị hợp lệ cho desktop
            const validPaddings = ['p-4', 'p-5', 'p-6'];
            expect(validPaddings).toContain(padding);
          }
        )
      );
    });
  });
});
