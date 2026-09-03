/**
 * Firestore Query Limits Configuration
 * 
 * Centralized configuration for all Firestore query limits across the application.
 * Optimized for performance and reduced Firestore reads.
 * 
 * Task 2.1: Create QUERY_LIMITS configuration constants
 * Requirements: 2.1, 2.2
 */

export const QUERY_LIMITS = {
  // Places - Task 2.1
  // Tăng giới hạn để tải đủ toàn bộ địa điểm (trước: 30/50, nay: 150/300)
  PLACES_MOBILE: 150,
  PLACES_DESKTOP: 300,
  
  // Messages - Task 2.2
  MESSAGES_INITIAL: 50,
  MESSAGES_LOAD_MORE: 30,
  
  // Check-ins
  CHECKINS_MOBILE: 30,
  CHECKINS_DESKTOP: 50,
  
  // Events
  EVENTS_MOBILE: 5,
  EVENTS_DESKTOP: 10,
  
  // Profiles (Matching)
  PROFILES_MOBILE: 10,
  PROFILES_DESKTOP: 20,
  
  // Posts
  POSTS_INITIAL: 20,
  POSTS_LOAD_MORE: 10,
  
  // Comments
  COMMENTS_INITIAL: 20,
  COMMENTS_LOAD_MORE: 10,
  
  // Conversations
  CONVERSATIONS_INITIAL: 30,
  
  // Notifications
  NOTIFICATIONS_INITIAL: 20,
  NOTIFICATIONS_LOAD_MORE: 10,
} as const;

/**
 * Helper function to get appropriate limit based on device type
 */
export const getQueryLimit = (
  mobileLimit: number,
  desktopLimit: number,
  isMobile: boolean
): number => {
  return isMobile ? mobileLimit : desktopLimit;
};

/**
 * Helper function to detect mobile device
 */
export const isMobileDevice = (): boolean => {
  return window.innerWidth < 768;
};
