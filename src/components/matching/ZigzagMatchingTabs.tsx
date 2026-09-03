import React from 'react';

interface ZigzagMatchingTabsProps {
  currentUser: any;
  onModeSelect: (mode: 'lover' | 'quick' | 'study' | 'hobby') => void;
  isProfileComplete: boolean;
}

export const ZigzagMatchingTabs: React.FC<ZigzagMatchingTabsProps> = ({
  currentUser,
  onModeSelect,
  isProfileComplete,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {/* Tabs will be rendered here */}
    </div>
  );
};
