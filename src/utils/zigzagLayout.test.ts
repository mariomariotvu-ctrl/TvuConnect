import { describe, it, expect } from 'vitest';
import { getZigzagPattern, calculateTabHeight, isTabLocked } from './zigzagLayout';

describe('zigzagLayout utilities', () => {
  describe('getZigzagPattern', () => {
    it('should return the correct zigzag pattern', () => {
      const pattern = getZigzagPattern();
      expect(pattern).toEqual(['h-48', 'h-56', 'h-56', 'h-48']);
    });

    it('should return an array with 4 elements', () => {
      const pattern = getZigzagPattern();
      expect(pattern).toHaveLength(4);
    });

    it('should return immutable pattern (same reference each time)', () => {
      const pattern1 = getZigzagPattern();
      const pattern2 = getZigzagPattern();
      expect(pattern1).toEqual(pattern2);
    });
  });

  describe('calculateTabHeight', () => {
    describe('mobile viewport', () => {
      it('should return h-auto for tab 0 on mobile', () => {
        expect(calculateTabHeight(0, 'mobile')).toBe('h-auto');
      });

      it('should return h-auto for tab 1 on mobile', () => {
        expect(calculateTabHeight(1, 'mobile')).toBe('h-auto');
      });

      it('should return h-auto for tab 2 on mobile', () => {
        expect(calculateTabHeight(2, 'mobile')).toBe('h-auto');
      });

      it('should return h-auto for tab 3 on mobile', () => {
        expect(calculateTabHeight(3, 'mobile')).toBe('h-auto');
      });
    });

    describe('desktop viewport', () => {
      it('should return h-48 for tab 0 (Tìm người yêu - low)', () => {
        expect(calculateTabHeight(0, 'desktop')).toBe('h-48');
      });

      it('should return h-56 for tab 1 (Kết nối nhanh - high)', () => {
        expect(calculateTabHeight(1, 'desktop')).toBe('h-56');
      });

      it('should return h-56 for tab 2 (Bạn cùng học - high)', () => {
        expect(calculateTabHeight(2, 'desktop')).toBe('h-56');
      });

      it('should return h-48 for tab 3 (Sở thích chung - low)', () => {
        expect(calculateTabHeight(3, 'desktop')).toBe('h-48');
      });
    });

    describe('edge cases', () => {
      it('should handle unexpected tab index gracefully', () => {
        expect(calculateTabHeight(4, 'desktop')).toBe('h-48');
        expect(calculateTabHeight(-1, 'desktop')).toBe('h-48');
      });
    });
  });

  describe('isTabLocked', () => {
    describe('profile incomplete', () => {
      it('should return true for lover tab when profile incomplete', () => {
        expect(isTabLocked('lover', false)).toBe(true);
      });

      it('should return true for quick tab when profile incomplete', () => {
        expect(isTabLocked('quick', false)).toBe(true);
      });

      it('should return true for study tab when profile incomplete', () => {
        expect(isTabLocked('study', false)).toBe(true);
      });

      it('should return true for hobby tab when profile incomplete', () => {
        expect(isTabLocked('hobby', false)).toBe(true);
      });
    });

    describe('profile complete', () => {
      it('should return false for lover tab when profile complete', () => {
        expect(isTabLocked('lover', true)).toBe(false);
      });

      it('should return false for quick tab when profile complete', () => {
        expect(isTabLocked('quick', true)).toBe(false);
      });

      it('should return false for study tab when profile complete', () => {
        expect(isTabLocked('study', true)).toBe(false);
      });

      it('should return false for hobby tab when profile complete', () => {
        expect(isTabLocked('hobby', true)).toBe(false);
      });
    });
  });
});
