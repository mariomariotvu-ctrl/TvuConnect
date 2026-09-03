import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface QuotaWarningProps {
  retryTime: Date | null;
}

export const QuotaWarning: React.FC<QuotaWarningProps> = ({ retryTime }) => {
  if (!retryTime) return null;

  const formatTime = (date: Date) => {
    return date.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-4"
    >
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-amber-900 mb-1">
              Hệ thống đang bảo trì
            </h3>
            <p className="text-sm text-amber-700 mb-2">
              Một số tính năng tạm thời bị giới hạn do đạt giới hạn sử dụng hàng ngày.
            </p>
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <Clock className="w-4 h-4" />
              <span>Hoạt động lại sau: {formatTime(retryTime)}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
