/**
 * Unit tests for useMessages hook
 * 
 * Tests:
 * - Loads messages with limit 30
 * - Sorts messages by createdAt ascending
 * - Loads older messages with pagination
 * - Unsubscribes when conversation changes
 * - Unsubscribes on unmount
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMessages } from './useMessages';
import { listenerManager } from '../utils/firestoreListenerManager';
import * as firebase from '../firebase';
import { FIRESTORE_LIMITS } from '../utils/constants';

// Mock Firebase
vi.mock('../firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'user123' }
  },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  getDocs: vi.fn(),
}));

// Mock listener manager
vi.mock('../utils/firestoreListenerManager', () => ({
  listenerManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }
}));

// Mock constants
vi.mock('../utils/constants', () => ({
  FIRESTORE_LIMITS: {
    MESSAGES_PER_PAGE: 30,
  }
}));

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (FIRESTORE_LIMITS as any).MESSAGES_PER_PAGE = 30;
  });

  it('should load messages with limit 30', async () => {
    const mockMessages = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        text: 'Hello',
        senderUid: 'user456',
        receiverUid: 'user123',
        participants: ['user123', 'user456'],
        createdAt: { toMillis: () => 1000 }
      },
      {
        id: 'msg2',
        conversationId: 'conv1',
        text: 'Hi',
        senderUid: 'user123',
        receiverUid: 'user456',
        participants: ['user123', 'user456'],
        createdAt: { toMillis: () => 2000 }
      }
    ];

    // Mock getDocs for initial oldest doc fetch
    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: [{ id: 'msg1' }, { id: 'msg2' }],
      empty: false,
      size: 2
    } as any);

    // Mock listener manager subscribe
    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onUpdate(mockMessages as any);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useMessages('conv1', 'user456'));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.messages).toEqual([]);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have messages sorted by createdAt ascending
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).toBe('msg1');
    expect(result.current.messages[1].id).toBe('msg2');
  });

  it('should sort messages by createdAt ascending', async () => {
    const mockMessages = [
      {
        id: 'msg3',
        conversationId: 'conv1',
        text: 'Latest',
        createdAt: { toMillis: () => 3000 }
      },
      {
        id: 'msg1',
        conversationId: 'conv1',
        text: 'Oldest',
        createdAt: { toMillis: () => 1000 }
      },
      {
        id: 'msg2',
        conversationId: 'conv1',
        text: 'Middle',
        createdAt: { toMillis: () => 2000 }
      }
    ];

    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: [],
      empty: true,
      size: 0
    } as any);

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onUpdate(mockMessages as any);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useMessages('conv1', 'user456'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should be sorted oldest to newest
    expect(result.current.messages[0].id).toBe('msg1');
    expect(result.current.messages[1].id).toBe('msg2');
    expect(result.current.messages[2].id).toBe('msg3');
  });

  it('should load older messages with pagination', async () => {
    (FIRESTORE_LIMITS as any).MESSAGES_PER_PAGE = 1;
    const initialMessages = [
      {
        id: 'msg2',
        conversationId: 'conv1',
        text: 'Recent',
        createdAt: { toMillis: () => 2000 }
      }
    ];

    const olderMessages = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        text: 'Older',
        createdAt: { toMillis: () => 1000 }
      }
    ];

    // Mock initial getDocs with state flag to survive double mounts
    let loadingOlder = false;
    vi.mocked(firebase.getDocs).mockImplementation(async () => {
      if (loadingOlder) {
        const docs = olderMessages.map(msg => ({
          id: msg.id,
          data: () => msg
        }));
        return {
          docs,
          empty: false,
          size: 1,
          forEach: (callback: any) => docs.forEach(callback)
        } as any;
      }
      return {
        docs: [{ id: 'msg2' }],
        empty: false,
        size: 1
      } as any;
    });

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onUpdate(initialMessages as any);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useMessages('conv1', 'user456'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    // Yield to the event loop/microtask queue to let getDocs promise (.then) run and set oldestDoc
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Load older messages
    await act(async () => {
      loadingOlder = true;
      await result.current.loadOlderMessages();
    });

    // Should have both messages
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).toBe('msg1'); // Older first
    expect(result.current.messages[1].id).toBe('msg2');
  });

  it('should unsubscribe when conversation changes', async () => {
    let capturedIds: string[] = [];
    vi.mocked(listenerManager.subscribe).mockImplementation((id, config) => {
      capturedIds.push(id);
      return id;
    });
    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: [],
      empty: true,
      size: 0
    } as any);

    const { rerender } = renderHook(
      ({ conversationId, receiverUid }) => useMessages(conversationId, receiverUid),
      {
        initialProps: { conversationId: 'conv1', receiverUid: 'user456' }
      }
    );

    await waitFor(() => {
      expect(listenerManager.subscribe).toHaveBeenCalledTimes(1);
    });

    // Change conversation
    rerender({ conversationId: 'conv2', receiverUid: 'user789' });

    await waitFor(() => {
      expect(listenerManager.unsubscribe).toHaveBeenCalledWith(capturedIds[0]);
      expect(listenerManager.subscribe).toHaveBeenCalledTimes(2);
    });
  });

  it('should unsubscribe on unmount', async () => {
    let capturedId = '';
    vi.mocked(listenerManager.subscribe).mockImplementation((id, config) => {
      capturedId = id;
      return id;
    });
    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: [],
      empty: true,
      size: 0
    } as any);

    const { unmount } = renderHook(() => useMessages('conv1', 'user456'));

    await waitFor(() => {
      expect(listenerManager.subscribe).toHaveBeenCalled();
    });

    unmount();

    expect(listenerManager.unsubscribe).toHaveBeenCalledWith(capturedId);
  });

  it('should handle errors gracefully', async () => {
    const mockError = new Error('Firestore error');

    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: [],
      empty: true,
      size: 0
    } as any);

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onError?.(mockError);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useMessages('conv1', 'user456'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(mockError);
  });

  it('should not load more when hasMore is false', async () => {
    const mockMessages = [
      {
        id: 'msg1',
        conversationId: 'conv1',
        text: 'Only message',
        createdAt: { toMillis: () => 1000 }
      }
    ];

    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: [{ id: 'msg1' }],
      empty: false,
      size: 1
    } as any);

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onUpdate(mockMessages as any);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useMessages('conv1', 'user456'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);

    const getDocsCalls = vi.mocked(firebase.getDocs).mock.calls.length;

    // Try to load more
    await act(async () => {
      await result.current.loadOlderMessages();
    });

    // Should not make additional getDocs call
    expect(vi.mocked(firebase.getDocs).mock.calls.length).toBe(getDocsCalls);
  });
});
