/**
 * StatusIndicator Component
 * 
 * Hiển thị indicator dot màu sắc cho trạng thái người dùng (online/away/offline).
 * Tương tự như Facebook status indicator với smooth transitions và hover tooltip.
 */

import React, { useState } from 'react';
import { UserStatus } from '../utils/userStatusManager';

export interface StatusIndicatorProps {
  status: UserStatus;
  size?: 'small' | 'medium' | 'large';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  showTooltip?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<UserStatus, string> = {
  online: '#42b72a',   // Green
  away: '#ffa500',     // Orange
  offline: '#8a8d91',  // Gray
};

const STATUS_TEXT: Record<UserStatus, string> = {
  online: 'Đang hoạt động',
  away: 'Không hoạt động',
  offline: 'Ngoại tuyến',
};

const SIZE_CONFIG = {
  small: { dot: 8, border: 2 },
  medium: { dot: 12, border: 2 },
  large: { dot: 16, border: 3 },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 'medium',
  position = 'bottom-right',
  showTooltip = true,
  className = '',
}) => {
  const [showTooltipState, setShowTooltipState] = useState(false);

  const sizeConfig = SIZE_CONFIG[size];
  const color = STATUS_COLORS[status];
  const text = STATUS_TEXT[status];

  // Calculate position offsets
  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: 0, right: 0 },
    'bottom-left': { bottom: 0, left: 0 },
    'top-right': { top: 0, right: 0 },
    'top-left': { top: 0, left: 0 },
  };

  const handleMouseEnter = () => {
    if (showTooltip) {
      setTimeout(() => setShowTooltipState(true), 300);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltipState(false);
  };

  return (
    <div
      className={`status-indicator-wrapper ${className}`}
      style={{
        position: 'absolute',
        ...positionStyles[position],
        zIndex: 10,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseEnter}
    >
      {/* Status Dot */}
      <div
        className="status-dot"
        style={{
          width: sizeConfig.dot,
          height: sizeConfig.dot,
          borderRadius: '50%',
          backgroundColor: color,
          border: `${sizeConfig.border}px solid white`,
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.2s ease-in-out',
          cursor: showTooltip ? 'pointer' : 'default',
          minWidth: 44, // Touch target for mobile
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Inner dot (actual visible dot) */}
        <div
          style={{
            width: sizeConfig.dot,
            height: sizeConfig.dot,
            borderRadius: '50%',
            backgroundColor: color,
            position: 'absolute',
          }}
        />
      </div>

      {/* Tooltip */}
      {showTooltip && showTooltipState && (
        <div
          className="status-tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            padding: '6px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 100,
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          {text}
          {/* Tooltip arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(0, 0, 0, 0.8)',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default StatusIndicator;
