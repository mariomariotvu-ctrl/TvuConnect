import React from 'react';
import { History, User as UserIcon, MessageCircle } from 'lucide-react';
import { Match, StudentProfile } from '../../types';
import type { Timestamp } from '../../firebase';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface MatchedProfilesSectionProps {
  matchHistory: Match[];
  hasMoreHistory: boolean;
  loadMore: () => void;
  isLoading: boolean;
  error: string | null;
  onStartChat: (profile: StudentProfile) => void;
}

interface ProfileCardItemProps {
  match: Match;
  onStartChat: (profile: StudentProfile) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatMatchDate = (createdAt: Timestamp | null | undefined): string => {
  if (!createdAt?.toDate) return 'Không rõ ngày';
  return createdAt.toDate().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// ─── ProfileCardItem ──────────────────────────────────────────────────────────

const ProfileCardItem: React.FC<ProfileCardItemProps> = ({ match, onStartChat }) => {
  if (!match.matchedProfile) return null;

  const profile = match.matchedProfile;
  const major = profile.major && profile.major.trim() !== '' ? profile.major : 'Chưa cập nhật';

  const [imgError, setImgError] = React.useState(false);
  const showAvatar = profile.photoURL && !imgError;

  return (
    <div
      data-testid="profile-card-item"
      className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-[18px] border border-gray-100 dark:border-gray-700 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-6px_rgba(99,102,241,0.13)] hover:border-indigo-100 dark:hover:border-indigo-500/40 hover:-translate-y-0.5 transition-all duration-300 group"
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-[14px] overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-700 ring-4 ring-transparent group-hover:ring-indigo-50 dark:group-hover:ring-indigo-500/20 transition-all duration-300">
        {showAvatar ? (
          <img
            src={profile.photoURL!}
            alt={profile.fullName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            style={{ imageRendering: '-webkit-optimize-contrast', backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-100 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-indigo-300 dark:text-indigo-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <h4 className="font-extrabold text-gray-900 dark:text-gray-100 text-[15px] line-clamp-1 tracking-tight leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {profile.fullName}
        </h4>
        <p className="text-[12px] text-indigo-500/80 dark:text-indigo-400/80 mt-0.5 font-bold leading-snug line-clamp-1">
          {major}
        </p>
        <p
          data-testid="match-date"
          className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-medium"
        >
          {formatMatchDate(match.createdAt)}
        </p>
      </div>

      {/* Message Button */}
      <button
        aria-label={`Nhắn tin với ${profile.fullName}`}
        onClick={() => onStartChat(profile)}
        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] min-w-[44px] bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white rounded-xl text-[13px] font-bold shadow-sm hover:shadow-indigo-300/40 dark:hover:shadow-indigo-700/40 hover:brightness-110 active:scale-95 transition-all duration-200 flex-shrink-0"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Nhắn tin</span>
      </button>
    </div>
  );
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

const SkeletonItem: React.FC = () => (
  <div
    aria-busy="true"
    aria-label="Đang tải hồ sơ"
    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-[18px] border border-gray-100 dark:border-gray-700 animate-pulse"
  >
    <div className="w-12 h-12 rounded-[14px] bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
    <div className="flex-1 space-y-2 py-0.5">
      <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded-md w-2/3" />
      <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded-md w-1/2" />
      <div className="h-2.5 bg-gray-100 dark:bg-gray-600 rounded-md w-1/3" />
    </div>
    <div className="w-[44px] h-[44px] rounded-xl bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
  </div>
);

// ─── MatchedProfilesSection ───────────────────────────────────────────────────

export const MatchedProfilesSection: React.FC<MatchedProfilesSectionProps> = ({
  matchHistory,
  hasMoreHistory,
  loadMore,
  isLoading,
  error,
  onStartChat,
}) => {
  return (
    <div
      data-testid="matched-profiles-section"
      className="mt-6 mb-2"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <History className="w-5 h-5 md:w-6 md:h-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
        <h3 className="text-[17px] md:text-lg font-extrabold text-gray-900 dark:text-gray-100 tracking-tight leading-tight">
          Kết nối lại với hồ sơ đã ghép
        </h3>
      </div>
      <p className="text-[12.5px] md:text-[13.5px] text-gray-500 dark:text-gray-400 font-medium mb-4 ml-7 md:ml-8">
        Nhắn tin ngay để không bỏ lỡ cơ hội kết nối
      </p>

      {/* Skeleton state */}
      {isLoading && (
        <div className="space-y-3">
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </div>
      )}

      {/* Error state */}
      {!isLoading && error !== null && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-[13.5px] text-gray-500 dark:text-gray-400 font-medium">
            Không thể tải danh sách. Vui lòng thử lại.
          </p>
          <button
            onClick={loadMore}
            className="px-5 py-2 text-[13px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && error === null && matchHistory.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-[13.5px] text-gray-400 dark:text-gray-500 font-medium">
            Chưa có hồ sơ nào được ghép
          </p>
        </div>
      )}

      {/* List */}
      {!isLoading && error === null && matchHistory.length > 0 && (
        <div className="space-y-3">
          {matchHistory
            .filter((m) => m.matchedProfile != null)
            .map((match) => (
              <ProfileCardItem
                key={match.id ?? match.matchedUid}
                match={match}
                onStartChat={onStartChat}
              />
            ))}
        </div>
      )}

      {/* Load More */}
      {!isLoading && hasMoreHistory && (
        <button
          onClick={loadMore}
          className="w-full mt-4 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors"
        >
          Xem thêm
        </button>
      )}
    </div>
  );
};

export default MatchedProfilesSection;
