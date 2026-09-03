import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Configuration for Activity Detector
 */
interface ActivityDetectorConfig {
  throttleMs: number;        // Default: 30000 (30s)
  events: string[];          // ['mousemove', 'keydown', 'touchstart', 'click']
  multiTabSync: boolean;     // Default: true
}

/**
 * Return type for Activity Detector Hook
 */
interface ActivityDetectorHook {
  lastActivity: number;      // Timestamp of last activity
  isActive: boolean;         // Current activity state
  resetActivity: () => void; // Manual reset
}

const DEFAULT_CONFIG: ActivityDetectorConfig = {
  throttleMs: 30000, // 30 seconds
  events: ['mousemove', 'keydown', 'keypress', 'click', 'touchstart', 'touchmove', 'scroll'],
  multiTabSync: true,
};

const STORAGE_KEY = 'user_activity_timestamp';

/**
 * useActivityDetector Hook
 * 
 * Phát hiện hoạt động của người dùng qua events (mousemove, keydown, click, touchstart, scroll)
 * với throttling để tối ưu performance.
 * 
 * Features:
 * - Throttled event detection (default 30s)
 * - Multi-tab activity sync via localStorage
 * - Auto cleanup listeners on unmount
 * 
 * Requirements: 1.1, 1.5, 7.1, 8.1
 * 
 * @param config - Configuration options
 * @returns ActivityDetectorHook
 */
export function useActivityDetector(
  config: Partial<ActivityDetectorConfig> = {}
): ActivityDetectorHook {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [isActive, setIsActive] = useState<boolean>(true);
  
  // Refs to track throttling
  const lastUpdateRef = useRef<number>(0);
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Throttled activity handler
   * Updates lastActivity timestamp at most once per throttleMs
   */
  const handleActivity = useCallback(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Skip if within throttle window
    if (timeSinceLastUpdate < finalConfig.throttleMs) {
      return;
    }

    // Update timestamp
    lastUpdateRef.current = now;
    setLastActivity(now);
    setIsActive(true);

    // Sync to localStorage for multi-tab support
    if (finalConfig.multiTabSync) {
      try {
        localStorage.setItem(STORAGE_KEY, now.toString());
      } catch (error) {
        console.error('[ActivityDetector] Failed to sync to localStorage:', error);
      }
    }
  }, [finalConfig.throttleMs, finalConfig.multiTabSync]);

  /**
   * Manual reset function
   */
  const resetActivity = useCallback(() => {
    const now = Date.now();
    lastUpdateRef.current = now;
    setLastActivity(now);
    setIsActive(true);
    
    if (finalConfig.multiTabSync) {
      try {
        localStorage.setItem(STORAGE_KEY, now.toString());
      } catch (error) {
        console.error('[ActivityDetector] Failed to reset activity:', error);
      }
    }
  }, [finalConfig.multiTabSync]);

  /**
   * Handle localStorage changes from other tabs
   */
  const handleStorageChange = useCallback((event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      const timestamp = parseInt(event.newValue, 10);
      if (!isNaN(timestamp) && timestamp > lastActivity) {
        setLastActivity(timestamp);
        setIsActive(true);
      }
    }
  }, [lastActivity]);

  /**
   * Setup event listeners
   */
  useEffect(() => {
    const events = finalConfig.events;

    // Attach activity listeners
    events.forEach(eventType => {
      document.addEventListener(eventType, handleActivity, { passive: true });
    });

    // Multi-tab sync listener
    if (finalConfig.multiTabSync) {
      window.addEventListener('storage', handleStorageChange);
    }

    // Cleanup function
    return () => {
      events.forEach(eventType => {
        document.removeEventListener(eventType, handleActivity);
      });

      if (finalConfig.multiTabSync) {
        window.removeEventListener('storage', handleStorageChange);
      }

      // Clear throttle timer if exists
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, [finalConfig.events, finalConfig.multiTabSync, handleActivity, handleStorageChange]);

  return {
    lastActivity,
    isActive,
    resetActivity,
  };
}
