import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { app } from '../firebase';
import { doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '@/utils/logger';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Initialize FCM
let messaging: Messaging | null = null;
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.error('FCM not supported:', error);
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
      return await getFCMToken(userId);
    }

    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      logger.log('✅ Notification permission granted');
      return await getFCMToken(userId);
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
export const getFCMToken = async (userId: string): Promise<string | null> => {
  try {
    if (!messaging) {
      logger.log('FCM not initialized');
      return null;
    }

    if (!vapidKey) {
      console.error('VAPID key not configured');
      return null;
    }

    // Get token
    const token = await getToken(messaging, { vapidKey });
    
    if (token) {
      logger.log('✅ FCM Token:', token.substring(0, 20) + '...');
      
      // Save to Firestore
      await saveFCMToken(userId, token);
      
      return token;
    } else {
      logger.log('No registration token available');
      return null;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
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
