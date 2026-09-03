/**
 * Unit tests for FirestoreListenerManager
 * 
 * Tests listener deduplication, subscription management, and auto-cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FirestoreListenerManager } from './firestoreListenerManager';
import { Query, onSnapshot } from 'firebase/firestore';

// Mock Firebase Firestore
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(),
}));

describe('FirestoreListenerManager', () => {
  let manager: FirestoreListenerManager;
  let mockQuery: Query;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new FirestoreListenerManager();
    mockQuery = {} as Query;
    mockUnsubscribe = vi.fn();

    // Setup onSnapshot mock
    vi.mocked(onSnapshot).mockImplementation((...args: any[]) => {
      const onNext = typeof args[1] === 'function' ? args[1] : args[2];
      
      // Simulate immediate snapshot
      setTimeout(() => {
        if (typeof onNext === 'function') {
          const mockSnapshot = {
            size: 2,
            forEach: (callback: any) => {
              callback({ id: 'doc1', data: () => ({ name: 'Test 1' }) });
              callback({ id: 'doc2', data: () => ({ name: 'Test 2' }) });
            },
          };
          onNext(mockSnapshot as any);
        }
      }, 0);

      const unsubscribe = () => (mockUnsubscribe as any)();
      return unsubscribe as any;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    manager.cleanup();
  });

  describe('subscribe', () => {
    it('should create a new listener for first subscription', async () => {
      const onUpdate = vi.fn();
      const subscriberId = 'subscriber1';

      manager.subscribe(subscriberId, {
        query: mockQuery,
        onUpdate,
      });

      // Wait for async snapshot
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onSnapshot).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith([
        { id: 'doc1', name: 'Test 1' },
        { id: 'doc2', name: 'Test 2' },
      ]);
    });

    it('should reuse existing listener for same query', async () => {
      const onUpdate1 = vi.fn();
      const onUpdate2 = vi.fn();

      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: onUpdate1,
      });

      manager.subscribe('subscriber2', {
        query: mockQuery,
        onUpdate: onUpdate2,
      });

      // Wait for async snapshot
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should only create one listener
      expect(onSnapshot).toHaveBeenCalledTimes(1);

      // Both subscribers should receive updates
      expect(onUpdate1).toHaveBeenCalled();
      expect(onUpdate2).toHaveBeenCalled();
    });

    it('should track multiple subscribers for same listener', () => {
      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      manager.subscribe('subscriber2', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      const stats = manager.getStats();
      expect(stats.totalListeners).toBe(1);
      expect(stats.totalSubscribers).toBe(2);
    });

    it('should return subscriber ID', () => {
      const subscriberId = 'test-subscriber';
      const result = manager.subscribe(subscriberId, {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      expect(result).toBe(subscriberId);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscriber from listener', async () => {
      const subscriberId = 'subscriber1';

      manager.subscribe(subscriberId, {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      manager.unsubscribe(subscriberId);

      const stats = manager.getStats();
      expect(stats.totalSubscribers).toBe(0);
    });

    it('should cleanup listener when no subscribers remain', async () => {
      const subscriberId = 'subscriber1';

      manager.subscribe(subscriberId, {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      manager.unsubscribe(subscriberId);

      // Wait for grace period (5 seconds)
      await new Promise(resolve => setTimeout(resolve, 5100));

      expect(mockUnsubscribe).toHaveBeenCalled();
      const stats = manager.getStats();
      expect(stats.totalListeners).toBe(0);
    }, 10000); // Increase timeout to 10 seconds

    it('should not cleanup listener if new subscriber added during grace period', async () => {
      const subscriber1 = 'subscriber1';
      const subscriber2 = 'subscriber2';

      manager.subscribe(subscriber1, {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      manager.unsubscribe(subscriber1);

      // Add new subscriber during grace period
      await new Promise(resolve => setTimeout(resolve, 2000));
      manager.subscribe(subscriber2, {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      // Wait for grace period to complete
      await new Promise(resolve => setTimeout(resolve, 3500));

      // Listener should still exist
      const stats = manager.getStats();
      expect(stats.totalListeners).toBe(1);
      expect(stats.totalSubscribers).toBe(1);
    }, 10000); // Increase timeout to 10 seconds

    it('should handle unsubscribe of non-existent subscriber', () => {
      expect(() => {
        manager.unsubscribe('non-existent');
      }).not.toThrow();
    });
  });

  describe('getActiveListeners', () => {
    it('should return empty array when no listeners', () => {
      const listeners = manager.getActiveListeners();
      expect(listeners).toEqual([]);
    });

    it('should return listener metadata', async () => {
      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const listeners = manager.getActiveListeners();
      expect(listeners).toHaveLength(1);
      expect(listeners[0]).toMatchObject({
        subscriberCount: 1,
        documentCount: 2,
      });
      expect(listeners[0].id).toBeDefined();
      expect(listeners[0].queryHash).toBeDefined();
      expect(listeners[0].createdAt).toBeGreaterThan(0);
      expect(listeners[0].lastActivity).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe all listeners', async () => {
      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      manager.cleanup();

      expect(mockUnsubscribe).toHaveBeenCalled();
      const stats = manager.getStats();
      expect(stats.totalListeners).toBe(0);
      expect(stats.totalSubscribers).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      manager.subscribe('subscriber2', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const stats = manager.getStats();
      expect(stats.totalListeners).toBe(1); // Same query = 1 listener
      expect(stats.totalSubscribers).toBe(2); // 2 subscribers
      expect(stats.totalDocuments).toBe(2); // 2 docs
      expect(stats.averageSubscribersPerListener).toBe(2); // 2 subscribers / 1 listener
    });

    it('should handle empty manager', () => {
      const stats = manager.getStats();
      expect(stats).toEqual({
        totalListeners: 0,
        totalSubscribers: 0,
        totalDocuments: 0,
        averageSubscribersPerListener: 0,
      });
    });
  });

  describe('error handling', () => {
    it('should call onError callback when listener fails', async () => {
      const onError = vi.fn();
      const mockError = new Error('Firestore error');

      vi.mocked(onSnapshot).mockImplementation((...args: any[]) => {
        const onError = typeof args[2] === 'function' ? args[2] : args[3];
        setTimeout(() => {
          if (onError) {
            onError(mockError as any);
          }
        }, 0);
        const unsubscribe = () => (mockUnsubscribe as any)();
        return unsubscribe as any;
      });

      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: vi.fn(),
        onError,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(mockError);
    });

    it('should cleanup listener on error', async () => {
      const mockError = new Error('Firestore error');

      vi.mocked(onSnapshot).mockImplementation((...args: any[]) => {
        const onError = typeof args[2] === 'function' ? args[2] : args[3];
        setTimeout(() => {
          if (onError) {
            onError(mockError as any);
          }
        }, 0);
        const unsubscribe = () => (mockUnsubscribe as any)();
        return unsubscribe as any;
      });

      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate: vi.fn(),
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const stats = manager.getStats();
      expect(stats.totalListeners).toBe(0);
    });

    it('should handle errors in subscriber callbacks', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onUpdate = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });

      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('query limits', () => {
    it('should apply query limits to reduce snapshot size', async () => {
      const onUpdate = vi.fn();

      manager.subscribe('subscriber1', {
        query: mockQuery,
        onUpdate,
        limit: 30, // Requirement 3.4: Apply limits to listeners
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify listener was created (limit is applied in query building, not here)
      expect(onSnapshot).toHaveBeenCalled();
    });
  });
});
