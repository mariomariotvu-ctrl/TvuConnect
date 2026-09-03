import { db, collection, query, where, getDocs, limit as firestoreLimit } from '../firebase';

// Feature flag to temporarily disable feedback system to reduce Firestore reads
const FEEDBACK_ENABLED = false;

const FEEDBACK_PROMPT_DELAY = 24 * 60 * 60 * 1000; // 24 hours
const FEEDBACK_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
const FEEDBACK_REMINDER_DELAY = 7 * 24 * 60 * 60 * 1000; // 7 days

interface MatchRecord {
  matchId: string;
  matchedUserId: string;
  matchedUserName: string;
  matchedAt: Date;
}

/**
 * Check if user should see feedback prompt for a match
 */
export const shouldShowFeedbackPrompt = async (
  userId: string,
  matchId: string,
  matchedAt: Date
): Promise<boolean> => {
  const now = Date.now();
  const matchTime = matchedAt.getTime();
  
  // Check if match is too old (>30 days)
  if (now - matchTime > FEEDBACK_EXPIRY) {
    return false;
  }
  
  // Check if 24 hours have passed
  if (now - matchTime < FEEDBACK_PROMPT_DELAY) {
    return false;
  }
  
  // Check if feedback already exists
  const feedbackQuery = query(
    collection(db, 'matchFeedback'),
    where('matchId', '==', matchId),
    where('userId', '==', userId),
    firestoreLimit(1)
  );
  
  const feedbackSnapshot = await getDocs(feedbackQuery);
  if (!feedbackSnapshot.empty) {
    return false; // Already submitted feedback
  }
  
  // Check if user dismissed the prompt recently
  const dismissedKey = `feedback_dismissed_${matchId}`;
  const dismissedTime = localStorage.getItem(dismissedKey);
  
  if (dismissedTime) {
    const timeSinceDismissed = now - parseInt(dismissedTime);
    if (timeSinceDismissed < FEEDBACK_REMINDER_DELAY) {
      return false; // Dismissed recently, wait 7 days
    }
  }
  
  return true;
};

/**
 * Get pending feedback matches for a user
 */
export const getPendingFeedbackMatches = async (
  userId: string
): Promise<MatchRecord[]> => {
  // Feature flag: Return empty array if feedback system is disabled
  if (!FEEDBACK_ENABLED) {
    return [];
  }

  try {
    // Get all matches for this user
    const matchesQuery = query(
      collection(db, 'matches'),
      where('userUid', '==', userId)
    );
    
    const matchesSnapshot = await getDocs(matchesQuery);
    const pendingMatches: MatchRecord[] = [];
    
    for (const doc of matchesSnapshot.docs) {
      const data = doc.data();
      const matchedAt = data.matchedAt?.toDate() || new Date();
      
      const shouldShow = await shouldShowFeedbackPrompt(
        userId,
        doc.id,
        matchedAt
      );
      
      if (shouldShow) {
        pendingMatches.push({
          matchId: doc.id,
          matchedUserId: data.matchedUid,
          matchedUserName: data.matchedUserName || 'Người dùng',
          matchedAt
        });
      }
    }
    
    return pendingMatches;
  } catch (error) {
    console.error('Error getting pending feedback matches:', error);
    return [];
  }
};

/**
 * Mark feedback prompt as dismissed
 */
export const dismissFeedbackPrompt = (matchId: string): void => {
  const dismissedKey = `feedback_dismissed_${matchId}`;
  localStorage.setItem(dismissedKey, Date.now().toString());
};

/**
 * Check if user has already submitted feedback for a match
 */
export const hasFeedbackForMatch = async (
  userId: string,
  matchId: string
): Promise<boolean> => {
  try {
    const feedbackQuery = query(
      collection(db, 'matchFeedback'),
      where('matchId', '==', matchId),
      where('userId', '==', userId),
      firestoreLimit(1)
    );
    
    const feedbackSnapshot = await getDocs(feedbackQuery);
    return !feedbackSnapshot.empty;
  } catch (error) {
    console.error('Error checking feedback:', error);
    return false;
  }
};
