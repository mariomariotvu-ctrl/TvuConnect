/**
 * useCachedMessages Hook - Cache-First Messages with Single Active Listener
 * 
 * This hook implements cache-first strategy for messages within a conversation using:
 * - Query Optimizer for Firestore query optimization
 * - Cache Manager for browser storage caching (sessionStorage)
 * - Single active listener per conversation (Requirement 3.4)
 * - Auto-unsubscribe when switching conversations (Requirement 3.5)
 * - TTL: 120 seconds
 * - Limit: 30 messages per conversation
 * - Cache key: 'messages:{conversationId}'
 * 
 * Requirements: Requirement 3 (Cache-First Strategy cho Messages)
 * Tasks 5.3-5.7: Messages Optimization with Listener Management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Unsubscribe } from 'firebase/firestore';
import { db, auth, collection, query, where, orderBy, limit, onSnapshot } from '../firebase';
import { Message } from '../types';
import { getCachedData, setCachedData, type CacheConfig } from '../utils/cacheManager';
import { listenerRegistry } from '../utils/listenerRegistry';
import { logger } from '@/utils/logger';
import { QUERY_LIMITS } from '../config/queryLimits';

/**
 * Listener Manager - Ensures only 1 active listener per conversation
 * Requirement 3.4: Maintain only 1 active listener per conversation
 */
class MessageListenerManager {
  private static instance: MessageListenerManager;
  private activeListeners: Map<string, string> = new Map(); // stores listenerRegistry IDs

  private constructor() {}

  static getInstance(): MessageListenerManager {
    if (!MessageListenerManager.instance) {
      MessageListenerManager.instance = new MessageListenerManager();
    }
    return MessageListenerManager.instance;
  }

  /**
   * Subscribe to messages for a conversation
   * Requirement 3.4: Only 1 active listener per conversation
   * Requirement 3.5: Auto-unsubscribe when switching conversations
   */
  subscribe(
    conversationId: string,
    messageLimit: number,
    callback: (messages: Message[]) => void,
    onError: (error: Error) => void
  ): Unsubscribe {
    // Unsubscribe from previous listener if exists
    this.unsubscribe(conversationId);

    // Create new listener
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      where('participants', 'array-contains', auth.currentUser?.uid || ''),
      orderBy('createdAt', 'desc'),
      limit(messageLimit) // Requirement 3.3: Limit messages
    );

    const listenerId = listenerRegistry.register({
      componentName: 'MessageListenerManager',
      collection: 'messages',
      query: `messages_${conversationId}`,
      priority: 9,
      conversationId: conversationId,
      unsubscribe: onSnapshot(
        q,
        (snapshot) => {
          const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as Message));

          // Sort messages by createdAt ascending (oldest first)
          const sortedMessages = messages.sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0);
            const timeB = b.createdAt?.toMillis?.() || (typeof b.createdAt === 'number' ? b.createdAt : 0);
            return timeA - timeB;
          });

          callback(sortedMessages);
        },
        (error) => {
          console.error('[MessageListenerManager] Listener error:', error);
          onError(error as Error);
        }
      )
    });

    // Store listener
    this.activeListeners.set(conversationId, listenerId);

    logger.log('[MessageListenerManager] Subscribed to conversation:', conversationId);
    logger.log('[MessageListenerManager] Active listeners:', this.activeListeners.size);

    // Return unsubscribe function
    return () => this.unsubscribe(conversationId);
  }

  /**
   * Unsubscribe from a conversation's listener
   * Requirement 3.5: Auto-unsubscribe when switching conversations
   */
  unsubscribe(conversationId: string): void {
    const listenerId = this.activeListeners.get(conversationId);
    if (listenerId) {
      listenerRegistry.unregister(listenerId);
      this.activeListeners.delete(conversationId);
      logger.log('[MessageListenerManager] Unsubscribed from conversation:', conversationId);
      logger.log('[MessageListenerManager] Active listeners:', this.activeListeners.size);
    }
  }

  /**
   * Unsubscribe from all listeners
   * Used for cleanup on app unmount
   */
  unsubscribeAll(): void {
    this.activeListeners.forEach((listenerId, conversationId) => {
      listenerRegistry.unregister(listenerId);
      logger.log('[MessageListenerManager] Unsubscribed from conversation:', conversationId);
    });
    this.activeListeners.clear();
    logger.log('[MessageListenerManager] All listeners unsubscribed');
  }

  /**
   * Get count of active listeners
   */
  getActiveListenerCount(): number {
    return this.activeListeners.size;
  }
}

/**
 * Hook result interface
 */
export interface UseCachedMessagesResult {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
}

/**
 * Custom hook for cache-first messages with single active listener
 * 
 * Features:
 * - Cache-first strategy with 120s TTL in sessionStorage
 * - Limit 30 messages per conversation
 * - Single active listener per conversation (auto-cleanup on switch)
 * - Automatic cache invalidation on refresh
 * - Error handling with graceful fallback
 * 
 * Requirement 3.1: Cache messages with TTL 120 seconds in sessionStorage
 * Requirement 3.3: Limit messages query to 30 items per conversation
 * Requirement 3.4: Maintain only 1 active listener per conversation
 * Requirement 3.5: Auto-unsubscribe when switching conversations
 * Requirement 3.7: Use cache key pattern 'messages:{conversationId}'
 */
export function useCachedMessages(
  conversationId: string,
  receiverUid: string
): UseCachedMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [currentLimit, setCurrentLimit] = useState<number>(QUERY_LIMITS.MESSAGES_INITIAL);
  const [hasMore, setHasMore] = useState(true);
  
  // Track if component is mounted
  const isMountedRef = useRef(true);
  
  // Get listener manager instance
  const listenerManager = MessageListenerManager.getInstance();

  /**
   * Helper to sort messages ascending
   */
  const sortMessages = useCallback((msgs: Message[]) => {
    return [...msgs].sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0);
      const timeB = b.createdAt?.toMillis?.() || (typeof b.createdAt === 'number' ? b.createdAt : 0);
      return timeA - timeB;
    });
  }, []);

  /**
   * Load messages with cache-first strategy
   * 
   * Requirement 3.1: Check sessionStorage first before subscribing to Firestore
   * Requirement 3.3: Limit messages query to 30 items
   * Requirement 3.7: Cache key pattern 'messages:{conversationId}'
   */
  const loadMessages = useCallback(() => {
    if (!auth.currentUser || !conversationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    /**
     * Cache configuration
     * Requirement 3.1: TTL 120 seconds in sessionStorage
     * Requirement 3.7: Cache key 'messages:{conversationId}'
     */
    const cacheConfig: CacheConfig = {
      key: `messages:${conversationId}`,
      ttl: 120000, // 120 seconds TTL
      storage: 'sessionStorage',
    };

    // Step 1: Check cache first
    let cachedMessages: Message[] | null = null;
    try {
      cachedMessages = getCachedData<Message[]>(cacheConfig);
    } catch (err) {
      logger.warn('[useCachedMessages] Failed to read cache:', err);
    }

    if (cachedMessages && cachedMessages.length > 0) {
      setMessages(sortMessages(cachedMessages));
      setFromCache(true);
      setLoading(false);

      logger.log('[useCachedMessages] Cache hit:', {
        conversationId,
        messageCount: cachedMessages.length,
      });
    } else {
      setFromCache(false);
      logger.log('[useCachedMessages] Cache miss, subscribing to Firestore');
    }

    /**
     * Step 2: Subscribe to real-time listener
     * Requirement 3.4: Single active listener per conversation
     * Requirement 3.5: Auto-unsubscribe when switching conversations
     */
    const unsubscribe = listenerManager.subscribe(
      conversationId,
      currentLimit,
      (newMessages) => {
        if (!isMountedRef.current) return;

        setMessages(sortMessages(newMessages));
        setHasMore(newMessages.length >= currentLimit);
        setLoading(false);

        // Update cache with fresh data
        try {
          setCachedData(cacheConfig, newMessages);
          logger.log('[useCachedMessages] Cache updated:', {
            conversationId,
            messageCount: newMessages.length,
          });
        } catch (err) {
          logger.warn('[useCachedMessages] Failed to update cache:', err);
        }
      },
      (err) => {
        if (!isMountedRef.current) return;
        
        console.error('[useCachedMessages] Listener error:', err);
        setError(err);
        setLoading(false);
      }
    );

    // Return cleanup function
    return unsubscribe;
  }, [conversationId, receiverUid, currentLimit, sortMessages]);

  /**
   * Refresh messages list
   * Invalidates cache and reloads messages
   */
  const refresh = useCallback(() => {
    const cacheConfig: CacheConfig = {
      key: `messages:${conversationId}`,
      ttl: 120000,
      storage: 'sessionStorage',
    };
    try {
      setCachedData(cacheConfig, null);
    } catch (err) {
      logger.warn('[useCachedMessages] Failed to invalidate cache:', err);
    }

    // Reset state
    setMessages([]);
    setFromCache(false);
    setCurrentLimit(QUERY_LIMITS.MESSAGES_INITIAL);

    // Reload messages (will fetch fresh data)
    loadMessages();
  }, [conversationId, loadMessages]);

  const loadMore = useCallback(() => {
    if (hasMore) {
      setCurrentLimit(prev => prev + QUERY_LIMITS.MESSAGES_LOAD_MORE);
    }
  }, [hasMore]);

  /**
   * Effect: Load messages on mount and when conversationId changes
   * Requirement 3.5: Auto-unsubscribe when switching conversations
   */
  useEffect(() => {
    isMountedRef.current = true;
    const unsubscribe = loadMessages();

    // Cleanup: Unsubscribe from listener when component unmounts or conversationId changes
    return () => {
      isMountedRef.current = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [loadMessages]);

  return {
    messages,
    loading,
    error,
    fromCache,
    hasMore,
    refresh,
    loadMore,
  };
}

export { MessageListenerManager };
