/**
 * Unit tests cho batchStatusFetcher.ts
 * Tập trung vào cache layer và các trường hợp không cần gọi Firebase.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  clearBatchStatusCache,
  getBatchStatusCacheStats,
  batchFetchPresenceStatus,
  BATCH_CACHE_TTL_MS,
} from './batchStatusFetcher';

// Mock lazy Firebase imports để ngăn thực sự gọi Firebase
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn(),
}));

vi.mock('../firebase', () => ({
  realtimeDb: {},
}));

describe('batchStatusFetcher — cache layer', () => {
  beforeEach(() => {
    clearBatchStatusCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ─── UIDs rỗng ──────────────────────────────────────────────────────────────

  it('UIDs rỗng → Map rỗng ngay, không gọi Firebase (Requirements 2.1)', async () => {
    const { get } = await import('firebase/database');
    const result = await batchFetchPresenceStatus([]);
    expect(result.size).toBe(0);
    expect(get).not.toHaveBeenCalled();
  });

  // ─── Cache management functions ─────────────────────────────────────────────

  it('getBatchStatusCacheStats() trả về { size:0, oldestEntryAgeMs:null } khi cache rỗng', () => {
    const stats = getBatchStatusCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.oldestEntryAgeMs).toBeNull();
  });

  it('clearBatchStatusCache() xóa toàn bộ cache', async () => {
    // Đầu tiên cần tạo entry trong cache — ta mock Firebase để trả về snapshot rỗng
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => false,
      val: () => null,
    } as unknown as Awaited<ReturnType<typeof get>>);

    await batchFetchPresenceStatus(['user1']);

    // Bây giờ cache có 1 entry
    expect(getBatchStatusCacheStats().size).toBe(1);

    // Xóa cache
    clearBatchStatusCache();
    expect(getBatchStatusCacheStats().size).toBe(0);
    expect(getBatchStatusCacheStats().oldestEntryAgeMs).toBeNull();
  });

  // ─── Property 4: Cache idempotent ────────────────────────────────────────────
  // Validates: Requirements 2.4

  it('Property 4 — cache hit: fetch lần 2 trong TTL không gọi get() lần nữa', async () => {
    /**
     * **Validates: Requirements 2.4**
     * Với bất kỳ tập UIDs nào, nếu batchFetchPresenceStatus(uids) được gọi lần thứ hai
     * trong vòng 60 giây kể từ lần đầu, kết quả trả về phải giống hệt lần đầu
     * và Firebase không được gọi thêm.
     */
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => false,
      val: () => null,
    } as unknown as Awaited<ReturnType<typeof get>>);

    // Fetch lần 1
    const result1 = await batchFetchPresenceStatus(['u1', 'u2']);
    expect(get).toHaveBeenCalledTimes(1);

    // Advance ít hơn TTL (59 giây)
    vi.advanceTimersByTime(BATCH_CACHE_TTL_MS - 1000);

    // Fetch lần 2 — cache hit: cùng kết quả, không gọi Firebase thêm
    const result2 = await batchFetchPresenceStatus(['u1', 'u2']);
    expect(get).toHaveBeenCalledTimes(1); // Vẫn 1, không gọi lại

    // Kết quả phải tương đương (idempotent)
    expect(result2.size).toBe(result1.size);
  });

  it('Property 4 — cache idempotent: kết quả fetch lần 2 giống hệt lần 1 khi Firebase có data', async () => {
    /**
     * **Validates: Requirements 2.4**
     * Khi Firebase trả về dữ liệu thực, cache phải lưu và trả về đúng dữ liệu đó.
     */
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        user1: {
          status: 'online',
          lastActive: Date.now(),
          settings: { invisibleMode: false },
        },
      }),
    } as unknown as Awaited<ReturnType<typeof get>>);

    // Fetch lần 1
    const result1 = await batchFetchPresenceStatus(['user1']);
    expect(get).toHaveBeenCalledTimes(1);
    expect(result1.size).toBe(1);
    expect(result1.get('user1')?.status).toBe('online');

    // Advance ít hơn TTL
    vi.advanceTimersByTime(BATCH_CACHE_TTL_MS / 2);

    // Fetch lần 2 — cache hit
    const result2 = await batchFetchPresenceStatus(['user1']);
    expect(get).toHaveBeenCalledTimes(1); // Không gọi lại Firebase

    // Kết quả idempotent
    expect(result2.get('user1')?.status).toBe(result1.get('user1')?.status);
    expect(result2.get('user1')?.lastActive).toBe(result1.get('user1')?.lastActive);
  });

  // ─── Cache miss sau TTL ──────────────────────────────────────────────────────

  it('cache miss sau TTL — gọi lại Firebase (Requirements 2.4)', async () => {
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => false,
      val: () => null,
    } as unknown as Awaited<ReturnType<typeof get>>);

    // Fetch lần 1
    await batchFetchPresenceStatus(['u1']);
    expect(get).toHaveBeenCalledTimes(1);

    // Advance qua TTL (61 giây)
    vi.advanceTimersByTime(BATCH_CACHE_TTL_MS + 1000);

    // Fetch lần 2 — cache expired, phải gọi lại Firebase
    await batchFetchPresenceStatus(['u1']);
    expect(get).toHaveBeenCalledTimes(2);
  });

  // ─── Firebase error → Map rỗng, không throw ──────────────────────────────────

  it('Firebase lỗi → trả về Map rỗng, không throw (Requirements 2.2)', async () => {
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockRejectedValue(new Error('Firebase network error'));

    // Phải không throw và trả về Map rỗng
    await expect(batchFetchPresenceStatus(['u1'])).resolves.toBeDefined();
    const result = await batchFetchPresenceStatus(['u1']);
    expect(result.size).toBe(0);
  });

  // ─── Firebase timeout → Map rỗng ─────────────────────────────────────────────

  it('Firebase timeout → Map rỗng sau 2s (Requirements 2.3)', async () => {
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);

    // get() không bao giờ resolve — simulate network hang
    vi.mocked(get).mockImplementation(() => new Promise(() => {}));

    // Chạy song song: fetch + advance timers
    const fetchPromise = batchFetchPresenceStatus(['u1_timeout']);
    await vi.runAllTimersAsync();

    const result = await fetchPromise;
    expect(result.size).toBe(0);
  }, 10_000);

  // ─── Cache key order-independent ─────────────────────────────────────────────

  it('cache key không phụ thuộc thứ tự UIDs (Requirements 2.4)', async () => {
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => false,
      val: () => null,
    } as unknown as Awaited<ReturnType<typeof get>>);

    // Fetch với thứ tự ['u2', 'u1']
    await batchFetchPresenceStatus(['u2', 'u1']);
    expect(get).toHaveBeenCalledTimes(1);

    // UIDs đảo ngược ['u1', 'u2'] — phải hit cache (cùng key sau khi sort)
    await batchFetchPresenceStatus(['u1', 'u2']);
    expect(get).toHaveBeenCalledTimes(1); // Vẫn 1 lần — cache hit
  });

  // ─── getBatchStatusCacheStats sau khi có entries ──────────────────────────────

  it('getBatchStatusCacheStats() trả về size đúng sau nhiều fetch với key khác nhau', async () => {
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => false,
      val: () => null,
    } as unknown as Awaited<ReturnType<typeof get>>);

    // Fetch 2 batch khác nhau → 2 cache entries
    await batchFetchPresenceStatus(['u1']);
    await batchFetchPresenceStatus(['u2', 'u3']); // key khác → entry mới

    const stats = getBatchStatusCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.oldestEntryAgeMs).toBeGreaterThanOrEqual(0);
  });

  // ─── Firebase snapshot với dữ liệu hợp lệ → parse đúng ──────────────────────

  it('Firebase snapshot có dữ liệu → parse đúng và lưu cache (Requirements 2.1)', async () => {
    const { ref, get } = await import('firebase/database');
    vi.mocked(ref).mockReturnValue({} as ReturnType<typeof ref>);
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        alice: {
          status: 'online',
          lastActive: 1700000000000,
          settings: { invisibleMode: false },
        },
        bob: {
          status: 'offline',
          lastActive: 1699900000000,
          settings: { invisibleMode: true },
        },
        unknownUser: {
          status: 'away',
          lastActive: 1699800000000,
        },
      }),
    } as unknown as Awaited<ReturnType<typeof get>>);

    const result = await batchFetchPresenceStatus(['alice', 'bob']);

    // Chỉ các UID được request mới có trong kết quả
    expect(result.size).toBe(2);
    expect(result.has('alice')).toBe(true);
    expect(result.has('bob')).toBe(true);
    expect(result.has('unknownUser')).toBe(false);

    // Parse đúng status và invisibleMode
    expect(result.get('alice')?.status).toBe('online');
    expect(result.get('alice')?.invisibleMode).toBe(false);
    expect(result.get('bob')?.status).toBe('offline');
    expect(result.get('bob')?.invisibleMode).toBe(true);

    // Kết quả đã được cache
    expect(getBatchStatusCacheStats().size).toBe(1);
  });
});
