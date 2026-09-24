import React from 'react';
import { Home, MapPin, Menu, MessageSquare, Users } from 'lucide-react';
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

const primaryItems = [
  { view: 'home' as const, label: 'Trang chủ', icon: Home },
  { view: 'students' as const, label: 'Kết nối', icon: Users },
  { view: 'conversations' as const, label: 'Tin nhắn', icon: MessageSquare },
  { view: 'explore' as const, label: 'Quanh bạn', icon: MapPin },
];

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
  const items = primaryItems;
  const moreActive = moreOpen || ['profile', 'notifications', 'settings', 'documents', 'posts'].includes(view);

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
      <button
        type="button"
        data-menu-toggle="true"
        data-tour={`${mobile ? 'mobile' : 'desktop'}-more`}
        className={moreActive ? 'is-active' : undefined}
        aria-label="Mở tất cả tiện ích"
        aria-expanded={moreOpen}
        aria-controls="utility-menu-container"
        onClick={onMore}
      >
        <Menu aria-hidden="true" />
        <span>Tiện ích</span>
      </button>
    </div>
  );
};
