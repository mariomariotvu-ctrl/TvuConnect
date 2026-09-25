import { deleteToken as deleteMessagingToken, getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { app } from '../firebase';
import { doc, setDoc, serverTimestamp, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '@/utils/logger';
import { requireRuntimeFeature } from '@/config/runtimeConfig';

// Keep the production project's current public VAPID key in source as a safe
// fallback. VAPID public keys are intentionally distributed to browsers. The
// project-specific value takes precedence so a stale Vercel variable cannot
// keep producing registration 401 responses after key rotation.
const vapidKey = app.options.projectId === 'tvu-connect-1dc97'
  ? 'BLCU4Lud3c0u7wCLnJW3FGwk5X56ockE82T_7MZQwz-BGjPKMw48iMSqJ6VJ5ogWy6bI1J6gOpaZZZsh2QYBdec'
  : import.meta.env.VITE_FIREBASE_VAPID_KEY;
const TOKEN_RETRY_DELAY_MS = 5 * 60 * 1000;
const tokenRequests = new Map<string, Promise<string | null>>();

interface GetFCMTokenOptions {
  force?: boolean;
}

const getFailureStorageKey = (userId: string) =>
  `tvu-connect:fcm-token-retry-after:${app.options.projectId ?? 'default'}:${userId}`;

const isTokenRequestCoolingDown = (userId: string) => {
  try {
    const retryAfter = Number(sessionStorage.getItem(getFailureStorageKey(userId)) || 0);
    return retryAfter > Date.now();
  } catch {
    return false;
  }
};

const markTokenRequestFailed = (userId: string) => {
  try {
    sessionStorage.setItem(
      getFailureStorageKey(userId),
      String(Date.now() + TOKEN_RETRY_DELAY_MS)
    );
  } catch {
    // Storage may be unavailable in private browsing. The request still fails safely.
  }
};

const clearTokenRequestFailure = (userId: string) => {
  try {
    sessionStorage.removeItem(getFailureStorageKey(userId));
  } catch {
    // Nothing else is required when session storage is unavailable.
  }
};

// Initialize FCM
let messaging: Messaging | null = null;
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
} catch (error) {
  logger.warn('FCM is unavailable in this browser:', error);
}

/**
 * Request notification permission và lấy FCM token
 */
export const requestNotificationPermission = async (userId: string): Promise<string | null> => {
  try {
    requireRuntimeFeature(
      'notificationsEnabled',
      'Thông báo đẩy đang được bảo trì. Bạn vẫn xem được thông báo trong ứng dụng.',
    );
    // Check if notifications supported
    if (!('Notification' in window)) {
      logger.log('Browser không hỗ trợ notifications');
      return null;
    }

    // Check if already granted
    if (Notification.permission === 'granted') {
      return await getFCMToken(userId, { force: true });
    }

    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      logger.log('✅ Notification permission granted');
      return await getFCMToken(userId, { force: true });
    } else {
      logger.log('❌ Notification permission denied');
      return null;
    }
  } catch (error) {
    console.error('Error requesting permission:', error);
    return null;
  }
};

/**
 * Lấy FCM token và lưu vào Firestore
 */
export const getFCMToken = async (
  userId: string,
  options: GetFCMTokenOptions = {}
): Promise<string | null> => {
  if (!messaging) {
    logger.log('FCM not initialized');
    return null;
  }

  if (!options.force && isTokenRequestCoolingDown(userId)) {
    return null;
  }

  const currentRequest = tokenRequests.get(userId);
  if (currentRequest) return currentRequest;

  const request = (async () => {
    try {
      // Use the explicit app worker instead of relying on SDK timing/default
      // registration. This is important on the first mobile visit.
      const serviceWorkerRegistration = await navigator.serviceWorker.ready;
      if (!vapidKey) {
        logger.warn('Web Push is not configured for this deployment.');
        markTokenRequestFailed(userId);
        return null;
      }

      // A VAPID public key belongs to exactly one Firebase project. Retrying
      // with Firebase's legacy default key after a 401 only creates a second
      // failing request and leaves the browser with a misleading error trail.
      // Once the project key is configured, the SDK rotates stale local token
      // metadata automatically when this value changes.
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
    
      if (token) {
        clearTokenRequestFailure(userId);
        logger.log('✅ FCM Token:', token.substring(0, 20) + '...');
      
        // Save to Firestore
        await saveFCMToken(userId, token);
      
        return token;
      }

      logger.log('No registration token available');
      return null;
    } catch (error) {
      markTokenRequestFailed(userId);
      logger.warn('FCM token registration is temporarily unavailable:', error);
      return null;
    } finally {
      tokenRequests.delete(userId);
    }
  })();

  tokenRequests.set(userId, request);
  return request;
};

/**
 * Lưu FCM token vào Firestore
 */
const saveFCMToken = async (userId: string, token: string) => {
  try {
    const tokenRef = doc(db, `users/${userId}/fcmTokens/${token}`);
    
    await setDoc(tokenRef, {
      token,
      platform: 'web',
      deviceInfo: navigator.userAgent,
      createdAt: serverTimestamp(),
      lastUsed: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
      deleted: false
    }, { merge: true });
    
    logger.log('✅ FCM token saved to Firestore');
  } catch (error) {
    console.error('Error saving FCM token:', error);
  }
};

/**
 * Setup foreground message listener
 */
export const setupForegroundListener = (
  onNotification: (payload: any) => void
): (() => void) => {
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, (payload) => {
    logger.log('📬 Foreground message received:', payload);
    onNotification(payload);
  });

  return unsubscribe;
};

/**
 * Delete FCM token (khi logout)
 */
export const deleteFCMToken = async (userId: string, token: string) => {
  try {
    if (messaging) await deleteMessagingToken(messaging).catch(() => false);
    const tokenRef = doc(db, `users/${userId}/fcmTokens/${token}`);
    await deleteDoc(tokenRef);
    logger.log('✅ FCM token deleted');
  } catch (error) {
    console.error('Error deleting FCM token:', error);
  }
};

/**
 * Check if notifications are supported
 */
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

/**
 * Get current notification permission status
 */
export const getNotificationPermission = (): NotificationPermission => {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
};
