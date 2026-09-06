/**
 * OnlineStatus.test.tsx
 *
 * Unit test cho OnlineStatus component.
 * Mock `useOnlineStatusCached` để kiểm soát hoàn toàn dữ liệu đầu vào,
 * không phụ thuộc Firebase.
 *
 * Validates: Requirements 4.5, 4.7, 4.8
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnlineStatus } from './OnlineStatus';
import type { StatusResult } from '../hooks/useOnlineStatusCache';

// ─── Mock hook ────────────────────────────────────────────────────────────────
// Mock toàn bộ module, sau đó gán giá trị trả về trong từng test
vi.mock('../hooks/useOnlineStatusCache', () => ({
  useOnlineStatusCached: vi.fn(),
}));

// Import mock sau khi đã vi.mock để TypeScript nhận đúng kiểu
import { useOnlineStatusCached } from '../hooks/useOnlineStatusCache';

const mockUseOnlineStatusCached = vi.mocked(useOnlineStatusCached);

// ─── Helper ───────────────────────────────────────────────────────────────────
/** Tạo StatusResult với các giá trị mặc định có thể override */
function makeStatus(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    isOnline: false,
    lastActive: null,
    loading: false,
    error: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnlineStatus component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: userId hợp lệ + isOnline=true → "Đang hoạt động" ─────────────
  it('hiển thị "Đang hoạt động" khi userId hợp lệ và isOnline=true', () => {
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ isOnline: true, lastActive: new Date() })
    );

    render(<OnlineStatus userId="user-123" />);

    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
  });

  // ── Test 2: userId hợp lệ + isOnline=false + lastActive 2 phút trước ─────
  // → away → "Không hoạt động"
  it('hiển thị "Không hoạt động" khi isOnline=false và lastActive 2 phút trước (away)', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000); // 120 000 ms < 300 000 ms threshold
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ isOnline: false, lastActive: twoMinutesAgo })
    );

    render(<OnlineStatus userId="user-123" />);

    expect(screen.getByText('Không hoạt động')).toBeInTheDocument();
  });

  // ── Test 3: userId hợp lệ + isOnline=false + lastActive 2 giờ trước ──────
  // → offline → "Hoạt động 2 giờ trước"
  it('hiển thị "Hoạt động 2 giờ trước" khi isOnline=false và lastActive 2 giờ trước', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 7 200 000 ms > 300 000 ms
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ isOnline: false, lastActive: twoHoursAgo })
    );

    render(<OnlineStatus userId="user-123" />);

    expect(screen.getByText('Hoạt động 2 giờ trước')).toBeInTheDocument();
  });

  // ── Test 4: userId=undefined → không render (null) ───────────────────────
  // Validates: Requirement 4.5
  it('không render gì khi userId=undefined', () => {
    // Hook vẫn được gọi với undefined, trả về trạng thái mặc định
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ loading: false })
    );

    const { container } = render(<OnlineStatus userId={undefined} />);

    expect(container.firstChild).toBeNull();
  });

  // ── Test 5: userId="" → không render ─────────────────────────────────────
  // Validates: Requirement 4.5
  it('không render gì khi userId là chuỗi rỗng', () => {
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ loading: false })
    );

    const { container } = render(<OnlineStatus userId="" />);

    expect(container.firstChild).toBeNull();
  });

  // ── Test 6: loading=true → không render ──────────────────────────────────
  // Validates: Requirement 4.7
  it('không render gì khi loading=true', () => {
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ loading: true })
    );

    const { container } = render(<OnlineStatus userId="user-123" />);

    expect(container.firstChild).toBeNull();
  });

  // ── Test 7: error=true → không render, không crash ───────────────────────
  // Validates: Requirement 4.8
  it('không render gì và không crash khi error=true', () => {
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ error: true })
    );

    expect(() => {
      const { container } = render(<OnlineStatus userId="user-123" />);
      expect(container.firstChild).toBeNull();
    }).not.toThrow();
  });

  // ── Test 8: lastActive=null + isOnline=false → "Không hoạt động" ─────────
  it('hiển thị "Không hoạt động" khi lastActive=null và isOnline=false', () => {
    mockUseOnlineStatusCached.mockReturnValue(
      makeStatus({ isOnline: false, lastActive: null })
    );

    render(<OnlineStatus userId="user-123" />);

    expect(screen.getByText('Không hoạt động')).toBeInTheDocument();
  });
});
