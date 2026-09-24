import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Bell,
  Check,
  CheckCheck,
  Heart,
  MapPin,
  MessageCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AppNotification, AppNotificationType } from '../types';
import {
  markNotificationRead,
  markNotificationsRead,
  safeNotificationRoute,
  subscribeToNotifications,
} from '../services/notificationCenterService';

interface NotificationCenterProps {
  currentUser: User;
  onOpenRoute: (route: string) => void;
}

type NotificationFilter = 'all' | 'unread' | 'connections' | 'activity' | 'nearby';

const CONNECTION_TYPES = new Set<AppNotificationType>([
  'friend_request',
  'friend_accepted',
  'new_profile',
  'dating_match',
]);

const ACTIVITY_TYPES = new Set<AppNotificationType>([
  'comment',
  'reply',
]);

const iconFor = (type: AppNotificationType) => {
  if (type === 'friend_request') return UserPlus;
  if (type === 'friend_accepted') return Users;
  if (type === 'encounter') return MapPin;
  if (type === 'dating_match') return Heart;
  if (type === 'new_profile') return UserPlus;
  if (type === 'comment' || type === 'reply') return MessageCircle;
  return Bell;
};

const styleFor = (type: AppNotificationType) => {
  if (type === 'dating_match') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300';
  if (type === 'encounter') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
  return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300';
};

const relativeTime = (value?: AppNotification['createdAt']) => {
  const date = value?.toDate?.();
  if (!date) return 'Vừa xong';
  const difference = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (Math.abs(difference) < hour) return formatter.format(Math.round(difference / minute), 'minute');
  if (Math.abs(difference) < day) return formatter.format(Math.round(difference / hour), 'hour');
  if (Math.abs(difference) < 7 * day) return formatter.format(Math.round(difference / day), 'day');
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ currentUser, onOpenRoute }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => subscribeToNotifications(currentUser.uid, (items) => {
    setNotifications(items);
    setLoading(false);
  }, (error) => {
    console.error('Could not load notifications:', error);
    setLoading(false);
    toast.error('Chưa thể tải thông báo. Vui lòng thử lại.');
  }), [currentUser.uid]);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const visibleNotifications = useMemo(() => notifications.filter((notification) => {
    if (filter === 'unread') return !notification.readAt;
    if (filter === 'connections') return CONNECTION_TYPES.has(notification.type);
    if (filter === 'activity') return ACTIVITY_TYPES.has(notification.type);
    if (filter === 'nearby') return notification.type === 'encounter';
    return true;
  }), [filter, notifications]);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      try {
        await markNotificationRead(currentUser.uid, notification.id);
      } catch (error) {
        console.error('Could not mark notification read:', error);
      }
    }
    onOpenRoute(safeNotificationRoute(notification.route));
  };

  const markAllRead = async () => {
    if (!unreadCount || markingAll) return;
    setMarkingAll(true);
    try {
      await markNotificationsRead(currentUser.uid, notifications);
    } catch (error) {
      console.error('Could not mark notifications read:', error);
      toast.error('Chưa thể đánh dấu đã đọc.');
    } finally {
      setMarkingAll(false);
    }
  };

  const filters: Array<{ id: NotificationFilter; label: string }> = [
    { id: 'all', label: 'Tất cả' },
    { id: 'unread', label: `Chưa đọc${unreadCount ? ` (${unreadCount})` : ''}` },
    { id: 'connections', label: 'Kết nối' },
    { id: 'activity', label: 'Hoạt động' },
    { id: 'nearby', label: 'Gần bạn' },
  ];

  return (
    <section className="mx-auto max-w-3xl">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Trung tâm thông báo</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Kết nối và hoạt động mới</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Lời mời kết bạn, tương tác cộng đồng, người phù hợp và những phát hiện quanh bạn.</p>
        </div>
        <button
          type="button"
          disabled={!unreadCount || markingAll}
          onClick={() => void markAllRead()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <CheckCheck className="h-4 w-4" />
          Đánh dấu tất cả đã đọc
        </button>
      </header>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 p-3.5 dark:border-blue-900/50 dark:bg-blue-950/25 sm:flex-row sm:items-center sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">Tin nhắn và cuộc gọi ở Hộp thư</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">Số chưa đọc được hiển thị ngay trên tab Tin nhắn, giống các ứng dụng nhắn tin.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenRoute('/messages')}
          className="min-h-10 w-full shrink-0 rounded-xl bg-white px-3 text-xs font-extrabold text-blue-700 shadow-sm ring-1 ring-blue-100 dark:bg-slate-900 dark:text-blue-300 dark:ring-blue-900 sm:w-auto"
        >
          Mở Tin nhắn
        </button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Lọc thông báo">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors ${
              filter === item.id
                ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-5" aria-label="Đang tải thông báo">
            {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Chưa có thông báo trong mục này</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kết nối, tương tác và phát hiện mới sẽ xuất hiện ở đây theo thời gian thực.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleNotifications.map((notification) => {
              const Icon = iconFor(notification.type);
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className={`flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70 sm:px-5 ${!notification.readAt ? 'bg-indigo-50/45 dark:bg-indigo-950/15' : ''}`}
                  >
                    {notification.actorPhotoURL ? (
                      <img src={notification.actorPhotoURL} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${styleFor(notification.type)}`}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <strong className="text-sm font-extrabold text-slate-900 dark:text-white">{notification.title}</strong>
                        <span className="shrink-0 text-xs text-slate-400">{relativeTime(notification.createdAt)}</span>
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-slate-600 dark:text-slate-300">{notification.body}</span>
                    </span>
                    {!notification.readAt ? (
                      <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600" aria-label="Chưa đọc" />
                    ) : (
                      <Check className="mt-1 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-label="Đã đọc" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
