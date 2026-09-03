/**
 * Unit tests for Firestore Batch Processor
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FirestoreBatchProcessor } from './firestoreBatchProcessor';

// Mock Firebase completely
vi.mock('firebase/firestore', () => ({
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn((db, collection, id) => ({ 
    id, 
    path: `${collection}/${id}`,
    _collection: collection 
  })),
  collection: vi.fn((db, name) => ({ name })),
}));

vi.mock('../firebase', () => ({
  db: { name: 'test-db' },
}));

describe('FirestoreBatchProcessor', () => {
  let processor: FirestoreBatchProcessor;

  beforeEach(() => {
    processor = new FirestoreBatchProcessor({
      maxBatchSize: 3,
      autoFlushInterval: 100,
      retryOnFailure: false,
    });
  });

  afterEach(() => {
    processor.clear();
  });

  describe('Operation Queueing', () => {
    it('should queue set operations', () => {
      const ref = { id: 'doc1', path: 'test/doc1' } as any;
      processor.addSet(ref, { name: 'Test' });
      
      expect(processor.getPendingCount()).toBe(1);
    });

    it('should queue update operations', () => {
      const ref = { id: 'doc1', path: 'test/doc1' } as any;
      processor.addUpdate(ref, { name: 'Updated' });
      
      expect(processor.getPendingCount()).toBe(1);
    });

    it('should queue delete operations', () => {
      const ref = { id: 'doc1', path: 'test/doc1' } as any;
      processor.addDelete(ref);
      
      expect(processor.getPendingCount()).toBe(1);
    });

    it('should queue multiple operations', () => {
      const ref1 = { id: 'doc1', path: 'test/doc1' } as any;
      const ref2 = { id: 'doc2', path: 'test/doc2' } as any;
      
      processor.addSet(ref1, { name: 'Test1' });
      processor.addSet(ref2, { name: 'Test2' });
      
      expect(processor.getPendingCount()).toBe(2);
    });
  });

  describe('Auto-flush on batch size', () => {
    it('should auto-flush when batch size is reached', async () => {
      const ref1 = { id: 'doc1', path: 'test/doc1' } as any;
      const ref2 = { id: 'doc2', path: 'test/doc2' } as any;
      const ref3 = { id: 'doc3', path: 'test/doc3' } as any;
      
      processor.addSet(ref1, { name: 'Test1' });
      processor.addSet(ref2, { name: 'Test2' });
      
      expect(processor.getPendingCount()).toBe(2);
      
      // Adding third operation should trigger auto-flush
      processor.addSet(ref3, { name: 'Test3' });
      
      // Wait for flush to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(processor.getPendingCount()).toBe(0);
    });
  });

  describe('Auto-flush on timeout', () => {
    it('should auto-flush after timeout', async () => {
      const ref = { id: 'doc1', path: 'test/doc1' } as any;
      processor.addSet(ref, { name: 'Test' });
      
      expect(processor.getPendingCount()).toBe(1);
      
      // Wait for auto-flush timeout (100ms)
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(processor.getPendingCount()).toBe(0);
    });
  });

  describe('Manual flush', () => {
    it('should flush all pending operations', async () => {
      const ref1 = { id: 'doc1', path: 'test/doc1' } as any;
      const ref2 = { id: 'doc2', path: 'test/doc2' } as any;
      
      processor.addSet(ref1, { name: 'Test1' });
      processor.addSet(ref2, { name: 'Test2' });
      
      expect(processor.getPendingCount()).toBe(2);
      
      await processor.flush();
      
      expect(processor.getPendingCount()).toBe(0);
    });

    it('should return success result on flush', async () => {
      const ref = { id: 'doc1', path: 'test/doc1' } as any;
      processor.addSet(ref, { name: 'Test' });
      
      const result = await processor.flush();
      
      expect(result.success).toBe(true);
      expect(result.operationsCount).toBe(1);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty flush', async () => {
      const result = await processor.flush();
      
      expect(result.success).toBe(true);
      expect(result.operationsCount).toBe(0);
      expect(result.executionTime).toBe(0);
    });
  });

  describe('Clear operations', () => {
    it('should clear all pending operations', () => {
      const ref1 = { id: 'doc1', path: 'test/doc1' } as any;
      const ref2 = { id: 'doc2', path: 'test/doc2' } as any;
      
      processor.addSet(ref1, { name: 'Test1' });
      processor.addSet(ref2, { name: 'Test2' });
      
      expect(processor.getPendingCount()).toBe(2);
      
      processor.clear();
      
      expect(processor.getPendingCount()).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track statistics', () => {
      const stats = processor.getStats();
      
      expect(stats).toHaveProperty('totalBatches');
      expect(stats).toHaveProperty('totalOperations');
      expect(stats).toHaveProperty('totalErrors');
      expect(stats).toHaveProperty('pendingOperations');
    });

    it('should update pending operations count', () => {
      const ref = { id: 'doc1', path: 'test/doc1' } as any;
      processor.addSet(ref, { name: 'Test' });
      
      const stats = processor.getStats();
      expect(stats.pendingOperations).toBe(1);
    });
  });
});

