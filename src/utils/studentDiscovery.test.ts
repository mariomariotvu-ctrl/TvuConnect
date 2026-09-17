import { describe, expect, it } from 'vitest';
import { approximateLocation, nearbyCells } from './proximity';
import { buildStudentSearchTokens, getStudentSearchQueryToken } from './studentSearch';

describe('student discovery search tokens', () => {
  it('normalizes Vietnamese names and creates useful prefixes', () => {
    const tokens = buildStudentSearchTokens([
      'Nguyễn Văn An',
      'Công nghệ thông tin',
      'DA21TT',
    ]);

    expect(tokens).toContain('nguyen');
    expect(tokens).toContain('an');
    expect(tokens).toContain('cntt');
    expect(tokens).toContain('da21tt');
  });

  it('normalizes the server query token and bounds its length', () => {
    expect(getStudentSearchQueryToken('  Trí tuệ nhân tạo  ')).toBe('tri tue nhan tao');
    expect(getStudentSearchQueryToken('a')).toBeNull();
    expect(getStudentSearchQueryToken('a'.repeat(40))).toHaveLength(24);
  });
});

describe('nearby discovery privacy grid', () => {
  const exactLocation = { lat: 9.93421, lng: 106.34567 };

  it('stores the centre of a coarse cell instead of exact coordinates', () => {
    const approximate = approximateLocation(exactLocation);

    expect(approximate.latitude).not.toBe(exactLocation.lat);
    expect(approximate.longitude).not.toBe(exactLocation.lng);
    expect(approximate.cell).toMatch(/^-?\d+:-?\d+$/);
  });

  it('queries the current cell and its eight neighbours', () => {
    const cells = nearbyCells(exactLocation);
    const currentCell = approximateLocation(exactLocation).cell;

    expect(cells).toHaveLength(9);
    expect(new Set(cells).size).toBe(9);
    expect(cells).toContain(currentCell);
  });
});
