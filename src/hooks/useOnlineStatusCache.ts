/**
 * Online Status Cache Hook with Optimizations
 *
 * Tối ưu hoá đọc trạng thái online với:
 * - getDoc polling — tránh lỗi INTERNAL ASSERTION FAILED khi onSnapshot
 *   mount/unmount nhanh trong trang matching.
 * - Ngưỡng 420 000 ms (7 phút) để chịu clock skew giữa client và server.
 * - Promise deduplication: nhiều component cùng gọi 1 userId → chỉ 1 request.
 * - Phân biệt lỗi permission (PERMISSION_DENIED / permission-denied) và lỗi mạng:
 *   lỗi permission → trả về error, KHÔNG retry tự động.
 *
 * Requirements: 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db } from '../firebase';

interface StatusCacheEntry {
  isOnline: boolean;
  lastActive: Date | null;
  timestamp: number;
}

/** Kết quả trả về bởi useOnlineStatusCached */
export interface StatusResult {
  isOnline: boolean;
  lastActive: Date | null;
  loading: boolean;
  error: boolean;
}

// ─── Module-level cache (dùng chung giữa các component) ──────────────────────
const statusCache = new Map<string, StatusCacheEntry>();
const STATUS_CACHE_TTL = 30_000; // 30 giây

// Deduplication: lưu promise đang pending theo userId
const fetchPromises = new Map<string, Promise<StatusCacheEntry | null>>();

// ─── Helper: phân loại lỗi permission ────────────────────────────────────────

/**
 * Trả về `true` nếu lỗi là PERMISSION_DENIED (Firestore security rules từ chối).
 * Áp dụng với: invisible mode, blocked users, user chưa xác thực.
 */
function isPermissionError(error: unknown): boolean {
  if (error instanceof FirebaseError) {
    // FirebaseError.code có dạng "firestore/permission-denied"
    return (
      error.code === 'permission-denied' ||
      error.code === 'firestore/permission-denied' ||
      error.code.includes('PERMISSION_DENIED')
    );
  }
  // Fallback cho các error object không phải FirebaseError
  if (error instanceof Error) {
    return (
      error.message.includes('PERMISSION_DENIED') ||
      error.message.includes('permission-denied')
    );
  }
  return false;
}

// ─── Helper: tính toán isOnline từ flag và lastActive (có thể test độc lập) ──

/**
 * Tính toán trạng thái online dựa trên `isOnlineFlag` và `lastActive`.
 *
 * Trả về `true` khi và chỉ khi:
 *   (1) `isOnlineFlag === true`
 *   (2) `lastActive` khác `null` VÀ `|Date.now() - lastActive.getTime()| < 420_000`
 *
 * Dùng `Math.abs` để chịu được clock skew giữa client và server.
 *
 * Validates: Requirements 6.4, 10.5
 */
export function computeIsOnline(isOnlineFlag: boolean, lastActive: Date | null): boolean {
  if (!isOnlineFlag) return false;
  if (lastActive === null) return false;
  return Math.abs(Date.now() - lastActive.getTime()) < 420_000;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnlineStatusCached(userId: string | null | undefined): StatusResult {
  // Lazy initial state: nếu userId không hợp lệ ngay từ đầu → loading = false
  const [status, setStatus] = useState<StatusResult>(() => {
    if (!userId) {
      return { isOnline: false, lastActive: null, loading: false, error: false };
    }
    return { isOnline: false, lastActive: null, loading: true, error: false };
  });

  useEffect(() => {
    // Guard: userId null / undefined → trả về ngay, không gọi Firebase
    if (!userId) {
      setStatus({ isOnline: false, lastActive: null, loading: false, error: false });
      return;
    }

    let mounted = true;
    // Flag để dừng retry khi gặp lỗi permission
    let permissionDenied = false;

    const fetchStatus = async () => {
      // Không retry sau khi đã gặp lỗi permission
      if (permissionDenied) return;

      const now = Date.now();
      const cachedEntry = statusCache.get(userId);

      // Cache hit: còn trong TTL → dùng luôn, không gọi mạng
      if (cachedEntry && (now - cachedEntry.timestamp) < STATUS_CACHE_TTL) {
        if (mounted) {
          setStatus({
            isOnline: cachedEntry.isOnline,
            lastActive: cachedEntry.lastActive,
            loading: false,
            error: false
          });
        }
        return;
      }

      // Deduplication: reuse promise đang pending cho cùng userId
      let fetchPromise = fetchPromises.get(userId);
      if (!fetchPromise) {
        fetchPromise = (async (): Promise<StatusCacheEntry | null> => {
          try {
            const userRef = doc(db, 'profiles', userId);
            const docSnap = await getDoc(userRef);

            if (docSnap.exists()) {
              const data = docSnap.data();
              const lastActiveDate: Date | null = data.lastActive?.toDate() ?? null;

              // isOnline: true CHỈ KHI isOnline === true VÀ lastActive trong 420 000 ms
              // Dùng computeIsOnline để đảm bảo nhất quán với logic đã được test
              const isActuallyOnline = computeIsOnline(data.isOnline === true, lastActiveDate);

              const newEntry: StatusCacheEntry = {
                isOnline: isActuallyOnline,
                lastActive: lastActiveDate,
                timestamp: Date.now()
              };

              statusCache.set(userId, newEntry);
              return newEntry;
            }

            // Document không tồn tại → offline, không lỗi
            return null;
          } catch (error) {
            if (isPermissionError(error)) {
              // Lỗi permission (invisible mode, bị block, chưa auth):
              // Ném lại để caller phân biệt — không log như network error
              throw error;
            }
            // Lỗi mạng / Firestore khác: log nhẹ, không crash
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[OnlineStatus] Network error fetching status:', error);
            }
            return null;
          } finally {
            fetchPromises.delete(userId);
          }
        })();

        fetchPromises.set(userId, fetchPromise);
      }

      try {
        const result = await fetchPromise;
        if (mounted) {
          if (result) {
            setStatus({
              isOnline: result.isOnline,
              lastActive: result.lastActive,
              loading: false,
              error: false
            });
          } else {
            // Document không tồn tại hoặc lỗi mạng → offline, error: true
            setStatus({ isOnline: false, lastActive: null, loading: false, error: true });
          }
        }
      } catch (error) {
        // Lỗi permission được bắt ở đây
        if (isPermissionError(error)) {
          permissionDenied = true; // Dừng retry
          if (mounted) {
            setStatus({ isOnline: false, lastActive: null, loading: false, error: true });
          }
        } else {
          // Trường hợp hiếm: lỗi bất ngờ không phải permission
          if (mounted) {
            setStatus({ isOnline: false, lastActive: null, loading: false, error: true });
          }
        }
      }
    };

    // Fetch lần đầu ngay lập tức
    fetchStatus();

    // Polling mỗi 30 giây để cập nhật UI
    const intervalId = setInterval(fetchStatus, STATUS_CACHE_TTL);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [userId]);

  return status;
}

export function cleanupAllOnlineStatusListeners() {
  statusCache.clear();
  fetchPromises.clear();
}

export function getOnlineStatusListenerStats() {
  return {
    cachedStatuses: statusCache.size,
    pendingRequests: fetchPromises.size,
    cacheTTL: STATUS_CACHE_TTL,
    mode: 'polling-with-skew-fix'
  };
}
