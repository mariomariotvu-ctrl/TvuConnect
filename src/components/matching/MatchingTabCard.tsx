import React from 'react';

interface MatchingTabCardProps {
  mode: 'lover' | 'quick' | 'study' | 'hobby';
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  heightClass: string;
  paddingClass: string;
  isLocked: boolean;
  onClick: () => void;
}

export const MatchingTabCard: React.FC<MatchingTabCardProps> = ({
  mode,
  title,
  description,
  icon: Icon,
  heightClass,
  paddingClass,
  isLocked,
  onClick,
}) => {
  return (
    <div
      className={`relative bg-white dark:bg-gray-800 rounded-[24px] border border-gray-100 dark:border-gray-700 shadow-xl ${heightClass} ${paddingClass} cursor-pointer transition-all duration-200`}
      onClick={onClick}
    >
      {isLocked && (
        <div className="absolute top-4 right-4 text-2xl">🔒</div>
      )}
      <div className="flex flex-col items-center justify-center h-full">
        <Icon className="w-12 h-12 mb-3" />
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{description}</p>
      </div>
    </div>
  );
};
