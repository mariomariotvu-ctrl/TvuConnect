/**
 * OnlineStatus Component
 *
 * Hiển thị trạng thái online/away/offline kèm text mô tả cho một người dùng.
 * Dùng `useOnlineStatusCached` để đọc trạng thái, `formatLastSeen` từ module
 * riêng để định dạng thời gian.
 *
 * Quy tắc render:
 * - `!userId` hoặc chuỗi rỗng → null (không render)
 * - `loading === true`         → null (tránh flash nội dung sai — Property 6)
 * - `error === true`           → null (ẩn component, không hiện lỗi)
 * - `isOnline === true`        → dot xanh + "Đang hoạt động"
 * - away (không online, lastActive gần đây) → dot cam + "Không hoạt động"
 * - offline                    → dot xám + formatLastSeen(lastActive)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7
 */

import React from 'react';
import { useOnlineStatusCached } from '../hooks/useOnlineStatusCache';
import { formatLastSeen } from '../utils/formatLastSeen';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface OnlineStatusProps {
  userId: string | undefined;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kích thước dot theo prop size */
const DOT_SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

/** Kích thước text theo prop size */
const TEXT_SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/** Màu sắc dot theo trạng thái — đồng bộ với STATUS_COLORS trong StatusIndicator */
const STATUS_DOT_COLORS = {
  online:  '#42b72a', // xanh lá
  away:    '#ffa500', // cam
  offline: '#8a8d91', // xám
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const OnlineStatus: React.FC<OnlineStatusProps> = ({
  userId,
  size = 'md',
  showText = true,
  className = '',
}) => {
  // Hook luôn được gọi (không điều kiện) — guard userId bên dưới
  const { isOnline, lastActive, loading, error } = useOnlineStatusCached(userId);

  // Guard 1: userId không hợp lệ → không render (Req 4.5)
  if (!userId || userId.trim() === '') {
    return null;
  }

  // Guard 2: đang tải lần đầu → không render để tránh flash (Property 6, Req 4.7)
  if (loading) {
    return null;
  }

  // Guard 3: lỗi → ẩn component, không hiện thông báo lỗi (Req 4.8)
  if (error) {
    return null;
  }

  // Xác định trạng thái hiển thị
  // Hook không trả về field `status` trực tiếp, nên suy luận từ isOnline + lastActive.
  // - isOnline === true → online (Req 3.2, 4.2)
  // - isOnline === false + lastActive có dữ liệu nhưng chưa lâu → có thể là away
  //   Tuy nhiên hook chỉ cung cấp isOnline/lastActive, không có "away" flag riêng.
  //   Theo design: trạng thái away được ghi bởi StatusManager lên Firebase,
  //   nhưng `useOnlineStatusCached` chỉ đọc `isOnline` từ Firestore (không phải `status`).
  //   Do đó: away = isOnline === false VÀ lastActive trong vòng 5 phút (300_000ms)
  const MS_5_MINUTES = 300_000;
  const lastActiveMs = lastActive?.getTime() ?? null;
  const isAway =
    !isOnline &&
    lastActiveMs !== null &&
    Math.abs(Date.now() - lastActiveMs) < MS_5_MINUTES;

  // Chọn màu dot và text
  let dotColor: string;
  let statusText: string;

  if (isOnline) {
    // Đang online (Req 3.2, 4.2)
    dotColor = STATUS_DOT_COLORS.online;
    statusText = 'Đang hoạt động';
  } else if (isAway) {
    // Away — không hoạt động gần đây (Req 3.3, 4.3)
    dotColor = STATUS_DOT_COLORS.away;
    statusText = 'Không hoạt động';
  } else {
    // Offline — hiển thị thời gian cuối (Req 3.4, 4.4)
    dotColor = STATUS_DOT_COLORS.offline;
    statusText = formatLastSeen(lastActive);
  }

  const dotSizeClass = DOT_SIZE_CLASSES[size];
  const textSizeClass = TEXT_SIZE_CLASSES[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Dot trạng thái */}
      <div
        className={`rounded-full flex-shrink-0 ${dotSizeClass}`}
        style={{ backgroundColor: dotColor }}
        role="img"
        aria-label={isOnline ? 'Đang hoạt động' : isAway ? 'Không hoạt động' : 'Ngoại tuyến'}
      />

      {/* Text trạng thái */}
      {showText && (
        <span
          className={`${textSizeClass} font-semibold ${
            isOnline
              ? 'bg-gradient-to-r from-purple-600 to-cyan-600 bg-clip-text text-transparent'
              : 'text-gray-500'
          }`}
        >
          {statusText}
        </span>
      )}
    </div>
  );
};

export default OnlineStatus;
