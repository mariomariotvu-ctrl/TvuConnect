import { logger } from './logger';
// Global Firestore Listener Registry
// Manages all active Firestore listeners to prevent memory leaks and duplicate subscriptions

interface ListenerEntry {
  id: string;
  unsubscribe: () => void;
  collection: string;
  query: string;
  createdAt: number;
  priority: number;
  componentName?: string;
  conversationId?: string; // For Chat listeners
  userId?: string; // For user-specific listeners
}

class ListenerRegistry {
  private listeners = new Map<string, ListenerEntry>();
  private readonly maxListeners = 50; // Tăng lên 50 cho Blaze plan
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Auto cleanup every 5 minutes
    this.startAutoCleanup();
  }

  /**
   * Register a new listener
   * Returns the listener ID or existing ID if duplicate found
   */
  register(entry: Omit<ListenerEntry, 'id' | 'createdAt'>): string {
    // Check if identical listener exists
    const existing = this.findDuplicate(entry);
    if (existing) {
      logger.log(`[ListenerRegistry] Reusing existing listener: ${existing.id}`);
      return existing.id;
    }

    // Generate unique ID
    const id = this.generateId();
    const fullEntry: ListenerEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
    };

    // Evict low priority listeners if at max capacity
    if (this.listeners.size >= this.maxListeners) {
      this.evictLowestPriority();
    }

    this.listeners.set(id, fullEntry);
    logger.log(`[ListenerRegistry] Registered listener: ${id} (${entry.collection})`);
    
    // Warning if exceeds threshold
    if (this.listeners.size > this.maxListeners) {
      logger.warn(`[ListenerRegistry] Active listeners (${this.listeners.size}) exceeds max (${this.maxListeners})`);
    }
    
    return id;
  }

  /**
   * Unregister and cleanup a listener
   */
  unregister(id: string): void {
    const entry = this.listeners.get(id);
    if (entry) {
      entry.unsubscribe();
      this.listeners.delete(id);
      logger.log(`[ListenerRegistry] Unregistered listener: ${id}`);
    }
  }

  /**
   * Unregister all listeners for a specific component
   */
  unregisterByComponent(componentName: string): void {
    const toRemove: string[] = [];
    
    for (const [id, entry] of this.listeners) {
      if (entry.componentName === componentName) {
        toRemove.push(id);
      }
    }
    
    toRemove.forEach(id => this.unregister(id));
    
    if (toRemove.length > 0) {
      logger.log(`[ListenerRegistry] Unregistered ${toRemove.length} listeners for component: ${componentName}`);
    }
  }

  /**
   * Unregister all listeners for a specific conversation
   */
  unregisterByConversation(conversationId: string): void {
    const toRemove: string[] = [];
    
    for (const [id, entry] of this.listeners) {
      if (entry.conversationId === conversationId) {
        toRemove.push(id);
      }
    }
    
    toRemove.forEach(id => this.unregister(id));
    
    if (toRemove.length > 0) {
      logger.log(`[ListenerRegistry] Unregistered ${toRemove.length} listeners for conversation: ${conversationId}`);
    }
  }

  /**
   * Get active listener count (for monitoring)
   */
  getActiveListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Get current listener count (alias for backward compatibility)
   */
  getCount(): number {
    return this.getActiveListenerCount();
  }

  /**
   * Get listeners by component name
   */
  getListenersByComponent(componentName: string): ListenerEntry[] {
    return Array.from(this.listeners.values()).filter(
      entry => entry.componentName === componentName
    );
  }

  /**
   * Get listeners by collection
   */
  getListenersByCollection(collection: string): ListenerEntry[] {
    return Array.from(this.listeners.values()).filter(
      entry => entry.collection === collection
    );
  }

  /**
   * Get all active listeners (for debugging)
   */
  getAll(): ListenerEntry[] {
    return Array.from(this.listeners.values());
  }

  /**
   * Cleanup stale listeners (older than 5 minutes)
   */
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [id, entry] of this.listeners) {
      if (now - entry.createdAt > staleThreshold) {
        logger.log(`[ListenerRegistry] Cleaning up stale listener: ${id}`);
        this.unregister(id);
      }
    }
  }

  /**
   * Cleanup all listeners (use with caution)
   */
  cleanupAll(): void {
    logger.log(`[ListenerRegistry] Cleaning up all ${this.listeners.size} listeners`);
    for (const [id] of this.listeners) {
      this.unregister(id);
    }
  }

  /**
   * Start automatic cleanup interval
   */
  private startAutoCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Stop automatic cleanup (for testing)
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Find duplicate listener
   */
  findDuplicate(entry: Omit<ListenerEntry, 'id' | 'createdAt'>): ListenerEntry | null {
    for (const existing of this.listeners.values()) {
      if (
        existing.collection === entry.collection &&
        existing.query === entry.query &&
        existing.componentName === entry.componentName &&
        existing.conversationId === entry.conversationId
      ) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Evict lowest priority listener
   */
  evictLowestPriority(): void {
    let lowestPriority = Infinity;
    let lowestId: string | null = null;

    for (const [id, entry] of this.listeners) {
      if (entry.priority < lowestPriority) {
        lowestPriority = entry.priority;
        lowestId = id;
      }
    }

    if (lowestId) {
      logger.log(`[ListenerRegistry] Evicting low priority listener: ${lowestId}`);
      this.unregister(lowestId);
    }
  }

  /**
   * Task 12.4: Memory Monitoring
   *
   * Kiểm tra `performance.memory.usedJSHeapSize` mỗi phút.
   * Ghi cảnh báo nếu bộ nhớ vượt quá 150MB.
   * Requirements: 10.3
   */
  startMemoryMonitoring(): () => void {
    const MEMORY_WARNING_THRESHOLD = 150 * 1024 * 1024; // 150MB in bytes
    const INTERVAL_MS = 60 * 1000; // 1 phút

    // performance.memory chỉ có trên Chromium-based browsers
    const memory = (performance as any).memory;
    if (!memory) {
      logger.log('[ListenerRegistry] performance.memory không được hỗ trợ trên trình duyệt này');
      return () => {};
    }

    const intervalId = setInterval(() => {
      const usedHeap = memory.usedJSHeapSize as number;
      const usedMB = (usedHeap / (1024 * 1024)).toFixed(1);

      if (usedHeap > MEMORY_WARNING_THRESHOLD) {
        logger.warn(
          `[ListenerRegistry] ⚠️ Bộ nhớ JS heap cao: ${usedMB}MB (ngưỡng: 150MB). ` +
          `Active listeners: ${this.listeners.size}`
        );
      } else {
        logger.log(`[ListenerRegistry] Memory check: ${usedMB}MB JS heap`);
      }
    }, INTERVAL_MS);

    logger.log('[ListenerRegistry] Bắt đầu theo dõi bộ nhớ (kiểm tra mỗi 60 giây)');

    // Trả về hàm dọn dẹp để caller có thể dừng monitoring
    return () => clearInterval(intervalId);
  }

  /**
   * Generate unique listener ID
   */
  private generateId(): string {
    return `listener_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// Export singleton instance
export const listenerRegistry = new ListenerRegistry();

// Export for testing
export { ListenerRegistry };
