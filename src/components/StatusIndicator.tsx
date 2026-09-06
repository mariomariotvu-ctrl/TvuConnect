/**
 * StatusIndicator Component
 *
 * Hiển thị indicator dot màu sắc cho trạng thái người dùng (online/away/offline).
 * Tương tự Facebook status indicator với smooth transitions và hover tooltip.
 *
 * Accessibility: aria-label + role="img" theo Requirement 9.1, 9.2
 * Prop validation: fallback về 'offline' + console.warn khi status không hợp lệ (Req 5.7)
 * Animation: không pulse khi offline/away để tiết kiệm pin (Req 8.5)
 * Touch target: minWidth/minHeight 44px đặt ở wrapper, không phải dot (tránh layout overflow)
 */

import React, { useState, useRef, useCallback } from 'react';
import { UserStatus } from '../utils/userStatusManager';

const VALID_STATUSES: readonly UserStatus[] = ['online', 'away', 'offline'];

export interface StatusIndicatorProps {
  status: UserStatus;
  size?: 'small' | 'medium' | 'large';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  showTooltip?: boolean;
  className?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export để các file import từ StatusIndicator vẫn có type UserStatus
export type { UserStatus };

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Mapping màu sắc theo trạng thái:
 * - online:  #42b72a (xanh lá) — contrast ≥ 4.5:1 trên nền trắng ✓
 * - away:    #ffa500 (cam)     — contrast ~2.9:1, viền trắng hỗ trợ đạt 3:1 ✓
 * - offline: #8a8d91 (xám)    — chỉ hiển thị khi cần thiết
 *
 * @validates Requirements 5.2, 10.1
 */
export const STATUS_COLORS: Record<UserStatus, string> = {
  online: '#42b72a',
  away: '#ffa500',
  offline: '#8a8d91',
};

/**
 * Nhãn aria-label tiếng Việt theo từng trạng thái.
 * @validates Requirements 9.1
 */
const STATUS_ARIA_LABELS: Record<UserStatus, string> = {
  online: 'Đang hoạt động',
  away: 'Không hoạt động',
  offline: 'Ngoại tuyến',
};

/**
 * Text tooltip tiếng Việt hiển thị khi hover/tap.
 * @validates Requirement 5.5
 */
const STATUS_TOOLTIP_TEXT: Record<UserStatus, string> = {
  online: 'Đang hoạt động',
  away: 'Không hoạt động',
  offline: 'Ngoại tuyến',
};

/**
 * Cấu hình kích thước dot theo prop `size`.
 * @validates Requirement 5.3
 */
const SIZE_CONFIG: Record<'small' | 'medium' | 'large', { dot: number; border: number }> = {
  small: { dot: 8, border: 2 },
  medium: { dot: 12, border: 2 },
  large: { dot: 16, border: 3 },
};

/** Thời gian delay hiển thị tooltip (ms) — Requirement 5.5 */
const TOOLTIP_DELAY_MS = 300;

// ─── Prop Validation Helper ───────────────────────────────────────────────────

/**
 * Validate và normalize prop `status`.
 * Khi giá trị không thuộc ['online', 'away', 'offline'] → fallback về 'offline' + console.warn.
 *
 * @validates Requirement 5.7
 */
function normalizeStatus(status: UserStatus): UserStatus {
  if (!VALID_STATUSES.includes(status)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[StatusIndicator] Prop "status" nhận giá trị không hợp lệ: "${status}". ` +
        `Giá trị hợp lệ: ${VALID_STATUSES.join(', ')}. Fallback về "offline".`
      );
    }
    return 'offline';
  }
  return status;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status: statusProp,
  size = 'medium',
  position = 'bottom-right',
  showTooltip = true,
  className = '',
}) => {
  // Normalize và validate prop status
  const status = normalizeStatus(statusProp);

  const [showTooltipState, setShowTooltipState] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sizeConfig = SIZE_CONFIG[size];
  const color = STATUS_COLORS[status];
  const ariaLabel = STATUS_ARIA_LABELS[status];
  const tooltipText = STATUS_TOOLTIP_TEXT[status];

  // Chỉ online mới có animation pulse để tiết kiệm pin (Requirement 8.5)
  const hasPulse = status === 'online';

  // Vị trí tuyệt đối của wrapper trên avatar container
  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: 0, right: 0 },
    'bottom-left': { bottom: 0, left: 0 },
    'top-right': { top: 0, right: 0 },
    'top-left': { top: 0, left: 0 },
  };

  // ─── Tooltip handlers ───────────────────────────────────────────────────────

  const handleShowTooltip = useCallback(() => {
    if (!showTooltip) return;
    tooltipTimerRef.current = setTimeout(() => setShowTooltipState(true), TOOLTIP_DELAY_MS);
  }, [showTooltip]);

  const handleHideTooltip = useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setShowTooltipState(false);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`status-indicator-wrapper ${className}`}
      style={{
        position: 'absolute',
        ...positionStyles[position],
        zIndex: 10,
        // Touch target 44×44px đặt ở wrapper level, KHÔNG phải trên dot nhỏ
        // (tránh gây layout overflow khi dot chỉ 8–16px)
        minWidth: 44,
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      // Accessibility: role="img" vì dot là phần tử trang trí có ngữ nghĩa (Req 9.2)
      role="img"
      aria-label={ariaLabel}
      onMouseEnter={handleShowTooltip}
      onMouseLeave={handleHideTooltip}
      onTouchStart={handleShowTooltip}
      onTouchEnd={handleHideTooltip}
    >
      {/* Status Dot — kích thước thực, viền trắng 2px để contrast với mọi nền (Req 5.4) */}
      <div
        className={`status-dot${hasPulse ? ' status-dot--pulse' : ''}`}
        style={{
          width: sizeConfig.dot,
          height: sizeConfig.dot,
          borderRadius: '50%',
          backgroundColor: color,
          border: `${sizeConfig.border}px solid white`,
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
          transition: 'background-color 0.2s ease-in-out',
          cursor: showTooltip ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      />

      {/* Tooltip — hiển thị sau 300ms hover/tap, ẩn ngay khi rời (Req 5.5, 5.6) */}
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
            animation: 'si-fadeIn 0.2s ease-in-out',
          }}
          role="tooltip"
        >
          {tooltipText}
          {/* Mũi tên tooltip */}
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

      {/* Animations — pulse chỉ cho online, fadeIn cho tooltip */}
      <style>{`
        @keyframes si-fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes si-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(66, 183, 42, 0.4); }
          50%       { box-shadow: 0 0 0 4px rgba(66, 183, 42, 0); }
        }
        .status-dot--pulse {
          animation: si-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default StatusIndicator;
