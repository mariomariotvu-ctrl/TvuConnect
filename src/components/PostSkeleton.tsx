import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

export const PostSkeleton: React.FC = () => {
  const { theme } = useTheme();
  const bgColor = theme === 'dark' ? 'rgba(31, 41, 55, 0.4)' : '#f3f4f6';
  const shimmerColor = theme === 'dark' ? 'rgba(55, 65, 81, 0.4)' : '#e5e7eb';

  return (
    <div 
      className="rounded-2xl p-4 md:p-5 border animate-pulse"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : '#ffffff',
        borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
      }}
    >
      {/* Header Skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full" style={{ backgroundColor: bgColor }} />
        <div className="space-y-2">
          <div className="w-32 h-4 rounded" style={{ backgroundColor: bgColor }} />
          <div className="w-20 h-3 rounded" style={{ backgroundColor: bgColor }} />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="space-y-2 mb-4">
        <div className="w-full h-4 rounded" style={{ backgroundColor: bgColor }} />
        <div className="w-full h-4 rounded" style={{ backgroundColor: bgColor }} />
        <div className="w-3/4 h-4 rounded" style={{ backgroundColor: bgColor }} />
      </div>

      {/* Image Skeleton (optional) */}
      <div className="w-full h-48 rounded-xl mb-4" style={{ backgroundColor: bgColor }} />

      {/* Footer Skeleton */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between">
        <div className="w-24 h-8 rounded-lg" style={{ backgroundColor: bgColor }} />
        <div className="w-24 h-8 rounded-lg" style={{ backgroundColor: bgColor }} />
      </div>
    </div>
  );
};
