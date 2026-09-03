/**
 * User Status Manager
 * 
 * Quản lý trạng thái hoạt động người dùng (online/away/offline) với Firebase Realtime Database.
 * Implement state machine với idle và offline thresholds, multi-device connection tracking,
 * và privacy mode support.
 */

import { ref, set, onDisconnect, serverTimestamp, onValue, remove } from 'firebase/database';
import { realtimeDb } from '../firebase';

export type UserStatus = 'online' | 'away' | 'offline';

export interface StatusConfig {
  idleThresholdMs: number;      // Time to transition from online → away
  offlineThresholdMs: number;   // Time to transition from away → offline
  updateDebounceMs: number;     // Debounce interval for database writes
}

export interface UserPresence {
  status: UserStatus;
  lastActive: number;
  connections: Record<string, ConnectionInfo>;
  settings: {
    privacyMode: boolean;
    invisibleMode: boolean;
  };
}

export interface ConnectionInfo {
  device: 'web' | 'mobile' | 'desktop';
  timestamp: number;
  userAgent?: string;
}

const DEFAULT_CONFIG: StatusConfig = {
  idleThresholdMs: 5 * 60 * 1000,      // 5 minutes
  offlineThresholdMs: 15 * 60 * 1000,  // 15 minutes
  updateDebounceMs: 30 * 1000,         // 30 seconds
};

/**
 * Network retry configuration with exponential backoff
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,   // Start with 1s
  maxDelayMs: 30000,   // Max 30s
};

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );
  return delay;
}

/**
 * Queue entry for offline updates
 */
interface QueuedUpdate {
  type: 'status' | 'activity' | 'invisibleMode';
  data: any;
  timestamp: number;
}

export class StatusManager {
  private userId: string;
  private config: StatusConfig;
  private connectionId: string;
  private currentStatus: UserStatus = 'offline';
  private lastActivityTime: number = Date.now();
  private updateTimer: NodeJS.Timeout | null = null;
  private stateCheckInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  private invisibleMode: boolean = false;

  // Network error handling
  private retryAttempt: number = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private isConnected: boolean = true;
  private lastKnownStatus: UserStatus = 'offline';
  private lastKnownStatusTime: number = Date.now();
  private updateQueue: QueuedUpdate[] = [];
  private consecutiveFailures: number = 0;

  constructor(userId: string, config?: Partial<StatusConfig>) {
    this.userId = userId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connectionId = this.generateConnectionId();
  }

  /**
   * Generate unique connection ID for this session
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Detect device type from user agent
   */
  private detectDevice(): 'web' | 'mobile' | 'desktop' {
    const ua = navigator.userAgent.toLowerCase();
    if (/mobile|android|iphone|ipad|tablet/.test(ua)) {
      return 'mobile';
    }
    return 'web';
  }

  /**
   * Initialize presence tracking
   * Setup Firebase connection, onDisconnect handlers, và state check interval
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('StatusManager already initialized');
      return;
    }

    try {
      await this.initializeWithRetry();
      this.initialized = true;
      console.log(`StatusManager initialized for user ${this.userId}`);
    } catch (error) {
      console.error('Failed to initialize StatusManager after retries:', error);
      throw error;
    }
  }

  /**
   * Initialize with retry logic
   */
  private async initializeWithRetry(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        // Setup connection tracking
        const connectionRef = ref(realtimeDb, `presence/${this.userId}/connections/${this.connectionId}`);
        const connectionData: ConnectionInfo = {
          device: this.detectDevice(),
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
        };

        // Write connection data
        await set(connectionRef, connectionData);

        // Setup auto-cleanup on disconnect
        await onDisconnect(connectionRef).remove();

        // Setup status auto-offline on disconnect
        const statusRef = ref(realtimeDb, `presence/${this.userId}/status`);
        await onDisconnect(statusRef).set('offline');

        // Set initial online status
        await this.setStatus('online');

        // Start state check interval
        this.stateCheckInterval = setInterval(() => {
          this.checkAndUpdateState();
        }, 10000); // Check every 10 seconds

        // Listen to network status
        this.setupNetworkListeners();

        // Reset retry count on success
        this.retryAttempt = 0;
        this.consecutiveFailures = 0;
        this.isConnected = true;

        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Initialization attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed:`, error);

        // Don't retry if it's an auth error
        if (this.isAuthError(error)) {
          throw error;
        }

        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = calculateBackoffDelay(attempt, RETRY_CONFIG);
          console.log(`Retrying initialization in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Failed to initialize after retries');
  }

  /**
   * Setup network status listeners
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  /**
   * Handle network online event
   */
  private handleOnline = async () => {
    console.log('Network connection restored');
    this.isConnected = true;
    this.retryAttempt = 0;
    this.consecutiveFailures = 0;

    // Flush queued updates
    await this.flushUpdateQueue();

    // Resume normal status updates
    this.checkAndUpdateState();
  };

  /**
   * Handle network offline event
   */
  private handleOffline = () => {
    console.log('Network connection lost');
    this.isConnected = false;

    // Store last known status
    this.lastKnownStatus = this.currentStatus;
    this.lastKnownStatusTime = Date.now();
  };

  /**
   * Flush queued updates when network is restored
   */
  private async flushUpdateQueue(): Promise<void> {
    if (this.updateQueue.length === 0) {
      return;
    }

    console.log(`Flushing ${this.updateQueue.length} queued updates`);

    // Process queue in order
    const queue = [...this.updateQueue];
    this.updateQueue = [];

    for (const update of queue) {
      try {
        await this.processQueuedUpdate(update);
      } catch (error) {
        console.error('Failed to process queued update:', error);
        // Re-queue failed updates
        this.updateQueue.push(update);
      }
    }
  }

  /**
   * Process a single queued update
   */
  private async processQueuedUpdate(update: QueuedUpdate): Promise<void> {
    switch (update.type) {
      case 'status':
        await this.setStatus(update.data as UserStatus);
        break;
      case 'activity':
        this.lastActivityTime = update.data;
        await this.writeStatusToDatabase();
        break;
      case 'invisibleMode':
        await this.setInvisibleMode(update.data);
        break;
      default:
        console.warn('Unknown update type:', update.type);
    }
  }

  /**
   * Queue an update when offline
   */
  private queueUpdate(type: QueuedUpdate['type'], data: any): void {
    this.updateQueue.push({
      type,
      data,
      timestamp: Date.now(),
    });

    // Limit queue size to prevent memory issues
    const MAX_QUEUE_SIZE = 50;
    if (this.updateQueue.length > MAX_QUEUE_SIZE) {
      this.updateQueue.shift(); // Remove oldest
    }
  }

  /**
   * Check if we should maintain last known status (within 2 minute grace period)
   */
  private shouldMaintainLastKnownStatus(): boolean {
    const now = Date.now();
    const gracePeriodMs = 2 * 60 * 1000; // 2 minutes
    return (now - this.lastKnownStatusTime) < gracePeriodMs;
  }

  /**
   * Get connection status indicator
   */
  getConnectionStatus(): {
    connected: boolean;
    lastKnownStatus: UserStatus | null;
    queuedUpdates: number;
  } {
    return {
      connected: this.isConnected,
      lastKnownStatus: this.shouldMaintainLastKnownStatus() ? this.lastKnownStatus : null,
      queuedUpdates: this.updateQueue.length,
    };
  }

  /**
   * Check if error is authentication-related
   */
  private isAuthError(error: any): boolean {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || '';
    return (
      errorMessage.includes('auth') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('unauthorized') ||
      errorCode === 'PERMISSION_DENIED' ||
      errorCode === 'UNAUTHENTICATED'
    );
  }

  /**
   * Check if error is permission-related
   */
  private isPermissionError(error: any): boolean {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || '';
    return (
      errorMessage.includes('permission denied') ||
      errorMessage.includes('insufficient permissions') ||
      errorCode === 'PERMISSION_DENIED'
    );
  }

  /**
   * Handle authentication error
   */
  private handleAuthError(error: any): void {
    console.error('Authentication error detected:', error);
    
    // Suspend presence tracking
    this.suspendTracking();
    
    // Emit event to trigger re-authentication flow
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statusAuthError', {
        detail: {
          userId: this.userId,
          error: error?.message || String(error),
          timestamp: Date.now(),
        }
      }));
    }
  }

  /**
   * Suspend presence tracking until re-authenticated
   */
  private suspendTracking(): void {
    console.log('Suspending presence tracking due to auth error');
    
    // Stop state check interval
    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
      this.stateCheckInterval = null;
    }

    // Clear update timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    // Mark as not initialized
    this.initialized = false;
  }

  /**
   * Handle permission denied error
   */
  private handlePermissionError(error: any): void {
    console.error('Permission denied error detected:', error);
    
    // Cache permission denial to avoid repeated attempts
    this.cachePermissionDenial();
    
    // Log unauthorized access attempt
    this.logUnauthorizedAccess(error);
    
    // Emit event for monitoring
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statusPermissionError', {
        detail: {
          userId: this.userId,
          error: error?.message || String(error),
          timestamp: Date.now(),
        }
      }));
    }
  }

  /**
   * Cache permission denial to avoid repeated checks
   */
  private cachePermissionDenial(): void {
    const cacheKey = `permission_denied_${this.userId}`;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        userId: this.userId,
      }));
    } catch (error) {
      console.error('Failed to cache permission denial:', error);
    }
  }

  /**
   * Check if permission denial is cached
   */
  private isPermissionDenialCached(): boolean {
    const cacheKey = `permission_denied_${this.userId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return false;

      const data = JSON.parse(cached);
      const cacheTTL = 5 * 60 * 1000; // 5 minutes
      return (Date.now() - data.timestamp) < cacheTTL;
    } catch (error) {
      return false;
    }
  }

  /**
   * Log unauthorized access attempt
   */
  private logUnauthorizedAccess(error: any): void {
    console.warn(`⚠️ Unauthorized access attempt for user ${this.userId}`, {
      error: error?.message || String(error),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
    
    // In production, this would send to a monitoring service
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update activity timestamp (called from Activity Detector)
   */
  updateActivity(): void {
    this.lastActivityTime = Date.now();

    // If currently away or offline, transition back to online
    if (this.currentStatus !== 'online') {
      this.setStatus('online');
    }

    // Debounced database write
    this.scheduleStatusUpdate();
  }

  /**
   * Schedule debounced status update to Firebase
   */
  private scheduleStatusUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(() => {
      this.writeStatusToDatabase();
    }, this.config.updateDebounceMs);
  }

  /**
   * Write current status to Firebase with retry logic
   */
  private async writeStatusToDatabase(): Promise<void> {
    if (!this.initialized || this.invisibleMode) {
      return;
    }

    // If offline, queue the update instead
    if (!this.isConnected) {
      this.queueUpdate('activity', Date.now());
      return;
    }

    try {
      const presenceRef = ref(realtimeDb, `presence/${this.userId}`);
      const updates = {
        status: this.currentStatus,
        lastActive: Date.now(),
      };

      await this.writeWithRetry(presenceRef, updates);
      
      // Reset failure count on success
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      console.error(`Failed to write status to database (failure #${this.consecutiveFailures}):`, error);

      // Alert on consecutive failures
      if (this.consecutiveFailures >= 3) {
        this.handleConsecutiveFailures();
      }

      // Queue update if network error
      if (this.isNetworkError(error)) {
        this.queueUpdate('activity', Date.now());
      }
    }
  }

  /**
   * Write data with exponential backoff retry
   */
  private async writeWithRetry(dbRef: any, data: any, attempt: number = 0): Promise<void> {
    try {
      await set(dbRef, data);
    } catch (error) {
      if (attempt < RETRY_CONFIG.maxRetries && this.isRetryableError(error)) {
        const delay = calculateBackoffDelay(attempt, RETRY_CONFIG);
        console.log(`Retrying write in ${delay}ms... (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
        
        await this.sleep(delay);
        return this.writeWithRetry(dbRef, data, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is a network error
   */
  private isNetworkError(error: any): boolean {
    const errorMessage = error?.message || String(error);
    return (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('offline')
    );
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Don't retry auth or permission errors
    if (this.isAuthError(error) || this.isPermissionError(error)) {
      return false;
    }
    // Retry network errors
    return this.isNetworkError(error);
  }

  /**
   * Handle consecutive failures (3+)
   */
  private handleConsecutiveFailures(): void {
    console.error(`⚠️ ALERT: ${this.consecutiveFailures} consecutive status update failures for user ${this.userId}`);
    
    // Emit event for monitoring system
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statusUpdateFailure', {
        detail: {
          userId: this.userId,
          failureCount: this.consecutiveFailures,
          timestamp: Date.now(),
        }
      }));
    }
  }

  /**
   * Check current state and transition if needed based on idle time
   */
  private checkAndUpdateState(): void {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivityTime;

    let newStatus: UserStatus = this.currentStatus;

    // State machine transitions
    if (timeSinceActivity >= this.config.offlineThresholdMs) {
      newStatus = 'offline';
    } else if (timeSinceActivity >= this.config.idleThresholdMs) {
      newStatus = 'away';
    } else {
      newStatus = 'online';
    }

    // Only update if status changed
    if (newStatus !== this.currentStatus) {
      this.setStatus(newStatus);
    }
  }

  /**
   * Manually set user status with error handling
   */
  async setStatus(status: UserStatus): Promise<void> {
    if (this.invisibleMode && status !== 'offline') {
      // In invisible mode, always show offline to others
      status = 'offline';
    }

    this.currentStatus = status;

    if (!this.initialized) {
      return;
    }

    // If offline, queue the update
    if (!this.isConnected) {
      this.queueUpdate('status', status);
      return;
    }

    try {
      const statusRef = ref(realtimeDb, `presence/${this.userId}/status`);
      await this.writeWithRetry(statusRef, status);

      const lastActiveRef = ref(realtimeDb, `presence/${this.userId}/lastActive`);
      await this.writeWithRetry(lastActiveRef, Date.now());

      // Reset failure count on success
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      console.error('Failed to set status:', error);

      // Handle auth errors specifically
      if (this.isAuthError(error)) {
        this.handleAuthError(error);
        throw error;
      }

      // Handle permission errors
      if (this.isPermissionError(error)) {
        this.handlePermissionError(error);
        throw error;
      }

      // Alert on consecutive failures
      if (this.consecutiveFailures >= 3) {
        this.handleConsecutiveFailures();
      }

      // Queue update if network error
      if (this.isNetworkError(error)) {
        this.queueUpdate('status', status);
      }

      throw error;
    }
  }

  /**
   * Enable or disable invisible mode
   * When enabled, user appears offline to others but can still see others' status
   */
  async setInvisibleMode(enabled: boolean): Promise<void> {
    this.invisibleMode = enabled;

    try {
      const invisibleRef = ref(realtimeDb, `presence/${this.userId}/settings/invisibleMode`);
      await set(invisibleRef, enabled);

      // Update status to reflect invisible mode
      if (enabled) {
        await this.setStatus('offline');
      } else {
        // Resume normal status based on activity
        this.checkAndUpdateState();
      }
    } catch (error) {
      console.error('Failed to set invisible mode:', error);
      throw error;
    }
  }

  /**
   * Get current connection ID
   */
  getConnectionId(): string {
    return this.connectionId;
  }

  /**
   * Cleanup and disconnect
   */
  destroy(): void {
    // Clear intervals
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
      this.stateCheckInterval = null;
    }

    // Remove connection from Firebase
    if (this.initialized) {
      const connectionRef = ref(realtimeDb, `presence/${this.userId}/connections/${this.connectionId}`);
      remove(connectionRef).catch(error => {
        console.error('Failed to remove connection:', error);
      });

      // Set status to offline
      this.setStatus('offline').catch(error => {
        console.error('Failed to set offline status:', error);
      });
    }

    this.initialized = false;
    console.log(`StatusManager destroyed for user ${this.userId}`);
  }
}
