import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { usePremiumStatus } from '../hooks/usePremiumStatus';
import { SubscriptionModal } from './SubscriptionModal';
import { toast } from 'sonner';
import { checkTrialExpiry } from '../utils/subscriptionManager';

interface PremiumGuardProps {
  children: React.ReactNode;
  userId: string | null;
  featureName: string;
  showBlur?: boolean;
}

/**
 * Higher-Order Component để bảo vệ các tính năng Premium
 * 
 * Cách sử dụng:
 * <PremiumGuard userId={user.uid} featureName="Ghép cặp">
 *   <MatchingComponent />
 * </PremiumGuard>
 */
export const PremiumGuard: React.FC<PremiumGuardProps> = ({
  children,
  userId,
  featureName,
  showBlur = true,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const premiumStatus = usePremiumStatus(userId);
  const [showModal, setShowModal] = useState(false);
  const [hasShownTrialWarning, setHasShownTrialWarning] = useState(false);

  // Kiểm tra trial sắp hết hạn
  useEffect(() => {
    if (!hasShownTrialWarning && premiumStatus.trialDaysLeft === 1) {
      checkTrialExpiry(premiumStatus.trialDaysLeft, () => {
        toast.warning('⏰ Dùng thử còn 1 ngày!', {
          description: 'Đóng góp 3.000 VNĐ/tuần để tiếp tục sử dụng TVU Connect',
          duration: 8000,
          action: {
            label: 'Nâng cấp ngay',
            onClick: () => setShowModal(true),
          },
        });
        setHasShownTrialWarning(true);
      });
    }
  }, [premiumStatus.trialDaysLeft, hasShownTrialWarning]);

  // Đang loading
  if (premiumStatus.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  // Có quyền truy cập - hiển thị nội dung bình thường
  if (premiumStatus.hasAccess) {
    return <>{children}</>;
  }

  // Không có quyền truy cập - hiển thị locked state
  return (
    <>
      <div className="relative">
        {/* Blurred Content */}
        {showBlur && (
          <div
            className="pointer-events-none select-none"
            style={{
              filter: 'blur(8px)',
              opacity: 0.3,
            }}
          >
            {children}
          </div>
        )}

        {/* Lock Overlay */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
          style={{
            background: isDark
              ? 'rgba(17, 24, 39, 0.8)'
              : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            className="p-6 rounded-full mb-6"
            style={{
              background: 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
              boxShadow: '0 10px 40px rgba(147, 51, 234, 0.3)',
            }}
          >
            <Lock className="w-12 h-12 text-white" />
          </div>

          <h3
            className="text-2xl font-black mb-3"
            style={{ color: isDark ? '#f3f4f6' : '#111827' }}
          >
            {featureName} đã bị khóa
          </h3>

          <p
            className="text-base mb-6 max-w-md"
            style={{ color: isDark ? '#d1d5db' : '#4b5563' }}
          >
            Thời gian dùng thử đã hết. Đóng góp <span className="font-bold">3.000 VNĐ/tuần</span> để
            tiếp tục sử dụng và hỗ trợ duy trì server.
          </p>

          <button
            onClick={() => setShowModal(true)}
            className="px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-95 flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
            }}
          >
            <Lock className="w-5 h-5" />
            Mở khóa ngay
          </button>
        </div>
      </div>

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        userId={userId || ''}
        trialDaysLeft={premiumStatus.trialDaysLeft}
        featureName={featureName}
      />
    </>
  );
};
