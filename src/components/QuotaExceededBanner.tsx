import React from 'react';
import { CloudOff, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QuotaExceededBannerProps {
  isVisible: boolean;
}

export const QuotaExceededBanner: React.FC<QuotaExceededBannerProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-20 md:top-24 left-0 right-0 z-40 px-4 py-2"
      >
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 border-2 border-red-300 dark:border-red-800 rounded-xl p-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="bg-red-200 dark:bg-red-800 p-2 rounded-full">
              <CloudOff className="w-4 h-4 text-red-700 dark:text-red-300" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-900 dark:text-red-100 text-sm">
                Hạn mức hệ thống đã đạt giới hạn (Firestore Quota)
              </h3>
              <p className="text-[10px] md:text-xs text-red-800 dark:text-red-200 opacity-90">
                Tính năng nhắn tin và ghép cặp có thể bị gián đoạn. Hạn mức sẽ được reset vào 7:00 sáng mai (giờ VN).
              </p>
            </div>
            <div className="hidden md:block bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded text-[10px] font-mono text-red-800 dark:text-red-300">
              RETRY AT 07:00 AM
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
