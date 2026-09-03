import { User } from 'lucide-react';
import { useUploaderProfile } from '../hooks/useUploaderProfile';
import { useTheme } from '../contexts/ThemeContext';

interface UploaderInfoProps {
  uploaderId: string;
  onProfileClick?: (uid: string) => void;
}

export function UploaderInfo({ uploaderId, onProfileClick }: UploaderInfoProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { profile, loading } = useUploaderProfile(uploaderId);

  if (loading) {
    // Loading skeleton - minimal without blurred box
    return (
      <div className="flex items-center gap-1.5 min-h-[20px]">
        <User className="w-4 h-4 flex-shrink-0 animate-pulse" style={{ color: isDark ? '#4b5563' : '#d1d5db' }} strokeWidth={2} />
        <span 
          className="text-sm font-semibold leading-none animate-pulse"
          style={{ color: isDark ? '#6b7280' : '#9ca3af' }}
        >
          Đang tải...
        </span>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const handleClick = () => {
    if (onProfileClick) {
      onProfileClick(uploaderId);
    }
  };

  // Truncate display name if longer than 20 characters
  const displayName = profile.displayName.length > 20
    ? profile.displayName.substring(0, 20) + '...'
    : profile.displayName;

  return (
    <div className="flex items-center gap-1.5 min-h-[20px] overflow-visible">
      <User 
        className="w-4 h-4 flex-shrink-0" 
        style={{ color: isDark ? '#9ca3af' : '#9ca3af' }} 
        strokeWidth={2} 
      />
      <span 
        className="text-sm font-semibold whitespace-nowrap leading-none"
        style={{ color: isDark ? '#9ca3af' : '#6b7280' }}
      >
        Đăng bởi:
      </span>
      <button
        onClick={onProfileClick ? handleClick : undefined}
        className={`text-sm font-semibold leading-none whitespace-nowrap ${
          onProfileClick ? 'hover:underline cursor-pointer' : ''
        }`}
        style={{ 
          color: isDark ? '#d1d5db' : '#374151'
        }}
        disabled={!onProfileClick}
        aria-label={`View profile of ${profile.displayName}`}
        title={profile.displayName}
      >
        {displayName}
      </button>
    </div>
  );
}
