import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProfileCompletionBannerProps {
  isComplete: boolean;
  missingFields: string[];
  onComplete: () => void;
  userId: string;
}

export const ProfileCompletionBanner: React.FC<ProfileCompletionBannerProps> = ({
  isComplete,
  missingFields,
  onComplete,
  userId,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // Check localStorage khi component mount
  useEffect(() => {
    const dismissedKey = `profile_banner_dismissed_${userId}`;
    const dismissed = localStorage.getItem(dismissedKey);
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, [userId]);

  const handleDismiss = () => {
    const dismissedKey = `profile_banner_dismissed_${userId}`;
    localStorage.setItem(dismissedKey, 'true');
    setIsDismissed(true);
  };

  // Không hiện nếu profile đã hoàn thiện hoặc user đã dismiss
  if (isComplete || isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="relative z-30 px-3 md:px-4 py-2 md:py-3"
      >
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-3 md:p-4 shadow-lg">
          <div className="flex items-start gap-2 md:gap-3">
            <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-amber-900 dark:text-amber-100 text-sm md:text-base mb-1 leading-tight">
                Hoàn thiện hồ sơ để mở khóa tất cả tính năng
              </h3>
              <p className="text-[11px] md:text-xs text-amber-800 dark:text-amber-200 mb-2 leading-snug">
                Bạn cần cập nhật: <span className="font-semibold">{missingFields.join(', ')}</span>
              </p>
              <button
                onClick={onComplete}
                className="text-[11px] md:text-xs font-bold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors active:scale-95"
              >
                Cập nhật ngay →
              </button>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
