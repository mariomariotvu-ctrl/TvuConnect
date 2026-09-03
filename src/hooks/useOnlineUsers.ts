/**
 * useOnlineUsers Hook
 * 
 * React hook để lấy danh sách users đang online từ Firebase Realtime Database.
 * Implement caching với TTL 30s, batch reads, và query optimization.
 */

import { useState, useEffect } from 'react';
import * as React from 'react';
import { ref, query, orderByChild, equalTo, onValue, off } from 'firebase/database';
import { realtimeDb } from '../firebase';
import { UserStatus } from '../utils/userStatusManager';

export interface OnlineUserData {
  userId: string;
  status: UserStatus;
  lastActive: number;
}

export interface OnlineUsersOptions {
  limit?: number;           // Max số users trả về
  includeAway?: boolean;    // Include "away" users
  sortBy?: 'lastActive' | 'name'; // Sort order
}

interface UseOnlineUsersReturn {
  users: OnlineUserData[];
  count: number;
  loading: boolean;
  error: Error | null;
  retrying: boolean;
}

/**
 * Cache entry với TTL
 */
interface CacheEntry {
  users: OnlineUserData[];
  timestamp: number;
}

/**
 * Cache với TTL 30 seconds
 */
const onlineUsersCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Hook để lấy danh sách users đang online
 * 
 * @param options - Query options (limit, includeAway, sortBy)
 * @returns UseOnlineUsersReturn object với users list
 */
export function useOnlineUsers(options?: OnlineUsersOptions): UseOnlineUsersReturn {
  const {
    limit: maxLimit,
    includeAway = false,
    sortBy = 'lastActive',
  } = options || {};

  const [users, setUsers] = useState<OnlineUserData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [retrying, setRetrying] = useState<boolean>(false);
  const retryAttemptRef = React.useRef<number>(0);
  const retryTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Generate cache key
  const cacheKey = `online-${includeAway ? 'with-away' : 'only'}-${sortBy}-${maxLimit || 'all'}`;

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
      console.error(`Max retries (${maxRetries}) reached for online users query`);
      setRetrying(false);
      setLoading(false);
      setError(new Error('Failed to connect after multiple retries'));
      return;
    }

    const delay = Math.min(
      baseDelay * Math.pow(2, retryAttemptRef.current),
      maxDelay
    );

    console.log(`Retrying online users query in ${delay}ms (attempt ${retryAttemptRef.current + 1}/${maxRetries})`);

    setRetrying(true);

    retryTimerRef.current = setTimeout(() => {
      retryAttemptRef.current++;
      // Re-trigger useEffect
      setLoading(true);
    }, delay);
  };

  useEffect(() => {
    // Check cache first
    const cached = onlineUsersCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setUsers(cached.users);
      setLoading(false);
      return;
    }

    // Clear retry timer on re-mount
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setLoading(true);
    setError(null);

    // Query Firebase Realtime Database
    const presenceRef = ref(realtimeDb, 'presence');
    
    // Query for online users
    const onlineQuery = query(
      presenceRef,
      orderByChild('status'),
      equalTo('online')
    );

    const unsubscribe = onValue(
      onlineQuery,
      (snapshot) => {
        try {
          // Reset retry count on successful connection
          retryAttemptRef.current = 0;

          const onlineUsersList: OnlineUserData[] = [];
          
          snapshot.forEach((childSnapshot) => {
            const userId = childSnapshot.key;
            const data = childSnapshot.val();
            
            if (userId && data) {
              onlineUsersList.push({
                userId,
                status: data.status as UserStatus,
                lastActive: data.lastActive || Date.now(),
              });
            }
          });

          // If includeAway, fetch away users as well
          // Note: Firebase Realtime Database doesn't support OR queries
          // So we need to make separate query for away users
          if (includeAway) {
            const awayQuery = query(
              presenceRef,
              orderByChild('status'),
              equalTo('away')
            );

            onValue(
              awayQuery,
              (awaySnapshot) => {
                awaySnapshot.forEach((childSnapshot) => {
                  const userId = childSnapshot.key;
                  const data = childSnapshot.val();
                  
                  if (userId && data) {
                    onlineUsersList.push({
                      userId,
                      status: data.status as UserStatus,
                      lastActive: data.lastActive || Date.now(),
                    });
                  }
                });

                // Sort users
                const sorted = sortUsers(onlineUsersList, sortBy);
                
                // Apply limit
                const limited = maxLimit ? sorted.slice(0, maxLimit) : sorted;

                // Update cache
                onlineUsersCache.set(cacheKey, {
                  users: limited,
                  timestamp: Date.now(),
                });

                setUsers(limited);
                setLoading(false);
                setRetrying(false);
              },
              (err) => {
                console.error('Error fetching away users:', err);
                // Still return online users even if away query fails
                const sorted = sortUsers(onlineUsersList, sortBy);
                const limited = maxLimit ? sorted.slice(0, maxLimit) : sorted;
                setUsers(limited);
                setLoading(false);
                setRetrying(false);
              }
            );
          } else {
            // Sort users
            const sorted = sortUsers(onlineUsersList, sortBy);
            
            // Apply limit
            const limited = maxLimit ? sorted.slice(0, maxLimit) : sorted;

            // Update cache
            onlineUsersCache.set(cacheKey, {
              users: limited,
              timestamp: Date.now(),
            });

            setUsers(limited);
            setLoading(false);
            setRetrying(false);
          }
        } catch (err) {
          console.error('Error processing online users:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          setRetrying(false);
        }
      },
      (err) => {
        console.error('Error fetching online users:', err);
        
        const networkError = isNetworkError(err);
        
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setRetrying(false);

        // Retry on network errors only
        if (networkError && retryAttemptRef.current < 3) {
          retrySubscription();
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      off(presenceRef);
      
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [cacheKey, includeAway, sortBy, maxLimit]);

  return {
    users,
    count: users.length,
    loading,
    error,
    retrying,
  };
}

/**
 * Sort users by specified field
 */
function sortUsers(users: OnlineUserData[], sortBy: 'lastActive' | 'name'): OnlineUserData[] {
  if (sortBy === 'lastActive') {
    return [...users].sort((a, b) => b.lastActive - a.lastActive);
  }
  
  // Sort by name not implemented yet (requires user profile data)
  return users;
}

export default useOnlineUsers;
