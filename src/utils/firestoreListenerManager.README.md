# Firestore Listener Manager

## Overview

The `FirestoreListenerManager` is a utility class that optimizes real-time Firestore listeners by preventing duplicate subscriptions, sharing listeners across components, and automatically cleaning up when no longer needed.

**Key Benefits:**
- **50-70% reduction in snapshot reads** through listener deduplication
- **Automatic cleanup** when components unmount
- **Shared listeners** across multiple components
- **Query limits** to reduce snapshot size
- **Listener registry** for monitoring active listeners

## Problem Statement

Without optimization, each component that needs real-time data creates its own Firestore listener, leading to:
- Duplicate listeners for the same query
- Excessive snapshot reads (each listener counts as reads)
- Memory leaks from forgotten unsubscribes
- High Firestore costs

## Solution

The `ListenerManager` solves these problems by:
1. **Deduplicating listeners** - Multiple components can share one listener
2. **Auto-cleanup** - Listeners are removed when no subscribers remain
3. **Grace period** - 5-second delay before cleanup allows reuse
4. **Error handling** - Robust error handling with cleanup on failure

## Architecture

```
Component A ──┐
              ├──> Subscriber 1 ──┐
Component B ──┘                   │
                                  ├──> Listener (shared) ──> Firestore
Component C ──┐                   │
              ├──> Subscriber 2 ──┘
Component D ──┘
```

## Usage

### Basic Usage

```typescript
import { listenerManager } from './utils/firestoreListenerManager';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';

// In your component or hook
function useMessages(conversationId: string) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!conversationId) return;

    // Create query
    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'desc'),
      limit(30) // Requirement 3.4: Apply limits to reduce snapshot size
    );

    // Subscribe with unique ID
    const subscriberId = `messages_${conversationId}_${Date.now()}`;
    
    listenerManager.subscribe(subscriberId, {
      query: messagesQuery,
      onUpdate: (data) => {
        setMessages(data);
      },
      onError: (error) => {
        console.error('Messages listener error:', error);
      },
    });

    // Cleanup on unmount
    return () => {
      listenerManager.unsubscribe(subscriberId);
    };
  }, [conversationId]);

  return messages;
}
```

### Advanced Usage - Conversations List

```typescript
function useConversations(userId: string) {
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    if (!userId) return;

    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
      limit(20) // Requirement 3.1: Limit conversations to 20
    );

    const subscriberId = `conversations_${userId}`;
    
    listenerManager.subscribe(subscriberId, {
      query: conversationsQuery,
      onUpdate: setConversations,
      onError: (error) => {
        console.error('Conversations error:', error);
        setConversations([]);
      },
    });

    return () => {
      listenerManager.unsubscribe(subscriberId);
    };
  }, [userId]);

  return conversations;
}
```

### Monitoring Active Listeners

```typescript
// Get statistics
const stats = listenerManager.getStats();
console.log('Active listeners:', stats.totalListeners);
console.log('Total subscribers:', stats.totalSubscribers);
console.log('Avg subscribers per listener:', stats.averageSubscribersPerListener);

// Get detailed listener info
const activeListeners = listenerManager.getActiveListeners();
activeListeners.forEach(listener => {
  console.log(`Listener ${listener.id}:`, {
    subscribers: listener.subscriberCount,
    documents: listener.documentCount,
    age: Date.now() - listener.createdAt,
  });
});
```

### Cleanup on Logout

```typescript
// In your logout handler
function handleLogout() {
  // Cleanup all listeners
  listenerManager.cleanup();
  
  // ... rest of logout logic
}
```

## API Reference

### `subscribe<T>(subscriberId: string, config: ListenerConfig<T>): string`

Subscribe to a query with automatic deduplication.

**Parameters:**
- `subscriberId` - Unique ID for this subscriber (e.g., `messages_conv123_1234567890`)
- `config.query` - Firestore query to listen to
- `config.onUpdate` - Callback when data updates
- `config.onError` - Optional error callback
- `config.limit` - Optional query limit (applied in query building)

**Returns:** The subscriber ID (same as input)

**Example:**
```typescript
const subscriberId = listenerManager.subscribe('my-subscriber', {
  query: myQuery,
  onUpdate: (data) => console.log('Data:', data),
  onError: (error) => console.error('Error:', error),
});
```

### `unsubscribe(subscriberId: string): void`

Unsubscribe a subscriber from its listener.

**Parameters:**
- `subscriberId` - The subscriber ID from `subscribe()`

**Behavior:**
- Removes subscriber from listener
- If no subscribers remain, waits 5 seconds then cleans up listener
- Grace period allows reuse if component remounts quickly

**Example:**
```typescript
listenerManager.unsubscribe('my-subscriber');
```

### `getActiveListeners(): Array<ListenerMetadata>`

Get metadata for all active listeners.

**Returns:** Array of listener metadata objects with:
- `id` - Unique listener ID
- `queryHash` - Hash of the query for deduplication
- `subscriberCount` - Number of subscribers
- `createdAt` - Timestamp when listener was created
- `lastActivity` - Timestamp of last update
- `documentCount` - Number of documents in last snapshot

**Example:**
```typescript
const listeners = listenerManager.getActiveListeners();
console.log(`${listeners.length} active listeners`);
```

### `getStats(): ListenerStats`

Get statistics about active listeners.

**Returns:** Object with:
- `totalListeners` - Number of active listeners
- `totalSubscribers` - Total subscribers across all listeners
- `totalDocuments` - Total documents across all snapshots
- `averageSubscribersPerListener` - Average subscribers per listener

**Example:**
```typescript
const stats = listenerManager.getStats();
console.log(`Efficiency: ${stats.averageSubscribersPerListener} subscribers per listener`);
```

### `cleanup(): void`

Cleanup all listeners and subscribers.

**Use cases:**
- User logout
- App unmount
- Testing cleanup

**Example:**
```typescript
listenerManager.cleanup();
```

## Best Practices

### 1. Use Descriptive Subscriber IDs

```typescript
// Good - includes context
const subscriberId = `messages_${conversationId}_${componentId}`;

// Bad - not unique enough
const subscriberId = 'messages';
```

### 2. Always Unsubscribe on Unmount

```typescript
useEffect(() => {
  const subscriberId = listenerManager.subscribe(/* ... */);
  
  return () => {
    listenerManager.unsubscribe(subscriberId);
  };
}, [dependencies]);
```

### 3. Apply Query Limits

```typescript
// Requirement 3.4: Apply limits to reduce snapshot size
const messagesQuery = query(
  collection(db, 'messages'),
  where('conversationId', '==', id),
  limit(30) // Limit to 30 messages
);
```

### 4. Handle Errors Gracefully

```typescript
listenerManager.subscribe(subscriberId, {
  query: myQuery,
  onUpdate: setData,
  onError: (error) => {
    console.error('Listener error:', error);
    setData([]); // Fallback to empty state
    setError(error.message);
  },
});
```

### 5. Monitor Listener Usage

```typescript
// In development, log listener stats periodically
if (import.meta.env.DEV) {
  setInterval(() => {
    const stats = listenerManager.getStats();
    console.log('[ListenerManager]', stats);
  }, 30000); // Every 30 seconds
}
```

## Performance Impact

### Before Optimization
- 3 components showing same conversation = 3 listeners
- Each listener = separate snapshot reads
- 100 messages × 3 listeners = 300 document reads

### After Optimization
- 3 components showing same conversation = 1 shared listener
- Single listener = single snapshot reads
- 100 messages × 1 listener = 100 document reads
- **67% reduction in reads!**

## Requirements Satisfied

- **Requirement 3.1**: Map-based listener registry with unique IDs based on query hash
- **Requirement 3.2**: Listener deduplication and reuse
- **Requirement 3.3**: Auto-cleanup when no subscribers remain
- **Requirement 3.4**: Query limits to reduce snapshot size
- **Requirement 6.2**: Reuse existing listeners for online status
- **Requirement 6.3**: Unsubscribe on component unmount
- **Requirement 6.4**: Prevent duplicate listeners
- **Requirement 12.1**: Auto-unsubscribe on unmount
- **Requirement 12.2**: Prevent duplicate listeners
- **Requirement 12.3**: Use query limits
- **Requirement 12.5**: Listener registry for tracking

## Testing

Run tests with:
```bash
npm run test src/utils/firestoreListenerManager.test.ts
```

## Integration with Existing Code

The `ListenerManager` is designed to work alongside existing listener implementations. You can gradually migrate hooks to use it:

1. Start with high-traffic listeners (messages, conversations)
2. Migrate online status listeners
3. Update other real-time features as needed

The existing `useOnlineStatusCache` hook already implements similar patterns and can be refactored to use `ListenerManager` for consistency.

## Troubleshooting

### Listeners not cleaning up
- Check that you're calling `unsubscribe()` in cleanup function
- Verify subscriber IDs are unique and consistent

### Multiple listeners for same query
- Ensure query objects are identical (same filters, limits, order)
- Query hash is based on query structure, not reference

### Memory leaks
- Always unsubscribe in `useEffect` cleanup
- Call `cleanup()` on logout/unmount

## Future Enhancements

- [ ] Persistent listener state across page reloads
- [ ] Configurable grace period per listener
- [ ] Listener priority and resource limits
- [ ] Integration with Query Monitor for cost tracking
- [ ] Automatic query optimization suggestions
