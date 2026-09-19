import { describe, expect, it } from 'vitest';
import {
  formatRouteDuration,
  presentStudentDistance,
  routeInstruction,
} from './studentLocationPresentation';

describe('privacy-aware student distances', () => {
  it('shows friend distance to about ten metres', () => {
    expect(presentStudentDistance(34, 'friend').label).toBe('Cách bạn 30m');
  });

  it('shows same-major distance by a 100 m area', () => {
    expect(presentStudentDistance(34, 'major').label).toBe('Trong cùng khu vực khoảng 100 m');
    expect(presentStudentDistance(360, 'major').label).toBe('Cách bạn khoảng 400m');
  });

  it('shows public TVU distance by kilometre-sized areas', () => {
    expect(presentStudentDistance(500, 'tvu').label).toBe('Trong cùng khu vực khoảng 1 km');
    expect(presentStudentDistance(1_600, 'tvu').label).toBe('Cách bạn khoảng 2 km');
  });
});

describe('route presentation', () => {
  it('formats route duration and Vietnamese turn instructions', () => {
    expect(formatRouteDuration(750)).toBe('13 phút');
    expect(routeInstruction('turn', 'right', 'Đường Điện Biên Phủ'))
      .toBe('Rẽ phải vào Đường Điện Biên Phủ');
  });
});
