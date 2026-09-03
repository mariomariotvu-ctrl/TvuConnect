import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { dismissNotification } from './notifications';

/**
 * Listen for read status changes and dismiss notifications
 */
export const setupReadStatusSync = (
  conversationId: string,
  userId: string
): (() => void) => {
  const conversationRef = doc(db, 'conversations', conversationId);
  
  const unsubscribe = onSnapshot(conversationRef, (snap) => {
    if (!snap.exists()) return;
    
    const data = snap.data();
    const lastRead = data.lastRead?.[userId];
    
    if (lastRead) {
      // Dismiss notification for this conversation
      dismissNotification(conversationId);
    }
  });
  
  return unsubscribe;
};

/**
 * Setup sync for all active conversations
 */
export const setupAllConversationsSync = (
  conversationIds: string[],
  userId: string
): (() => void) => {
  const unsubscribes = conversationIds.map(conversationId => 
    setupReadStatusSync(conversationId, userId)
  );
  
  // Return cleanup function
  return () => {
    unsubscribes.forEach(unsub => unsub());
  };
};
