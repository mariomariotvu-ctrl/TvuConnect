/**
 * useConversations Hook
 * 
 * Optimized hook for loading conversations list with:
 * - Limit 20 conversations
 * - Cache 120 seconds
 * - Real-time listener with deduplication
 * - Batch profile fetching
 * 
 * Requirements: 3.1, 3.5
 */

import { useState, useEffect, useRef } from 'react';
import { Query } from 'firebase/firestore';
import { db, auth, collection, query, where, orderBy, limit, getDocs } from '../firebase';
import { Conversation, StudentProfile } from '../types';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';
import { listenerManager } from '../utils/firestoreListenerManager';
import { FIRESTORE_LIMITS } from '../utils/constants';

/**
 * Conversation with populated user profile
 */
export interface ConversationWithProfile extends Conversation {
  otherUser: StudentProfile;
}

/**
 * Hook state
 */
interface UseConversationsState {
  conversations: ConversationWithProfile[];
  loading: boolean;
  error: Error | null;
}

/**
 * Cache manager for conversations (120 seconds TTL)
 */
const conversationsCache = new FirestoreCacheManager({
  maxSize: 30,
  defaultTTL: 120000, // 120 seconds
});

/**
 * Cache manager for profiles (3 minutes TTL)
 */
const profilesCache = new FirestoreCacheManager({
  maxSize: 100,
  defaultTTL: 180000, // 3 minutes
});

/**
 * Optimized conversations hook
 * 
 * Requirement 3.1: Limit initial query to 20 conversations
 * Requirement 3.5: Cache conversation list for 120 seconds
 */
export function useConversations(blockedUids: string[] = []): UseConversationsState {
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const subscriberIdRef = useRef<string | null>(null);
  const blockedUidsRef = useRef<string[]>(blockedUids);

  // Update blocked UIDs ref
  useEffect(() => {
    blockedUidsRef.current = blockedUids;
  }, [blockedUids]);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const currentUserId = auth.currentUser.uid;

    // Build query for conversations
    const conversationsQuery: Query = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUserId),
      orderBy('lastMessageAt', 'desc'),
      limit(FIRESTORE_LIMITS.CONVERSATIONS_LIMIT || 20)
    );

    // Generate subscriber ID
    const subscriberId = `conversations_${currentUserId}_${Date.now()}`;
    subscriberIdRef.current = subscriberId;

    // Subscribe to real-time updates
    listenerManager.subscribe<Conversation>(subscriberId, {
      query: conversationsQuery,
      onUpdate: async (conversationsData) => {
        try {
          // Extract other user UIDs
          const otherUids = conversationsData
            .map(conv => conv.participants.find(p => p !== currentUserId))
            .filter((uid): uid is string => uid !== undefined);

          // Remove duplicates — Firestore 'in' query giới hạn 30 UIDs
          // Chia batch nếu > 30 để đảm bảo fetch đủ tất cả profiles
          const uniqueUids = [...new Set(otherUids)];

          // Batch fetch profiles with caching
          const profilesMap = new Map<string, StudentProfile>();

          if (uniqueUids.length > 0) {
            // Check cache first
            uniqueUids.forEach(uid => {
              const cached = profilesCache.get<StudentProfile>(`profile:${uid}`);
              if (cached) {
                profilesMap.set(uid, cached);
              }
            });

            // Fetch missing profiles — chia batch 30 vì Firestore giới hạn 'in' query tối đa 30
            const missingUids = uniqueUids.filter(uid => !profilesMap.has(uid));
            if (missingUids.length > 0) {
              // Chia thành các mảng nhỏ tối đa 30 phần tử
              const BATCH_SIZE = 30;
              const batches: string[][] = [];
              for (let i = 0; i < missingUids.length; i += BATCH_SIZE) {
                batches.push(missingUids.slice(i, i + BATCH_SIZE));
              }

              // Fetch tất cả batches song song
              const batchResults = await Promise.all(
                batches.map(batchUids =>
                  getDocs(query(
                    collection(db, 'profiles'),
                    where('__name__', 'in', batchUids)
                  ))
                )
              );

              // Gộp kết quả từ tất cả batches
              batchResults.forEach(snap => {
                snap.docs.forEach(doc => {
                  const profile = { uid: doc.id, ...doc.data() } as StudentProfile;
                  profilesMap.set(doc.id, profile);
                  // Cache profile for 3 minutes
                  profilesCache.set(`profile:${doc.id}`, profile, 180000);
                });
              });
            }
          }

          // Combine conversations with profiles
          const results: ConversationWithProfile[] = conversationsData
            .map(conv => {
              const otherUid = conv.participants.find(p => p !== currentUserId);
              if (!otherUid) return null;

              const otherUser = profilesMap.get(otherUid);
              if (!otherUser) return null;

              // Filter out blocked users
              if (blockedUidsRef.current.includes(otherUid)) return null;

              return {
                ...conv,
                otherUser
              };
            })
            .filter((c): c is ConversationWithProfile => c !== null);

          setConversations(results);
          setLoading(false);
          setError(null);

          // Cache the results
          conversationsCache.set(
            `conversations:${currentUserId}`,
            results,
            120000 // 120 seconds
          );
        } catch (err) {
          console.error('[useConversations] Error processing conversations:', err);
          setError(err as Error);
          setLoading(false);
        }
      },
      onError: (err) => {
        console.error('[useConversations] Listener error:', err);
        setError(err);
        setLoading(false);
      }
    });

    // Cleanup on unmount
    return () => {
      if (subscriberIdRef.current) {
        listenerManager.unsubscribe(subscriberIdRef.current);
        subscriberIdRef.current = null;
      }
    };
  }, []); // Only run once on mount

  return {
    conversations,
    loading,
    error
  };
}
