import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, limit, onSnapshot, setDoc, deleteDoc, doc, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '@/utils/logger';

/**
 * Return type for useBlockedUsers hook
 */
export interface UseBlockedUsersReturn {
  blockedUids: string[];
  blockedSet: Set<string>;
  blockUser: (blockedUid: string) => Promise<void>;
  unblockUser: (blockedUid: string) => Promise<void>;
  isBlocked: (uid: string) => boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook for managing blocked users with real-time updates
 * 
 * Subscribes to blocks collection in both directions:
 * - Users blocked by current user (blockerUid == currentUser.uid)
 * - Users who blocked current user (blockedUid == currentUser.uid)
 * 
 * @param {string} userUid - Current user's UID
 * @returns {UseBlockedUsersReturn} Blocked users state and management functions
 * 
 * @example
 * ```tsx
 * const { blockedSet, blockUser, unblockUser, isBlocked } = useBlockedUsers(currentUser.uid);
 * 
 * // Check if user is blocked
 * if (isBlocked('someUserId')) {
 *   logger.log('User is blocked');
 * }
 * 
 * // Block a user
 * await blockUser('someUserId');
 * 
 * // Unblock a user
 * await unblockUser('someUserId');
 * ```
 */
export const useBlockedUsers = (userUid: string): UseBlockedUsersReturn => {
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Memoized Set for O(1) lookup performance
   */
  const blockedSet = useMemo(() => new Set(blockedUids), [blockedUids]);

  /**
   * Check if a user is blocked
   */
  const isBlocked = useCallback((uid: string): boolean => {
    return blockedSet.has(uid);
  }, [blockedSet]);

  /**
   * Block a user
   */
  const blockUser = useCallback(async (blockedUid: string): Promise<void> => {
    if (!userUid || !blockedUid) {
      throw new Error('Invalid user IDs');
    }

    if (userUid === blockedUid) {
      throw new Error('Cannot block yourself');
    }

    try {
      await addDoc(collection(db, 'blocks'), {
        blockerUid: userUid,
        blockedUid: blockedUid,
        createdAt: new Date(),
      });
    } catch (err: any) {
      console.error('Error blocking user:', err);
      throw new Error(err.message || 'Failed to block user');
    }
  }, [userUid]);

  /**
   * Unblock a user
   */
  const unblockUser = useCallback(async (blockedUid: string): Promise<void> => {
    if (!userUid || !blockedUid) {
      throw new Error('Invalid user IDs');
    }

    try {
      // Find the block document
      const blocksRef = collection(db, 'blocks');
      const q = query(
        blocksRef,
        where('blockerUid', '==', userUid),
        where('blockedUid', '==', blockedUid),
        limit(1)
      );

      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        throw new Error('Block not found');
      }

      // Delete the block document
      await deleteDoc(doc(db, 'blocks', snapshot.docs[0].id));
    } catch (err: any) {
      console.error('Error unblocking user:', err);
      throw new Error(err.message || 'Failed to unblock user');
    }
  }, [userUid]);

  /**
   * Subscribe to blocks collection (both directions)
   */
  useEffect(() => {
    if (!userUid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const blocksRef = collection(db, 'blocks');
    
    // Query for users blocked by current user
    const myBlocksQuery = query(
      blocksRef,
      where('blockerUid', '==', userUid),
      limit(100)
    );
    
    // Query for users who blocked current user
    const theirBlocksQuery = query(
      blocksRef,
      where('blockedUid', '==', userUid),
      limit(100)
    );

    // Subscribe to users blocked by me
    const unsubMyBlocks = onSnapshot(
      myBlocksQuery,
      (snap) => {
        const blockedByMe = snap.docs.map(doc => doc.data().blockedUid as string);
        setBlockedUids(prev => {
          const combined = [...blockedByMe, ...prev];
          return [...new Set(combined)]; // Deduplicate
        });
        setIsLoading(false);
      },
      (err) => {
        console.error('Error loading my blocks:', err);
        setError(err.message || 'Failed to load blocked users');
        setIsLoading(false);
      }
    );

    // Subscribe to users who blocked me
    const unsubTheirBlocks = onSnapshot(
      theirBlocksQuery,
      (snap) => {
        const blockedByThem = snap.docs.map(doc => doc.data().blockerUid as string);
        setBlockedUids(prev => {
          const combined = [...blockedByThem, ...prev];
          return [...new Set(combined)]; // Deduplicate
        });
        setIsLoading(false);
      },
      (err) => {
        console.error('Error loading their blocks:', err);
        setError(err.message || 'Failed to load blocked users');
        setIsLoading(false);
      }
    );

    return () => {
      unsubMyBlocks();
      unsubTheirBlocks();
    };
  }, [userUid]);

  return {
    blockedUids,
    blockedSet,
    blockUser,
    unblockUser,
    isBlocked,
    isLoading,
    error,
  };
};
