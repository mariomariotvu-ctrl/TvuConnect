import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { subscribeToNotifications } from '../services/notificationCenterService';

interface NotificationBellProps {
  uid: string;
  active?: boolean;
  onOpen: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ uid, active = false, onOpen }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => subscribeToNotifications(
    uid,
    (notifications) => setUnreadCount(notifications.filter((notification) => !notification.readAt).length),
    () => setUnreadCount(0),
    50,
  ), [uid]);

  const label = unreadCount
    ? `Thông báo, ${unreadCount} mục chưa đọc`
    : 'Thông báo';

  return (
    <button
      type="button"
      data-tour="notifications"
      onClick={onOpen}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative grid h-11 w-11 place-items-center rounded-full border transition-colors ${
        active
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white dark:ring-slate-950">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
