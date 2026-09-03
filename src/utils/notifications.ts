import { logger } from './logger';
/**
 * Show browser notification (foreground)
 */
export const showNotification = (
  title: string,
  options: NotificationOptions
): Notification | null => {
  try {
    if (!('Notification' in window)) {
      logger.log('Browser không hỗ trợ notifications');
      return null;
    }

    if (Notification.permission !== 'granted') {
      logger.log('Notification permission not granted');
      return null;
    }

    const notification = new Notification(title, options);
    
    // Auto close after 10 seconds
    setTimeout(() => notification.close(), 10000);
    
    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
};

/**
 * Format message notification
 */
export const formatMessageNotification = (
  senderName: string,
  senderAvatar: string,
  messageText: string,
  conversationId: string
): { title: string; options: NotificationOptions } => {
  // Truncate message to 100 chars
  const truncatedMessage = messageText.length > 100 
    ? messageText.substring(0, 100) + '...' 
    : messageText;

  return {
    title: senderName,
    options: {
      body: truncatedMessage,
      icon: senderAvatar || '/logo.png',
      badge: '/logo.png',
      tag: conversationId, // Same tag = replace previous notification
      requireInteraction: false,
      silent: false,
      data: {
        type: 'message',
        conversationId,
        url: `/messages?chat=${conversationId}`
      }
    }
  };
};

/**
 * Handle notification click
 */
export const handleNotificationClick = (notification: Notification) => {
  notification.close();
  
  const data = (notification as any).data;
  if (data && data.url) {
    window.focus();
    window.location.href = data.url;
  }
};

/**
 * Dismiss notification by tag
 */
export const dismissNotification = async (conversationId: string) => {
  if (!('serviceWorker' in navigator)) return;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({
      tag: conversationId
    });
    
    notifications.forEach(notification => notification.close());
    
    if (notifications.length > 0) {
      logger.log('✅ Dismissed', notifications.length, 'notifications for', conversationId);
    }
  } catch (error) {
    console.error('Error dismissing notifications:', error);
  }
};

/**
 * Request notification permission with better UX
 */
export const shouldShowPermissionPrompt = (): boolean => {
  if (!('Notification' in window)) return false;
  
  const permission = Notification.permission;
  const dismissed = localStorage.getItem('notification-banner-dismissed');
  const dismissedTime = localStorage.getItem('notification-banner-dismissed-time');
  
  // Don't show if already granted or permanently denied
  if (permission === 'granted' || permission === 'denied') return false;
  
  // Don't show if dismissed recently (within 7 days)
  if (dismissed && dismissedTime) {
    const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissed < 7) return false;
  }
  
  return permission === 'default';
};
