/**
 * usePresenceManager Hook
 * 
 * Wire StatusManager với Activity Detector. Initialize StatusManager khi user
 * authenticates, connect activity events đến status updates, setup lifecycle management.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4 (Task 14.1)
 */

import { useEffect, useRef } from 'react';
import { StatusManager } from '../utils/userStatusManager';
import { useActivityDetector } from './useActivityDetector';

interface PresenceManagerOptions {
  /** Enable debug mode for detailed logging */
  debugMode?: boolean;
}

/**
 * Hook quản lý presence lifecycle cho authenticated user.
 * 
 * - Tạo StatusManager instance khi userId có
 * - Connect useActivityDetector → statusManager.updateActivity()
 * - Cleanup khi userId thay đổi hoặc component unmount
 * 
 * @param userId - Authenticated user ID (null/undefined = không init)
 * @param options - Optional config
 */
export function usePresenceManager(
  userId: string | null | undefined,
  options: PresenceManagerOptions = {}
): void {
  const { debugMode = false } = options;
  const statusManagerRef = useRef<StatusManager | null>(null);

  // Activity detector - throttle 30s (default)
  const { lastActivity } = useActivityDetector();
  const prevLastActivityRef = useRef<number>(lastActivity);

  // --- Initialize / cleanup StatusManager khi userId thay đổi ---
  useEffect(() => {
    if (!userId) {
      // Không có user → cleanup nếu có instance cũ
      if (statusManagerRef.current) {
        statusManagerRef.current.destroy();
        statusManagerRef.current = null;
      }
      return;
    }

    // Tạo StatusManager mới cho userId này
    const manager = new StatusManager(userId);

    if (debugMode) {
      manager.setDebugMode(true);
    }

    statusManagerRef.current = manager;

    // Initialize async
    manager.initialize().catch((err) => {
      console.error('[usePresenceManager] Failed to initialize StatusManager:', err);
    });

    // Cleanup khi userId đổi hoặc unmount
    return () => {
      manager.destroy();
      statusManagerRef.current = null;
    };
  }, [userId, debugMode]);

  // --- Wire activity events → statusManager.updateActivity() ---
  useEffect(() => {
    if (!statusManagerRef.current) return;
    if (lastActivity === prevLastActivityRef.current) return;

    // Activity mới detected → notify StatusManager
    prevLastActivityRef.current = lastActivity;
    statusManagerRef.current.updateActivity();
  }, [lastActivity]);

  // --- Expose getHealthStatus qua window trong dev mode ---
  useEffect(() => {
    if (!import.meta.env.DEV || !statusManagerRef.current) return;

    (window as any).__presenceManager = statusManagerRef.current;

    return () => {
      delete (window as any).__presenceManager;
    };
  }, [userId]);
}

export default usePresenceManager;
