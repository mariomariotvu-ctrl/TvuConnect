import React from 'react';
import { BookOpen, FileText, Home, MapPin, Menu, MessageSquare, Users } from 'lucide-react';
import type { View } from '../types';
import { preloadRoute } from '../utils/routePreloader';

interface AppNavigationProps {
  view: View;
  mobile?: boolean;
  moreOpen?: boolean;
  onNavigate: (view: View) => void;
  onMore?: () => void;
}

const desktopItems = [
  { view: 'home' as const, label: 'Trang chủ', icon: Home },
  { view: 'students' as const, label: 'Tìm bạn', icon: Users },
  { view: 'conversations' as const, label: 'Tin nhắn', icon: MessageSquare },
  { view: 'posts' as const, label: 'Cộng đồng', icon: FileText },
  { view: 'documents' as const, label: 'Tài liệu', icon: BookOpen },
  { view: 'explore' as const, label: 'Khám phá', icon: MapPin },
];

const mobileItems = desktopItems.filter(({ view }) =>
  ['home', 'students', 'conversations', 'explore'].includes(view),
);

const isItemActive = (current: View, item: View) => {
  if (item === 'students') return ['students', 'matching', 'results'].includes(current);
  if (item === 'conversations') return ['conversations', 'chat'].includes(current);
  return current === item;
};

const preloadName: Partial<Record<View, string>> = {
  students: 'students',
  conversations: 'conversations',
  posts: 'posts',
  documents: 'documents',
  explore: 'map',
};

export const AppNavigation: React.FC<AppNavigationProps> = ({ view, mobile = false, moreOpen = false, onNavigate, onMore }) => {
  const items = mobile ? mobileItems : desktopItems;

  return (
    <div className={mobile ? 'app-tabs' : 'app-nav'} role="navigation" aria-label="Điều hướng chính">
      {items.map(({ view: itemView, label, icon: Icon }) => {
        const active = isItemActive(view, itemView);
        return (
          <button
            key={itemView}
            type="button"
            data-tour={`${mobile ? 'mobile' : 'desktop'}-${itemView === 'conversations' ? 'messages' : itemView}`}
            className={active ? 'is-active' : undefined}
            aria-current={active ? 'page' : undefined}
            onMouseEnter={() => preloadName[itemView] && preloadRoute(preloadName[itemView]!)}
            onFocus={() => preloadName[itemView] && preloadRoute(preloadName[itemView]!)}
            onClick={() => onNavigate(itemView)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
      {mobile && (
        <button
          type="button"
          data-menu-toggle="true"
          data-tour="mobile-more"
          className={moreOpen || ['profile', 'notifications', 'settings', 'documents', 'posts'].includes(view) ? 'is-active' : undefined}
          aria-expanded={moreOpen}
          aria-controls="mobile-menu-container"
          onClick={onMore}
        >
          <Menu aria-hidden="true" />
          <span>Thêm</span>
        </button>
      )}
    </div>
  );
};
