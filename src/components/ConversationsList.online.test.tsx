/**
 * Unit tests: ConversationsList — indicator rendering behavior
 *
 * Validates: Requirements 2.4, 2.7
 *
 * Chiến lược: Thay vì render toàn bộ ConversationsList (phụ thuộc nhiều vào
 * Firebase/Firestore), các test này kiểm tra trực tiếp hành vi render của
 * `OnlineStatus` component trong avatar container pattern —
 * tức là đặt indicator vào div với `position: relative` để xác nhận:
 *   - Không crash trong mọi trạng thái (online/offline/loading/error)
 *   - Dot được render khi isOnline=true
 *   - Dot bị ẩn (null) khi loading=true, error=true, hoặc isOnline=false
 *   - Không hiển thị thông báo lỗi cho người dùng
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock firebase (tránh khởi tạo thật) ────────────────────────────────────
vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: null },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()), // trả về unsubscribe fn
  getDoc: vi.fn(),
  doc: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

// ─── Mock useOnlineStatusCache ───────────────────────────────────────────────
const mockUseOnlineStatusCached = vi.fn();

vi.mock('../hooks/useOnlineStatusCache', () => ({
  useOnlineStatusCached: (userId: string | null | undefined) =>
    mockUseOnlineStatusCached(userId),
}));

// Import AFTER mock setup
import { OnlineStatus } from './OnlineStatus';

// ─── Helper: render OnlineStatus trong avatar container pattern ───────────────
/**
 * Mô phỏng cách ConversationsList dùng OnlineStatus:
 *   <div style={{ position: 'relative' }}>
 *     <img ... /> {/* avatar *\/}
 *     <div className="absolute -bottom-1 -right-1">
 *       <OnlineStatus userId={userId} size="sm" showText={false} />
 *     </div>
 *   </div>
 */
function renderInAvatarContainer(userId: string) {
  return render(
    <div data-testid="avatar-container" style={{ position: 'relative' }}>
      <div data-testid="avatar-img" style={{ width: 56, height: 56, borderRadius: 8 }} />
      <div
        data-testid="indicator-slot"
        style={{ position: 'absolute', bottom: -4, right: -4 }}
      >
        <OnlineStatus
          userId={userId}
          size="sm"
          showText={false}
          className="rounded-full p-0.5 shadow-sm"
        />
      </div>
    </div>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConversationsList — OnlineStatus indicator rendering', () => {
  const TEST_USER_ID = 'user_abc123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test case 1: isOnline=true, loading=false ───────────────────────────
  describe('khi isOnline=true, loading=false', () => {
    beforeEach(() => {
      mockUseOnlineStatusCached.mockReturnValue({
        isOnline: true,
        lastActive: new Date(),
        loading: false,
        error: false,
      });
    });

    it('không crash khi render trong avatar container', () => {
      expect(() => renderInAvatarContainer(TEST_USER_ID)).not.toThrow();
    });

    it('avatar container luôn được render', () => {
      renderInAvatarContainer(TEST_USER_ID);
      expect(screen.getByTestId('avatar-container')).toBeInTheDocument();
    });

    it('OnlineStatus render dot (không null) — Requirements 2.2', () => {
      renderInAvatarContainer(TEST_USER_ID);
      // Khi online, OnlineStatus render một div với role="img" và aria-label "Đang hoạt động"
      const dot = screen.queryByRole('img', { name: /đang hoạt động/i });
      expect(dot).not.toBeNull();
    });

    it('indicator slot tồn tại trong DOM', () => {
      renderInAvatarContainer(TEST_USER_ID);
      expect(screen.getByTestId('indicator-slot')).toBeInTheDocument();
    });
  });

  // ─── Test case 2: isOnline=false, loading=false ──────────────────────────
  describe('khi isOnline=false, loading=false', () => {
    beforeEach(() => {
      mockUseOnlineStatusCached.mockReturnValue({
        isOnline: false,
        lastActive: null,
        loading: false,
        error: false,
      });
    });

    it('không crash khi render — Requirements 2.4', () => {
      expect(() => renderInAvatarContainer(TEST_USER_ID)).not.toThrow();
    });

    it('không hiển thị thông báo lỗi cho người dùng', () => {
      renderInAvatarContainer(TEST_USER_ID);
      // Không có text lỗi nào xuất hiện
      expect(screen.queryByText(/lỗi/i)).toBeNull();
      expect(screen.queryByText(/error/i)).toBeNull();
      expect(screen.queryByText(/không thể kết nối/i)).toBeNull();
    });

    it('indicator dot online bị ẩn — Requirements 2.4 (offline → không render dot)', () => {
      renderInAvatarContainer(TEST_USER_ID);
      // Khi offline và không error/loading, OnlineStatus trả về null (không render)
      // do guard: error=false, loading=false, isOnline=false → offline state
      // OnlineStatus vẫn render dot xám nhưng không có "Đang hoạt động"
      const onlineDot = screen.queryByRole('img', { name: /đang hoạt động/i });
      expect(onlineDot).toBeNull();
    });

    it('avatar container vẫn hiển thị bình thường', () => {
      renderInAvatarContainer(TEST_USER_ID);
      expect(screen.getByTestId('avatar-container')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-img')).toBeInTheDocument();
    });
  });

  // ─── Test case 3: loading=true ───────────────────────────────────────────
  describe('khi loading=true', () => {
    beforeEach(() => {
      mockUseOnlineStatusCached.mockReturnValue({
        isOnline: false,
        lastActive: null,
        loading: true,
        error: false,
      });
    });

    it('không crash khi đang tải — Requirements 2.4', () => {
      expect(() => renderInAvatarContainer(TEST_USER_ID)).not.toThrow();
    });

    it('OnlineStatus trả về null khi loading (ẩn để tránh flash) — Property 6', () => {
      renderInAvatarContainer(TEST_USER_ID);
      // OnlineStatus có guard: if (loading) return null — không render bất kỳ thứ gì
      const dot = screen.queryByRole('img');
      expect(dot).toBeNull();
    });

    it('không có nội dung trạng thái nào được hiển thị trong slot', () => {
      const { getByTestId } = renderInAvatarContainer(TEST_USER_ID);
      const slot = getByTestId('indicator-slot');
      // Slot tồn tại nhưng OnlineStatus bên trong là null → slot rỗng
      expect(slot).toBeInTheDocument();
      expect(slot.children).toHaveLength(0);
    });

    it('avatar container vẫn render bình thường dù đang tải', () => {
      renderInAvatarContainer(TEST_USER_ID);
      expect(screen.getByTestId('avatar-container')).toBeInTheDocument();
    });
  });

  // ─── Test case 4: error=true ─────────────────────────────────────────────
  describe('khi error=true (Presence_System không kết nối được)', () => {
    beforeEach(() => {
      mockUseOnlineStatusCached.mockReturnValue({
        isOnline: false,
        lastActive: null,
        loading: false,
        error: true,
      });
    });

    it('không crash khi có lỗi — Requirements 2.7', () => {
      expect(() => renderInAvatarContainer(TEST_USER_ID)).not.toThrow();
    });

    it('không hiển thị thông báo lỗi cho người dùng — Requirements 2.7', () => {
      renderInAvatarContainer(TEST_USER_ID);
      expect(screen.queryByText(/lỗi/i)).toBeNull();
      expect(screen.queryByText(/error/i)).toBeNull();
      expect(screen.queryByText(/không thể kết nối/i)).toBeNull();
      expect(screen.queryByText(/không thể tải/i)).toBeNull();
    });

    it('OnlineStatus trả về null khi error (ẩn indicator hoàn toàn)', () => {
      renderInAvatarContainer(TEST_USER_ID);
      // OnlineStatus có guard: if (error) return null
      const dot = screen.queryByRole('img');
      expect(dot).toBeNull();
    });

    it('indicator slot rỗng khi error', () => {
      const { getByTestId } = renderInAvatarContainer(TEST_USER_ID);
      const slot = getByTestId('indicator-slot');
      expect(slot.children).toHaveLength(0);
    });

    it('toàn bộ avatar container vẫn hiển thị bình thường', () => {
      renderInAvatarContainer(TEST_USER_ID);
      expect(screen.getByTestId('avatar-container')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-img')).toBeInTheDocument();
    });
  });

  // ─── Test case 5: userId không hợp lệ ───────────────────────────────────
  describe('khi userId không hợp lệ (chuỗi rỗng)', () => {
    beforeEach(() => {
      mockUseOnlineStatusCached.mockReturnValue({
        isOnline: false,
        lastActive: null,
        loading: false,
        error: false,
      });
    });

    it('không crash khi userId là chuỗi rỗng', () => {
      expect(() =>
        render(
          <div style={{ position: 'relative' }}>
            <OnlineStatus userId="" size="sm" showText={false} />
          </div>
        )
      ).not.toThrow();
    });

    it('không render indicator khi userId rỗng', () => {
      render(
        <div style={{ position: 'relative' }}>
          <OnlineStatus userId="" size="sm" showText={false} />
        </div>
      );
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  // ─── Test case 6: nhiều user trong danh sách ────────────────────────────
  describe('khi render nhiều user trong danh sách (mô phỏng ConversationsList)', () => {
    const USER_IDS = ['user_1', 'user_2', 'user_3'];

    beforeEach(() => {
      // user_1: online, user_2: offline, user_3: loading
      mockUseOnlineStatusCached.mockImplementation((userId: string) => {
        if (userId === 'user_1') return { isOnline: true, lastActive: new Date(), loading: false, error: false };
        if (userId === 'user_2') return { isOnline: false, lastActive: null, loading: false, error: false };
        if (userId === 'user_3') return { isOnline: false, lastActive: null, loading: true, error: false };
        return { isOnline: false, lastActive: null, loading: false, error: false };
      });
    });

    it('không crash khi render danh sách nhiều conversation items', () => {
      expect(() =>
        render(
          <div data-testid="conversations-list">
            {USER_IDS.map((uid) => (
              <div key={uid} data-testid={`item-${uid}`} style={{ position: 'relative' }}>
                <div style={{ width: 56, height: 56 }} />
                <div style={{ position: 'absolute', bottom: -4, right: -4 }}>
                  <OnlineStatus userId={uid} size="sm" showText={false} />
                </div>
              </div>
            ))}
          </div>
        )
      ).not.toThrow();
    });

    it('chỉ user online mới có indicator dot "Đang hoạt động"', () => {
      render(
        <div>
          {USER_IDS.map((uid) => (
            <div key={uid} style={{ position: 'relative' }}>
              <OnlineStatus userId={uid} size="sm" showText={false} />
            </div>
          ))}
        </div>
      );

      // Chỉ user_1 online → 1 dot "Đang hoạt động"
      const onlineDots = screen.queryAllByRole('img', { name: /đang hoạt động/i });
      expect(onlineDots).toHaveLength(1);
    });
  });
});
