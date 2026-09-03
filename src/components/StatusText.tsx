/**
 * StatusText Component
 * 
 * Hiển thị text mô tả trạng thái người dùng với time formatting tương tự Facebook.
 * Tự động cập nhật mỗi 60 giây để đảm bảo độ chính xác.
 */

import React, { useState, useEffect } from 'react';
import { UserStatus } from '../utils/userStatusManager';

export interface StatusTextProps {
  status: UserStatus;
  lastActive: number;
  format?: 'short' | 'long';
  showOnlineText?: boolean;
  className?: string;
}

/**
 * Format timestamp thành text dạng "Active X minutes ago"
 */
function formatTimeAgo(timestamp: number, format: 'short' | 'long' = 'long'): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (format === 'short') {
    if (diffMinutes < 1) return 'vừa xong';
    if (diffMinutes < 60) return `${diffMinutes}p`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  // Long format
  if (diffMinutes < 1) return 'Hoạt động vừa xong';
  if (diffMinutes === 1) return 'Hoạt động 1 phút trước';
  if (diffMinutes < 60) return `Hoạt động ${diffMinutes} phút trước`;
  if (diffHours === 1) return 'Hoạt động 1 giờ trước';
  if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
  if (diffDays === 1) return 'Hoạt động 1 ngày trước';
  return `Hoạt động ${diffDays} ngày trước`;
}

export const StatusText: React.FC<StatusTextProps> = ({
  status,
  lastActive,
  format = 'long',
  showOnlineText = true,
  className = '',
}) => {
  const [timeText, setTimeText] = useState<string>('');

  // Update time text
  const updateTimeText = () => {
    if (status === 'online' && showOnlineText) {
      setTimeText('Đang hoạt động');
    } else {
      setTimeText(formatTimeAgo(lastActive, format));
    }
  };

  useEffect(() => {
    // Initial update
    updateTimeText();

    // Setup interval to update every 60 seconds
    const interval = setInterval(() => {
      updateTimeText();
    }, 60000); // 60 seconds

    // Cleanup interval on unmount
    return () => {
      clearInterval(interval);
    };
  }, [status, lastActive, format, showOnlineText]);

  return (
    <span
      className={`status-text ${className}`}
      style={{
        color: '#8a8d91',
        fontSize: 13,
        fontWeight: 400,
      }}
    >
      {timeText}
    </span>
  );
};

export default StatusText;
