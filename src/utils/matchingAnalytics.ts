import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Analytics event types for matching system
 */
export type AnalyticsEventType = 
  | 'matching_start'
  | 'profile_click'
  | 'message_sent'
  | 'filter_applied'
  | 'load_more';

/**
 * Analytics event structure stored in Firestore
 */
export interface AnalyticsEvent {
  userId: string;
  sessionId: string;
  timestamp: number;
  eventType: AnalyticsEventType;
  metadata?: Record<string, any>;
}

/**
 * Generate a unique session ID for tracking user sessions
 */
function generateSessionId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Session ID is generated once per page load
let currentSessionId: string | null = null;

/**
 * Get or create the current session ID
 */
function getSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
  }
  return currentSessionId;
}

/**
 * Track when a user starts matching
 * 
 * @param userId - The user's ID
 * @param matchingMode - The matching mode (lover, study, hobby, quick)
 * @param filters - Applied filters
 */
export async function trackMatchingStart(
  userId: string,
  matchingMode: string,
  filters?: Record<string, any>
): Promise<void> {
  try {
    const event: AnalyticsEvent = {
      userId,
      sessionId: getSessionId(),
      timestamp: Date.now(),
      eventType: 'matching_start',
      metadata: {
        matchingMode,
        filters: filters || {}
      }
    };

    // Fire-and-forget: don't await to avoid blocking UI
    addDoc(collection(db, 'matching_analytics'), event).catch(err => {
      console.error('Failed to track matching start:', err);
    });
  } catch (error) {
    console.error('Error in trackMatchingStart:', error);
  }
}

/**
 * Track when a user clicks on a profile
 * 
 * @param userId - The user's ID
 * @param clickedUserId - The clicked profile's user ID
 * @param matchScore - The match score
 */
export async function trackProfileClick(
  userId: string,
  clickedUserId: string,
  matchScore?: number
): Promise<void> {
  try {
    const event: AnalyticsEvent = {
      userId,
      sessionId: getSessionId(),
      timestamp: Date.now(),
      eventType: 'profile_click',
      metadata: {
        clickedUserId,
        matchScore
      }
    };

    // Fire-and-forget
    addDoc(collection(db, 'matching_analytics'), event).catch(err => {
      console.error('Failed to track profile click:', err);
    });
  } catch (error) {
    console.error('Error in trackProfileClick:', error);
  }
}

/**
 * Track when a user sends a message from matching
 * 
 * @param userId - The user's ID
 * @param recipientUserId - The recipient's user ID
 */
export async function trackMessageSent(
  userId: string,
  recipientUserId: string
): Promise<void> {
  try {
    const event: AnalyticsEvent = {
      userId,
      sessionId: getSessionId(),
      timestamp: Date.now(),
      eventType: 'message_sent',
      metadata: {
        recipientUserId
      }
    };

    // Fire-and-forget
    addDoc(collection(db, 'matching_analytics'), event).catch(err => {
      console.error('Failed to track message sent:', err);
    });
  } catch (error) {
    console.error('Error in trackMessageSent:', error);
  }
}

/**
 * Track when filters are applied
 * 
 * @param userId - The user's ID
 * @param filters - The applied filters
 */
export async function trackFilterApplied(
  userId: string,
  filters: Record<string, any>
): Promise<void> {
  try {
    const event: AnalyticsEvent = {
      userId,
      sessionId: getSessionId(),
      timestamp: Date.now(),
      eventType: 'filter_applied',
      metadata: {
        filters
      }
    };

    // Fire-and-forget
    addDoc(collection(db, 'matching_analytics'), event).catch(err => {
      console.error('Failed to track filter applied:', err);
    });
  } catch (error) {
    console.error('Error in trackFilterApplied:', error);
  }
}

/**
 * Track when user loads more profiles
 * 
 * @param userId - The user's ID
 * @param loadType - Type of load (history or results)
 */
export async function trackLoadMore(
  userId: string,
  loadType: 'history' | 'results'
): Promise<void> {
  try {
    const event: AnalyticsEvent = {
      userId,
      sessionId: getSessionId(),
      timestamp: Date.now(),
      eventType: 'load_more',
      metadata: {
        loadType
      }
    };

    // Fire-and-forget
    addDoc(collection(db, 'matching_analytics'), event).catch(err => {
      console.error('Failed to track load more:', err);
    });
  } catch (error) {
    console.error('Error in trackLoadMore:', error);
  }
}
