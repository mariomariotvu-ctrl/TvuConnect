/**
 * Online Status Cache Hook with Optimizations
 * 
 * This hook optimizes online status fetching with:
 * - getDoc polling to completely prevent Firestore INTERNAL ASSERTION FAILED crashes 
 *   caused by rapid onSnapshot mount/unmounts during matching.
 * - 5-minute threshold for online status to tolerate device clock skew
 * - Promise deduplication to prevent redundant network calls
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface StatusCacheEntry {
  isOnline: boolean;
  lastActive: Date | null;
  timestamp: number;
}

// Global cache to prevent re-fetching the same user across components
const statusCache = new Map<string, StatusCacheEntry>();
const STATUS_CACHE_TTL = 30000; // Poll every 30s to keep UI feeling real-time

// Deduplicate concurrent fetch requests
const fetchPromises = new Map<string, Promise<StatusCacheEntry | null>>();

export function useOnlineStatusCached(userId: string | undefined) {
  const [status, setStatus] = useState<{
    isOnline: boolean;
    lastActive: Date | null;
    loading: boolean;
    error: boolean;
  }>({
    isOnline: false,
    lastActive: null,
    loading: true,
    error: false
  });

  useEffect(() => {
    if (!userId) {
      setStatus({ isOnline: false, lastActive: null, loading: false, error: false });
      return;
    }

    let mounted = true;

    const fetchStatus = async () => {
      const now = Date.now();
      const cachedStatus = statusCache.get(userId);

      // Cache hit
      if (cachedStatus && (now - cachedStatus.timestamp) < STATUS_CACHE_TTL) {
        if (mounted) {
          setStatus({
            isOnline: cachedStatus.isOnline,
            lastActive: cachedStatus.lastActive,
            loading: false,
            error: false
          });
        }
        return;
      }

      // Deduplicate concurrent fetches
      let fetchPromise = fetchPromises.get(userId);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          try {
            const userRef = doc(db, 'profiles', userId);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              const lastActiveDate = data.lastActive?.toDate() || null;
              
              // Allow 5 minutes (300,000ms) threshold to account for 3-min heartbeat + clock skew
              // Math.abs handles cases where client clock is behind server clock
              const isRecentlyActive = lastActiveDate 
                ? Math.abs(Date.now() - lastActiveDate.getTime()) < 300000 
                : false;
              
              const isActuallyOnline = (data.isOnline || false) && isRecentlyActive;
              
              const newEntry = {
                isOnline: isActuallyOnline,
                lastActive: lastActiveDate,
                timestamp: Date.now()
              };
              
              statusCache.set(userId, newEntry);
              return newEntry;
            }
            return null;
          } catch (error) {
            console.error('[OnlineStatus] Error fetching status:', error);
            return null;
          } finally {
            fetchPromises.delete(userId);
          }
        })();
        fetchPromises.set(userId, fetchPromise);
      }

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
          setStatus(prev => ({ ...prev, loading: false, error: true }));
        }
      }
    };

    fetchStatus();

    // Poll every 30 seconds to keep the UI fresh
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
