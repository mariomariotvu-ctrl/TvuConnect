import React from 'react';
import { motion } from 'motion/react';

const Shimmer = () => (
  <motion.div
    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full"
    animate={{ translateX: '200%' }}
    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
  />
);

export const ProfileCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 relative overflow-hidden border border-gray-100">
    <div className="flex flex-col items-center">
      <div className="w-32 h-32 bg-gray-100 rounded-full mb-6 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="h-8 bg-gray-100 rounded-2xl w-48 mb-2 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="h-4 bg-gray-100 rounded-xl w-32 mb-8 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="space-y-4 w-full">
        <div className="h-4 bg-gray-100 rounded-xl w-full relative overflow-hidden">
          <Shimmer />
        </div>
        <div className="h-4 bg-gray-100 rounded-xl w-5/6 relative overflow-hidden">
          <Shimmer />
        </div>
        <div className="h-4 bg-gray-100 rounded-xl w-4/6 relative overflow-hidden">
          <Shimmer />
        </div>
      </div>
    </div>
  </div>
);

export const ConversationSkeleton: React.FC = () => (
  <div className="flex items-center gap-4 p-4 bg-white rounded-3xl border border-gray-50 shadow-sm relative overflow-hidden">
    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex-shrink-0 relative overflow-hidden">
      <Shimmer />
    </div>
    <div className="flex-1 min-w-0 space-y-3">
      <div className="h-4 bg-gray-100 rounded-xl w-32 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="h-3 bg-gray-50 rounded-lg w-48 relative overflow-hidden">
        <Shimmer />
      </div>
    </div>
  </div>
);

export const MessageSkeleton: React.FC = () => (
  <div className="flex gap-3 relative overflow-hidden">
    <div className="w-9 h-9 bg-gray-100 rounded-2xl flex-shrink-0 relative overflow-hidden">
      <Shimmer />
    </div>
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-100 rounded-xl w-24 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="h-16 bg-gray-100 rounded-[1.5rem] w-full max-w-md relative overflow-hidden">
        <Shimmer />
      </div>
    </div>
  </div>
);

export const MatchingCardSkeleton: React.FC = () => (
  <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 relative overflow-hidden">
    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex-shrink-0 relative overflow-hidden">
      <Shimmer />
    </div>
    <div className="flex-1 space-y-3">
      <div className="h-4 bg-gray-100 rounded-xl w-32 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="h-3 bg-gray-50 rounded-lg w-48 relative overflow-hidden">
        <Shimmer />
      </div>
      <div className="flex gap-2">
        <div className="h-6 bg-gray-50 rounded-lg w-16 relative overflow-hidden">
          <Shimmer />
        </div>
        <div className="h-6 bg-gray-50 rounded-lg w-12 relative overflow-hidden">
          <Shimmer />
        </div>
      </div>
    </div>
    <div className="h-10 bg-gray-100 rounded-2xl w-20 relative overflow-hidden">
      <Shimmer />
    </div>
  </div>
);

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', color = 'indigo' }) => {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-10 h-10 border-3',
    lg: 'w-16 h-16 border-4',
  };

  return (
    <motion.div
      className={`${sizeClasses[size]} border-${color}-100 border-t-${color}-600 rounded-full`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    />
  );
};
