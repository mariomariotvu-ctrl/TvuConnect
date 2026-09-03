import { useState, useEffect } from 'react';
import { doc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface PremiumStatus {
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number;
  premiumDaysLeft: number;
  hasAccess: boolean;
  loading: boolean;
  trialExpiryDate: Date | null;
  premiumExpiryDate: Date | null;
}

/**
 * Custom Hook để kiểm tra quyền truy cập Premium của người dùng
 * 
 * Logic:
 * - Người dùng có quyền Premium nếu:
 *   1. Đang trong thời gian dùng thử (< 7 ngày từ ngày đăng ký)
 *   2. HOẶC đã mua Premium và chưa hết hạn
 * 
 * @param userId - UID của người dùng
 * @returns PremiumStatus object với thông tin chi tiết
 */
export const usePremiumStatus = (userId: string | null): PremiumStatus => {
  const [status, setStatus] = useState<PremiumStatus>({
    isPremium: false,
    isTrialActive: false,
    trialDaysLeft: 0,
    premiumDaysLeft: 0,
    hasAccess: false,
    loading: true,
    trialExpiryDate: null,
    premiumExpiryDate: null,
  });

  useEffect(() => {
    if (!userId) {
      setStatus({
        isPremium: false,
        isTrialActive: false,
        trialDaysLeft: 0,
        premiumDaysLeft: 0,
        hasAccess: false,
        loading: false,
        trialExpiryDate: null,
        premiumExpiryDate: null,
      });
      return;
    }

    // Lắng nghe thay đổi real-time từ Firestore
    const unsubscribe = onSnapshot(
      doc(db, 'users', userId),
      (docSnap) => {
        if (!docSnap.exists()) {
          setStatus({
            isPremium: false,
            isTrialActive: false,
            trialDaysLeft: 0,
            premiumDaysLeft: 0,
            hasAccess: false,
            loading: false,
            trialExpiryDate: null,
            premiumExpiryDate: null,
          });
          return;
        }

        const data = docSnap.data();
        
        // Sử dụng server time để tránh gian lận
        const now = new Date();
        
        // Parse timestamps
        const trialExpiry = data.trialExpiryDate 
          ? (data.trialExpiryDate as Timestamp).toDate() 
          : null;
        
        const premiumExpiry = data.premiumExpiryDate 
          ? (data.premiumExpiryDate as Timestamp).toDate() 
          : null;

        // Tính số ngày còn lại
        const trialDaysLeft = trialExpiry 
          ? Math.max(0, Math.ceil((trialExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        const premiumDaysLeft = premiumExpiry 
          ? Math.max(0, Math.ceil((premiumExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        // Kiểm tra trial còn hiệu lực
        const isTrialActive = trialExpiry ? now < trialExpiry : false;

        // Kiểm tra premium còn hiệu lực
        const isPremium = data.isPremium === true && premiumExpiry ? now < premiumExpiry : false;

        // Có quyền truy cập nếu trial hoặc premium còn hiệu lực
        const hasAccess = isTrialActive || isPremium;

        setStatus({
          isPremium,
          isTrialActive,
          trialDaysLeft,
          premiumDaysLeft,
          hasAccess,
          loading: false,
          trialExpiryDate: trialExpiry,
          premiumExpiryDate: premiumExpiry,
        });
      },
      (error) => {
        console.error('Error listening to premium status:', error);
        setStatus({
          isPremium: false,
          isTrialActive: false,
          trialDaysLeft: 0,
          premiumDaysLeft: 0,
          hasAccess: false,
          loading: false,
          trialExpiryDate: null,
          premiumExpiryDate: null,
        });
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return status;
};
