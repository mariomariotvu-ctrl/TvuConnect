import { describe, expect, it } from 'vitest';
import { calculateDistance, formatDistance, sortByDistance } from './locationUtils';

describe('local discovery distance', () => {
  const tvu = { lat: 9.9345, lng: 106.3461 };

  it('trả về 0 km cho cùng một vị trí', () => {
    expect(calculateDistance(tvu, tvu)).toBe(0);
  });

  it('tính được khoảng cách đủ để lọc bán kính quanh người dùng', () => {
    const roughlyOneKilometreNorth = { lat: tvu.lat + 0.009, lng: tvu.lng };
    const distance = calculateDistance(tvu, roughlyOneKilometreNorth);
    expect(distance).toBeGreaterThanOrEqual(0.9);
    expect(distance).toBeLessThanOrEqual(1.1);
  });

  it('xếp địa điểm có khoảng cách gần nhất lên trước và thiếu tọa độ xuống cuối', () => {
    const sorted = sortByDistance([
      { id: 'far', distance: 5 },
      { id: 'unknown' },
      { id: 'near', distance: 0.4 },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['near', 'far', 'unknown']);
  });

  it('hiển thị mét dưới 1 km và km từ 1 km trở lên', () => {
    expect(formatDistance(0.4)).toBe('400m');
    expect(formatDistance(1.25)).toBe('1.3km');
  });
});
