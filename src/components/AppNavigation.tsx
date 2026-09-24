import React from 'react';
import { BookOpen, FileText, Home, MapPin, Menu, MessageSquare, Users } from 'lucide-react';
import type { View } from '../types';
import { preloadRoute } from '../utils/routePreloader';

interface AppNavigationProps {
  view: View;
  mobile?: boolean;
  moreOpen?: boolean;
  messageUnreadCount?: number;
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

export const AppNavigation: React.FC<AppNavigationProps> = ({
  view,
  mobile = false,
  moreOpen = false,
  messageUnreadCount = 0,
  onNavigate,
  onMore,
}) => {
  const items = mobile ? mobileItems : desktopItems;

  return (
    <div className={mobile ? 'app-tabs' : 'app-nav'} role="navigation" aria-label="Điều hướng chính">
      {items.map(({ view: itemView, label, icon: Icon }) => {
        const active = isItemActive(view, itemView);
        return (
          <button
            key={itemView}
            type="button"
            aria-label={itemView === 'conversations' && messageUnreadCount > 0
              ? `${label}, ${messageUnreadCount > 99 ? 'hơn 99' : messageUnreadCount} chưa đọc`
              : label}
            data-tour={`${mobile ? 'mobile' : 'desktop'}-${itemView === 'conversations' ? 'messages' : itemView}`}
            className={`relative ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onMouseEnter={() => preloadName[itemView] && preloadRoute(preloadName[itemView]!)}
            onFocus={() => preloadName[itemView] && preloadRoute(preloadName[itemView]!)}
            onClick={() => onNavigate(itemView)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {itemView === 'conversations' && messageUnreadCount > 0 && (
              <span
                aria-hidden="true"
                className={mobile
                  ? 'absolute right-2 top-1 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-extrabold leading-4 text-white ring-2 ring-white dark:ring-slate-950'
                  : 'min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-extrabold leading-4 text-white'}
              >
                {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
              </span>
            )}
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
