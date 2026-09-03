import { useState, useEffect } from 'react';
import { getPendingFeedbackMatches, dismissFeedbackPrompt } from '../utils/feedbackManager';

interface PendingMatch {
  matchId: string;
  matchedUserId: string;
  matchedUserName: string;
  matchedAt: Date;
}

export const useFeedbackPrompt = (userId: string) => {
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [currentMatch, setCurrentMatch] = useState<PendingMatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPendingMatches();
  }, [userId]);

  const loadPendingMatches = async () => {
    setIsLoading(true);
    try {
      const matches = await getPendingFeedbackMatches(userId);
      setPendingMatches(matches);
      
      // Show first pending match
      if (matches.length > 0) {
        setCurrentMatch(matches[0]);
      }
    } catch (error) {
      console.error('Error loading pending matches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissCurrent = () => {
    if (currentMatch) {
      dismissFeedbackPrompt(currentMatch.matchId);
      
      // Move to next match
      const remaining = pendingMatches.filter(m => m.matchId !== currentMatch.matchId);
      setPendingMatches(remaining);
      setCurrentMatch(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const completeCurrent = () => {
    if (currentMatch) {
      // Move to next match
      const remaining = pendingMatches.filter(m => m.matchId !== currentMatch.matchId);
      setPendingMatches(remaining);
      setCurrentMatch(remaining.length > 0 ? remaining[0] : null);
    }
  };

  return {
    currentMatch,
    pendingCount: pendingMatches.length,
    isLoading,
    dismissCurrent,
    completeCurrent,
    reload: loadPendingMatches
  };
};
