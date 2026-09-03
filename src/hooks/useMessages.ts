/**
 * useMessages Hook
 * 
 * Optimized hook for loading messages with:
 * - Limit 30 messages for initial load
 * - Pagination with startAfter cursor
 * - Single active conversation listener
 * - Composite index on (conversationId, createdAt DESC)
 * - Auto-unsubscribe when conversation changes
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.6, 3.7
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Query, DocumentSnapshot } from 'firebase/firestore';
import { db, auth, collection, query, where, orderBy, limit, getDocs, startAfter } from '../firebase';
import { Message } from '../types';
import { listenerManager } from '../utils/firestoreListenerManager';
import { FIRESTORE_LIMITS } from '../utils/constants';

/**
 * Hook state
 */
interface UseMessagesState {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadOlderMessages: () => Promise<void>;
  loadingMore: boolean;
}

/**
 * Optimized messages hook
 * 
 * Requirement 3.2: Limit initial query to 30 messages
 * Requirement 3.3: Use composite index on (conversationId, createdAt DESC)
 * Requirement 3.4: Load older messages using startAfter cursor
 * Requirement 3.6: Subscribe only to active conversation
 * Requirement 3.7: Unsubscribe from previous conversation when switching
 */
export function useMessages(
  conversationId: string,
  receiverUid: string
): UseMessagesState {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [oldestDoc, setOldestDoc] = useState<DocumentSnapshot | null>(null);
  
  const subscriberIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string>(conversationId);

  /**
   * Load older messages with pagination
   * 
   * Requirement 3.4: Load older messages using startAfter cursor when user scrolls up
   */
  const loadOlderMessages = useCallback(async () => {
    if (!auth.currentUser || !hasMore || loadingMore || !oldestDoc) {
      return;
    }

    setLoadingMore(true);

    try {
      // Build query for older messages
      const olderMessagesQuery = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId),
        where('participants', 'array-contains', auth.currentUser.uid),
        orderBy('createdAt', 'desc'),
        startAfter(oldestDoc),
        limit(FIRESTORE_LIMITS.MESSAGES_PER_PAGE || 30)
      );

      const snapshot = await getDocs(olderMessagesQuery);

      if (snapshot.empty) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      // Extract older messages
      const olderMessages: Message[] = [];
      snapshot.forEach(doc => {
        olderMessages.push({ id: doc.id, ...doc.data() } as Message);
      });

      // Update oldest document reference
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setOldestDoc(lastDoc);

      // Check if there are more messages
      setHasMore(snapshot.docs.length === (FIRESTORE_LIMITS.MESSAGES_PER_PAGE || 30));

      // Prepend older messages (they come in desc order, so reverse)
      setMessages(prev => {
        const combined = [...olderMessages.reverse(), ...prev];
        // Remove duplicates by ID
        const uniqueMessages = Array.from(
          new Map(combined.map(msg => [msg.id, msg])).values()
        );
        return uniqueMessages;
      });

      setLoadingMore(false);
    } catch (err) {
      console.error('[useMessages] Error loading older messages:', err);
      setError(err as Error);
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, loadingMore, oldestDoc]);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const currentUserId = auth.currentUser.uid;

    // Reset state when conversation changes
    if (conversationIdRef.current !== conversationId) {
      setMessages([]);
      setLoading(true);
      setHasMore(true);
      setOldestDoc(null);
      conversationIdRef.current = conversationId;
    }

    // Unsubscribe from previous conversation listener
    if (subscriberIdRef.current) {
      listenerManager.unsubscribe(subscriberIdRef.current);
      subscriberIdRef.current = null;
    }

    // Build query for messages
    const messagesQuery: Query = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      where('participants', 'array-contains', currentUserId),
      orderBy('createdAt', 'desc'),
      limit(FIRESTORE_LIMITS.MESSAGES_PER_PAGE || 30)
    );

    // Generate subscriber ID
    const subscriberId = `messages_${conversationId}_${Date.now()}`;
    subscriberIdRef.current = subscriberId;

    // Subscribe to real-time updates
    listenerManager.subscribe<Message>(subscriberId, {
      query: messagesQuery,
      onUpdate: (messagesData) => {
        try {
          // Sort messages by createdAt ascending (oldest first)
          const sortedMessages = [...messagesData].sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeA - timeB;
          });

          setMessages(sortedMessages);
          setLoading(false);
          setError(null);

          // Store oldest document for pagination
          if (messagesData.length > 0) {
            // Find the oldest message (last in desc order)
            const oldestMessage = messagesData[messagesData.length - 1];
            // We need the actual DocumentSnapshot, but we only have the data
            // For now, we'll fetch it when needed in loadOlderMessages
            setHasMore(messagesData.length === (FIRESTORE_LIMITS.MESSAGES_PER_PAGE || 30));
          } else {
            setHasMore(false);
          }
        } catch (err) {
          console.error('[useMessages] Error processing messages:', err);
          setError(err as Error);
          setLoading(false);
        }
      },
      onError: (err) => {
        console.error('[useMessages] Listener error:', err);
        setError(err);
        setLoading(false);
      }
    });

    // Fetch initial oldest document for pagination
    getDocs(messagesQuery).then(snapshot => {
      if (!snapshot.empty) {
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        setOldestDoc(lastDoc);
      }
    }).catch(err => {
      console.error('[useMessages] Error fetching initial oldest doc:', err);
    });

    // Cleanup on unmount or conversation change
    return () => {
      if (subscriberIdRef.current) {
        listenerManager.unsubscribe(subscriberIdRef.current);
        subscriberIdRef.current = null;
      }
    };
  }, [conversationId]); // Re-run when conversation changes

  return {
    messages,
    loading,
    error,
    hasMore,
    loadOlderMessages,
    loadingMore
  };
}
