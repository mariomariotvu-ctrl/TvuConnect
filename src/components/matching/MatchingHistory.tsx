import React from 'react';
import { History, User as UserIcon, Calendar } from 'lucide-react';
import { Match } from '../../types';
import { logger } from '@/utils/logger';

interface MatchingHistoryProps {
  matches: Match[];
  hasMore: boolean;
  onProfileClick: (match: Match) => void;
  onLoadMore: () => void;
}

/**
 * MatchingHistory component renders match history sidebar with pagination
 * 
 * @param {Match[]} matches - Array of match history items
 * @param {boolean} hasMore - Whether there are more matches to load
 * @param {Function} onProfileClick - Callback when a match is clicked
 * @param {Function} onLoadMore - Callback to load more matches
 * 
 * @example
 * ```tsx
 * <MatchingHistory
 *   matches={matchHistory}
 *   hasMore={hasMoreHistory}
 *   onProfileClick={(match) => logger.log('Clicked:', match)}
 *   onLoadMore={() => logger.log('Load more')}
 * />
 * ```
 */
export const MatchingHistory: React.FC<MatchingHistoryProps> = ({
  matches,
  hasMore,
  onProfileClick,
  onLoadMore,
}) => {
  // Don't render if no matches
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="mt-10">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
        <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">
          Lịch sử ghép cặp
        </h3>
      </div>

      {/* Match List */}
      <div className="space-y-3">
        {matches.map((match) => {
          // Skip items with missing matchedProfile (legacy data guard)
          if (!match.matchedProfile) return null;

          return (
          <div
            key={match.id}
            onClick={() => onProfileClick(match)}
            className="flex items-start gap-3 p-3 bg-white rounded-[20px] cursor-pointer transition-all duration-300 border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_20px_-6px_rgba(99,102,241,0.12)] hover:border-indigo-100 hover:-translate-y-0.5 group min-h-[72px]"
          >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-[14px] overflow-hidden shadow-sm flex-shrink-0 ring-4 ring-transparent group-hover:ring-indigo-50 transition-all duration-300 bg-gray-50 mt-0.5">
              {match.matchedProfile.photoURL ? (
                <img 
                  src={match.matchedProfile.photoURL} 
                  alt={match.matchedProfile.fullName}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                  style={{
                    imageRendering: '-webkit-optimize-contrast',
                    backfaceVisibility: 'hidden',
                    transform: 'translateZ(0)',
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
              <h4 className="font-extrabold text-gray-900 text-[15px] line-clamp-1 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors">
                {match.matchedProfile.fullName}
              </h4>
              <p className="text-[12px] text-indigo-500/80 mt-1 font-bold leading-[1.3] line-clamp-2">
                {match.matchedProfile.major || 'Chưa cập nhật'}
              </p>
            </div>

            {/* Timestamp */}
            <div className="flex flex-col items-end justify-start flex-shrink-0 ml-1 pt-0.5">
              <div className="text-[10px] text-gray-500 font-bold flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-1.5 rounded-lg group-hover:bg-white transition-colors">
                <Calendar className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                <span className="whitespace-nowrap">
                  {match.createdAt?.toDate 
                    ? match.createdAt.toDate().toLocaleDateString('vi-VN') 
                    : 'Vừa xong'}
                </span>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full mt-4 py-3 text-sm font-bold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
        >
          Xem thêm lịch sử
        </button>
      )}
    </div>
  );
};
