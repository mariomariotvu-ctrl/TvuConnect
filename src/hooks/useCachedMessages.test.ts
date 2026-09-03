/**
 * Unit Tests for useCachedMessages Hook
 * 
 * Tests cache-first strategy, listener management, and auto-cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCachedMessages, MessageListenerManager } from './useCachedMessages';
import type { Message } from '../types';
import * as cacheManager from '../utils/cacheManager';
import { auth } from '../firebase';

let mockCurrentUser: any = { uid: 'user123' };

// Mock Firebase
vi.mock('../firebase', () => ({
  db: {},
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}));

// Mock cache manager
vi.mock('../utils/cacheManager', () => ({
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}));

describe('useCachedMessages', () => {
  const conversationId = 'user123_user456';
  const receiverUid = 'user456';
  let subscribeSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = { uid: 'user123' };
    // Clear sessionStorage
    sessionStorage.clear();
  });

  afterEach(() => {
    // Restore spy if any
    if (subscribeSpy) {
      subscribeSpy.mockRestore();
      subscribeSpy = null;
    }
    // Cleanup all listeners
    const listenerManager = MessageListenerManager.getInstance();
    listenerManager.unsubscribeAll();
  });

  describe('Cache-First Strategy', () => {
    it('should check cache first before subscribing to Firestore', async () => {
      const cachedMessages = [
        { id: '1', text: 'Hello', conversationId, createdAt: { toMillis: () => 1000 } },
        { id: '2', text: 'World', conversationId, createdAt: { toMillis: () => 2000 } },
      ];

      vi.mocked(cacheManager.getCachedData).mockReturnValue(cachedMessages);

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(cacheManager.getCachedData).toHaveBeenCalledWith({
        key: `messages:${conversationId}`,
        ttl: 120000,
        storage: 'sessionStorage',
      });

      expect(result.current.messages).toEqual(cachedMessages);
      expect(result.current.fromCache).toBe(true);
    });

    it('should return empty array when cache is empty', async () => {
      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      expect(result.current.messages).toEqual([]);
      expect(result.current.fromCache).toBe(false);
    });

    it('should use correct cache key pattern', async () => {
      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);

      renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(cacheManager.getCachedData).toHaveBeenCalledWith(
          expect.objectContaining({
            key: `messages:${conversationId}`,
          })
        );
      });
    });

    it('should use TTL of 120 seconds', async () => {
      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);

      renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(cacheManager.getCachedData).toHaveBeenCalledWith(
          expect.objectContaining({
            ttl: 120000, // 120 seconds
          })
        );
      });
    });

    it('should use sessionStorage for caching', async () => {
      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);

      renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(cacheManager.getCachedData).toHaveBeenCalledWith(
          expect.objectContaining({
            storage: 'sessionStorage',
          })
        );
      });
    });
  });

  describe('Listener Management', () => {
    it('should maintain only 1 active listener per conversation', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      // Render hook twice for same conversation
      const { unmount: unmount1 } = renderHook(() => 
        useCachedMessages(conversationId, receiverUid)
      );

      await waitFor(() => {
        expect(listenerManager.getActiveListenerCount()).toBe(1);
      });

      const { unmount: unmount2 } = renderHook(() => 
        useCachedMessages(conversationId, receiverUid)
      );

      await waitFor(() => {
        // Should still be 1 listener (reused)
        expect(listenerManager.getActiveListenerCount()).toBe(1);
      });

      unmount1();
      unmount2();
    });

    it('should unsubscribe when conversation changes', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      const { rerender, unmount } = renderHook(
        ({ convId, recUid }) => useCachedMessages(convId, recUid),
        {
          initialProps: {
            convId: conversationId,
            recUid: receiverUid,
          },
        }
      );

      await waitFor(() => {
        expect(listenerManager.getActiveListenerCount()).toBe(1);
      });

      // Switch to different conversation
      const newConversationId = 'user123_user789';
      const newReceiverUid = 'user789';

      rerender({
        convId: newConversationId,
        recUid: newReceiverUid,
      });

      await waitFor(() => {
        // Should still be 1 listener (old unsubscribed, new subscribed)
        expect(listenerManager.getActiveListenerCount()).toBe(1);
      });

      unmount();
    });

    it('should unsubscribe on unmount', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      const { unmount } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(listenerManager.getActiveListenerCount()).toBe(1);
      });

      unmount();

      await waitFor(() => {
        expect(listenerManager.getActiveListenerCount()).toBe(0);
      });
    });

    it('should cleanup all listeners on unsubscribeAll', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      // Create multiple listeners for different conversations
      const { unmount: unmount1 } = renderHook(() => 
        useCachedMessages('conv1', 'user1')
      );
      const { unmount: unmount2 } = renderHook(() => 
        useCachedMessages('conv2', 'user2')
      );

      await waitFor(() => {
        expect(listenerManager.getActiveListenerCount()).toBe(2);
      });

      listenerManager.unsubscribeAll();

      expect(listenerManager.getActiveListenerCount()).toBe(0);

      unmount1();
      unmount2();
    });
  });

  describe('Error Handling', () => {
    it('should handle cache read errors gracefully', async () => {
      vi.mocked(cacheManager.getCachedData).mockImplementation(() => {
        throw new Error('Cache read error');
      });

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      // Should not crash, should continue with Firestore listener
      expect(result.current.messages).toEqual([]);
    });

    it('should set error state when listener fails', async () => {
      const listenerManager = MessageListenerManager.getInstance();
      const mockError = new Error('Firestore error');

      // Mock listener to call error callback
      subscribeSpy = vi.spyOn(listenerManager, 'subscribe').mockImplementation(
        (convId: string, _limit: number, _callback: (messages: Message[]) => void, onError: (error: Error) => void) => {
          onError(mockError);
          return () => {};
        }
      );

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.error).toEqual(mockError);
      });
    });

    it('should handle cache write errors gracefully', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);
      vi.mocked(cacheManager.setCachedData).mockImplementation(() => {
        throw new Error('Cache write error');
      });

      subscribeSpy = vi.spyOn(listenerManager, 'subscribe').mockImplementation((convId, _limit, callback) => {
        callback([
          { id: '1', text: 'Hello', conversationId, createdAt: { toMillis: () => 1000 } },
        ] as any);
        return () => {};
      });

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      // Should not crash, messages should still be available
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.messages).toHaveLength(1);
    });
  });

  describe('Refresh Functionality', () => {
    it('should clear messages and reload on refresh', async () => {
      const cachedMessages = [
        { id: '1', text: 'Hello', conversationId, createdAt: { toMillis: () => 1000 } },
      ];

      vi.mocked(cacheManager.getCachedData).mockReturnValueOnce(cachedMessages).mockReturnValue(null);

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.messages).toEqual(cachedMessages);
      });

      // Call refresh
      result.current.refresh();

      await waitFor(() => {
        expect(result.current.messages).toEqual([]);
        expect(result.current.fromCache).toBe(false);
      });
    });
  });

  describe('Message Sorting', () => {
    it('should sort messages by createdAt ascending (oldest first)', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      const unsortedMessages = [
        { id: '3', text: 'Third', conversationId, createdAt: { toMillis: () => 3000 } },
        { id: '1', text: 'First', conversationId, createdAt: { toMillis: () => 1000 } },
        { id: '2', text: 'Second', conversationId, createdAt: { toMillis: () => 2000 } },
      ];

      subscribeSpy = vi.spyOn(listenerManager, 'subscribe').mockImplementation((convId, _limit, callback) => {
        callback(unsortedMessages as any);
        return () => {};
      });

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(3);
      });

      // Check sorting (oldest first)
      expect(result.current.messages[0].id).toBe('1');
      expect(result.current.messages[1].id).toBe('2');
      expect(result.current.messages[2].id).toBe('3');
    });
  });

  describe('Loading State', () => {
    it('should start with loading=true', () => {
      // Invalidate the cache to ensure we do not hit cache synchronously
      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      expect(result.current.loading).toBe(true);
    });

    it('should set loading=false after cache hit', async () => {
      const cachedMessages = [
        { id: '1', text: 'Hello', conversationId, createdAt: { toMillis: () => 1000 } },
      ];

      vi.mocked(cacheManager.getCachedData).mockReturnValue(cachedMessages);

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set loading=false after listener receives data', async () => {
      const listenerManager = MessageListenerManager.getInstance();

      vi.mocked(cacheManager.getCachedData).mockReturnValue(null);

      subscribeSpy = vi.spyOn(listenerManager, 'subscribe').mockImplementation((convId, _limit, callback) => {
        setTimeout(() => {
          callback([
            { id: '1', text: 'Hello', conversationId, createdAt: { toMillis: () => 1000 } },
          ] as any);
        }, 50);
        return () => {};
      });

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Auth Guard', () => {
    it('should not load messages when user is not authenticated', async () => {
      // Mock no current user
      mockCurrentUser = null;

      const { result } = renderHook(() => useCachedMessages(conversationId, receiverUid));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.messages).toEqual([]);
      expect(cacheManager.getCachedData).not.toHaveBeenCalled();
    });
  });
});

describe('MessageListenerManager', () => {
  let listenerManager: MessageListenerManager;

  beforeEach(() => {
    listenerManager = MessageListenerManager.getInstance();
    listenerManager.unsubscribeAll();
  });

  afterEach(() => {
    listenerManager.unsubscribeAll();
  });

  it('should be a singleton', () => {
    const instance1 = MessageListenerManager.getInstance();
    const instance2 = MessageListenerManager.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should track active listener count', () => {
    expect(listenerManager.getActiveListenerCount()).toBe(0);

    const unsubscribe1 = listenerManager.subscribe('conv1', 30, () => {}, () => {});
    expect(listenerManager.getActiveListenerCount()).toBe(1);

    const unsubscribe2 = listenerManager.subscribe('conv2', 30, () => {}, () => {});
    expect(listenerManager.getActiveListenerCount()).toBe(2);

    unsubscribe1();
    expect(listenerManager.getActiveListenerCount()).toBe(1);

    unsubscribe2();
    expect(listenerManager.getActiveListenerCount()).toBe(0);
  });

  it('should replace existing listener for same conversation', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    listenerManager.subscribe('conv1', 30, callback1, () => {});
    expect(listenerManager.getActiveListenerCount()).toBe(1);

    listenerManager.subscribe('conv1', 30, callback2, () => {});
    expect(listenerManager.getActiveListenerCount()).toBe(1);
  });

  it('should unsubscribe all listeners', () => {
    listenerManager.subscribe('conv1', 30, () => {}, () => {});
    listenerManager.subscribe('conv2', 30, () => {}, () => {});
    listenerManager.subscribe('conv3', 30, () => {}, () => {});

    expect(listenerManager.getActiveListenerCount()).toBe(3);

    listenerManager.unsubscribeAll();

    expect(listenerManager.getActiveListenerCount()).toBe(0);
  });
});
