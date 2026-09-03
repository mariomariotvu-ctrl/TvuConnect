import React from 'react';
import { Heart, BookOpen, Smile, Zap, History, Eye } from 'lucide-react';
import { StudentProfile } from '../../types';
import { ProfileCard } from './ProfileCard';
import { MatchingCardSkeleton } from '../SkeletonLoader';
import { logger } from '@/utils/logger';
import { ActivityData } from '../../utils/activityBooster';

interface MatchingResultsProps {
  profiles: StudentProfile[];
  reasons: Map<string, string[]>;
  mode: 'lover' | 'study' | 'quick' | 'hobby';
  isLoading: boolean;
  isShowingFallback: boolean;
  viewedStats: { total: number; inCooldown: number; available: number };
  onProfileClick: (profile: StudentProfile) => void;
  onLoadMore: () => void;
  showFeedback?: boolean;
  onFeedback?: (profile: StudentProfile, action: 'like' | 'dislike') => void;
  activityDataMap?: Map<string, ActivityData>;
  isInOnlineBatch?: boolean;
}

/**
 * MatchingResults component renders grid of ProfileCard components with loading states
 * 
 * @param {StudentProfile[]} profiles - Array of matched profiles to display
 * @param {Map<string, string[]>} reasons - Map of profile UID to matching reasons
 * @param {string} mode - Current matching mode
 * @param {boolean} isLoading - Whether results are loading
 * @param {boolean} isShowingFallback - Whether showing fallback (previously viewed) profiles
 * @param {object} viewedStats - Statistics about viewed profiles
 * @param {Function} onProfileClick - Callback when profile is clicked
 * @param {Function} onLoadMore - Callback to load more profiles
 * @param {boolean} showFeedback - Whether to show feedback buttons on cards
 * @param {Function} onFeedback - Callback when feedback is given
 * 
 * @example
 * ```tsx
 * <MatchingResults
 *   profiles={matchedProfiles}
 *   reasons={reasonsMap}
 *   mode="lover"
 *   isLoading={false}
 *   isShowingFallback={false}
 *   viewedStats={{ total: 10, inCooldown: 5, available: 5 }}
 *   onProfileClick={(profile) => logger.log('Clicked:', profile)}
 *   onLoadMore={() => logger.log('Load more')}
 * />
 * ```
 */
export const MatchingResults: React.FC<MatchingResultsProps> = ({
  profiles,
  reasons,
  mode,
  isLoading,
  isShowingFallback,
  viewedStats,
  onProfileClick,
  onLoadMore,
  showFeedback = false,
  onFeedback,
  activityDataMap = new Map(),
  isInOnlineBatch = false,
}) => {
  // Get mode icon
  const getModeIcon = () => {
    switch (mode) {
      case 'lover':
        return <Heart className="w-5 h-5 text-red-500" />;
      case 'study':
        return <BookOpen className="w-5 h-5 text-indigo-600" />;
      case 'hobby':
        return <Smile className="w-5 h-5 text-yellow-500" />;
      case 'quick':
        return <Zap className="w-5 h-5 text-yellow-400" />;
      default:
        return null;
    }
  };

  // Show loading skeletons
  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <MatchingCardSkeleton />
        <MatchingCardSkeleton />
        <MatchingCardSkeleton />
      </div>
    );
  }

  // No profiles to show
  if (profiles.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          {getModeIcon()}
          Kết quả ghép cặp
        </h3>
      </div>

      {/* Fallback Indicator */}
      {isShowingFallback ? (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <History className="w-4 h-4 text-amber-600" />
          <span className="text-xs text-amber-700 font-medium">
            Hiển thị ngẫu nhiên hồ sơ đã xem (xen kẽ gần & xa)
          </span>
        </div>
      ) : viewedStats.total > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <Eye className="w-4 h-4 text-blue-600" />
          <span className="text-xs text-blue-700 font-medium">
            Đã xem {viewedStats.total} hồ sơ • Ưu tiên hồ sơ mới
          </span>
        </div>
      )}
      
      {/* Profile Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.uid}
            profile={profile}
            reasons={reasons.get(profile.uid) || []}
            onProfileClick={onProfileClick}
            showFeedback={showFeedback}
            onFeedback={onFeedback}
            activityData={activityDataMap?.get(profile.uid) ?? null}
            isInOnlineBatch={isInOnlineBatch ?? false}
          />
        ))}
      </div>

      {/* Load More Button */}
      <div className="text-center mt-4">
        <button
          onClick={onLoadMore}
          disabled={isLoading}
          className="text-indigo-600 font-bold text-sm hover:text-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Đang tải...' : 'Xem thêm'}
        </button>
      </div>
    </div>
  );
};
