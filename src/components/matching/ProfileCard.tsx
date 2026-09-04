import React from 'react';
import { User as UserIcon } from 'lucide-react';
import { StudentProfile } from '../../types';
import { ActivityData } from '../../utils/activityBooster';
import { logger } from '@/utils/logger';

interface ProfileCardProps {
  profile: StudentProfile;
  reasons: string[];
  onProfileClick: (profile: StudentProfile) => void;
  showFeedback?: boolean;
  onFeedback?: (profile: StudentProfile, action: 'like' | 'dislike') => void;
  activityData?: ActivityData | null;
  isInOnlineBatch?: boolean;
}

/**
 * ActivityBadge — hiển thị dot màu trên góc dưới-phải của avatar
 * - online → xanh lá (#22c55e)
 * - recent <24h → vàng (#f59e0b)
 * - >24h hoặc invisibleMode → không render
 */
const ActivityBadge: React.FC<{ activityData: ActivityData }> = ({ activityData }) => {
  if (activityData.invisibleMode) return null;

  const now = Date.now();
  const elapsed = now - activityData.lastActive;
  const MS_24H = 24 * 60 * 60 * 1000;

  if (activityData.status === 'online') {
    return (
      <div
        className="absolute bottom-0 right-0 z-10 w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full ring-2 ring-white"
        style={{ backgroundColor: '#22c55e' }}
        aria-label="Đang online"
      />
    );
  }

  if (elapsed <= MS_24H) {
    return (
      <div
        className="absolute bottom-0 right-0 z-10 w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full ring-2 ring-white"
        style={{ backgroundColor: '#f59e0b' }}
        aria-label="Hoạt động gần đây"
      />
    );
  }

  return null; // > 24h: không render
};

/**
 * ActivityStatusText — hiển thị text trạng thái bên cạnh tên
 * - online → "● Online" xanh lá
 * - ≤1h → "Vừa hoạt động" xanh nhạt
 * - ≤24h → "Hoạt động X giờ trước" xám
 * - >24h hoặc invisibleMode → không render
 */
const ActivityStatusText: React.FC<{ activityData: ActivityData }> = ({ activityData }) => {
  if (activityData.invisibleMode) return null;

  const now = Date.now();
  const elapsed = now - activityData.lastActive;
  const MS_1H = 60 * 60 * 1000;
  const MS_24H = 24 * MS_1H;

  if (activityData.status === 'online') {
    return (
      <span className="truncate max-w-[80px] sm:max-w-none text-[10px] sm:text-[11px] font-semibold" style={{ color: '#22c55e' }}>
        ● Online
      </span>
    );
  }

  if (elapsed <= MS_1H) {
    return (
      <span className="truncate max-w-[80px] sm:max-w-none text-[10px] sm:text-[11px] font-medium text-green-500/80">
        Vừa hoạt động
      </span>
    );
  }

  if (elapsed <= MS_24H) {
    const hours = Math.floor(elapsed / MS_1H);
    return (
      <span className="truncate max-w-[100px] sm:max-w-none text-[10px] sm:text-[11px] font-medium text-gray-400">
        Hoạt động {hours} giờ trước
      </span>
    );
  }

  return null;
};

/**
 * ProfileCard component displays a student profile with match score and reasons
 *
 * @param {StudentProfile} profile - The student profile to display
 * @param {string[]} reasons - Array of matching reasons to display as chips
 * @param {Function} onProfileClick - Callback when profile card is clicked
 * @param {boolean} showFeedback - Whether to show like/dislike buttons
 * @param {Function} onFeedback - Callback when feedback button is clicked
 * @param {ActivityData | null} activityData - Activity data for badge display
 * @param {boolean} isInOnlineBatch - Whether this batch has both online and offline profiles
 */
const ProfileCardComponent: React.FC<ProfileCardProps> = ({
  profile,
  reasons,
  onProfileClick,
  showFeedback = false,
  onFeedback,
  activityData,
  isInOnlineBatch = false,
}) => {
  // Limit reasons to 2 on mobile
  const displayReasons = reasons.slice(0, 2);

  return (
    <div
      className="flex flex-row sm:flex-col bg-white rounded-[14px] sm:rounded-[20px] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.08)] border border-gray-100 cursor-pointer group hover:shadow-[0_20px_40px_-12px_rgba(99,102,241,0.15)] hover:-translate-y-1 hover:border-indigo-100 transition-all duration-300 min-h-[110px] sm:h-auto animate-slide touch-manipulation"
      onClick={() => onProfileClick(profile)}
    >
      {/* Avatar Image — relative để ActivityBadge dùng absolute positioning */}
      <div className="relative w-[75px] sm:w-full sm:aspect-square shrink-0 border-r sm:border-r-0 sm:border-b border-gray-100/50 bg-gray-50 flex flex-col justify-center overflow-hidden rounded-l-[14px] sm:rounded-l-none sm:rounded-t-[20px]">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt={profile.fullName}
            loading="eager"
            decoding="sync"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 block"
            referrerPolicy="no-referrer"
            style={{
              imageRendering: 'auto',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              WebkitTransform: 'translateZ(0)',
              filter: 'none',
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-100 to-indigo-50 flex items-center justify-center group-hover:scale-105 transition-transform duration-700">
            <UserIcon className="w-10 h-10 text-indigo-300" />
          </div>
        )}
        {/* Activity Badge */}
        {activityData && !activityData.invisibleMode && (
          <ActivityBadge activityData={activityData} />
        )}
      </div>

      {/* Info Section */}
      <div className="p-2 pb-2.5 sm:p-4 flex flex-col flex-1 bg-white relative">
        {/* Name */}
        <div className="flex justify-between items-start gap-2 mb-0.5">
          <div className="flex flex-col flex-1 min-w-0">
            {/* Nhãn "🟢 Đang online" — chỉ khi online VÀ batch có cả online + offline */}
            {activityData?.status === 'online' && isInOnlineBatch && (
              <span className="text-[10px] sm:text-[11px] font-bold text-green-600 dark:text-green-400 leading-none mb-0.5 block">
                🟢 Đang online
              </span>
            )}
            {/* Tên + Status text */}
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5 overflow-hidden">
              <h4
                className="font-extrabold text-gray-900 text-[13px] sm:text-[18px] line-clamp-1 sm:truncate tracking-tight pr-1"
                title={profile.fullName}
              >
                {profile.fullName}
              </h4>
              {activityData && !activityData.invisibleMode && (
                <ActivityStatusText activityData={activityData} />
              )}
            </div>
          </div>
        </div>

        {/* Major */}
        <p
          className="text-[10.5px] sm:text-[14.5px] font-bold text-indigo-600/90 mb-0.5 leading-snug line-clamp-1"
          title={profile.major}
        >
          {profile.major || 'Chưa cập nhật ngành'}
        </p>

        {/* Metadata (Year • Gender) */}
        <div className="flex items-center gap-1.5 text-[10px] sm:text-[13.5px] font-extrabold text-gray-500 mb-1.5 sm:mb-3">
          <span className="truncate">{profile.academicYear || 'Khóa ?'}</span>
          {profile.gender && (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></span>
              <span className="flex-shrink-0">
                {profile.gender === 'male' ? 'Nam' : profile.gender === 'female' ? 'Nữ' : 'Khác'}
              </span>
            </>
          )}
        </div>

        {/* Matching Reasons - Limited to 2 on mobile, displayed in a single row */}
        <div className="pt-1 border-t border-gray-50/50 flex items-start gap-1.5 overflow-hidden rounded-t-lg">
          {displayReasons.length > 0 ? (
            displayReasons.map((reason, idx) => (
              <div
                key={idx}
                className="flex items-center px-1.5 py-0.5 bg-indigo-50/60 text-indigo-700 rounded-md text-[10px] sm:text-[12px] font-black border border-indigo-100/40 whitespace-nowrap shadow-sm flex-shrink-0"
              >
                {reason}
              </div>
            ))
          ) : (
            <span className="text-[10px] text-gray-400 italic font-medium">✨ Hồ sơ nổi bật</span>
          )}
        </div>

        {/* Feedback Buttons (Optional) */}
        {showFeedback && onFeedback && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFeedback(profile, 'like');
              }}
              className="flex-1 py-2 px-3 bg-green-50 text-green-600 rounded-lg text-sm font-bold hover:bg-green-100 transition-colors"
            >
              👍 Thích
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFeedback(profile, 'dislike');
              }}
              className="flex-1 py-2 px-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors"
            >
              👎 Bỏ qua
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProfileCard = React.memo(ProfileCardComponent, (prevProps, nextProps) => {
  // So sánh profile.uid - prop quan trọng nhất
  if (prevProps.profile.uid !== nextProps.profile.uid) {
    return false;
  }

  // So sánh showFeedback flag
  if (prevProps.showFeedback !== nextProps.showFeedback) {
    return false;
  }

  // So sánh reasons array length - nếu length khác thì re-render
  if (prevProps.reasons.length !== nextProps.reasons.length) {
    return false;
  }

  // So sánh profile data có thể thay đổi
  if (
    prevProps.profile.fullName !== nextProps.profile.fullName ||
    prevProps.profile.major !== nextProps.profile.major ||
    prevProps.profile.photoURL !== nextProps.profile.photoURL
  ) {
    return false;
  }

  // So sánh activityData
  if (prevProps.activityData?.status !== nextProps.activityData?.status) return false;
  if (prevProps.activityData?.lastActive !== nextProps.activityData?.lastActive) return false;
  if (prevProps.isInOnlineBatch !== nextProps.isInOnlineBatch) return false;

  // Tất cả props đều giống nhau → không cần re-render
  return true;
});
