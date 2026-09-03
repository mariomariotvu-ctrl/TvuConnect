import React from 'react';
import { useOnlineStatus, formatLastSeen } from '../hooks/useOnlineStatus';
import { motion } from 'motion/react';

interface OnlineStatusProps {
  userId: string | undefined;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4'
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base'
};

export const OnlineStatus: React.FC<OnlineStatusProps> = ({
  userId,
  size = 'md',
  showText = true,
  className = ''
}) => {
  const { isOnline, lastActive, loading, error } = useOnlineStatus(userId);

  // Don't render if loading, no userId, or error occurred
  if (loading || !userId || error) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Chấm trạng thái */}
      <div className={`relative ${sizeClasses[size]}`}>
        <motion.div 
          className={`rounded-full ${
            isOnline 
              ? 'bg-green-500' 
              : 'bg-gray-400'
          }`}
          animate={isOnline ? {
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1]
          } : {}}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ width: '100%', height: '100%' }}
        />
        {isOnline && (
          <motion.div 
            className="absolute inset-0 rounded-full bg-green-500"
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.7, 0, 0.7]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        )}
      </div>

      {/* Text trạng thái */}
      {showText && (
        <span 
          className={`${textSizeClasses[size]} font-semibold ${
            isOnline 
              ? 'bg-gradient-to-r from-purple-600 to-cyan-600 bg-clip-text text-transparent'
              : 'text-gray-500'
          }`}
        >
          {isOnline 
            ? 'Đang hoạt động'
            : formatLastSeen(lastActive)
          }
        </span>
      )}
    </div>
  );
};
