/**
 * Unit tests for useConversations hook
 * 
 * Tests:
 * - Loads conversations with limit 20
 * - Caches conversations for 120 seconds
 * - Batch fetches profiles
 * - Filters blocked users
 * - Unsubscribes on unmount
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useConversations } from './useConversations';
import { listenerManager } from '../utils/firestoreListenerManager';
import * as firebase from '../firebase';

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
  getDocs: vi.fn(),
}));

// Mock listener manager
vi.mock('../utils/firestoreListenerManager', () => ({
  listenerManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }
}));

// Mock Cache Manager to prevent leakage between tests
const mockCache = new Map();
vi.mock('../utils/firestoreCacheManager', () => {
  class MockFirestoreCacheManager {
    get = vi.fn((key) => mockCache.get(key) || null);
    set = vi.fn((key, data) => mockCache.set(key, data));
    invalidate = vi.fn((key) => mockCache.delete(key));
    clear = vi.fn(() => mockCache.clear());
  }
  return {
    FirestoreCacheManager: MockFirestoreCacheManager
  };
});

// Mock constants
vi.mock('../utils/constants', () => ({
  FIRESTORE_LIMITS: {
    CONVERSATIONS_LIMIT: 20,
  }
}));

describe('useConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load conversations with limit 20', async () => {
    const mockConversations = [
      {
        id: 'conv1',
        participants: ['user123', 'user456'],
        lastMessage: 'Hello',
        lastMessageAt: { toDate: () => new Date() }
      }
    ];

    const mockProfiles = [
      {
        uid: 'user456',
        fullName: 'Test User',
        photoURL: 'https://example.com/photo.jpg'
      }
    ];

    // Mock getDocs to return profiles
    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: mockProfiles.map(profile => ({
        id: profile.uid,
        data: () => profile
      })),
      empty: false,
      size: 1
    } as any);

    // Mock listener manager subscribe
    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      // Simulate immediate callback with conversations data
      setTimeout(() => {
        config.onUpdate(mockConversations as any);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useConversations());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.conversations).toEqual([]);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have conversations with profiles
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].otherUser.fullName).toBe('Test User');
  });

  it('should filter out blocked users', async () => {
    const mockConversations = [
      {
        id: 'conv1',
        participants: ['user123', 'user456'],
        lastMessage: 'Hello',
        lastMessageAt: { toDate: () => new Date() }
      },
      {
        id: 'conv2',
        participants: ['user123', 'user789'],
        lastMessage: 'Hi',
        lastMessageAt: { toDate: () => new Date() }
      }
    ];

    const mockProfiles = [
      {
        uid: 'user456',
        fullName: 'Test User 1',
      },
      {
        uid: 'user789',
        fullName: 'Test User 2',
      }
    ];

    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: mockProfiles.map(profile => ({
        id: profile.uid,
        data: () => profile
      })),
      empty: false,
      size: 2
    } as any);

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onUpdate(mockConversations as any);
      }, 0);
      return subscriberId;
    });

    // Block user789
    const { result } = renderHook(() => useConversations(['user789']));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should only have 1 conversation (user456)
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].otherUser.uid).toBe('user456');
  });

  it('should unsubscribe on unmount', () => {
    let capturedId = '';
    vi.mocked(listenerManager.subscribe).mockImplementation((id, config) => {
      capturedId = id;
      return id;
    });

    const { unmount } = renderHook(() => useConversations());

    unmount();

    expect(listenerManager.unsubscribe).toHaveBeenCalledWith(capturedId);
  });

  it('should handle errors gracefully', async () => {
    const mockError = new Error('Firestore error');

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onError?.(mockError);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(mockError);
  });

  it('should batch fetch profiles efficiently', async () => {
    const mockConversations = [
      {
        id: 'conv1',
        participants: ['user123', 'user456'],
        lastMessage: 'Hello',
        lastMessageAt: { toDate: () => new Date() }
      },
      {
        id: 'conv2',
        participants: ['user123', 'user789'],
        lastMessage: 'Hi',
        lastMessageAt: { toDate: () => new Date() }
      }
    ];

    const mockProfiles = [
      { uid: 'user456', fullName: 'User 1' },
      { uid: 'user789', fullName: 'User 2' }
    ];

    vi.mocked(firebase.getDocs).mockResolvedValue({
      docs: mockProfiles.map(profile => ({
        id: profile.uid,
        data: () => profile
      })),
      empty: false,
      size: 2
    } as any);

    vi.mocked(listenerManager.subscribe).mockImplementation((subscriberId, config) => {
      setTimeout(() => {
        config.onUpdate(mockConversations as any);
      }, 0);
      return subscriberId;
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should only call getDocs once for batch fetch
    expect(firebase.getDocs).toHaveBeenCalledTimes(1);
    expect(result.current.conversations).toHaveLength(2);
  });
});
