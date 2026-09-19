import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Bell, X } from 'lucide-react';
import { requestNotificationPermission } from '../utils/fcm';
import { shouldShowPermissionPrompt } from '../utils/notifications';
import { logger } from '@/utils/logger';
import { isIosDevice, isStandaloneApp } from '../utils/platform';

interface NotificationPermissionProps {
  currentUser: User;
}

export const NotificationPermission: React.FC<NotificationPermissionProps> = ({ 
  currentUser 
}) => {
  const [showBanner, setShowBanner] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    // iOS/iPadOS only allows Web Push from an app added to the Home Screen.
    // InstallPrompt explains that step first instead of showing a dead button.
    if (isIosDevice() && !isStandaloneApp()) return;

    // Check if should show banner
    const checkPermission = () => {
      if (shouldShowPermissionPrompt()) {
        // Show after 3 seconds to not be intrusive
        const timer = window.setTimeout(() => setShowBanner(true), 3000);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    };

    return checkPermission();
  }, []);

  const handleAllow = async () => {
    setIsRequesting(true);
    
    try {
      const token = await requestNotificationPermission(currentUser.uid);
      
      if (token) {
        logger.log('✅ Notifications enabled');
        setShowBanner(false);
        localStorage.removeItem('notification-banner-dismissed');
        localStorage.removeItem('notification-banner-dismissed-time');
      } else {
        logger.log('❌ Notifications denied');
        setShowBanner(false);
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('notification-banner-dismissed', 'true');
    localStorage.setItem('notification-banner-dismissed-time', Date.now().toString());
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4 animate-slide-down">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
            <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">
              Bật thông báo TVU Connect?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Tin nhắn và cuộc gọi mới sẽ dùng âm báo của thiết bị, kể cả khi TVU Connect đã đóng.
            </p>
            
            <div className="flex gap-2">
              <button
                onClick={handleAllow}
                disabled={isRequesting}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
              >
                {isRequesting ? 'Đang xử lý...' : 'Cho phép'}
              </button>
              <button
                onClick={handleDismiss}
                disabled={isRequesting}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium text-sm transition-colors"
              >
                Để sau
              </button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            disabled={isRequesting}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
