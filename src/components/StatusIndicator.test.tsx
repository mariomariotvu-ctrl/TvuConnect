/**
 * StatusIndicator — Property Test: Màu sắc nhất quán (Property 1)
 *
 * Với mọi status ∈ { 'online', 'away', 'offline' }, StatusIndicator luôn render
 * màu tương ứng trong STATUS_COLORS[status] và không bao giờ render màu của trạng thái khác.
 *
 * **Validates: Requirements 5.2, 10.1**
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusIndicator, STATUS_COLORS } from './StatusIndicator';
import type { UserStatus } from './StatusIndicator';

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Lấy element `.status-dot` trong DOM sau khi render StatusIndicator.
 * Component render dot với backgroundColor = STATUS_COLORS[status].
 */
function getStatusDot(container: HTMLElement): HTMLElement {
  const dot = container.querySelector('.status-dot') as HTMLElement | null;
  if (!dot) throw new Error('Không tìm thấy .status-dot trong DOM');
  return dot;
}

// ─── Property 1: Màu sắc nhất quán với trạng thái đầu vào ───────────────────

describe('StatusIndicator — Property 1: Màu sắc nhất quán', () => {
  /**
   * Parameterized test: kiểm tra cả 3 trạng thái hợp lệ
   *
   * Với mỗi status hợp lệ:
   *   - dot phải có backgroundColor = STATUS_COLORS[status]
   *   - dot KHÔNG được có màu của 2 trạng thái còn lại
   */
  const validStatuses: { status: UserStatus; expectedColor: string; otherColors: string[] }[] = [
    {
      status: 'online',
      expectedColor: STATUS_COLORS.online,   // #42b72a
      otherColors: [STATUS_COLORS.away, STATUS_COLORS.offline],
    },
    {
      status: 'away',
      expectedColor: STATUS_COLORS.away,     // #ffa500
      otherColors: [STATUS_COLORS.online, STATUS_COLORS.offline],
    },
    {
      status: 'offline',
      expectedColor: STATUS_COLORS.offline,  // #8a8d91
      otherColors: [STATUS_COLORS.online, STATUS_COLORS.away],
    },
  ];

  it.each(validStatuses)(
    'status="$status" → render đúng màu $expectedColor, không render màu trạng thái khác',
    ({ status, expectedColor, otherColors }) => {
      const { container } = render(<StatusIndicator status={status} showTooltip={false} />);
      const dot = getStatusDot(container);

      // Phải render đúng màu tương ứng với trạng thái
      expect(dot.style.backgroundColor).toBe(expectedColor);

      // KHÔNG được render màu của trạng thái khác (tính loại trừ)
      for (const wrongColor of otherColors) {
        expect(dot.style.backgroundColor).not.toBe(wrongColor);
      }
    }
  );

  /**
   * Kiểm tra tính nhất quán của STATUS_COLORS export:
   * Các giá trị màu phải khớp với spec (Requirements 5.2, 10.1)
   */
  it('STATUS_COLORS export đúng giá trị hex theo spec', () => {
    expect(STATUS_COLORS.online).toBe('#42b72a');
    expect(STATUS_COLORS.away).toBe('#ffa500');
    expect(STATUS_COLORS.offline).toBe('#8a8d91');
  });

  /**
   * Kiểm tra tính duy nhất của màu:
   * Ba trạng thái phải có 3 màu khác nhau hoàn toàn
   */
  it('Ba trạng thái có 3 màu hoàn toàn khác nhau', () => {
    const colors = Object.values(STATUS_COLORS);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(3);
  });
});

// ─── Prop không hợp lệ → fallback về offline + console.warn ─────────────────

describe('StatusIndicator — Prop không hợp lệ (Requirement 5.7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('status không hợp lệ → fallback render màu offline (#8a8d91)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Ép kiểu để bypass TypeScript và kiểm tra runtime behavior
    const { container } = render(
      <StatusIndicator status={'invalid-status' as UserStatus} showTooltip={false} />
    );
    const dot = getStatusDot(container);

    // Phải fallback về màu offline
    expect(dot.style.backgroundColor).toBe(STATUS_COLORS.offline);

    // Không được render màu online hoặc away
    expect(dot.style.backgroundColor).not.toBe(STATUS_COLORS.online);
    expect(dot.style.backgroundColor).not.toBe(STATUS_COLORS.away);

    warnSpy.mockRestore();
  });

  it('status không hợp lệ → gọi console.warn với thông báo phù hợp', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <StatusIndicator status={'unknown' as UserStatus} showTooltip={false} />
    );

    // Phải gọi console.warn đúng 1 lần
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Thông báo warn phải đề cập đến giá trị không hợp lệ
    const warnMessage = warnSpy.mock.calls[0][0] as string;
    expect(warnMessage).toContain('unknown');

    warnSpy.mockRestore();
  });

  it.each([
    { invalidStatus: '' },
    { invalidStatus: 'ONLINE' },
    { invalidStatus: 'Online' },
    { invalidStatus: 'null' },
    { invalidStatus: '0' },
  ])(
    'status="$invalidStatus" (không hợp lệ) → luôn fallback về màu offline',
    ({ invalidStatus }) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { container } = render(
        <StatusIndicator status={invalidStatus as UserStatus} showTooltip={false} />
      );
      const dot = getStatusDot(container);

      expect(dot.style.backgroundColor).toBe(STATUS_COLORS.offline);

      vi.restoreAllMocks();
    }
  );
});

// ─── Accessibility: aria-label theo trạng thái ───────────────────────────────

describe('StatusIndicator — aria-label nhất quán với trạng thái', () => {
  const ariaLabelMap: Record<UserStatus, string> = {
    online: 'Đang hoạt động',
    away: 'Không hoạt động',
    offline: 'Ngoại tuyến',
  };

  it.each(Object.entries(ariaLabelMap) as [UserStatus, string][])(
    'status="%s" → aria-label="%s"',
    (status, expectedLabel) => {
      render(<StatusIndicator status={status} showTooltip={false} />);
      // wrapper có role="img" và aria-label (Requirement 9.1, 9.2)
      expect(screen.getByRole('img', { name: expectedLabel })).toBeInTheDocument();
    }
  );
});
