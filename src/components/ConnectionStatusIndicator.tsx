/**
 * Connection Status Indicator Component
 * 
 * Hiển thị trạng thái kết nối network và queued updates cho user.
 * Requirement 4.4: Display connection indicator
 */

import { useState, useEffect } from 'react';

interface ConnectionStatus {
  connected: boolean;
  lastKnownStatus: string | null;
  queuedUpdates: number;
}

interface ConnectionStatusIndicatorProps {
  statusManager: any; // StatusManager instance
  className?: string;
}

/**
 * Component hiển thị connection status indicator
 */
export function ConnectionStatusIndicator({
  statusManager,
  className = '',
}: ConnectionStatusIndicatorProps): React.ReactElement | null {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: true,
    lastKnownStatus: null,
    queuedUpdates: 0,
  });
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!statusManager) return;

    // Poll connection status mỗi 2 seconds
    const interval = setInterval(() => {
      const status = statusManager.getConnectionStatus();
      setConnectionStatus(status);
      
      // Chỉ hiện indicator khi có vấn đề
      setVisible(!status.connected || status.queuedUpdates > 0);
    }, 2000);

    // Check immediately on mount
    const status = statusManager.getConnectionStatus();
    setConnectionStatus(status);
    setVisible(!status.connected || status.queuedUpdates > 0);

    return () => clearInterval(interval);
  }, [statusManager]);

  // Don't show if everything is fine
  if (!visible) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border-l-4 ${
        connectionStatus.connected
          ? 'border-yellow-500'
          : 'border-red-500'
      } ${className}`}
      style={{
        maxWidth: '320px',
        animation: 'slideInLeft 0.3s ease-out',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Status Icon */}
        <div className="flex-shrink-0">
          {connectionStatus.connected ? (
            // Syncing icon
            <svg
              className="w-5 h-5 text-yellow-500 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            // Disconnected icon
            <svg
              className="w-5 h-5 text-red-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
              />
            </svg>
          )}
        </div>

        {/* Status Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {connectionStatus.connected
              ? 'Đang đồng bộ...'
              : 'Kết nối không ổn định'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {connectionStatus.connected ? (
              connectionStatus.queuedUpdates > 0 ? (
                `Đang gửi ${connectionStatus.queuedUpdates} cập nhật...`
              ) : (
                'Đang thử kết nối lại...'
              )
            ) : (
              'Đang thử kết nối lại...'
            )}
          </p>
        </div>
      </div>

      {/* Last known status info */}
      {!connectionStatus.connected && connectionStatus.lastKnownStatus && (
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Trạng thái cuối: <span className="font-medium">{connectionStatus.lastKnownStatus}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// Add CSS animation keyframes
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInLeft {
      from {
        transform: translateX(-100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}

export default ConnectionStatusIndicator;
