import { StudentProfile } from '../types';
import { 
  normalizeVietnameseText, 
  majorContains, 
  getSeniorityRelation 
} from './matchingUtils';
import { MatchingFilters } from '../hooks/useMatchingFilters';

/**
 * Apply filters to a list of profiles
 * 
 * Note: Gender, major (via majorNormalized), and academicYear are now filtered
 * at the database level in matchingService.ts. This function only applies
 * remaining filters that cannot be efficiently done at the database level.
 */
export const applyFilters = (
  profiles: StudentProfile[],
  filters: MatchingFilters,
  mode: 'lover' | 'study' | 'quick' | 'hobby',
  currentProfile: StudentProfile | null
): StudentProfile[] => {
  let filtered = [...profiles];

  // Note: gender, major, and academicYear are filtered at database level
  
  if (filters.zodiac) {
    filtered = filtered.filter(p => p.zodiac === filters.zodiac);
  }
  if (filters.interest) {
    filtered = filtered.filter(p => 
      p.interests?.some(i => normalizeVietnameseText(i).includes(normalizeVietnameseText(filters.interest)))
    );
  }
  if (filters.minAge) {
    filtered = filtered.filter(p => p.age && p.age >= parseInt(filters.minAge));
  }
  if (filters.maxAge) {
    filtered = filtered.filter(p => p.age && p.age <= parseInt(filters.maxAge));
  }
  if (mode === 'study' && filters.studyGoals.length > 0) {
    filtered = filtered.filter(p =>
      // Chỉ filter studyGoals khi user chủ động chọn filter, không loại người chưa điền
      !p.studyGoals || p.studyGoals.length === 0 ||
      p.studyGoals?.some(goal => filters.studyGoals.includes(goal))
    );
  }
  if (filters.seniority && currentProfile) {
    filtered = filtered.filter(p => {
      const seniority = getSeniorityRelation(currentProfile.academicYear, p.academicYear);
      return seniority === filters.seniority;
    });
  }

  return filtered;
};

/**
 * Alternate between recent and old profiles for variety
 */
export const alternateRecentAndOld = (profiles: StudentProfile[]): StudentProfile[] => {
  if (profiles.length <= 4) return profiles;
  
  const result: StudentProfile[] = [];
  const recent = [...profiles];
  const old = [...profiles].reverse();
  
  let recentIndex = 0;
  let oldIndex = 0;
  let useRecent = true;
  
  while (result.length < profiles.length && (recentIndex < recent.length || oldIndex < old.length)) {
    if (useRecent && recentIndex < recent.length) {
      const profile = recent[recentIndex];
      if (!result.find(p => p.uid === profile.uid)) {
        result.push(profile);
      }
      recentIndex++;
    } else if (!useRecent && oldIndex < old.length) {
      const profile = old[oldIndex];
      if (!result.find(p => p.uid === profile.uid)) {
        result.push(profile);
      }
      oldIndex++;
    }
    useRecent = !useRecent;
  }
  
  return result;
};
