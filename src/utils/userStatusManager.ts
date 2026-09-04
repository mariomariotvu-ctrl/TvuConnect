/**
 * User Status Manager
 * 
 * Quản lý trạng thái hoạt động người dùng (online/away/offline) với Firebase Realtime Database.
 * Implement state machine với idle và offline thresholds, multi-device connection tracking,
 * và privacy mode support.
 */

import { ref, set, onDisconnect, serverTimestamp, onValue, remove } from 'firebase/database';
import { realtimeDb } from '../firebase';
import { StatusMetrics, HealthStatus } from './statusMetrics';

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

/**
 * Mobile background state configuration
 */
const MOBILE_BACKGROUND_GRACE_MS = 5 * 60 * 1000;  // 5 minutes
const MOBILE_FOREGROUND_UPDATE_MS = 2000;            // 2 seconds
const LOW_BATTERY_THRESHOLD = 0.2;                   // 20%
const LOW_BATTERY_DEBOUNCE_MS = 5 * 60 * 1000;      // 5 minutes when low battery

/**
 * Stale data cleanup configuration (Requirements 4.5)
 */
const STALE_DATA_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;    // 24 hours

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

  // Auth error handling (Requirements 6.3)
  private isSuspended: boolean = false; // Tracking bị suspend do auth error

  // Permission error handling (Requirements 6.4)
  private permissionDeniedForWrite: boolean = false; // Write bị từ chối

  // Metrics tracking (Requirements 9.2, 9.3)
  private metrics: StatusMetrics = new StatusMetrics();

  // Debug mode (Requirements 9.4)
  private debugMode: boolean = false;

  // Mobile-specific state (Requirements 8.2, 8.3, 8.5)
  private isInBackground: boolean = false;
  private backgroundTimer: NodeJS.Timeout | null = null;
  private backgroundEnteredAt: number = 0;
  private isLowBattery: boolean = false;
  private batteryManager: any = null; // BatteryManager API

  // Cleanup job (Requirements 4.5)
  private cleanupInterval: NodeJS.Timeout | null = null;

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

      // Setup mobile-specific listeners (Requirements 8.2, 8.3, 8.5)
      this.setupMobileListeners();
      this.setupBatteryMonitoring();

      // Setup stale data cleanup job (Requirements 4.5)
      this.setupCleanupJob();

      console.log(`StatusManager initialized for user ${this.userId}`);
    } catch (error) {
      console.error('Failed to initialize StatusManager after retries:', error);
      throw error;
    }
  }

  /**
   * Setup mobile background/foreground detection using Page Visibility API
   * Requirements: 8.2, 8.3
   */
  private setupMobileListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  /**
   * Handle document visibility changes (background/foreground transitions)
   * Requirements: 8.2, 8.3
   */
  private handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;

    if (document.hidden) {
      // App went to background
      this.isInBackground = true;
      this.backgroundEnteredAt = Date.now();

      // Requirement 8.2: Maintain "online" status for 5 minutes before switching to "away"
      this.backgroundTimer = setTimeout(() => {
        if (this.isInBackground) {
          console.log('Mobile: Background grace period expired, switching to away');
          this.setStatus('away').catch(err => {
            console.error('Failed to set away status after background grace period:', err);
          });
        }
      }, MOBILE_BACKGROUND_GRACE_MS);

      console.log('Mobile: App went to background, grace period started');
    } else {
      // App returned to foreground
      this.isInBackground = false;

      // Clear background timer if still within grace period
      if (this.backgroundTimer) {
        clearTimeout(this.backgroundTimer);
        this.backgroundTimer = null;
      }

      // Requirement 8.3: Update status to "online" within 2 seconds when returning to foreground
      setTimeout(() => {
        console.log('Mobile: App returned to foreground, updating status to online');
        this.updateActivity();
      }, MOBILE_FOREGROUND_UPDATE_MS);
    }
  };

  /**
   * Setup battery monitoring to reduce update frequency when battery is low
   * Requirements: 8.5
   */
  private setupBatteryMonitoring(): void {
    if (typeof navigator === 'undefined') return;

    // Battery Status API
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.batteryManager = battery;
        this.handleBatteryChange();

        // Listen for battery level and charging status changes
        battery.addEventListener('levelchange', this.handleBatteryChange);
        battery.addEventListener('chargingchange', this.handleBatteryChange);
      }).catch((err: any) => {
        console.warn('Battery API not available:', err);
      });
    }
  }

  /**
   * Handle battery status changes - adjust debounce frequency when low battery
   * Requirements: 8.5
   */
  private handleBatteryChange = (): void => {
    if (!this.batteryManager) return;

    const level: number = this.batteryManager.level;
    const charging: boolean = this.batteryManager.charging;

    const wasLowBattery = this.isLowBattery;

    // Low battery = below threshold AND not charging
    this.isLowBattery = level <= LOW_BATTERY_THRESHOLD && !charging;

    if (this.isLowBattery !== wasLowBattery) {
      if (this.isLowBattery) {
        console.log(`Mobile: Low battery detected (${Math.round(level * 100)}%), reducing update frequency`);
      } else {
        console.log(`Mobile: Battery normal (${Math.round(level * 100)}%), resuming normal update frequency`);
      }
    }
  };

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
        this.metrics.resetConsecutiveFailures();
        this.isConnected = true;
        // Task 10.3: Clear suspended state on successful initialization
        this.isSuspended = false;
        this.permissionDeniedForWrite = false;

        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Initialization attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed:`, error);

        // Task 10.3: Don't retry auth errors - suspend tracking and propagate
        if (this.isAuthError(error)) {
          this.handleAuthError(error);
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
    this.metrics.resetConsecutiveFailures();

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
   * Task 10.3: Catches auth errors, triggers re-auth flow, suspends tracking
   */
  private handleAuthError(error: any): void {
    const errorMessage = error?.message || String(error);
    console.error(`AuthError: User not authenticated. UserId: ${this.userId}`, {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
    
    // Suspend presence tracking until re-authenticated
    this.suspendTracking();
    
    // Emit event to trigger re-authentication flow in the app
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statusAuthError', {
        detail: {
          userId: this.userId,
          error: errorMessage,
          timestamp: Date.now(),
        }
      }));
    }
  }

  /**
   * Suspend presence tracking until re-authenticated
   * Task 10.3: Sets isSuspended flag to block all subsequent writes
   */
  private suspendTracking(): void {
    console.log('Suspending presence tracking due to auth error');
    
    // Mark as suspended to block all subsequent Firebase writes
    this.isSuspended = true;

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
   * Task 10.4: Caches denial, logs attempt, emits monitoring event
   */
  private handlePermissionError(error: any): void {
    const errorMessage = error?.message || String(error);
    console.error(`PermissionError: Access denied to /presence/${this.userId}`, {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
    
    // Cache permission denial to avoid repeated attempts
    this.cachePermissionDenial();
    
    // Log unauthorized access attempt
    this.logUnauthorizedAccess(error);
    
    // Emit event for monitoring
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statusPermissionError', {
        detail: {
          userId: this.userId,
          error: errorMessage,
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
   * Task 10.4: Structured logging for security monitoring
   */
  private logUnauthorizedAccess(error: any): void {
    const logEntry = {
      event: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      userId: this.userId,
      path: `/presence/${this.userId}`,
      errorCode: error?.code || 'PERMISSION_DENIED',
      errorMessage: error?.message || String(error),
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };

    console.warn('⚠️ Unauthorized presence access attempt:', logEntry);
    
    // In production, this would send to a monitoring/security service
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

    this.debugLog('Activity recorded', {
      lastActivityTime: this.lastActivityTime,
      currentStatus: this.currentStatus,
    });

    // If currently away or offline, transition back to online
    if (this.currentStatus !== 'online') {
      this.setStatus('online');
    }

    // Debounced database write
    this.scheduleStatusUpdate();
  }

  /**
   * Schedule debounced status update to Firebase
   * Requirement 8.5: Use higher debounce when battery is low to minimize consumption
   */
  private scheduleStatusUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Adjust debounce interval based on battery status (Requirement 8.5)
    const debounceMs = this.isLowBattery
      ? LOW_BATTERY_DEBOUNCE_MS
      : this.config.updateDebounceMs;

    this.updateTimer = setTimeout(() => {
      this.writeStatusToDatabase();
    }, debounceMs);
  }

  /**
   * Write current status to Firebase with retry logic
   * Handles auth errors (Task 10.3) and permission denied (Task 10.4)
   */
  private async writeStatusToDatabase(): Promise<void> {
    if (!this.initialized || this.invisibleMode) {
      return;
    }

    // Task 10.3: Suspend tracking khi có auth error
    if (this.isSuspended) {
      console.log('StatusManager: Presence tracking suspended (auth error). Skipping write.');
      return;
    }

    // Task 10.4: Skip write nếu permission denial đã được cache
    if (this.permissionDeniedForWrite || this.isPermissionDenialCached()) {
      console.log('StatusManager: Permission denied (cached). Skipping write, returning offline status.');
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

      this.debugLog('Writing status to Firebase', { path: `presence/${this.userId}`, updates });

      const writeStartTime = Date.now();
      await this.writeWithRetry(presenceRef, updates);

      this.debugLog('Firebase write completed', {
        latencyMs: Date.now() - writeStartTime,
        status: this.currentStatus,
      });

      // Record latency on success (Requirements 9.2)
      this.metrics.recordUpdateLatency(writeStartTime);
      
      // Reset failure count on success
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      this.metrics.incrementFailedCount();
      console.error(`Failed to write status to database (failure #${this.consecutiveFailures}):`, error);

      // Task 10.3: Handle auth errors - suspend tracking và trigger re-auth
      if (this.isAuthError(error)) {
        this.handleAuthError(error);
        return; // Không throw - gracefully stop
      }

      // Task 10.4: Handle permission denied - cache và log, trả về default offline
      if (this.isPermissionError(error)) {
        this.permissionDeniedForWrite = true;
        this.handlePermissionError(error);
        return; // Không throw - silently degrade to offline
      }

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
   * Requirements: 9.1, 9.4 - Alert monitoring system sau 3 failures
   */
  private handleConsecutiveFailures(): void {
    console.error(`⚠️ ALERT: ${this.consecutiveFailures} consecutive status update failures for user ${this.userId}`);

    this.debugLog('Consecutive failures threshold reached', {
      consecutiveFailures: this.consecutiveFailures,
      userId: this.userId,
      timestamp: new Date().toISOString(),
    });

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
   * Enable or disable debug mode for detailed logging
   * Requirements: 9.4
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    console.log(`StatusManager: Debug mode ${enabled ? 'enabled' : 'disabled'} for user ${this.userId}`);
  }

  /**
   * Log debug message only when debugMode is enabled
   * Requirements: 9.4
   */
  private debugLog(message: string, data?: any): void {
    if (!this.debugMode) return;
    if (data !== undefined) {
      console.debug(`[StatusManager:${this.userId}] ${message}`, data);
    } else {
      console.debug(`[StatusManager:${this.userId}] ${message}`);
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
      this.debugLog('Status transition triggered', {
        from: this.currentStatus,
        to: newStatus,
        timeSinceActivityMs: timeSinceActivity,
      });
      this.setStatus(newStatus);
    }
  }

  /**
   * Manually set user status with error handling
   * Task 10.3: Catches auth errors and triggers re-authentication flow
   * Task 10.4: Returns default offline status on permission denied (no throw)
   */
  async setStatus(status: UserStatus): Promise<void> {
    if (this.invisibleMode && status !== 'offline') {
      // In invisible mode, always show offline to others
      status = 'offline';
    }

    // Task 10.3: Block writes when tracking is suspended due to auth error
    if (this.isSuspended) {
      console.log('StatusManager: Presence tracking suspended. Status update skipped.');
      return;
    }

    // Task 10.4: Block writes when permission has been denied
    if (this.permissionDeniedForWrite || this.isPermissionDenialCached()) {
      console.log('StatusManager: Permission denied (cached). Write blocked, returning default offline.');
      this.currentStatus = 'offline';
      return;
    }

    const prevStatus = this.currentStatus;
    this.currentStatus = status;

    this.debugLog('setStatus called', {
      from: prevStatus,
      to: status,
      invisibleMode: this.invisibleMode,
      initialized: this.initialized,
    });

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
      const writeStartTime = Date.now();
      await this.writeWithRetry(lastActiveRef, Date.now());

      // Record latency on success (Requirements 9.2)
      this.metrics.recordUpdateLatency(writeStartTime);

      // Reset failure count on success
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      this.metrics.incrementFailedCount();
      console.error('Failed to set status:', error);

      // Task 10.3: Handle auth errors - suspend tracking và trigger re-authentication flow
      if (this.isAuthError(error)) {
        this.handleAuthError(error);
        // Do NOT throw - suspend tracking gracefully, let caller continue
        return;
      }

      // Task 10.4: Handle permission denied - return default offline status, no throw
      if (this.isPermissionError(error)) {
        this.permissionDeniedForWrite = true;
        this.handlePermissionError(error);
        this.currentStatus = 'offline'; // Default to offline for unauthorized writes
        return; // Silently degrade - no throw
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
   * Task 10.3: Handles auth errors gracefully without throwing
   */
  async setInvisibleMode(enabled: boolean): Promise<void> {
    this.invisibleMode = enabled;

    // Task 10.3: Don't attempt write if suspended
    if (this.isSuspended) {
      console.log('StatusManager: Tracking suspended. Invisible mode change queued locally.');
      return;
    }

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
      // Task 10.3: Handle auth errors - suspend and don't throw
      if (this.isAuthError(error)) {
        this.handleAuthError(error);
        return;
      }
      console.error('Failed to set invisible mode:', error);
      throw error;
    }
  }

  /**
   * Resume presence tracking after re-authentication
   * Task 10.3: Called when user successfully re-authenticates
   */
  async resume(): Promise<void> {
    if (!this.isSuspended) {
      console.log('StatusManager: Not suspended, no need to resume.');
      return;
    }

    console.log('StatusManager: Resuming presence tracking after re-authentication.');
    
    // Clear suspended state and permission denial cache
    this.isSuspended = false;
    this.permissionDeniedForWrite = false;

    // Clear permission denial from localStorage
    const cacheKey = `permission_denied_${this.userId}`;
    try {
      localStorage.removeItem(cacheKey);
    } catch (_) {
      // Ignore localStorage errors
    }

    // Re-initialize
    await this.initialize();
  }

  /**
   * Get status for display purposes - returns 'offline' for unauthorized access
   * Task 10.4: Public method that gracefully handles permission denied
   */
  getStatusForDisplay(): UserStatus {
    if (this.permissionDeniedForWrite || this.isPermissionDenialCached()) {
      return 'offline'; // Default offline status for unauthorized
    }
    return this.currentStatus;
  }

  /**
   * Get current connection ID
   */
  getConnectionId(): string {
    return this.connectionId;
  }

  /**
   * Get metrics snapshot - expose health check endpoint (Requirements 9.2, 9.3)
   * Trả về metrics hiện tại bao gồm: onlineUsersCount, latency, failedUpdateCount,
   * consecutiveFailures, và trạng thái healthy của hệ thống.
   */
  getHealthStatus(): HealthStatus {
    return this.metrics.getHealthStatus();
  }

  /**
   * Remove stale presence data older than STALE_DATA_TTL_MS (Requirements 4.5)
   * - Removes individual connections with stale timestamps
   * - Removes entire presence node if lastActive > 7 days and status is offline
   */
  private async cleanupStaleData(): Promise<void> {
    try {
      const { get } = await import('firebase/database');
      const connectionsRef = ref(realtimeDb, `presence/${this.userId}/connections`);
      const connectionsSnap = await get(connectionsRef);

      if (connectionsSnap.exists()) {
        const connections = connectionsSnap.val() as Record<string, ConnectionInfo>;
        const staleThreshold = Date.now() - STALE_DATA_TTL_MS;

        for (const [connectionId, connection] of Object.entries(connections)) {
          if (connection.timestamp < staleThreshold) {
            await remove(ref(realtimeDb, `presence/${this.userId}/connections/${connectionId}`));
            console.log(`Cleanup: removed stale connection ${connectionId} for user ${this.userId}`);
          }
        }
      }

      // Check if entire presence node is stale (offline + lastActive > 7 days)
      const presenceRef = ref(realtimeDb, `presence/${this.userId}`);
      const { get: getPresence } = await import('firebase/database');
      const presenceSnap = await getPresence(presenceRef);

      if (presenceSnap.exists()) {
        const presence = presenceSnap.val() as UserPresence;
        const staleThreshold = Date.now() - STALE_DATA_TTL_MS;

        if (
          presence.status === 'offline' &&
          presence.lastActive != null &&
          presence.lastActive < staleThreshold
        ) {
          await remove(presenceRef);
          console.log(`Cleanup: removed stale presence node for user ${this.userId}`);
        }
      }
    } catch (error) {
      console.error(`Cleanup: error during stale data cleanup for user ${this.userId}:`, error);
      // Don't throw - cleanup failures should not affect normal operation
    }
  }

  /**
   * Setup background cleanup job that runs every 24 hours (Requirements 4.5)
   * Runs immediately on setup, then on a recurring interval
   */
  private setupCleanupJob(): void {
    // Run immediately
    this.cleanupStaleData();

    // Schedule recurring cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleData();
    }, CLEANUP_INTERVAL_MS);
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

    // Clear cleanup job interval (Requirements 4.5)
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear mobile background timer (Requirements 8.2, 8.3)
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }

    // Remove mobile event listeners
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    // Remove battery listeners (Requirement 8.5)
    if (this.batteryManager) {
      this.batteryManager.removeEventListener('levelchange', this.handleBatteryChange);
      this.batteryManager.removeEventListener('chargingchange', this.handleBatteryChange);
      this.batteryManager = null;
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
    this.isSuspended = false;
    this.permissionDeniedForWrite = false;
    console.log(`StatusManager destroyed for user ${this.userId}`);
  }
}
