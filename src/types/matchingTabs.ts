import React from 'react';

export interface MatchingTabConfig {
  id: 'lover' | 'quick' | 'study' | 'hobby';
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  heightClass: 'h-48' | 'h-56';
  paddingClass: string;
  isLocked: boolean;
}

export interface ZigzagLayoutProps {
  tabs: MatchingTabConfig[];
  currentUser: any;
  onTabClick: (mode: string) => void;
  isProfileComplete: boolean;
}

export interface TabCardProps {
  config: MatchingTabConfig;
  isLocked: boolean;
  onClick: () => void;
  heightClass: string;
  paddingClass: string;
}

export interface LayoutConfig {
  desktop: {
    gridCols: 'grid-cols-4';
    gap: 'gap-4';
    tabHeights: ['h-48', 'h-56', 'h-56', 'h-48'];
  };
  mobile: {
    gridCols: 'grid-cols-2';
    gap: 'gap-3';
    tabHeights: ['h-auto', 'h-auto', 'h-auto', 'h-auto'];
  };
}
