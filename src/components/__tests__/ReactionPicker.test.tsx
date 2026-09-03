import { describe, it, expect } from 'vitest';

const PICKER_WIDTH = 280;
const PICKER_HEIGHT = 60;

function calculatePickerPosition(triggerLeft: number, triggerTop: number, viewportWidth = 375) {
  const spaceRight = viewportWidth - triggerLeft;
  const spaceAbove = triggerTop;
  const style: any = { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto' };
  if (spaceRight < PICKER_WIDTH) { style.right = 0; style.left = 'auto'; }
  else { style.left = 0; style.right = 'auto'; }
  if (spaceAbove < PICKER_HEIGHT + 10) { style.top = 'calc(100% + 8px)'; style.bottom = 'auto'; }
  else { style.bottom = 'calc(100% + 8px)'; style.top = 'auto'; }
  return style;
}

describe('ReactionPicker Unit Tests', () => {
  it('trigger gần cạnh phải (spaceRight < 280) → right = 0', () => {
    const style = calculatePickerPosition(350, 400);
    expect(style.right).toBe(0);
    expect(style.left).toBe('auto');
  });

  it('trigger gần top (top = 20px) → top = calc(100% + 8px)', () => {
    const style = calculatePickerPosition(100, 20);
    expect(style.top).toBe('calc(100% + 8px)');
    expect(style.bottom).toBe('auto');
  });

  it('trigger ở giữa → bottom = calc(100% + 8px)', () => {
    const style = calculatePickerPosition(50, 400);
    expect(style.bottom).toBe('calc(100% + 8px)');
    expect(style.top).toBe('auto');
    expect(style.left).toBe(0);
  });

  it('trigger ở góc trên phải → flip cả hai hướng', () => {
    const style = calculatePickerPosition(350, 30);
    expect(style.right).toBe(0);
    expect(style.top).toBe('calc(100% + 8px)');
  });

  it('trigger ở cạnh trái → không flip ngang', () => {
    const style = calculatePickerPosition(0, 400);
    expect(style.left).toBe(0);
    expect(style.right).toBe('auto');
  });

  it('spaceRight = 280 (biên) → không flip (strict <)', () => {
    const style = calculatePickerPosition(95, 400); // 375-95=280, không < 280
    expect(style.left).toBe(0);
  });

  it('spaceRight = 279 → flip', () => {
    const style = calculatePickerPosition(96, 400); // 375-96=279 < 280
    expect(style.right).toBe(0);
  });
});
