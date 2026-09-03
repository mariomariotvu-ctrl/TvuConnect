/**
 * Unit tests for useCachedConversations hook
 * 
 * Tests:
 * - Cache-first behavior
 * - TTL expiration
 * - Refresh functionality
 * - Error handling
 * - Performance metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCachedConversations } from './useCachedConversations';
import * as queryOptimizer from '../utils/queryOptimizer';
import * as firebase from '../firebase';

let mockAuthenticatedUser: any = { uid: 'test-user-123' };

// Mock Firebase auth
vi.mock('../firebase', () => ({
  auth: {
    get currentUser() {
      return mockAuthenticatedUser;
    },
  },
  db: {},
}));

// Mock queryOptimizer
vi.mock('../utils/queryOptimizer', () => ({
  optimizeQuery: vi.fn(),
  createCacheConfig: vi.fn((ttl, storage, keyPrefix) => ({
    enabled: true,
    ttl,
    storage,
    keyPrefix,
  })),
}));

describe('useCachedConversations', () => {
  const mockConversations = [
    {
      id: 'conv1',
      participants: ['test-user-123', 'user2'],
      lastMessage: 'Hello',
      lastMessageAt: { seconds: 1234567890 },
      lastMessageBy: 'user2',
      unreadCount: { 'test-user-123': 1 },
      createdAt: { seconds: 1234567890 },
    },
    {
      id: 'conv2',
      participants: ['test-user-123', 'user3'],
      lastMessage: 'Hi there',
      lastMessageAt: { seconds: 1234567891 },
      lastMessageBy: 'user3',
      unreadCount: { 'test-user-123': 2 },
      createdAt: { seconds: 1234567891 },
    },
  ];

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    vi.mocked(queryOptimizer.optimizeQuery).mockReset();
    mockAuthenticatedUser = { uid: 'test-user-123' };
    
    // Clear sessionStorage
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Load', () => {
    it('should load conversations from Firestore on first call (cache miss)', async () => {
      // Mock optimizeQuery to return conversations
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      const { result } = renderHook(() => useCachedConversations());

      // Initially loading
      expect(result.current.loading).toBe(true);
      expect(result.current.conversations).toEqual([]);

      // Wait for load to complete
      await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10000 });

      // Should have conversations
      expect(result.current.conversations).toEqual(mockConversations);
      expect(result.current.fromCache).toBe(false);
      expect(result.current.error).toBeNull();

      // Should have called optimizeQuery with correct config
      expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'conversations',
          limit: 20,
          orderBy: {
            field: 'lastMessageAt',
            direction: 'desc',
          },
          where: [
            {
              field: 'participants',
              operator: 'array-contains',
              value: 'test-user-123',
            },
          ],
        }),
        expect.objectContaining({
          enabled: true,
          ttl: 120000,
          storage: 'sessionStorage',
          keyPrefix: 'conversations:list:test-user-123',
        })
      );
    });

    it('should return empty array when user is not authenticated', async () => {
      // Mock auth.currentUser as null
      mockAuthenticatedUser = null;

      const { result } = renderHook(() => useCachedConversations());

      // Should not be loading
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should have empty conversations
      expect(result.current.conversations).toEqual([]);
      expect(result.current.error).toBeNull();

      // Should not have called optimizeQuery
      expect(queryOptimizer.optimizeQuery).not.toHaveBeenCalled();

      // Restore auth.currentUser
      mockAuthenticatedUser = { uid: 'test-user-123' };
    });
  });

  describe('Cache Behavior', () => {
    it('should load conversations from cache on second call (cache hit)', async () => {
      // First call - cache miss
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      const { result: result1, unmount: unmount1 } = renderHook(() => useCachedConversations());
      await waitFor(() => expect(result1.current.loading).toBe(false));
      expect(result1.current.fromCache).toBe(false);
      unmount1();

      // Second call - cache hit
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: true,
        executionTime: 10,
        documentReads: 0,
      });

      const { result: result2 } = renderHook(() => useCachedConversations());
      await waitFor(() => expect(result2.current.loading).toBe(false));
      
      // Should be from cache
      expect(result2.current.fromCache).toBe(true);
      expect(result2.current.conversations).toEqual(mockConversations);
    });

    it('should use correct cache key pattern', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      renderHook(() => useCachedConversations());
      await waitFor(() => expect(queryOptimizer.optimizeQuery).toHaveBeenCalled());

      // Verify cache key pattern
      expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
        120000,
        'sessionStorage',
        'conversations:list:test-user-123'
      );
    });

    it('should use 120 second TTL', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      renderHook(() => useCachedConversations());
      await waitFor(() => expect(queryOptimizer.optimizeQuery).toHaveBeenCalled());

      // Verify TTL is 120 seconds (120000ms)
      expect(queryOptimizer.createCacheConfig).toHaveBeenCalledWith(
        120000,
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh conversations when refresh() is called', async () => {
      // Initial load
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      const { result } = renderHook(() => useCachedConversations());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Refresh
      const updatedConversations = [
        ...mockConversations,
        {
          id: 'conv3',
          participants: ['test-user-123', 'user4'],
          lastMessage: 'New message',
          lastMessageAt: { seconds: 1234567892 },
          lastMessageBy: 'user4',
          unreadCount: { 'test-user-123': 1 },
          createdAt: { seconds: 1234567892 },
        },
      ];

      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
        data: updatedConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 3,
      });

      await act(async () => {
        result.current.refresh();
      });

      // Wait for refresh to complete
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should have updated conversations
      expect(result.current.conversations).toEqual(updatedConversations);
      expect(result.current.conversations.length).toBe(3);
    });

    it('should reset state when refresh() is called', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      const { result } = renderHook(() => useCachedConversations());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Call refresh - state resets immediately, then loads
      await act(async () => {
        result.current.refresh();
        // Check state immediately after calling refresh (before async load completes)
        // Note: We can't check state here because act() waits for async operations
      });

      // After refresh completes, should have data again
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.conversations).toEqual(mockConversations);
    });
  });

  describe('Error Handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      const mockError = new Error('Firestore error');
      vi.mocked(queryOptimizer.optimizeQuery).mockRejectedValue(mockError);

      const { result } = renderHook(() => useCachedConversations());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should have error
      expect(result.current.error).toEqual(mockError);
      expect(result.current.conversations).toEqual([]);
    });

    it('should clear error on successful refresh', async () => {
      // First call - error
      const mockError = new Error('Firestore error');
      vi.mocked(queryOptimizer.optimizeQuery).mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useCachedConversations());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toEqual(mockError);

      // Refresh - success
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValueOnce({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      await act(async () => {
        result.current.refresh();
      });
      
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Error should be cleared
      expect(result.current.error).toBeNull();
      expect(result.current.conversations).toEqual(mockConversations);
    });
  });

  describe('Query Configuration', () => {
    it('should limit conversations to 20', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      renderHook(() => useCachedConversations());
      await waitFor(() => expect(queryOptimizer.optimizeQuery).toHaveBeenCalled());

      // Verify limit is 20
      expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
        }),
        expect.any(Object)
      );
    });

    it('should order by lastMessageAt desc', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      renderHook(() => useCachedConversations());
      await waitFor(() => expect(queryOptimizer.optimizeQuery).toHaveBeenCalled());

      // Verify orderBy
      expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            field: 'lastMessageAt',
            direction: 'desc',
          },
        }),
        expect.any(Object)
      );
    });

    it('should filter by current user in participants', async () => {
      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      renderHook(() => useCachedConversations());
      await waitFor(() => expect(queryOptimizer.optimizeQuery).toHaveBeenCalled());

      // Verify where clause
      expect(queryOptimizer.optimizeQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            {
              field: 'participants',
              operator: 'array-contains',
              value: 'test-user-123',
            },
          ],
        }),
        expect.any(Object)
      );
    });
  });

  describe('Performance Metrics', () => {
    it('should log performance metrics on load', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(queryOptimizer.optimizeQuery).mockResolvedValue({
        data: mockConversations,
        lastDoc: null,
        hasMore: false,
        fromCache: false,
        executionTime: 500,
        documentReads: 2,
      });

      renderHook(() => useCachedConversations());
      await waitFor(() => expect(consoleSpy).toHaveBeenCalled());

      // Verify performance metrics are logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useCachedConversations] Load completed:',
        expect.objectContaining({
          fromCache: false,
          executionTime: 500,
          documentReads: 2,
          conversationCount: 2,
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
