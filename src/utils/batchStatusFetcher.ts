/**
 * batchStatusFetcher.ts
 * Module lấy presence data của nhiều UIDs cùng lúc từ Firebase Realtime DB,
 * với cache in-memory TTL 60 giây để tránh gọi lại Firebase khi load thêm hồ sơ.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.4
 */

import { ActivityData } from './activityBooster';

// ============================================================
// Constants
// ============================================================

export const BATCH_CACHE_TTL_MS = 60_000; // 60 giây
export const BATCH_TIMEOUT_MS = 800;      // 0.8 giây (giảm từ 2s để không block matching)

// ============================================================
// Internal Types
// ============================================================

interface BatchCacheEntry {
  data: Map<string, ActivityData>;
  fetchedAt: number;
}

// ============================================================
// Module-level in-memory cache
// ============================================================

const batchCache = new Map<string, BatchCacheEntry>();

// ============================================================
// Public: Cache management
// ============================================================

/**
 * Xóa toàn bộ cache — dùng trong tests để đảm bảo isolation.
 */
export function clearBatchStatusCache(): void {
  batchCache.clear();
}

/**
 * Trả về thống kê cache hiện tại (dùng để debug).
 *
 * - `size`: Số lượng entry đang có trong cache
 * - `oldestEntryAgeMs`: Tuổi của entry cũ nhất (ms kể từ `fetchedAt`),
 *   hoặc `null` nếu cache trống
 */
export function getBatchStatusCacheStats(): {
  size: number;
  oldestEntryAgeMs: number | null;
} {
  const size = batchCache.size;

  if (size === 0) {
    return { size: 0, oldestEntryAgeMs: null };
  }

  const now = Date.now();
  let oldestFetchedAt = now; // Tìm entry có fetchedAt nhỏ nhất (lâu nhất)

  for (const entry of batchCache.values()) {
    if (entry.fetchedAt < oldestFetchedAt) {
      oldestFetchedAt = entry.fetchedAt;
    }
  }

  return {
    size,
    oldestEntryAgeMs: now - oldestFetchedAt,
  };
}

// ============================================================
// Internal: Cache helpers
// ============================================================

/**
 * Tạo cache key từ danh sách UIDs.
 * Sort trước để đảm bảo cùng tập UIDs (dù thứ tự khác nhau) → cùng key.
 * Requirements: 2.4
 */
function getCacheKey(uids: string[]): string {
  return JSON.stringify([...uids].sort());
}

/**
 * Trả về dữ liệu từ cache nếu còn trong TTL, ngược lại xóa entry và trả về null.
 */
function getCached(key: string): Map<string, ActivityData> | null {
  const entry = batchCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.fetchedAt > BATCH_CACHE_TTL_MS) {
    batchCache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Lưu kết quả fetch vào cache với timestamp hiện tại.
 */
function setCached(key: string, data: Map<string, ActivityData>): void {
  batchCache.set(key, { data, fetchedAt: Date.now() });
}

// ============================================================
// Public: batchFetchPresenceStatus
// (Implementation sẽ được thêm ở Task 3.2)
// ============================================================

/**
 * Fetch presence data cho nhiều UIDs cùng lúc từ Firebase Realtime DB.
 *
 * - Trả về `Map<uid, ActivityData>` cho các UID có dữ liệu hợp lệ.
 * - UIDs rỗng → trả về `Map()` ngay, không gọi Firebase.
 * - Cache hit (trong TTL 60s) → trả về cached, không gọi Firebase.
 * - Timeout (>2s), lỗi Firebase, lỗi parse → trả về `Map()` rỗng, không throw.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.4
 */
export async function batchFetchPresenceStatus(
  uids: string[]
): Promise<Map<string, ActivityData>> {
  // UIDs rỗng → không cần fetch
  if (uids.length === 0) return new Map();

  // Kiểm tra cache
  const key = getCacheKey(uids);
  const cached = getCached(key);
  if (cached !== null) return cached;

  try {
    // Import lazy để tránh lỗi circular dependency và dễ mock trong tests
    const { ref, get } = await import('firebase/database');
    const { realtimeDb } = await import('../firebase');
    const { parsePresenceData } = await import('./activityBooster');

    // Fetch toàn bộ node 'presence' một lần duy nhất
    const fetchPromise = get(ref(realtimeDb, 'presence')).then((snapshot) => {
      const result = new Map<string, ActivityData>();

      if (!snapshot.exists()) return result;

      const allPresence = snapshot.val() as Record<string, unknown>;

      for (const uid of uids) {
        try {
          const raw = allPresence[uid];
          if (raw == null) continue;

          const parsed = parsePresenceData(raw as Parameters<typeof parsePresenceData>[0]);
          if (parsed !== null) {
            result.set(uid, parsed);
          }
        } catch {
          // Skip UID này nếu parse thất bại — không ảnh hưởng các UID khác
        }
      }

      return result;
    });

    // Timeout 2 giây theo Requirements 2.3
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), BATCH_TIMEOUT_MS)
    );

    const result = await Promise.race([fetchPromise, timeoutPromise]);

    if (result === null) {
      // Timeout
      console.warn('[BatchStatusFetcher] Fetch timed out after 2s, falling back to empty map');
      return new Map();
    }

    // Lưu vào cache sau khi fetch thành công
    setCached(key, result);
    return result;
  } catch (e) {
    console.warn('[BatchStatusFetcher] Fetch failed, falling back to empty map:', e);
    return new Map(); // NEVER throw — Requirements 2.2
  }
}
