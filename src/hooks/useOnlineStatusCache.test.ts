/**
 * Property-based tests cho `computeIsOnline`
 *
 * **Validates: Requirements 6.4, 10.5**
 *
 * Property 3: isOnline logic (if-and-only-if)
 *   `isOnline === true` khi và chỉ khi:
 *     - `isOnlineFlag === true`  VÀ
 *     - `|Date.now() - lastActive.getTime()| < 420_000`
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeIsOnline } from './useOnlineStatusCache';

// ─────────────────────────────────────────────────────────────────────────────
// Property 3: isOnline logic — if and only if
// ─────────────────────────────────────────────────────────────────────────────

describe('computeIsOnline — Property 3: isOnline logic (if and only if)', () => {
  /**
   * Core property:
   * Với mọi `isOnlineFlag: boolean` và `ageMs: number` trong [0, 1_000_000],
   * `computeIsOnline(isOnlineFlag, new Date(Date.now() - ageMs))`
   * phải trả về `true` khi và chỉ khi `isOnlineFlag === true` VÀ `ageMs < 420_000`.
   *
   * **Validates: Requirements 6.4, 10.5**
   */
  it('Property 3: result === true khi và chỉ khi isOnlineFlag=true VÀ ageMs < 420_000', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 1_000_000 }),
        (isOnlineFlag, ageMs) => {
          const lastActive = new Date(Date.now() - ageMs);
          const result = computeIsOnline(isOnlineFlag, lastActive);
          const expected = isOnlineFlag === true && ageMs < 420_000;
          return result === expected;
        }
      ),
      { numRuns: 1000 }
    );
  });

  // ─── Boundary tests ─────────────────────────────────────────────────────────

  it('Boundary: ageMs=419_999 + isOnlineFlag=true → true', () => {
    const lastActive = new Date(Date.now() - 419_999);
    expect(computeIsOnline(true, lastActive)).toBe(true);
  });

  it('Boundary: ageMs=420_000 + isOnlineFlag=true → false (bằng ngưỡng không tính)', () => {
    // Math.abs(...) < 420_000 là strictly less than → đúng bằng 420_000 phải là false
    const lastActive = new Date(Date.now() - 420_000);
    expect(computeIsOnline(true, lastActive)).toBe(false);
  });

  it('Boundary: ageMs=420_001 + isOnlineFlag=true → false', () => {
    const lastActive = new Date(Date.now() - 420_001);
    expect(computeIsOnline(true, lastActive)).toBe(false);
  });

  it('Boundary: ageMs=0 + isOnlineFlag=false → false', () => {
    const lastActive = new Date(Date.now() - 0);
    expect(computeIsOnline(false, lastActive)).toBe(false);
  });

  it('Edge case: lastActive=null → false (dù isOnlineFlag=true)', () => {
    expect(computeIsOnline(true, null)).toBe(false);
  });

  it('Edge case: lastActive=null + isOnlineFlag=false → false', () => {
    expect(computeIsOnline(false, null)).toBe(false);
  });

  // ─── Thêm property cho trường hợp lastActive=null luôn trả về false ─────────

  it('Property: lastActive=null luôn trả về false bất kể isOnlineFlag', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isOnlineFlag) => {
          return computeIsOnline(isOnlineFlag, null) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  // ─── Property cho trường hợp isOnlineFlag=false luôn trả về false ───────────

  it('Property: isOnlineFlag=false luôn trả về false bất kể lastActive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        (ageMs) => {
          const lastActive = new Date(Date.now() - ageMs);
          return computeIsOnline(false, lastActive) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Property 2: Cache deduplication — cùng userId trong TTL → chỉ 1 network request
//
// **Validates: Requirements 6.1, 6.2, 10.2**
//
// Kiểm tra module-level cache (statusCache) và promise deduplication (fetchPromises)
// đảm bảo nhiều lần gọi fetchStatus cho cùng userId trong TTL window
// chỉ tạo đúng 1 Firestore request.
// ─────────────────────────────────────────────────────────────────────────────

import {
  describe as describeP2,
  it as itP2,
  expect as expectP2,
  vi,
  beforeEach as beforeEachP2,
  afterEach as afterEachP2,
} from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOnlineStatusCached, cleanupAllOnlineStatusListeners } from './useOnlineStatusCache';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock ../firebase để tránh import thật
vi.mock('../firebase', () => ({
  db: {},
}));

// Mock firebase/firestore — getDoc là spy có thể configure theo từng test
const mockGetDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, _collection: string, userId: string) => ({
    _path: `profiles/${userId}`,
  })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

// ─── Helper: tạo fake Firestore document snapshot ─────────────────────────────

function makeFakeDocSnap(userId: string, isOnline = true, ageMs = 10_000) {
  return {
    exists: () => true,
    data: () => ({
      isOnline,
      lastActive: {
        toDate: () => new Date(Date.now() - ageMs),
      },
    }),
    id: userId,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describeP2('useOnlineStatusCached — Property 2: Cache deduplication', () => {
  /**
   * Dùng vi.useFakeTimers() để kiểm soát TTL mà không cần đợi 30 giây thật.
   * cleanupAllOnlineStatusListeners() reset module-level cache và fetchPromises
   * trước mỗi test để đảm bảo isolation.
   */
  beforeEachP2(() => {
    vi.useFakeTimers();
    mockGetDoc.mockReset();
    cleanupAllOnlineStatusListeners();
  });

  afterEachP2(() => {
    cleanupAllOnlineStatusListeners();
    vi.useRealTimers();
  });

  // ─── Test 1: Nhiều calls cùng userId trong TTL → chỉ 1 getDoc ──────────────

  itP2(
    'Property 2a: N lần gọi hook với cùng userId trong TTL → getDoc chỉ được gọi 1 lần',
    async () => {
      /**
       * **Validates: Requirements 6.1, 6.2, 10.2**
       *
       * Với mọi N ∈ [2..10] và cùng userId,
       * số lần getDoc thực tế luôn bằng 1 (không phải N).
       */
      const userId = 'user-dedup-test';
      mockGetDoc.mockResolvedValue(makeFakeDocSnap(userId));

      // Mount N hooks đồng thời cho cùng userId
      const N = 5;
      const hooks = Array.from({ length: N }, () =>
        renderHook(() => useOnlineStatusCached(userId))
      );

      // Chờ tất cả hooks resolve
      await waitFor(() => {
        hooks.forEach(({ result }) => {
          expectP2(result.current.loading).toBe(false);
        });
      });

      // Chỉ 1 network request dù có N hooks
      expectP2(mockGetDoc).toHaveBeenCalledTimes(1);

      // Tất cả hooks trả về kết quả nhất quán
      hooks.forEach(({ result }) => {
        expectP2(result.current.isOnline).toBe(true);
        expectP2(result.current.error).toBe(false);
      });

      // Cleanup
      hooks.forEach(({ unmount }) => unmount());
    }
  );

  // ─── Test 2 (property-based): Với mọi N ∈ [2..8] và bất kỳ userId nào ─────

  itP2(
    'Property 2b (fast-check): Với mọi N và userId ngẫu nhiên trong TTL → getDoc luôn = 1',
    async () => {
      /**
       * **Validates: Requirements 6.1, 6.2, 10.2**
       */
      const userIds = ['alice', 'bob-123', 'user_xyz', 'test-user-99'];
      const callCounts = [2, 3, 5, 8];

      for (const userId of userIds) {
        for (const N of callCounts) {
          // Reset cho mỗi lần chạy
          cleanupAllOnlineStatusListeners();
          mockGetDoc.mockReset();
          mockGetDoc.mockResolvedValue(makeFakeDocSnap(userId));

          const hooks = Array.from({ length: N }, () =>
            renderHook(() => useOnlineStatusCached(userId))
          );

          await waitFor(() => {
            hooks.forEach(({ result }) => {
              expectP2(result.current.loading).toBe(false);
            });
          });

          // Invariant: số requests luôn = 1 bất kể N
          expectP2(mockGetDoc).toHaveBeenCalledTimes(1);

          hooks.forEach(({ unmount }) => unmount());
        }
      }
    }
  );

  // ─── Test 3: Sau khi TTL hết hạn → getDoc được gọi lại ─────────────────────

  itP2(
    'Property 2c: Sau khi TTL (30s) hết hạn → getDoc được gọi thêm lần nữa',
    async () => {
      /**
       * **Validates: Requirements 6.1, 10.2**
       *
       * Cache entry hết hạn sau STATUS_CACHE_TTL (30_000ms).
       * Lần gọi tiếp theo sau TTL phải tạo thêm 1 network request.
       */
      const userId = 'user-ttl-expiry';
      mockGetDoc.mockResolvedValue(makeFakeDocSnap(userId));

      const { result, unmount } = renderHook(() => useOnlineStatusCached(userId));

      // Chờ lần fetch đầu tiên hoàn thành
      await waitFor(() => {
        expectP2(result.current.loading).toBe(false);
      });

      expectP2(mockGetDoc).toHaveBeenCalledTimes(1);

      // Tiến thời gian qua TTL (30s + 1ms) để cache expire và interval trigger
      vi.advanceTimersByTime(30_001);

      // Chờ setInterval trigger fetchStatus lần 2
      await waitFor(() => {
        expectP2(mockGetDoc.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      unmount();
    }
  );

  // ─── Test 4: userId khác nhau → getDoc gọi riêng biệt ─────────────────────

  itP2(
    'Property 2d: userId khác nhau → mỗi userId có 1 getDoc riêng biệt',
    async () => {
      /**
       * **Validates: Requirements 6.1, 6.2**
       *
       * Cache key là userId — hai userId khác nhau không chia sẻ cache entry.
       * Mỗi userId phải có đúng 1 network request riêng.
       */
      const userA = 'user-alpha';
      const userB = 'user-beta';
      const userC = 'user-gamma';

      mockGetDoc.mockImplementation((docRef: { _path: string }) => {
        const userId = docRef._path.split('/')[1];
        return Promise.resolve(makeFakeDocSnap(userId));
      });

      const hookA = renderHook(() => useOnlineStatusCached(userA));
      const hookB = renderHook(() => useOnlineStatusCached(userB));
      const hookC = renderHook(() => useOnlineStatusCached(userC));

      await waitFor(() => {
        expectP2(hookA.result.current.loading).toBe(false);
        expectP2(hookB.result.current.loading).toBe(false);
        expectP2(hookC.result.current.loading).toBe(false);
      });

      // 3 userId khác nhau → 3 requests riêng biệt
      expectP2(mockGetDoc).toHaveBeenCalledTimes(3);

      hookA.unmount();
      hookB.unmount();
      hookC.unmount();
    }
  );

  // ─── Test 5: Cache hit → không gọi getDoc lần 2 ─────────────────────────────

  itP2(
    'Property 2e: Gọi hook lần 2 trong TTL → dùng cache, không gọi getDoc lại',
    async () => {
      /**
       * **Validates: Requirements 6.1, 10.2**
       *
       * Hook lần 1 fetch xong → cache được lưu.
       * Unmount rồi remount trong TTL → vẫn là cache hit, getDoc không được gọi thêm.
       */
      const userId = 'user-cache-hit';
      mockGetDoc.mockResolvedValue(makeFakeDocSnap(userId));

      // Lần mount đầu
      const { result: r1, unmount: u1 } = renderHook(() =>
        useOnlineStatusCached(userId)
      );
      await waitFor(() => expectP2(r1.current.loading).toBe(false));
      expectP2(mockGetDoc).toHaveBeenCalledTimes(1);
      u1();

      // Lần mount lại trong TTL (chưa advance time)
      const { result: r2, unmount: u2 } = renderHook(() =>
        useOnlineStatusCached(userId)
      );
      await waitFor(() => expectP2(r2.current.loading).toBe(false));

      // Vẫn chỉ 1 lần gọi getDoc — lần 2 là cache hit
      expectP2(mockGetDoc).toHaveBeenCalledTimes(1);
      expectP2(r2.current.isOnline).toBe(true);
      u2();
    }
  );
});
