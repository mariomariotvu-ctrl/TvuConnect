/**
 * Viewed Profiles Management System
 * Tracks which profiles a user has seen to improve matching experience
 */

export interface ViewedProfile {
  uid: string;
  viewedAt: number; // timestamp
  viewCount: number; // how many times viewed
}

const STORAGE_KEY_PREFIX = 'tvu_viewed_profiles_';
const COOLDOWN_PERIOD = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_VIEW_COUNT_BEFORE_DEPRIORITIZE = 3; // After 3 views, heavily deprioritize

/**
 * Get all viewed profiles for a user
 */
export const getViewedProfiles = (userUid: string): ViewedProfile[] => {
  try {
    const key = STORAGE_KEY_PREFIX + userUid;
    const data = localStorage.getItem(key);
    if (!data) return [];
    
    const profiles: ViewedProfile[] = JSON.parse(data);
    
    // Clean up old entries (older than 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const cleaned = profiles.filter(p => p.viewedAt > thirtyDaysAgo);
    
    if (cleaned.length !== profiles.length) {
      localStorage.setItem(key, JSON.stringify(cleaned));
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error getting viewed profiles:', error);
    return [];
  }
};

/**
 * Mark a profile as viewed
 */
export const markProfileAsViewed = (userUid: string, profileUid: string): void => {
  try {
    const key = STORAGE_KEY_PREFIX + userUid;
    const viewed = getViewedProfiles(userUid);
    
    const existingIndex = viewed.findIndex(p => p.uid === profileUid);
    
    if (existingIndex >= 0) {
      // Update existing entry
      viewed[existingIndex] = {
        uid: profileUid,
        viewedAt: Date.now(),
        viewCount: viewed[existingIndex].viewCount + 1
      };
    } else {
      // Add new entry
      viewed.push({
        uid: profileUid,
        viewedAt: Date.now(),
        viewCount: 1
      });
    }
    
    localStorage.setItem(key, JSON.stringify(viewed));
  } catch (error) {
    console.error('Error marking profile as viewed:', error);
  }
};

/**
 * Check if a profile is in cooldown period
 */
export const isInCooldown = (viewedProfile: ViewedProfile): boolean => {
  const timeSinceView = Date.now() - viewedProfile.viewedAt;
  return timeSinceView < COOLDOWN_PERIOD;
};

/**
 * Calculate priority score for a profile
 * Higher score = higher priority
 */
export const calculatePriorityScore = (
  profileUid: string,
  viewedProfiles: ViewedProfile[]
): number => {
  const viewed = viewedProfiles.find(p => p.uid === profileUid);
  
  // New profile (never viewed) = highest priority
  if (!viewed) {
    return 1000;
  }
  
  // In cooldown = very low priority
  if (isInCooldown(viewed)) {
    return 10;
  }
  
  // Calculate score based on view count and time since last view
  const timeSinceView = Date.now() - viewed.viewedAt;
  const daysSinceView = timeSinceView / (24 * 60 * 60 * 1000);
  
  // Base score decreases with view count
  let score = 100 - (viewed.viewCount * 20);
  
  // Bonus for time passed (1 point per day)
  score += Math.min(daysSinceView * 5, 50);
  
  // Heavy penalty if viewed too many times
  if (viewed.viewCount >= MAX_VIEW_COUNT_BEFORE_DEPRIORITIZE) {
    score = Math.max(score * 0.3, 20);
  }
  
  return Math.max(score, 15); // Minimum score of 15
};

/**
 * Sort profiles by priority (new profiles first, then by score)
 */
export const sortProfilesByPriority = <T extends { uid: string }>(
  profiles: T[],
  userUid: string
): T[] => {
  const viewedProfiles = getViewedProfiles(userUid);
  
  return profiles.sort((a, b) => {
    const scoreA = calculatePriorityScore(a.uid, viewedProfiles);
    const scoreB = calculatePriorityScore(b.uid, viewedProfiles);
    
    // Higher score comes first
    return scoreB - scoreA;
  });
};

/**
 * Get statistics about viewed profiles
 */
export const getViewedStats = (userUid: string) => {
  const viewed = getViewedProfiles(userUid);
  const inCooldown = viewed.filter(isInCooldown).length;
  
  return {
    total: viewed.length,
    inCooldown,
    available: viewed.length - inCooldown
  };
};

/**
 * Clear all viewed profiles for a user (useful for testing or reset)
 */
export const clearViewedProfiles = (userUid: string): void => {
  try {
    const key = STORAGE_KEY_PREFIX + userUid;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error clearing viewed profiles:', error);
  }
};
