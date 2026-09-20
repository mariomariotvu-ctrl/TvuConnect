import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { app } from '../firebase';
import { doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '@/utils/logger';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
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
      let token: string;
      try {
        token = vapidKey
          ? await getToken(messaging, { vapidKey, serviceWorkerRegistration })
          : await getToken(messaging, { serviceWorkerRegistration });
      } catch (customKeyError) {
        // Older deployments may still carry a VAPID key from another Firebase
        // project. Firebase's project-default key is a safe compatibility path
        // until the project owner generates and deploys its own Web Push key.
        logger.warn('Custom Web Push key was rejected; retrying with Firebase default.', customKeyError);
        token = await getToken(messaging, { serviceWorkerRegistration });
      }
    
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
