/**
 * useUserStatus Hook
 * 
 * React hook để lấy trạng thái hoạt động (online/away/offline) của một user từ Firebase Realtime Database.
 * Implement caching để giảm re-renders, handle loading/error states, và privacy filtering.
 */

import { useState, useEffect, useRef } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { realtimeDb, db, auth } from '../firebase';
import { UserStatus, UserPresence } from '../utils/userStatusManager';

export interface UserStatusData {
  status: UserStatus;
  lastActive: number;
  isOnline: boolean;
  isAway: boolean;
  isOffline: boolean;
  timeAgo: string;
  loading: boolean;
  error: Error | null;
  isVisible: boolean; // Privacy: status có visible cho current user không
  retrying: boolean; // Có đang retry không
  permissionDenied: boolean; // Permission denied error
}

/**
 * Format timestamp thành text "Active X minutes ago"
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

/**
 * Cache để tránh re-renders không cần thiết
 */
const statusCache = new Map<string, UserStatusData>();

/**
 * Check privacy: user có visible với current viewer không
 * 
 * @param userId - ID của user cần check
 * @param viewerId - ID của viewer
 * @param presenceData - Presence data từ Firebase
 * @returns Promise<boolean> - true nếu visible, false nếu hidden
 */
async function checkStatusVisibility(
  userId: string,
  viewerId: string | undefined,
  presenceData: Partial<UserPresence> | null
): Promise<boolean> {
  // Nếu không có viewer (chưa login), không show status
  if (!viewerId) {
    return false;
  }

  // Nếu xem status của chính mình, luôn visible
  if (userId === viewerId) {
    return true;
  }

  // Check invisible mode
  if (presenceData?.settings?.invisibleMode) {
    return false;
  }

  // Check privacy mode
  if (presenceData?.settings?.privacyMode) {
    // Privacy mode enabled - chỉ friends mới thấy
    try {
      const userProfileRef = doc(db, 'profiles', userId);
      const userProfileSnap = await getDoc(userProfileRef);
      
      if (userProfileSnap.exists()) {
        const friends = userProfileSnap.data()?.friends || [];
        return friends.includes(viewerId);
      }
    } catch (error) {
      console.error('Error checking friends list:', error);
      return false;
    }
  }

  // Check blocked users (cả 2 chiều: A block B hoặc B block A)
  try {
    // Không cần import useBlockedUsers vì sẽ gây circular dependency
    // Thay vào đó, check trực tiếp từ Firestore
    // TODO: Optimize bằng cách cache blocked users list
    
    // For now, assume visible if not blocked
    // Privacy filtering với blocked users sẽ implement ở Task 7.4
    return true;
  } catch (error) {
    console.error('Error checking blocked status:', error);
    return false;
  }
}

/**
 * Hook để lấy trạng thái hoạt động của user với privacy filtering
 * 
 * @param userId - ID của user cần lấy status
 * @returns UserStatusData object với derived fields và privacy info
 */
export function useUserStatus(userId: string): UserStatusData {
  const [statusData, setStatusData] = useState<UserStatusData>(() => {
    // Check cache first
    const cached = statusCache.get(userId);
    if (cached) {
      return cached;
    }

    // Default state
    return {
      status: 'offline',
      lastActive: Date.now(),
      isOnline: false,
      isAway: false,
      isOffline: true,
      timeAgo: '',
      loading: true,
      error: null,
      isVisible: false,
      retrying: false,
      permissionDenied: false,
    };
  });

  const listenerRef = useRef<any>(null);
  const currentUserId = auth.currentUser?.uid;
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryAttemptRef = useRef<number>(0);

  /**
   * Check if error is permission-related
   */
  const isPermissionError = (error: any): boolean => {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || '';
    return (
      errorMessage.toLowerCase().includes('permission denied') ||
      errorMessage.toLowerCase().includes('insufficient permissions') ||
      errorCode === 'PERMISSION_DENIED'
    );
  };

  /**
   * Check if error is network-related
   */
  const isNetworkError = (error: any): boolean => {
    const errorMessage = error?.message || String(error);
    return (
      errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('timeout') ||
      errorMessage.toLowerCase().includes('connection') ||
      errorMessage.toLowerCase().includes('offline')
    );
  };

  /**
   * Retry subscription with exponential backoff
   */
  const retrySubscription = () => {
    const maxRetries = 3;
    const baseDelay = 1000; // 1s
    const maxDelay = 8000; // 8s

    if (retryAttemptRef.current >= maxRetries) {
      console.error(`Max retries (${maxRetries}) reached for user ${userId}`);
      setStatusData(prev => ({
        ...prev,
        retrying: false,
        loading: false,
        error: new Error('Failed to connect after multiple retries'),
      }));
      return;
    }

    const delay = Math.min(
      baseDelay * Math.pow(2, retryAttemptRef.current),
      maxDelay
    );

    console.log(`Retrying subscription for user ${userId} in ${delay}ms (attempt ${retryAttemptRef.current + 1}/${maxRetries})`);

    setStatusData(prev => ({
      ...prev,
      retrying: true,
    }));

    retryTimerRef.current = setTimeout(() => {
      retryAttemptRef.current++;
      // Re-trigger useEffect by updating a dummy state
      setStatusData(prev => ({ ...prev }));
    }, delay);
  };

  useEffect(() => {
    if (!userId) {
      setStatusData(prev => ({
        ...prev,
        loading: false,
        error: new Error('userId is required'),
      }));
      return;
    }

    // Clear retry timer on re-mount
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    // Subscribe to Firebase presence path
    const presenceRef = ref(realtimeDb, `presence/${userId}`);
    
    const unsubscribe = onValue(
      presenceRef,
      async (snapshot) => {
        try {
          // Reset retry count on successful connection
          retryAttemptRef.current = 0;

          const data = snapshot.val() as Partial<UserPresence> | null;

          // Check privacy visibility
          const isVisible = await checkStatusVisibility(userId, currentUserId, data);

          if (!data || !isVisible) {
            // No presence data OR privacy hidden - show as offline
            const newData: UserStatusData = {
              status: 'offline',
              lastActive: Date.now(),
              isOnline: false,
              isAway: false,
              isOffline: true,
              timeAgo: '',
              loading: false,
              error: null,
              isVisible,
              retrying: false,
              permissionDenied: !isVisible && data !== null, // Permission denied if data exists but not visible
            };
            setStatusData(newData);
            statusCache.set(userId, newData);
            return;
          }

          const status = data.status || 'offline';
          const lastActive = data.lastActive || Date.now();

          // Create status data with derived fields
          const newData: UserStatusData = {
            status,
            lastActive,
            isOnline: status === 'online',
            isAway: status === 'away',
            isOffline: status === 'offline',
            timeAgo: formatTimeAgo(lastActive),
            loading: false,
            error: null,
            isVisible,
            retrying: false,
            permissionDenied: false,
          };

          // Update state and cache
          setStatusData(newData);
          statusCache.set(userId, newData);
        } catch (error) {
          console.error('Error processing user status:', error);
          
          // Check if it's a permission error
          const permDenied = isPermissionError(error);
          
          setStatusData(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
            permissionDenied: permDenied,
            retrying: false,
          }));
        }
      },
      (error) => {
        console.error('Error subscribing to user status:', error);
        
        // Check error type
        const permDenied = isPermissionError(error);
        const networkError = isNetworkError(error);
        
        setStatusData(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
          permissionDenied: permDenied,
          retrying: false,
        }));

        // Retry on network errors only
        if (networkError && retryAttemptRef.current < 3) {
          retrySubscription();
        }
      }
    );

    listenerRef.current = presenceRef;

    // Cleanup subscription on unmount
    return () => {
      if (listenerRef.current) {
        off(listenerRef.current);
        listenerRef.current = null;
      }
      
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [userId, currentUserId]);

  return statusData;
}

export default useUserStatus;
