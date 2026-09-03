import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, Sparkles, QrCode, Clock, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { generateVietQRCode } from '../utils/subscriptionManager';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  trialDaysLeft: number;
  featureName?: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  userId,
  trialDaysLeft,
  featureName = 'tính năng này',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showQR, setShowQR] = useState(false);
  const qrCodeUrl = generateVietQRCode(userId, 3000);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ height: '100dvh' }}>
        {/* Backdrop with blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 backdrop-blur-md"
          style={{
            background: isDark 
              ? 'rgba(0, 0, 0, 0.7)' 
              : 'rgba(0, 0, 0, 0.4)',
          }}
          onClick={onClose}
        />

        {/* Modal Content - Glassmorphism */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
          className="relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          style={{
            background: isDark
              ? 'rgba(31, 41, 55, 0.8)'
              : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
          }}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full transition-all hover:scale-110 active:scale-95 z-10"
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            }}
          >
            <X className="w-5 h-5" style={{ color: isDark ? '#f3f4f6' : '#374151' }} />
          </button>

          {/* Header with Gradient */}
          <div
            className="relative p-8 text-center"
            style={{
              background: 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
            }}
          >
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-white/20 backdrop-blur-sm">
                <Lock className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Nâng cấp Premium
            </h2>
            <p className="text-white/90 text-sm">
              Mở khóa {featureName} và nhiều tính năng khác
            </p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Trial Status */}
            {trialDaysLeft > 0 && (
              <div
                className="p-4 rounded-xl flex items-center gap-3"
                style={{
                  background: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                  border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
                }}
              >
                <Clock className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: isDark ? '#60a5fa' : '#2563eb' }}>
                    Dùng thử còn {trialDaysLeft} ngày
                  </p>
                  <p className="text-xs" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                    Sau đó cần đóng góp để tiếp tục sử dụng
                  </p>
                </div>
              </div>
            )}

            {/* Benefits */}
            <div className="space-y-3">
              <h3 className="font-bold text-base" style={{ color: isDark ? '#f3f4f6' : '#111827' }}>
                Quyền lợi Premium:
              </h3>
              {[
                'Ghép cặp không giới hạn',
                'Kết nối nhanh với bạn bè',
                'Tìm người yêu thông minh',
                'Hỗ trợ duy trì server 24/7',
              ].map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="p-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <p className="text-sm" style={{ color: isDark ? '#d1d5db' : '#4b5563' }}>
                    {benefit}
                  </p>
                </div>
              ))}
            </div>

            {/* Pricing */}
            <div
              className="p-5 rounded-xl text-center"
              style={{
                background: isDark
                  ? 'linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)'
                  : 'linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
                border: `1px solid ${isDark ? 'rgba(147, 51, 234, 0.3)' : 'rgba(147, 51, 234, 0.2)'}`,
              }}
            >
              <div className="flex items-baseline justify-center gap-2 mb-2">
                <span className="text-4xl font-black" style={{ color: isDark ? '#f3f4f6' : '#111827' }}>
                  3.000
                </span>
                <span className="text-lg font-semibold" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                  VNĐ
                </span>
              </div>
              <p className="text-sm font-medium" style={{ color: isDark ? '#d1d5db' : '#4b5563' }}>
                Mỗi tuần (7 ngày)
              </p>
              <p className="text-xs mt-2" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                Giúp duy trì chi phí server và phát triển tính năng mới
              </p>
            </div>

            {/* QR Code Section */}
            {showQR && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="flex justify-center">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code thanh toán"
                    className="w-64 h-64 rounded-xl shadow-lg"
                  />
                </div>
                <div
                  className="p-3 rounded-lg text-center"
                  style={{
                    background: isDark ? 'rgba(234, 179, 8, 0.1)' : 'rgba(234, 179, 8, 0.05)',
                    border: `1px solid ${isDark ? 'rgba(234, 179, 8, 0.3)' : 'rgba(234, 179, 8, 0.2)'}`,
                  }}
                >
                  <p className="text-xs font-semibold" style={{ color: isDark ? '#fbbf24' : '#d97706' }}>
                    Nội dung CK: TVU_CONNECT_ID_{userId.slice(0, 8)}...
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                    Sau khi chuyển khoản, Premium sẽ được kích hoạt trong 5-10 phút
                  </p>
                </div>
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowQR(!showQR)}
                className="w-full py-3 px-6 rounded-xl font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-95 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
                }}
              >
                <QrCode className="w-5 h-5" />
                {showQR ? 'Ẩn mã QR' : 'Đóng góp ngay'}
              </button>

              <button
                onClick={onClose}
                className="w-full py-3 px-6 rounded-xl font-semibold transition-all hover:opacity-80 active:scale-95"
                style={{
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  color: isDark ? '#d1d5db' : '#6b7280',
                }}
              >
                Để sau
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
