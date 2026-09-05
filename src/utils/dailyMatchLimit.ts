import { FIRESTORE_LIMITS } from './constants';

interface MatchLimitData {
  lastResetTime: number; // timestamp của lần reset cuối
  count: number; // 0-5
}

const STORAGE_KEY_PREFIX = 'match_limit_8h_';
const RESET_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 tiếng = 8 hours
const MATCHES_PER_PERIOD = 8; // 8 lượt mỗi ca

/**
 * Get match limit data for a user
 */
const getMatchLimitData = (userId: string): MatchLimitData => {
  const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
  const stored = localStorage.getItem(storageKey);
  
  const now = Date.now();
  
  if (!stored) {
    return {
      lastResetTime: now,
      count: 0
    };
  }
  
  try {
    const data: MatchLimitData = JSON.parse(stored);
    
    // Check if 8 hours have passed since last reset
    const timeSinceReset = now - data.lastResetTime;
    if (timeSinceReset >= RESET_INTERVAL_MS) {
      // Auto reset to 0 after 8 hours
      return {
        lastResetTime: now,
        count: 0
      };
    }
    
    return data;
  } catch (error) {
    console.error('Error parsing match limit data:', error);
    return {
      lastResetTime: now,
      count: 0
    };
  }
};

/**
 * Save match limit data for a user
 */
const saveMatchLimitData = (userId: string, data: MatchLimitData): void => {
  const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
  localStorage.setItem(storageKey, JSON.stringify(data));
};

/**
 * Check if user has reached limit (5 matches per 8 hours)
 */
export const hasReachedDailyLimit = (userId: string): boolean => {
  const data = getMatchLimitData(userId);
  return data.count >= MATCHES_PER_PERIOD;
};

/**
 * Get remaining matches in current 8-hour period
 */
export const getRemainingMatches = (userId: string): number => {
  const data = getMatchLimitData(userId);
  const remaining = MATCHES_PER_PERIOD - data.count;
  return Math.max(0, remaining);
};

/**
 * Get current match count in this 8-hour period
 */
export const getTodayMatchCount = (userId: string): number => {
  const data = getMatchLimitData(userId);
  return data.count;
};

/**
 * Increment match count
 * Returns the new count
 */
export const incrementMatchCount = (userId: string): number => {
  const data = getMatchLimitData(userId);
  
  // Don't increment if already at limit
  if (data.count >= MATCHES_PER_PERIOD) {
    return data.count;
  }
  
  const newData: MatchLimitData = {
    ...data,
    count: data.count + 1
  };
  
  saveMatchLimitData(userId, newData);
  return newData.count;
};

/**
 * Get time until next reset (in hours and minutes)
 */
export const getTimeUntilReset = (userId: string): { hours: number; minutes: number } => {
  const data = getMatchLimitData(userId);
  const now = Date.now();
  const timeSinceReset = now - data.lastResetTime;
  const timeUntilReset = RESET_INTERVAL_MS - timeSinceReset;
  
  if (timeUntilReset <= 0) {
    return { hours: 0, minutes: 0 };
  }
  
  const hours = Math.floor(timeUntilReset / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes };
};

/**
 * Reset match count manually (for testing or admin purposes)
 */
export const resetMatchCount = (userId: string): void => {
  const data: MatchLimitData = {
    lastResetTime: Date.now(),
    count: 0
  };
  saveMatchLimitData(userId, data);
};

/**
 * Get info about current period for display
 */
export const getCurrentPeriodInfo = (userId: string): {
  periodNumber: number; // 1, 2, or 3 (ca trong ngày)
  periodLabel: string; // "Ca 1", "Ca 2", "Ca 3"
  resetsIn: string; // "5h 30p"
} => {
  const { hours, minutes } = getTimeUntilReset(userId);
  const now = new Date();
  const currentHour = now.getHours();
  
  // Determine which period we're in based on time of day
  // Ca 1: 00:00-08:00
  // Ca 2: 08:00-16:00
  // Ca 3: 16:00-00:00
  let periodNumber = 1;
  let periodLabel = 'Ca 1 (00:00-08:00)';
  
  if (currentHour >= 0 && currentHour < 8) {
    periodNumber = 1;
    periodLabel = 'Ca 1 (00:00-08:00)';
  } else if (currentHour >= 8 && currentHour < 16) {
    periodNumber = 2;
    periodLabel = 'Ca 2 (08:00-16:00)';
  } else {
    periodNumber = 3;
    periodLabel = 'Ca 3 (16:00-00:00)';
  }
  
  return {
    periodNumber,
    periodLabel,
    resetsIn: `${hours}h ${minutes}p`
  };
};
