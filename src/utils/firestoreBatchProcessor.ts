/**
 * Firestore Batch Processor
 * 
 * This processor reduces Firestore write operations by batching multiple writes
 * into single batch operations, improving performance and reducing costs.
 * 
 * Features:
 * - Queue write operations (set, update, delete)
 * - Auto-flush after reaching batch size or timeout
 * - Retry individual operations on batch failure
 * - Track batch execution metrics
 * 
 * Requirements: 2.7, 9.1, 9.2, 9.3, 9.4
 */

import { 
  writeBatch, 
  WriteBatch, 
  DocumentReference, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Batch operation types
 */
export type BatchOperationType = 'set' | 'update' | 'delete';

/**
 * Batch operation configuration
 */
export interface BatchOperation {
  type: BatchOperationType;
  ref: DocumentReference;
  data?: any;
  retryCount?: number;
}

/**
 * Batch processor configuration
 */
export interface BatchConfig {
  maxBatchSize: number;      // Maximum operations per batch (Firestore limit is 500)
  autoFlushInterval: number;  // Auto-flush timeout in milliseconds
  retryOnFailure: boolean;    // Retry individual operations on batch failure
}

/**
 * Batch execution result
 */
export interface BatchResult {
  success: boolean;
  operationsCount: number;
  executionTime: number;
  errors?: Error[];
}

/**
 * Firestore Batch Processor
 * 
 * Queues write operations and executes them in batches to reduce
 * the number of write operations and improve performance.
 * 
 * Requirement 9.1: Batch writes in groups of 10
 * Requirement 9.3: Execute batch operations within 500ms
 */
export class FirestoreBatchProcessor {
  private pendingOps: BatchOperation[];
  private config: BatchConfig;
  private flushTimer: NodeJS.Timeout | null;
  private stats: {
    totalBatches: number;
    totalOperations: number;
    totalErrors: number;
  };

  constructor(config: Partial<BatchConfig> = {}) {
    this.pendingOps = [];
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 10,
      autoFlushInterval: config.autoFlushInterval ?? 500,
      retryOnFailure: config.retryOnFailure ?? true,
    };
    this.flushTimer = null;
    this.stats = {
      totalBatches: 0,
      totalOperations: 0,
      totalErrors: 0,
    };
  }

  /**
   * Add a set operation to the batch queue
   * 
   * Requirement 2.7: Queue match history saves for batching
   */
  addSet(ref: DocumentReference, data: any): void {
    this.add({
      type: 'set',
      ref,
      data,
    });
  }

  /**
   * Add an update operation to the batch queue
   */
  addUpdate(ref: DocumentReference, data: any): void {
    this.add({
      type: 'update',
      ref,
      data,
    });
  }

  /**
   * Add a delete operation to the batch queue
   */
  addDelete(ref: DocumentReference): void {
    this.add({
      type: 'delete',
      ref,
    });
  }

  /**
   * Add an operation to the batch queue
   * 
   * Requirement 9.1: Queue operations for batching
   * Requirement 9.3: Auto-flush after 500ms or when batch is full
   */
  private add(operation: BatchOperation): void {
    this.pendingOps.push(operation);

    // Auto-flush if batch is full
    if (this.pendingOps.length >= this.config.maxBatchSize) {
      this.flush();
      return;
    }

    // Schedule auto-flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.config.autoFlushInterval);
    }
  }

  /**
   * Flush all pending operations
   * 
   * Requirement 9.3: Execute batch operations within 500ms
   * Requirement 9.4: Retry individual operations on batch failure
   */
  async flush(): Promise<BatchResult> {
    // Clear auto-flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Nothing to flush
    if (this.pendingOps.length === 0) {
      return {
        success: true,
        operationsCount: 0,
        executionTime: 0,
      };
    }

    const startTime = Date.now();
    const operations = [...this.pendingOps];
    this.pendingOps = [];

    try {
      // Create batch
      const batch = writeBatch(db);

      // Add all operations to batch
      operations.forEach(op => {
        switch (op.type) {
          case 'set':
            batch.set(op.ref, op.data);
            break;
          case 'update':
            batch.update(op.ref, op.data);
            break;
          case 'delete':
            batch.delete(op.ref);
            break;
        }
      });

      // Commit batch
      await batch.commit();

      // Update stats
      this.stats.totalBatches++;
      this.stats.totalOperations += operations.length;

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        operationsCount: operations.length,
        executionTime,
      };
    } catch (error) {
      console.error('[BatchProcessor] Batch commit failed:', error);
      this.stats.totalErrors++;

      // Retry individual operations if enabled
      if (this.config.retryOnFailure) {
        const errors = await this.retryIndividualOperations(operations);
        
        const executionTime = Date.now() - startTime;

        return {
          success: errors.length === 0,
          operationsCount: operations.length,
          executionTime,
          errors: errors.length > 0 ? errors : undefined,
        };
      }

      const executionTime = Date.now() - startTime;

      return {
        success: false,
        operationsCount: operations.length,
        executionTime,
        errors: [error as Error],
      };
    }
  }

  /**
   * Retry individual operations when batch fails
   * 
   * Requirement 9.4: Retry individual operations on batch failure
   */
  private async retryIndividualOperations(
    operations: BatchOperation[]
  ): Promise<Error[]> {
    const errors: Error[] = [];

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'set':
            await setDoc(op.ref, op.data);
            break;
          case 'update':
            await updateDoc(op.ref, op.data);
            break;
          case 'delete':
            await deleteDoc(op.ref);
            break;
        }
        this.stats.totalOperations++;
      } catch (error) {
        console.error('[BatchProcessor] Individual operation failed:', error);
        errors.push(error as Error);
        this.stats.totalErrors++;
      }
    }

    return errors;
  }

  /**
   * Clear all pending operations without executing them
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingOps = [];
  }

  /**
   * Get batch processor statistics
   */
  getStats() {
    return {
      ...this.stats,
      pendingOperations: this.pendingOps.length,
    };
  }

  /**
   * Get number of pending operations
   */
  getPendingCount(): number {
    return this.pendingOps.length;
  }
}

// Export singleton instance for match history batching
export const matchHistoryBatchProcessor = new FirestoreBatchProcessor({
  maxBatchSize: 10,
  autoFlushInterval: 500,
  retryOnFailure: true,
});

