// Use cached version to prevent duplicate Firestore listeners
import { useOnlineStatusCached } from './useOnlineStatusCache';

export interface OnlineStatus {
  isOnline: boolean;
  lastActive: Date | null;
  loading: boolean;
  error: boolean;
}

export function useOnlineStatus(userId: string | undefined): OnlineStatus {
  return useOnlineStatusCached(userId);
}

// Helper function to format last seen time
export function formatLastSeen(lastActive: Date | null): string {
  if (!lastActive) return 'Không hoạt động';
  
  const now = new Date();
  const diff = now.getTime() - lastActive.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (seconds < 30) return 'Vừa hoạt động';
  if (minutes < 1) return 'Hoạt động vài giây trước';
  if (minutes === 1) return 'Hoạt động 1 phút trước';
  if (minutes < 60) return `Hoạt động ${minutes} phút trước`;
  if (hours === 1) return 'Hoạt động 1 giờ trước';
  if (hours < 24) return `Hoạt động ${hours} giờ trước`;
  if (days === 1) return 'Hoạt động hôm qua';
  if (days < 7) return `Hoạt động ${days} ngày trước`;
  if (days < 30) return `Hoạt động ${Math.floor(days / 7)} tuần trước`;
  return 'Hoạt động lâu rồi';
}
