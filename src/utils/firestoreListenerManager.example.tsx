/**
 * Example usage of FirestoreListenerManager
 * 
 * This file demonstrates how to use the ListenerManager in various scenarios
 * to optimize real-time Firestore listeners and reduce snapshot reads.
 */

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { listenerManager } from './firestoreListenerManager';
import { logger } from '@/utils/logger';

// ============================================================================
// Example 1: Messages Listener with Limit
// ============================================================================

/**
 * Hook for listening to messages in a conversation
 * 
 * Requirement 3.2: Reuse existing listener if one exists
 * Requirement 3.4: Apply limit to reduce snapshot size (30 messages)
 */
export function useMessages(conversationId: string | undefined) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Build query with limit
    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'desc'),
      limit(30) // Requirement 3.4: Limit to 30 messages
    );

    // Generate unique subscriber ID
    const subscriberId = `messages_${conversationId}_${Date.now()}`;

    // Subscribe to listener
    listenerManager.subscribe(subscriberId, {
      query: messagesQuery,
      onUpdate: (data) => {
        setMessages(data);
        setLoading(false);
        setError(null);
      },
      onError: (err) => {
        console.error('[useMessages] Error:', err);
        setError(err.message);
        setLoading(false);
      },
    });

    // Cleanup on unmount (Requirement 3.3, 12.1)
    return () => {
      listenerManager.unsubscribe(subscriberId);
    };
  }, [conversationId]);

  return { messages, loading, error };
}

// ============================================================================
// Example 2: Conversations List Listener
// ============================================================================

/**
 * Hook for listening to user's conversations
 * 
 * Requirement 3.1: Limit to 20 conversations
 * Requirement 3.6: Subscribe only to active conversation
 */
export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Build query with limit
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
      limit(20) // Requirement 3.1: Limit to 20 conversations
    );

    const subscriberId = `conversations_${userId}`;

    listenerManager.subscribe(subscriberId, {
      query: conversationsQuery,
      onUpdate: (data) => {
        setConversations(data);
        setLoading(false);
      },
      onError: (error) => {
        console.error('[useConversations] Error:', error);
        setConversations([]);
        setLoading(false);
      },
    });

    return () => {
      listenerManager.unsubscribe(subscriberId);
    };
  }, [userId]);

  return { conversations, loading };
}

// ============================================================================
// Example 3: Single Active Conversation Listener
// ============================================================================

/**
 * Hook that switches between conversations, unsubscribing from previous
 * 
 * Requirement 3.7: Unsubscribe from previous conversation when switching
 */
export function useActiveConversation(conversationId: string | undefined) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const subscriberId = `active_conversation_${conversationId}`;

    listenerManager.subscribe(subscriberId, {
      query: messagesQuery,
      onUpdate: (data) => {
        setMessages(data);
        setLoading(false);
      },
    });

    // When conversationId changes, this cleanup runs first
    // Then new subscription is created
    // This ensures we only have 1 active conversation listener at a time
    return () => {
      listenerManager.unsubscribe(subscriberId);
    };
  }, [conversationId]); // Dependency on conversationId triggers cleanup

  return { messages, loading };
}

// ============================================================================
// Example 4: Online Status Listener with Reuse
// ============================================================================

/**
 * Hook for listening to user's online status
 * 
 * Requirement 6.2: Reuse existing listener if one already exists
 * Requirement 6.3: Unsubscribe when component unmounts
 * Requirement 6.4: Prevent duplicate listeners
 */
export function useOnlineStatus(userId: string | undefined) {
  const [status, setStatus] = useState<{
    isOnline: boolean;
    lastActive: Date | null;
  }>({
    isOnline: false,
    lastActive: null,
  });

  useEffect(() => {
    if (!userId) {
      setStatus({ isOnline: false, lastActive: null });
      return;
    }

    // Query for single user document
    const userQuery = query(
      collection(db, 'profiles'),
      where('__name__', '==', userId),
      limit(1)
    );

    // Use consistent subscriber ID pattern
    // Multiple components can subscribe to same user's status
    // ListenerManager will reuse the listener
    const subscriberId = `online_status_${userId}_${Date.now()}`;

    listenerManager.subscribe(subscriberId, {
      query: userQuery,
      onUpdate: (data) => {
        if (data.length > 0) {
          const profile = data[0];
          setStatus({
            isOnline: profile.isOnline || false,
            lastActive: profile.lastActive?.toDate() || null,
          });
        }
      },
    });

    return () => {
      listenerManager.unsubscribe(subscriberId);
    };
  }, [userId]);

  return status;
}

// ============================================================================
// Example 5: Monitoring Listener Usage
// ============================================================================

/**
 * Component for monitoring active listeners (dev/admin tool)
 */
export function ListenerMonitor() {
  const [stats, setStats] = useState(listenerManager.getStats());
  const [listeners, setListeners] = useState(listenerManager.getActiveListeners());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(listenerManager.getStats());
      setListeners(listenerManager.getActiveListeners());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
      <h3>Listener Manager Stats</h3>
      <div>
        <strong>Total Listeners:</strong> {stats.totalListeners}
      </div>
      <div>
        <strong>Total Subscribers:</strong> {stats.totalSubscribers}
      </div>
      <div>
        <strong>Total Documents:</strong> {stats.totalDocuments}
      </div>
      <div>
        <strong>Avg Subscribers/Listener:</strong> {stats.averageSubscribersPerListener}
      </div>

      <h4>Active Listeners</h4>
      {listeners.map(listener => (
        <div key={listener.id} style={{ marginBottom: '10px', padding: '10px', background: 'white' }}>
          <div><strong>ID:</strong> {listener.id}</div>
          <div><strong>Subscribers:</strong> {listener.subscriberCount}</div>
          <div><strong>Documents:</strong> {listener.documentCount}</div>
          <div><strong>Age:</strong> {Math.round((Date.now() - listener.createdAt) / 1000)}s</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Example 6: Cleanup on Logout
// ============================================================================

/**
 * Logout handler that cleans up all listeners
 */
export function handleLogout() {
  // Cleanup all active listeners
  listenerManager.cleanup();

  // ... rest of logout logic (clear auth, redirect, etc.)
  logger.log('All listeners cleaned up');
}

// ============================================================================
// Example 7: Multiple Components Sharing Same Listener
// ============================================================================

/**
 * Component A - Shows message count
 */
export function MessageCount({ conversationId }: { conversationId: string }) {
  const { messages } = useMessages(conversationId);
  return <div>Messages: {messages.length}</div>;
}

/**
 * Component B - Shows message list
 */
export function MessageList({ conversationId }: { conversationId: string }) {
  const { messages } = useMessages(conversationId);
  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.text}</div>
      ))}
    </div>
  );
}

/**
 * Parent component using both
 * 
 * Both MessageCount and MessageList will share the same listener!
 * Only 1 Firestore listener is created, reducing snapshot reads by 50%
 */
export function ChatView({ conversationId }: { conversationId: string }) {
  return (
    <div>
      <MessageCount conversationId={conversationId} />
      <MessageList conversationId={conversationId} />
    </div>
  );
}

// ============================================================================
// Example 8: Performance Comparison
// ============================================================================

/**
 * Before: Each component creates its own listener
 * - Component A: 1 listener (100 docs)
 * - Component B: 1 listener (100 docs)
 * - Component C: 1 listener (100 docs)
 * Total: 3 listeners, 300 document reads
 * 
 * After: Components share one listener via ListenerManager
 * - Shared listener: 1 listener (100 docs)
 * - Component A: subscribes to shared listener
 * - Component B: subscribes to shared listener
 * - Component C: subscribes to shared listener
 * Total: 1 listener, 100 document reads
 * 
 * Savings: 67% reduction in document reads!
 */
