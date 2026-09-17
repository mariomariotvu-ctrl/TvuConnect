import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

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
 *   // Hide or disable actions for this profile.
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
  const blockedByMeRef = useRef<Set<string>>(new Set());
  const blockedByThemRef = useRef<Set<string>>(new Set());

  const syncBlockedUsers = useCallback(() => {
    setBlockedUids([...new Set([
      ...blockedByMeRef.current,
      ...blockedByThemRef.current,
    ])]);
  }, []);

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
      // The deterministic document ID lets Firestore rules check this edge
      // atomically before allowing a message or call.
      await setDoc(doc(db, 'blocks', `${userUid}_${blockedUid}`), {
        blockerUid: userUid,
        blockedUid,
        createdAt: serverTimestamp(),
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
      const blocksRef = collection(db, 'blocks');
      const blockId = `${userUid}_${blockedUid}`;
      const q = query(
        blocksRef,
        where('blockerUid', '==', userUid),
        where('blockedUid', '==', blockedUid),
        limit(1)
      );

      const snapshot = await getDocs(q);

      // Remove the canonical edge and any legacy auto-ID document left by an
      // older version of the app, so the visible state cannot get stuck.
      await Promise.all([
        deleteDoc(doc(db, 'blocks', blockId)),
        ...snapshot.docs
          .filter((blockDoc) => blockDoc.id !== blockId)
          .map((blockDoc) => deleteDoc(blockDoc.ref)),
      ]);
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
    blockedByMeRef.current = new Set();
    blockedByThemRef.current = new Set();
    syncBlockedUsers();

    const blocksRef = collection(db, 'blocks');
    let completedInitialSnapshots = 0;
    const markSnapshotComplete = () => {
      completedInitialSnapshots += 1;
      if (completedInitialSnapshots >= 2) setIsLoading(false);
    };
    
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
        blockedByMeRef.current = new Set(
          snap.docs.map((blockDoc) => blockDoc.data().blockedUid as string),
        );
        syncBlockedUsers();
        markSnapshotComplete();
      },
      (err) => {
        console.error('Error loading my blocks:', err);
        setError(err.message || 'Failed to load blocked users');
        blockedByMeRef.current = new Set();
        syncBlockedUsers();
        markSnapshotComplete();
      }
    );

    // Subscribe to users who blocked me
    const unsubTheirBlocks = onSnapshot(
      theirBlocksQuery,
      (snap) => {
        blockedByThemRef.current = new Set(
          snap.docs.map((blockDoc) => blockDoc.data().blockerUid as string),
        );
        syncBlockedUsers();
        markSnapshotComplete();
      },
      (err) => {
        console.error('Error loading their blocks:', err);
        setError(err.message || 'Failed to load blocked users');
        blockedByThemRef.current = new Set();
        syncBlockedUsers();
        markSnapshotComplete();
      }
    );

    return () => {
      unsubMyBlocks();
      unsubTheirBlocks();
    };
  }, [syncBlockedUsers, userUid]);

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
