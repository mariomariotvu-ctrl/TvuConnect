import { doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logger } from '@/utils/logger';

/**
 * Khởi tạo user mới với thời gian dùng thử 7 ngày
 * Gọi hàm này khi user đăng ký lần đầu
 */
export const initializeUserSubscription = async (userId: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    // Chỉ khởi tạo nếu user chưa tồn tại
    if (!userSnap.exists()) {
      const now = new Date();
      const trialExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 ngày

      await setDoc(userRef, {
        createdAt: serverTimestamp(),
        trialExpiryDate: Timestamp.fromDate(trialExpiry),
        isPremium: false,
        premiumExpiryDate: null,
        updatedAt: serverTimestamp(),
      });

      logger.log('✅ User subscription initialized with 7-day trial');
    }
  } catch (error) {
    console.error('❌ Error initializing user subscription:', error);
    throw error;
  }
};

/**
 * Kích hoạt Premium cho user (sau khi thanh toán)
 * @param userId - UID của user
 * @param durationDays - Số ngày Premium (mặc định 7 ngày = 1 tuần)
 */
export const activatePremium = async (
  userId: string, 
  durationDays: number = 7
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    const data = userSnap.data();
    const now = new Date();
    
    // Nếu đã có premium, gia hạn thêm
    let newExpiryDate: Date;
    if (data.isPremium && data.premiumExpiryDate) {
      const currentExpiry = (data.premiumExpiryDate as Timestamp).toDate();
      // Nếu còn hạn, cộng thêm vào ngày hết hạn hiện tại
      if (currentExpiry > now) {
        newExpiryDate = new Date(currentExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000);
      } else {
        // Nếu đã hết hạn, tính từ hôm nay
        newExpiryDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      }
    } else {
      // Lần đầu kích hoạt
      newExpiryDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    await updateDoc(userRef, {
      isPremium: true,
      premiumExpiryDate: Timestamp.fromDate(newExpiryDate),
      updatedAt: serverTimestamp(),
    });

    logger.log('✅ Premium activated until:', newExpiryDate);
  } catch (error) {
    console.error('❌ Error activating premium:', error);
    throw error;
  }
};

/**
 * Tạo mã QR VietQR cho thanh toán
 * @param userId - UID của user (dùng làm nội dung chuyển khoản)
 * @param amount - Số tiền (mặc định 3000 VNĐ)
 * @returns URL của mã QR
 */
export const generateVietQRCode = (
  userId: string,
  amount: number = 3000
): string => {
  // Thông tin tài khoản (thay bằng thông tin thật của bạn)
  const bankId = 'MB'; // Mã ngân hàng (ví dụ: MB = MBBank, VCB = Vietcombank)
  const accountNo = '0123456789'; // Số tài khoản
  const accountName = 'NGUYEN VAN A'; // Tên chủ tài khoản
  
  // Nội dung chuyển khoản: TVU_CONNECT_ID_[User_ID]
  const transferContent = `TVU_CONNECT_ID_${userId}`;
  
  // Template VietQR (QuickClick)
  // Format: https://img.vietqr.io/image/[BANK_ID]-[ACCOUNT_NO]-[TEMPLATE].png?amount=[AMOUNT]&addInfo=[CONTENT]&accountName=[NAME]
  const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;
  
  return qrUrl;
};

/**
 * Kiểm tra và gửi thông báo khi trial sắp hết hạn
 * Gọi hàm này trong useEffect để kiểm tra định kỳ
 */
export const checkTrialExpiry = (
  trialDaysLeft: number,
  onTrialExpiringSoon: () => void
): void => {
  // Thông báo khi còn 1 ngày
  if (trialDaysLeft === 1) {
    onTrialExpiringSoon();
  }
};
