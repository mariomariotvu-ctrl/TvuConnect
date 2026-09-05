import { collection, getDocs, query, where, limit, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { StudentProfile } from '../types';
import { FIRESTORE_LIMITS } from '../utils/constants';
import { calculateMatchingScore, normalizeVietnameseText } from '../utils/matchingUtils';
import { applyFilters, alternateRecentAndOld, getMockProfiles } from '../utils/matchingHelpers';
import { getFallbackProfiles } from './fallbackProfilesService';
import { markProfileAsViewedInCache, getViewedStatsFromCache, filterViewedProfiles } from '../utils/viewedProfilesCache';
import { MatchingFilters } from '../hooks/useMatchingFilters';
import { toast } from 'sonner';
import { hasReachedDailyLimit, incrementMatchCount, getRemainingMatches, getTimeUntilReset } from '../utils/dailyMatchLimit';
import { matchHistoryBatchProcessor } from '../utils/firestoreBatchProcessor';
import { batchFetchPresenceStatus } from '../utils/batchStatusFetcher';
import { applyActivityBooster, limitStaleProfiles, ActivityData } from '../utils/activityBooster';

interface MatchingServiceResult {
  profiles: StudentProfile[];
  isShowingFallback: boolean;
  viewedStats: { total: number; inCooldown: number; available: number };
  error: string | null;
  activityDataMap: Map<string, ActivityData>;
  isInOnlineBatch: boolean;
}

/**
 * Cache kết quả query profiles để tái sử dụng trong loadOneMoreProfile
 * Tránh N+1 problem: mỗi "load more" không cần query lại 30 docs từ Firestore
 * TTL: 60 giây — đủ dài để loadOneMore reuse, đủ ngắn để profile mới được cập nhật
 */
interface ProfilesQueryCache {
  profiles: StudentProfile[];
  timestamp: number;
  filterKey: string;
}
let profilesQueryCache: ProfilesQueryCache | null = null;
const PROFILES_CACHE_TTL = 60 * 1000; // 60 giây

function buildFilterKey(filters: MatchingFilters): string {
  return `${filters.gender || ''}_${filters.major || ''}_${filters.academicYear || ''}`;
}

function getCachedProfiles(filters: MatchingFilters): StudentProfile[] | null {
  if (!profilesQueryCache) return null;
  const now = Date.now();
  if (now - profilesQueryCache.timestamp > PROFILES_CACHE_TTL) {
    profilesQueryCache = null;
    return null;
  }
  if (profilesQueryCache.filterKey !== buildFilterKey(filters)) return null;
  return profilesQueryCache.profiles;
}

function setCachedProfiles(filters: MatchingFilters, profiles: StudentProfile[]): void {
  profilesQueryCache = {
    profiles,
    timestamp: Date.now(),
    filterKey: buildFilterKey(filters),
  };
}

/** Xóa cache khi cần refresh (sau khi block user, thay đổi filter) */
export function invalidateProfilesCache(): void {
  profilesQueryCache = null;
}

/**
 * Fetch and score profiles for matching
 */
export const fetchMatchingProfiles = async (
  userUid: string,
  filters: MatchingFilters,
  blockedSet: Set<string>,
  mode: 'lover' | 'study' | 'quick' | 'hobby',
  currentProfile: StudentProfile | null
): Promise<MatchingServiceResult> => {
  try {
    // Check daily limit FIRST
    if (hasReachedDailyLimit(userUid)) {
      const { hours, minutes } = getTimeUntilReset(userUid);
      toast.error(`Bạn đã hết lượt ghép cặp ca này (5/5). Reset sau ${hours}h${minutes}p.`, { duration: 5000 });
      return {
        profiles: [],
        isShowingFallback: false,
        viewedStats: getViewedStatsFromCache(userUid),
        error: `Đã đạt giới hạn 5 lượt ghép cặp/ca. Quay lại sau ${hours} giờ ${minutes} phút.`,
        activityDataMap: new Map(),
        isInOnlineBatch: false,
      };
    }

    const profilesRef = collection(db, 'profiles');
    let q = query(profilesRef);

    // Database-level filtering for gender
    if (filters.gender) {
      q = query(q, where('gender', '==', filters.gender));
    }

    // Database-level filtering for major (using normalized field)
    if (filters.major) {
      const normalizedMajor = normalizeVietnameseText(filters.major);
      q = query(q, where('majorNormalized', '==', normalizedMajor));
    }

    // Database-level filtering for academic year
    if (filters.academicYear) {
      q = query(q, where('academicYear', '==', filters.academicYear));
    }

    q = query(q, limit(FIRESTORE_LIMITS.PROFILES_PER_QUERY));

    const querySnapshot = await getDocs(q);
    
    let allProfiles = querySnapshot.docs
      .map(doc => doc.data() as StudentProfile)
      .filter(p => p.uid !== userUid && !blockedSet.has(p.uid));

    // Lưu cache để loadOneMoreProfile tái sử dụng — tránh N+1 reads
    setCachedProfiles(filters, allProfiles);

    // Filter out already viewed profiles (24h cooldown) — prevent duplicate results
    allProfiles = filterViewedProfiles(allProfiles, userUid);

    // Apply remaining filters (in-memory)
    allProfiles = applyFilters(allProfiles, filters, mode, currentProfile);

    if (allProfiles.length === 0) {
      // Try fallback profiles
      const fallbackProfiles = await getFallbackProfiles(userUid, filters, blockedSet, mode, currentProfile);
      
      if (fallbackProfiles.length === 0) {
        return {
          profiles: [],
          isShowingFallback: false,
          viewedStats: getViewedStatsFromCache(userUid),
          error: 'Không tìm thấy sinh viên nào phù hợp. Hãy thử điều chỉnh bộ lọc hoặc thử lại sau.',
          activityDataMap: new Map(),
          isInOnlineBatch: false,
        };
      }
      
      const alternatingProfiles = alternateRecentAndOld(fallbackProfiles);
      const limitedProfiles = alternatingProfiles.slice(0, 4);
      
      toast.info(`Đã xem hết hồ sơ mới! Hiển thị lại ${limitedProfiles.length} hồ sơ đã xem.`);
      
      return {
        profiles: limitedProfiles,
        isShowingFallback: true,
        viewedStats: getViewedStatsFromCache(userUid),
        error: null,
        activityDataMap: new Map(),
        isInOnlineBatch: false,
      };
    }

    // Calculate scores
    const profilesWithScores = allProfiles.map(profile => {
      const scoreResult = calculateMatchingScore(currentProfile, profile, mode);
      return {
        profile,
        score: scoreResult.totalScore,
      };
    });

    // Fetch presence data với timeout ngắn hơn (không block nếu chậm)
    let realPresenceMap = new Map<string, ActivityData>();
    try {
      const uids = allProfiles.map(p => p.uid);
      realPresenceMap = await batchFetchPresenceStatus(uids);
    } catch {
      // Fallback: presenceMap rỗng → Composite_Score = Matching_Score × 0.7
    }

    // Apply Activity_Booster
    const profilesWithBoost = applyActivityBooster(profilesWithScores, realPresenceMap);
    const limitedWithStale = limitStaleProfiles(profilesWithBoost, 4);
    const top4 = limitedWithStale.slice(0, 4);
    const profiles = top4.map(p => p.profile);

    // Build activityDataMap và tính isInOnlineBatch
    const activityDataMap = new Map<string, ActivityData>();
    top4.forEach(({ profile }) => {
      const data = realPresenceMap.get(profile.uid);
      if (data) activityDataMap.set(profile.uid, data);
    });
    const onlineCount = top4.filter(p => realPresenceMap.get(p.profile.uid)?.status === 'online').length;
    const isInOnlineBatch = onlineCount > 0 && onlineCount < top4.length;

    // Mark as viewed using cache
    // Requirement 2.5: Cache viewed profile UIDs with 24h TTL
    profiles.forEach(profile => {
      markProfileAsViewedInCache(userUid, profile.uid);
    });

    // Save to history using batch processor — lưu cả matchedProfile để hiển thị trong lịch sử
    profiles.forEach(profile => {
      try {
        const matchRef = doc(collection(db, 'matches'));
        // Lưu snapshot thông tin cơ bản của profile tại thời điểm match
        // Chỉ lưu các field cần thiết để hiển thị card (tránh document quá lớn)
        const matchedProfileSnapshot = {
          uid: profile.uid,
          fullName: profile.fullName || '',
          major: profile.major || null,
          photoURL: profile.photoURL || null,
          academicYear: profile.academicYear || null,
          className: profile.className || null,
        };
        matchHistoryBatchProcessor.addSet(matchRef, {
          userUid,
          matchedUid: profile.uid,
          matchedProfile: matchedProfileSnapshot,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'matches', true);
      }
    });

    // Không flush ngay — để batch processor tự flush sau 500ms hoặc khi đủ 10 records
    // Tránh tạo nhiều write operations đồng thời khi nhiều user ghép cặp cùng lúc

    // Increment match count AFTER successful match
    incrementMatchCount(userUid);
    const remaining = getRemainingMatches(userUid);

    if (profilesWithBoost.length > 4) {
      toast.success(`Tìm thấy ${profilesWithBoost.length} người! Hiển thị 4 người phù hợp nhất. (Còn ${remaining}/5 lượt)`, { duration: 4000 });
    } else {
      toast.success(`Tìm thấy ${profiles.length} người phù hợp! (Còn ${remaining}/5 lượt ca này)`, { duration: 4000 });
    }

    return {
      profiles,
      isShowingFallback: false,
      viewedStats: getViewedStatsFromCache(userUid),
      error: null,
      activityDataMap,
      isInOnlineBatch,
    };
  } catch (err: any) {
    console.error('Matching error:', err);
    
    if (err?.message && (err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('permission'))) {
      toast.warning('⚠️ Đã hết Data Firebase hôm nay (Quota Exceeded). Hiển thị danh sách giả lập để bạn tiếp tục duyệt UI!', { duration: 6000 });
      return {
        profiles: getMockProfiles(),
        isShowingFallback: false,
        viewedStats: getViewedStatsFromCache(userUid),
        error: null,
        activityDataMap: new Map(),
        isInOnlineBatch: false,
      };
    }
    
    toast.error('Không thể tìm kiếm. Vui lòng thử lại.');
    return {
      profiles: [],
      isShowingFallback: false,
      viewedStats: getViewedStatsFromCache(userUid),
      error: 'Đã xảy ra lỗi. Vui lòng thử lại sau.',
      activityDataMap: new Map(),
      isInOnlineBatch: false,
    };
  }
};

/**
 * Kết quả trả về từ loadOneMoreProfile
 */
export interface LoadOneMoreResult {
  profile: StudentProfile;
  activityData?: ActivityData;
}

/**
 * Load one more profile
 */
export const loadOneMoreProfile = async (
  userUid: string,
  filters: MatchingFilters,
  blockedSet: Set<string>,
  shownUids: Set<string>,
  mode: 'lover' | 'study' | 'quick' | 'hobby',
  currentProfile: StudentProfile | null
): Promise<LoadOneMoreResult | null> => {
  try {
    const profilesRef = collection(db, 'profiles');
    let q = query(profilesRef);

    // Database-level filtering for gender
    if (filters.gender) {
      q = query(q, where('gender', '==', filters.gender));
    }

    // Database-level filtering for major (using normalized field)
    if (filters.major) {
      const normalizedMajor = normalizeVietnameseText(filters.major);
      q = query(q, where('majorNormalized', '==', normalizedMajor));
    }

    // Database-level filtering for academic year
    if (filters.academicYear) {
      q = query(q, where('academicYear', '==', filters.academicYear));
    }

    q = query(q, limit(FIRESTORE_LIMITS.PROFILES_PER_QUERY));

    const querySnapshot = await getDocs(q);
    
    let allProfiles = querySnapshot.docs
      .map(doc => doc.data() as StudentProfile)
      .filter(p => 
        p.uid !== userUid && 
        !blockedSet.has(p.uid) &&
        !shownUids.has(p.uid)
      );

    // Apply remaining filters (in-memory)
    allProfiles = applyFilters(allProfiles, filters, mode, currentProfile);

    if (allProfiles.length === 0) {
      toast.info('Không còn hồ sơ mới. Hãy thử làm mới toàn bộ!');
      return null;
    }

    const profilesWithScores = allProfiles.map(profile => {
      const scoreResult = calculateMatchingScore(currentProfile, profile, mode);
      return {
        profile,
        score: scoreResult.totalScore,
      };
    });
    
    const sortedByScore = profilesWithScores.sort((a, b) => b.score - a.score);
    const newProfile = sortedByScore[0].profile;

    // Fetch activityData cho profile mới — gọi batchFetchPresenceStatus với UID đơn lẻ.
    // Requirements 2.4: Nếu cache còn TTL (60s) và UID này đã được fetch cùng batch trước → hit cache.
    // Nếu cache miss → fetch nhẹ chỉ 1 UID, tự động cache kết quả.
    let activityData: ActivityData | undefined;
    try {
      const presenceMap = await batchFetchPresenceStatus([newProfile.uid]);
      activityData = presenceMap.get(newProfile.uid);
    } catch {
      // Fail gracefully — activityData sẽ là undefined
    }

    // Mark as viewed using cache
    markProfileAsViewedInCache(userUid, newProfile.uid);

    // Save to history using batch processor — lưu cả matchedProfile
    try {
      const matchRef = doc(collection(db, 'matches'));
      const matchedProfileSnapshot = {
        uid: newProfile.uid,
        fullName: newProfile.fullName || '',
        major: newProfile.major || null,
        photoURL: newProfile.photoURL || null,
        academicYear: newProfile.academicYear || null,
        className: newProfile.className || null,
      };
      matchHistoryBatchProcessor.addSet(matchRef, {
        userUid,
        matchedUid: newProfile.uid,
        matchedProfile: matchedProfileSnapshot,
        createdAt: serverTimestamp()
      });
      // Batch processor tự flush sau 500ms hoặc khi đủ 10 records
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'matches', true);
    }

    toast.success('Đã thêm 1 hồ sơ mới!');
    return { profile: newProfile, activityData };
  } catch (err) {
    console.error('Load one more error:', err);
    toast.error('Không thể tải thêm. Vui lòng thử lại.');
    return null;
  }
};
