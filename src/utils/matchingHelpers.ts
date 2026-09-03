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

/**
 * Mock profiles for quota exceeded scenario
 */
export const getMockProfiles = (): StudentProfile[] => [
  { 
    uid: 'mock1', 
    fullName: 'Ngân Hà Đẹp Gái', 
    major: 'Thiết kế đồ họa', 
    academicYear: '2023 - 2027', 
    gender: 'female', 
    photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80', 
    mssv: '110123001' 
  } as StudentProfile,
  { 
    uid: 'mock2', 
    fullName: 'Nguyễn Trần Trọng Giao Diện', 
    major: 'Công Nghệ Thông Tin', 
    academicYear: '2022 - 2026', 
    gender: 'male', 
    photoURL: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80', 
    mssv: '110122002' 
  } as StudentProfile,
  { 
    uid: 'mock3', 
    fullName: 'Lê Mai Trúc', 
    major: 'Ngôn ngữ Anh', 
    academicYear: '2024 - 2028', 
    gender: 'female', 
    photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80', 
    mssv: '110124003' 
  } as StudentProfile,
  { 
    uid: 'mock4', 
    fullName: 'Trần Đại Bác', 
    major: 'Quản trị Kinh doanh Dịch vụ', 
    academicYear: '2021 - 2025', 
    gender: 'male', 
    photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80', 
    mssv: '110121004' 
  } as StudentProfile
];
