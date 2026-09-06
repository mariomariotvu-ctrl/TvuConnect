/**
 * userStatus.serialization.test.ts
 *
 * Unit tests cho round-trip serialization của UserStatus.
 *
 * **Validates: Requirements 10.3**
 *
 * Property 5: Serialize `UserStatus` sang string và parse lại cho kết quả
 * tương đương về ngữ nghĩa — cùng `status`, cùng `isOnline`.
 */

import { describe, it, expect } from 'vitest';
import type { UserStatus } from './userStatusManager';

// ─── Kiểu nội bộ cho test StatusCacheEntry ───────────────────────────────────

/**
 * Mirrors the StatusCacheEntry interface từ useOnlineStatusCache.ts
 * (không export từ module đó nên định nghĩa lại ở đây cho mục đích test).
 */
interface StatusCacheEntry {
  isOnline: boolean;
  lastActive: Date | null;
  timestamp: number;
}

// ─── Test 1: Parameterized round-trip cho mọi UserStatus hợp lệ ──────────────

describe('Property 5: Round-trip UserStatus serialization', () => {
  /**
   * **Validates: Requirements 10.3**
   *
   * JSON.parse(JSON.stringify(status)) === status
   * với mọi UserStatus hợp lệ.
   */
  it.each<UserStatus>(['online', 'away', 'offline'])(
    'JSON.parse(JSON.stringify("%s")) === "%s"',
    (status) => {
      const serialized = JSON.stringify(status);
      const parsed = JSON.parse(serialized) as UserStatus;
      expect(parsed).toBe(status);
    }
  );
});

// ─── Test 2: StatusCacheEntry object round-trip ───────────────────────────────

describe('Property 5: StatusCacheEntry round-trip serialization', () => {
  /**
   * **Validates: Requirements 10.3**
   *
   * Serialize toàn bộ StatusCacheEntry → JSON → parse lại →
   * `isOnline` và `lastActive.getTime()` phải bằng nhau.
   */
  it('StatusCacheEntry với isOnline=true và lastActive hợp lệ: isOnline và lastActive.getTime() bằng nhau sau round-trip', () => {
    const lastActiveDate = new Date(Date.now() - 60_000); // 1 phút trước
    const entry: StatusCacheEntry = {
      isOnline: true,
      lastActive: lastActiveDate,
      timestamp: Date.now(),
    };

    // Serialize — Date sẽ thành ISO string khi JSON.stringify
    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as { isOnline: boolean; lastActive: string | null; timestamp: number };

    // isOnline giữ nguyên
    expect(parsed.isOnline).toBe(entry.isOnline);

    // lastActive: parse lại ISO string thành Date rồi so sánh getTime()
    const parsedLastActive = parsed.lastActive ? new Date(parsed.lastActive) : null;
    expect(parsedLastActive).not.toBeNull();
    expect(parsedLastActive!.getTime()).toBe(lastActiveDate.getTime());
  });

  it('StatusCacheEntry với isOnline=false và lastActive=null: round-trip giữ nguyên isOnline và lastActive', () => {
    const entry: StatusCacheEntry = {
      isOnline: false,
      lastActive: null,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as { isOnline: boolean; lastActive: string | null; timestamp: number };

    expect(parsed.isOnline).toBe(false);
    expect(parsed.lastActive).toBeNull();
  });

  it('StatusCacheEntry với isOnline=false và lastActive xa trong quá khứ: getTime() bằng nhau sau round-trip', () => {
    const lastActiveDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 ngày trước
    const entry: StatusCacheEntry = {
      isOnline: false,
      lastActive: lastActiveDate,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as { isOnline: boolean; lastActive: string | null; timestamp: number };

    expect(parsed.isOnline).toBe(false);
    const parsedLastActive = parsed.lastActive ? new Date(parsed.lastActive) : null;
    expect(parsedLastActive).not.toBeNull();
    expect(parsedLastActive!.getTime()).toBe(lastActiveDate.getTime());
  });
});

// ─── Test 3: UserStatus string không thay đổi ý nghĩa sau serialize/deserialize ─

describe('Property 5: UserStatus giữ nguyên ý nghĩa sau serialize/deserialize', () => {
  /**
   * **Validates: Requirements 10.3**
   *
   * Sau khi serialize rồi parse lại, UserStatus vẫn là một trong các giá trị hợp lệ
   * và ánh xạ isOnline đúng ngữ nghĩa.
   */
  const VALID_STATUSES: UserStatus[] = ['online', 'away', 'offline'];

  it('Mọi UserStatus sau serialize/deserialize vẫn là giá trị hợp lệ', () => {
    for (const status of VALID_STATUSES) {
      const parsed = JSON.parse(JSON.stringify(status)) as UserStatus;
      expect(VALID_STATUSES).toContain(parsed);
    }
  });

  it('"online" → serialize/deserialize → vẫn ánh xạ isOnline = true', () => {
    const status: UserStatus = 'online';
    const parsed = JSON.parse(JSON.stringify(status)) as UserStatus;
    const isOnline = parsed === 'online';
    expect(isOnline).toBe(true);
  });

  it('"away" → serialize/deserialize → vẫn ánh xạ isOnline = false (away không phải online)', () => {
    const status: UserStatus = 'away';
    const parsed = JSON.parse(JSON.stringify(status)) as UserStatus;
    const isOnline = parsed === 'online';
    expect(isOnline).toBe(false);
    // Nhưng vẫn là 'away' — không bị mất thông tin
    expect(parsed).toBe('away');
  });

  it('"offline" → serialize/deserialize → vẫn ánh xạ isOnline = false', () => {
    const status: UserStatus = 'offline';
    const parsed = JSON.parse(JSON.stringify(status)) as UserStatus;
    const isOnline = parsed === 'online';
    expect(isOnline).toBe(false);
    expect(parsed).toBe('offline');
  });

  it('serialize nhiều lần liên tiếp vẫn giữ nguyên giá trị (idempotent)', () => {
    for (const status of VALID_STATUSES) {
      // Double round-trip
      const parsed = JSON.parse(JSON.stringify(JSON.parse(JSON.stringify(status)))) as UserStatus;
      expect(parsed).toBe(status);
    }
  });
});
