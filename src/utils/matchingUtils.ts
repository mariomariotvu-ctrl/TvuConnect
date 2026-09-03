// Enhanced Matching System Utilities
// Implements: Data Normalization, Seniority Filtering, Smart Matching Score

/**
 * 1. DATA NORMALIZATION
 * Normalize Vietnamese text for consistent matching
 */
export const normalizeVietnameseText = (text: string): string => {
  if (!text) return '';
  
  // Step 1: Convert to lowercase
  let normalized = text.toLowerCase();
  
  // Step 2: Remove Vietnamese accents
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
  
  // Step 3: Remove extra spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
};

/**
 * Extract acronym from text (first letter of each word)
 * Example: "Răng Hàm Mặt" → "rhm"
 */
export const extractAcronym = (text: string): string => {
  if (!text) return '';
  
  const normalized = normalizeVietnameseText(text);
  const words = normalized.split(' ').filter(w => w.length > 0);
  
  // Get first letter of each word
  return words.map(w => w[0]).join('');
};

/**
 * Check if two major/field names match after normalization
 * Handles both full names and acronyms
 */
export const isMajorMatch = (major1: string | undefined, major2: string | undefined): boolean => {
  if (!major1 || !major2) return false;
  
  const norm1 = normalizeVietnameseText(major1);
  const norm2 = normalizeVietnameseText(major2);
  
  // Direct match
  if (norm1 === norm2) return true;
  
  // Check if one is acronym of the other
  const acronym1 = extractAcronym(major1);
  const acronym2 = extractAcronym(major2);
  
  return acronym1 === norm2 || acronym2 === norm1;
};

/**
 * Check if major contains keyword after normalization
 * Handles both full text and acronym matching
 */
export const majorContains = (major: string | undefined, keyword: string): boolean => {
  if (!major || !keyword) return false;
  
  const normMajor = normalizeVietnameseText(major);
  const normKeyword = normalizeVietnameseText(keyword);
  
  // Direct substring match
  if (normMajor.includes(normKeyword)) return true;
  
  // Check if keyword is acronym of major
  const acronym = extractAcronym(major);
  if (acronym === normKeyword) return true;
  
  // Check if major is acronym and keyword contains it
  if (normKeyword.includes(normMajor)) return true;
  
  return false;
};

/**
 * 2. SENIORITY FILTERING
 * Extract academic year start year and compare seniority
 */
export const extractAcademicStartYear = (academicYear: string | undefined): number | null => {
  if (!academicYear) return null;
  
  // Extract first year from formats like "2023-2027" or "2023"
  const match = academicYear.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
};

export type SeniorityRelation = 'same' | 'senior' | 'junior' | 'unknown';

export const getSeniorityRelation = (
  myAcademicYear: string | undefined,
  theirAcademicYear: string | undefined
): SeniorityRelation => {
  const myYear = extractAcademicStartYear(myAcademicYear);
  const theirYear = extractAcademicStartYear(theirAcademicYear);
  
  if (myYear === null || theirYear === null) return 'unknown';
  
  if (theirYear === myYear) return 'same';
  if (theirYear < myYear) return 'senior'; // They started before me
  return 'junior'; // They started after me
};

/**
 * 3. SMART MATCHING SCORE
 * Calculate matching score based on multiple weighted factors
 */
export interface MatchingScoreFactors {
  purposeMatch: number;      // 0-40 points
  interestMatch: number;      // 0-25 points
  locationMatch: number;      // 0-15 points
  zodiacMatch: number;        // 0-10 points
  activityBonus: number;      // 0-10 points
}

export interface MatchingScoreResult {
  totalScore: number;
  factors: MatchingScoreFactors;
  reasons: string[];
}

export const calculateMatchingScore = (
  currentProfile: any,
  targetProfile: any,
  mode: 'lover' | 'study' | 'quick' | 'hobby'
): MatchingScoreResult => {
  const factors: MatchingScoreFactors = {
    purposeMatch: 0,
    interestMatch: 0,
    locationMatch: 0,
    zodiacMatch: 0,
    activityBonus: 0,
  };
  const reasons: string[] = [];

  // Guard: nếu currentProfile null/undefined thì trả về score 50 (base) để không bị lọc
  if (!currentProfile) {
    return { totalScore: 50, factors, reasons };
  }

  // ── 1. Purpose / Mode-specific Match (40 points max) ──────────────────────
  if (mode === 'lover') {
    // Flexible: chấp nhận nhiều cách diễn đạt mục đích tìm người yêu
    const loverKeywords = ['tìm người yêu', 'tìm nửa kia', 'yêu', 'bạn gái', 'bạn trai', 'lover'];
    const myPurpose = normalizeVietnameseText(currentProfile.purpose || '');
    const theirPurpose = normalizeVietnameseText(targetProfile.purpose || '');
    const myMatch = loverKeywords.some(kw => myPurpose.includes(normalizeVietnameseText(kw)));
    const theirMatch = loverKeywords.some(kw => theirPurpose.includes(normalizeVietnameseText(kw)));

    if (myMatch && theirMatch) {
      factors.purposeMatch = 40;
      reasons.push('Cùng mục đích tìm người yêu');
    } else if (theirMatch || !targetProfile.purpose) {
      // Họ tìm người yêu hoặc chưa điền → vẫn cho điểm
      factors.purposeMatch = 20;
    } else {
      factors.purposeMatch = 10; // Base score để không bị loại
    }
  } else if (mode === 'study') {
    // Ưu tiên cùng ngành trước, sau đó studyGoals
    const sameMajor = isMajorMatch(currentProfile.major, targetProfile.major);
    if (sameMajor) {
      factors.purposeMatch = 35;
      reasons.push('Cùng ngành học');
    } else if (currentProfile.studyGoals && targetProfile.studyGoals) {
      const commonGoals = currentProfile.studyGoals.filter((g: string) =>
        targetProfile.studyGoals?.includes(g)
      );
      if (commonGoals.length > 0) {
        factors.purposeMatch = Math.min(30, commonGoals.length * 15);
        reasons.push(`Cùng mục tiêu: ${commonGoals[0]}`);
      } else {
        factors.purposeMatch = 10; // Base score
      }
    } else {
      factors.purposeMatch = 10; // Base score
    }
  } else if (mode === 'hobby') {
    if (currentProfile.interests && targetProfile.interests) {
      const commonInterests = currentProfile.interests.filter((i: string) =>
        targetProfile.interests?.some((ti: string) =>
          normalizeVietnameseText(i) === normalizeVietnameseText(ti)
        )
      );
      if (commonInterests.length > 0) {
        factors.purposeMatch = Math.min(40, commonInterests.length * 12);
        reasons.push(`Cùng sở thích: ${commonInterests[0]}`);
      } else {
        factors.purposeMatch = 10; // Base score
      }
    } else {
      factors.purposeMatch = 10;
    }
  } else if (mode === 'quick') {
    // Quick mode: ưu tiên người hoạt động gần đây và cùng ngành/khóa
    const sameMajor = isMajorMatch(currentProfile.major, targetProfile.major);
    const seniority = getSeniorityRelation(currentProfile.academicYear, targetProfile.academicYear);
    if (sameMajor) {
      factors.purposeMatch = 30;
      reasons.push('Cùng ngành');
    } else if (seniority === 'same') {
      factors.purposeMatch = 25;
      reasons.push('Cùng khóa');
    } else {
      factors.purposeMatch = 15; // Base score cho quick mode
    }
  }

  // ── 2. Interest Match (25 points max) ─────────────────────────────────────
  if (currentProfile.interests?.length > 0 && targetProfile.interests?.length > 0) {
    const commonInterests = currentProfile.interests.filter((i: string) =>
      targetProfile.interests?.some((ti: string) =>
        normalizeVietnameseText(i).includes(normalizeVietnameseText(ti)) ||
        normalizeVietnameseText(ti).includes(normalizeVietnameseText(i))
      )
    );
    if (commonInterests.length > 0) {
      factors.interestMatch = Math.min(25, commonInterests.length * 8);
      if (!reasons.some(r => r.includes('sở thích'))) {
        reasons.push(`Cùng sở thích: ${commonInterests[0]}`);
      }
    }
  }

  // ── 3. Location Match (15 points max) ─────────────────────────────────────
  if (currentProfile.hometown && targetProfile.hometown) {
    const myLocation = normalizeVietnameseText(currentProfile.hometown);
    const theirLocation = normalizeVietnameseText(targetProfile.hometown);

    if (myLocation === theirLocation) {
      factors.locationMatch = 15;
      reasons.push('Cùng quê');
    } else if (myLocation.includes(theirLocation) || theirLocation.includes(myLocation)) {
      factors.locationMatch = 8;
    }
  }

  // ── 4. Zodiac Match (10 points max) ───────────────────────────────────────
  if (mode === 'lover' && currentProfile.zodiac && targetProfile.zodiac) {
    if (currentProfile.zodiac === targetProfile.zodiac) {
      factors.zodiacMatch = 10;
      reasons.push('Cùng cung hoàng đạo');
    }
  }

  // ── 5. Activity Bonus (10 points max) ─────────────────────────────────────
  if (targetProfile.isOnline) {
    factors.activityBonus = 10;
    reasons.push('Đang online');
  } else if (targetProfile.lastSeen) {
    const lastSeenTime = targetProfile.lastSeen.toDate
      ? targetProfile.lastSeen.toDate()
      : new Date(targetProfile.lastSeen);
    const hoursSinceLastSeen = (Date.now() - lastSeenTime.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastSeen < 24) {
      factors.activityBonus = 5;
      reasons.push('Hoạt động gần đây');
    }
  }

  const totalScore = Object.values(factors).reduce((sum, val) => sum + val, 0);

  return {
    totalScore,
    factors,
    reasons: reasons.slice(0, 2),
  };
};

/**
 * 4. MATCHING REASON LABELS
 * Generate user-friendly reason labels
 */
export const getMatchingReasons = (
  currentProfile: any,
  targetProfile: any,
  mode: 'lover' | 'study' | 'quick' | 'hobby'
): string[] => {
  // Guard: nếu currentProfile hoặc targetProfile null thì trả về mảng rỗng
  if (!currentProfile || !targetProfile) {
    return [];
  }

  const reasons: string[] = [];
  
  // Same academic year
  const seniority = getSeniorityRelation(currentProfile.academicYear, targetProfile.academicYear);
  if (seniority === 'same') {
    reasons.push('Cùng khóa');
  } else if (seniority === 'senior') {
    reasons.push('Khóa trên');
  } else if (seniority === 'junior') {
    reasons.push('Khóa dưới');
  }
  
  // Same major
  if (isMajorMatch(currentProfile.major, targetProfile.major)) {
    reasons.push('Cùng ngành');
  }
  
  // Common interests
  if (currentProfile.interests && targetProfile.interests) {
    const commonInterests = currentProfile.interests.filter((i: string) => 
      targetProfile.interests?.some((ti: string) => 
        normalizeVietnameseText(i) === normalizeVietnameseText(ti)
      )
    );
    if (commonInterests.length > 0) {
      reasons.push(`Cùng sở thích ${commonInterests[0]}`);
    }
  }
  
  // Same hometown
  if (currentProfile.hometown && targetProfile.hometown) {
    const myLocation = normalizeVietnameseText(currentProfile.hometown);
    const theirLocation = normalizeVietnameseText(targetProfile.hometown);
    if (myLocation === theirLocation) {
      reasons.push('Cùng quê');
    }
  }
  
  // Mode-specific reasons
  if (mode === 'lover' && currentProfile.zodiac === targetProfile.zodiac) {
    reasons.push('Cùng cung');
  }
  
  if (mode === 'study' && currentProfile.studyGoals && targetProfile.studyGoals) {
    const commonGoals = currentProfile.studyGoals.filter((g: string) => 
      targetProfile.studyGoals?.includes(g)
    );
    if (commonGoals.length > 0) {
      reasons.push(commonGoals[0]);
    }
  }
  
  return reasons.slice(0, 3); // Limit to 3 reasons
};
