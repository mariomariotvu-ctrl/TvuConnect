import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, collection, getDocs, query, where, limit } from '../firebase';
import { StudentProfile } from '../types';
import { User } from 'firebase/auth';
import { Heart, BookOpen, Smile, Zap, X } from 'lucide-react';
import { FIRESTORE_LIMITS, TIMING } from '../utils/constants';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { getMatchingReasons } from '../utils/matchingUtils';
import { trackMatchingStart, trackProfileClick, trackFilterApplied, trackLoadMore } from '../utils/matchingAnalytics';
import { getRemainingMatches, getTimeUntilReset } from '../utils/dailyMatchLimit';

// Import custom hooks
import { useMatchingFilters } from '../hooks/useMatchingFilters';
import { useMatchingHistory } from '../hooks/useMatchingHistory';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useCachedMatching } from '../hooks/useCachedMatching';

// Import sub-components
import { MatchingFilters } from './matching/MatchingFilters';
import { MatchingResults } from './matching/MatchingResults';
import { MatchingHistory } from './matching/MatchingHistory';
import { MatchedProfilesSection } from './matching/MatchedProfilesSection';

interface MatchingProps {
  currentUser: User;
  onMatchFound: (profile: StudentProfile) => void;
  mode: 'lover' | 'study' | 'quick' | 'hobby';
}

export const Matching: React.FC<MatchingProps> = ({ currentUser, onMatchFound, mode }) => {
  const { theme } = useTheme();
  
  // Use custom hooks
  const { filters, setFilters, resetFilters } = useMatchingFilters();
  const { blockedSet } = useBlockedUsers(currentUser.uid);
  const { matchHistory, hasMoreHistory, loadMore, isLoading: isHistoryLoading, error: historyError } = useMatchingHistory(
    currentUser.uid,
    blockedSet,
    FIRESTORE_LIMITS.MATCH_HISTORY_INITIAL
  );

  // Local state
  const [currentProfile, setCurrentProfile] = useState<StudentProfile | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);
  const [remainingMatches, setRemainingMatches] = useState(10);
  const [hasShownLowMatchWarning, setHasShownLowMatchWarning] = useState(false);

  // Task 4.5: Use cached matching hook
  const {
    profiles: matchedProfiles,
    loading: isMatching,
    error,
    isShowingFallback,
    viewedStats,
    startMatching: startCachedMatching,
    loadOneMore: loadOneCached,
    activityDataMap,
    isInOnlineBatch,
  } = useCachedMatching(currentUser.uid, filters, blockedSet, mode, currentProfile);

  // Create reasons map for MatchingResults
  // MOVED UP: This must be defined BEFORE handleProfileClick to avoid TDZ error
  const reasonsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    matchedProfiles.forEach(profile => {
      const reasons = currentProfile ? getMatchingReasons(currentProfile, profile, mode) : [];
      map.set(profile.uid, reasons);
    });
    return map;
  }, [matchedProfiles, currentProfile, mode]);

  // Task 5.8: useCallback for Matching event handlers - Validates Requirements 3.6
  // Memoize event handlers để prevent re-renders của child components
  const handleFiltersChange = useCallback((newFilters: Partial<typeof filters>) => {
    setFilters(newFilters);
    // Track filter changes (fire-and-forget)
    trackFilterApplied(currentUser.uid, { ...filters, ...newFilters });
  }, [filters, setFilters, currentUser.uid]);

  const handleProfileClick = useCallback((profile: StudentProfile) => {
    // Track profile click (fire-and-forget)
    const matchScore = reasonsMap.get(profile.uid)?.length || 0;
    trackProfileClick(currentUser.uid, profile.uid, matchScore);
    onMatchFound(profile);
  }, [reasonsMap, currentUser.uid, onMatchFound]);

  const startMatching = useCallback(async () => {
    // Check if out of matches - just show toast, banner already visible
    if (remainingMatches === 0) {
      const { hours, minutes } = getTimeUntilReset(currentUser.uid);
      const displayHours = minutes > 0 ? hours + 1 : hours;
      toast.error(`Vui lòng đợi khoảng ${displayHours} tiếng nữa`);
      return;
    }
    
    const now = Date.now();
    if (now - lastActionTime < TIMING.MATCHING_THROTTLE) {
      toast.error(`Vui lòng đợi ${Math.ceil((TIMING.MATCHING_THROTTLE - (now - lastActionTime)) / 1000)} giây`);
      return;
    }
    setLastActionTime(now);

    // Track matching start (fire-and-forget)
    trackMatchingStart(currentUser.uid, mode, filters);

    // Task 4.5: Use cached matching hook
    await startCachedMatching();
    
    // Update remaining matches after matching
    setRemainingMatches(getRemainingMatches(currentUser.uid));
  }, [remainingMatches, currentUser.uid, lastActionTime, mode, filters, startCachedMatching]);

  const loadOneMore = useCallback(async () => {
    const now = Date.now();
    if (now - lastActionTime < TIMING.MATCHING_THROTTLE) {
      toast.error(`Vui lòng đợi ${Math.ceil((TIMING.MATCHING_THROTTLE - (now - lastActionTime)) / 1000)} giây`);
      return;
    }
    setLastActionTime(now);

    // Track load more (fire-and-forget)
    trackLoadMore(currentUser.uid, 'results');

    // Task 4.5: Use cached matching hook
    await loadOneCached();
  }, [lastActionTime, currentUser.uid, loadOneCached]);

  // Load current user profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profileDoc = await getDocs(query(
          collection(db, 'profiles'),
          where('uid', '==', currentUser.uid),
          limit(1)
        ));
        
        if (!profileDoc.empty) {
          setCurrentProfile(profileDoc.docs[0].data() as StudentProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };
    
    loadProfile();
    
    // Update remaining matches on mount
    setRemainingMatches(getRemainingMatches(currentUser.uid));
    
    // Check if warning was already shown in this session
    const warningShown = sessionStorage.getItem(`match_warning_shown_${currentUser.uid}`);
    setHasShownLowMatchWarning(!!warningShown);
  }, [currentUser.uid]);
  
  // Show one-time toast when reaching 3 matches
  useEffect(() => {
    if (remainingMatches === 3 && !hasShownLowMatchWarning) {
      toast.warning('Bạn còn 3 lượt ghép hôm nay', {
        duration: 5000,
      });
      setHasShownLowMatchWarning(true);
      sessionStorage.setItem(`match_warning_shown_${currentUser.uid}`, 'true');
    }
  }, [remainingMatches, hasShownLowMatchWarning, currentUser.uid]);

  return (
    <div className="max-w-3xl lg:max-w-4xl mx-auto">
      <div className={`text-center ${mode === 'lover' ? 'mb-4' : mode === 'study' ? 'mb-4' : 'mb-10'}`}>
        <h2 className="matching-heading text-3xl md:text-4xl font-black mb-2 tracking-tight">
          {mode === 'lover' ? 'Tìm người yêu' :
            mode === 'study' ? 'Bạn cùng học' :
              mode === 'hobby' ? 'Sở thích chung' : 'Kết nối nhanh'}
        </h2>
        <p className="matching-subheading text-lg font-medium leading-relaxed">
          {mode === 'lover' ? 'Tìm kiếm nửa kia tại TVU' :
            mode === 'study' ? 'Tìm bạn cùng tiến trong học tập' :
              mode === 'hobby' ? 'Kết nối với những người cùng đam mê' : 'Kết nối ngẫu nhiên với sinh viên TVU'}
        </p>
      </div>

      <div 
        className={`rounded-[24px] shadow-xl border bg-white border-gray-100 dark:bg-gray-800/70 dark:border-gray-600/50 ${
          mode === 'lover' ? 'pt-2 px-4 pb-4 md:pt-2 md:px-6 md:pb-6' : 
          mode === 'hobby' ? 'pt-4 px-4 pb-3 md:pt-6 md:px-6 md:pb-3' : 
          'pt-2 px-4 pb-4 md:pt-2 md:px-6 md:pb-6'
        }`}
        style={{ backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.7)' : '#ffffff' }}
      >
        {/* Filters Component */}
        {(mode === 'lover' || mode === 'hobby' || mode === 'study') && (
          <MatchingFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={resetFilters}
            mode={mode}
            showFilters={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
          />
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-2">
            <X className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Daily Limit Info */}
        {remainingMatches === 0 ? (
          <div className="mb-4 bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl p-4 text-center shadow-lg">
            <p className="text-white text-lg font-bold mb-1">
              ⏰ Đã hết lượt ghép
            </p>
            {(() => {
              const { hours, minutes } = getTimeUntilReset(currentUser.uid);
              const displayHours = minutes > 0 ? hours + 1 : hours;
              return (
                <p className="text-white/90 text-base">
                  Vui lòng đợi khoảng <span className="font-bold">{displayHours} tiếng</span> nữa
                </p>
              );
            })()}
          </div>
        ) : remainingMatches <= 3 && (
          <div className="mb-4 bg-gradient-to-r from-orange-400 to-amber-400 rounded-2xl p-3.5 text-center shadow-lg">
            <p className="text-white text-base font-bold">
              ⚠️ Bạn còn <span className="text-white drop-shadow-md">{remainingMatches} lượt</span> ghép hôm nay
            </p>
          </div>
        )}

        {/* Start Matching Button */}
        <button
          onClick={startMatching}
          disabled={isMatching || remainingMatches === 0}
          className={`w-full py-3.5 md:py-4 ${
            remainingMatches === 0 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 hover:opacity-95 hover:shadow-[0_8px_25px_-8px_rgba(99,102,241,0.6)]'
          } text-white font-bold text-[17px] rounded-[16px] overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2.5 relative group`}
        >
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out z-0 rounded-[16px]"></div>
          
          <div className="relative z-10 flex items-center justify-center gap-2.5">
            {isMatching ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Đang tìm kiếm...</span>
              </>
            ) : remainingMatches === 0 ? (
              <>
                <X className="w-5 h-5" />
                <span>Đã hết lượt ghép</span>
              </>
            ) : (
              <>
                {mode === 'lover' && <Heart className="w-5 h-5 fill-white/20" />}
                {mode === 'study' && <BookOpen className="w-5 h-5" />}
                {mode === 'hobby' && <Smile className="w-5 h-5" />}
                {mode === 'quick' && <Zap className="w-5 h-5 fill-white/20 text-yellow-300" />}
                <span>Bắt đầu ghép cặp</span>
              </>
            )}
          </div>
        </button>

        {/* Matching Results Component */}
        {remainingMatches === 0 && (
          <MatchedProfilesSection
            matchHistory={matchHistory}
            hasMoreHistory={hasMoreHistory}
            loadMore={loadMore}
            isLoading={isHistoryLoading}
            error={historyError}
            onStartChat={onMatchFound}
          />
        )}

        {/* Matching Results Component */}
        <MatchingResults
          profiles={matchedProfiles}
          reasons={reasonsMap}
          mode={mode}
          isLoading={isMatching}
          isShowingFallback={isShowingFallback}
          viewedStats={viewedStats}
          onProfileClick={handleProfileClick}
          onLoadMore={loadOneMore}
          activityDataMap={activityDataMap}
          isInOnlineBatch={isInOnlineBatch}
        />

        {/* Matching History Component */}
        <MatchingHistory
          matches={matchHistory}
          hasMore={hasMoreHistory}
          onProfileClick={(match) => match.matchedProfile && handleProfileClick(match.matchedProfile)}
          onLoadMore={loadMore}
        />
      </div>
      

    </div>
  );
};
