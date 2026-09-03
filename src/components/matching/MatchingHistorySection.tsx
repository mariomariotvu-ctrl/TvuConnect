import React from 'react';
import { History, User as UserIcon, MessageSquare } from 'lucide-react';
import { Match, StudentProfile } from '../../types';

interface MatchedProfileCardProps {
  match: Match;
  onStartChat?: (uid: string) => void;
}

const MatchedProfileCard: React.FC<MatchedProfileCardProps> = ({ match, onStartChat }) => {
  if (!match.matchedProfile) return null;

  const profile = match.matchedProfile;

  const formatDate = (createdAt: any): string => {
    if (!createdAt) return 'Không rõ ngày';
    try {
      const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return 'Không rõ ngày';
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-[20px] bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt={profile.fullName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <UserIcon className="w-6 h-6 text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{profile.fullName}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {profile.major || 'Chưa cập nhật'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(match.createdAt)}</p>
      </div>
      {onStartChat && profile.uid && (
        <button
          onClick={() => onStartChat(profile.uid)}
          className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 text-white rounded-2xl px-3 gap-1.5 text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition-all"
          aria-label={`Nhắn tin với ${profile.fullName}`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Nhắn tin</span>
        </button>
      )}
    </div>
  );
};

export interface MatchingHistorySectionProps {
  matches: Match[];
  hasMoreHistory: boolean;
  loadMore: () => void;
  isLoading: boolean;
  error: string | null;
  onStartChat?: (uid: string) => void;
}

export const MatchingHistorySection: React.FC<MatchingHistorySectionProps> = ({
  matches,
  hasMoreHistory,
  loadMore,
  isLoading,
  error,
  onStartChat,
}) => {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-5 h-5 text-indigo-500" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Hồ sơ đã ghép</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Xem lại và nhắn tin với những người đã ghép trước đó
      </p>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-gray-100 dark:bg-gray-700 rounded-[20px] h-[72px]" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl p-4 text-sm">
          Không thể tải lịch sử ghép. Vui lòng thử lại sau.
        </div>
      )}

      {!isLoading && !error && matches.length === 0 && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
          <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Chưa có hồ sơ nào được ghép</p>
        </div>
      )}

      {!isLoading && !error && matches.length > 0 && (
        <div className="space-y-2">
          {matches
            .filter((m) => m.matchedProfile != null)
            .map((match) => (
              <MatchedProfileCard key={match.id ?? match.matchedUid} match={match} onStartChat={onStartChat} />
            ))}
          {hasMoreHistory && (
            <button
              onClick={loadMore}
              className="w-full py-2.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-2xl transition-colors"
            >
              Xem thêm
            </button>
          )}
        </div>
      )}
    </div>
  );
};
