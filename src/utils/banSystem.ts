// Ban System - Hệ thống phạt tăng dần
// Lần 1: Cảnh báo (0h)
// Lần 2: 10 phút
// Lần 3: 1 giờ
// Lần 4: 3 giờ
// Lần 5: 10 giờ
// Lần 6: 24 giờ (1 ngày)
// Lần 7: 34 giờ
// Lần 8: 2 ngày (48 giờ)
// Lần 9+: Vĩnh viễn

export interface BanInfo {
  level: number;
  duration: number; // milliseconds
  durationText: string;
  message: string;
  description: string;
  nextPenalty: string;
}

/**
 * Tính toán thời gian khóa dựa trên số lần vi phạm
 */
export const calculateBanDuration = (violationCount: number): BanInfo => {
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  
  switch (violationCount) {
    case 1:
      return {
        level: 1,
        duration: 0,
        durationText: 'Cảnh báo',
        message: '⚠️ Cảnh báo vi phạm lần đầu',
        description: 'Đây là lần đầu bạn vi phạm quy định. Vui lòng tuân thủ để tránh bị khóa tài khoản.',
        nextPenalty: 'Lần sau: Khóa 10 phút'
      };
      
    case 2:
      return {
        level: 2,
        duration: 10 * MINUTE,
        durationText: '10 phút',
        message: '🔒 Tài khoản bị khóa 10 phút',
        description: 'Vi phạm lần 2. Bạn không thể đăng bài trong 10 phút.',
        nextPenalty: 'Lần sau: Khóa 1 giờ'
      };
      
    case 3:
      return {
        level: 3,
        duration: 1 * HOUR,
        durationText: '1 giờ',
        message: '🔒 Tài khoản bị khóa 1 giờ',
        description: 'Vi phạm lần 3. Bạn không thể đăng bài trong 1 giờ.',
        nextPenalty: 'Lần sau: Khóa 3 giờ'
      };
      
    case 4:
      return {
        level: 4,
        duration: 3 * HOUR,
        durationText: '3 giờ',
        message: '🔒 Tài khoản bị khóa 3 giờ',
        description: 'Vi phạm lần 4. Bạn không thể đăng bài trong 3 giờ.',
        nextPenalty: 'Lần sau: Khóa 10 giờ'
      };
      
    case 5:
      return {
        level: 5,
        duration: 10 * HOUR,
        durationText: '10 giờ',
        message: '🔒 Tài khoản bị khóa 10 giờ',
        description: 'Vi phạm lần 5. Bạn không thể đăng bài trong 10 giờ.',
        nextPenalty: 'Lần sau: Khóa 24 giờ (1 ngày)'
      };
      
    case 6:
      return {
        level: 6,
        duration: 24 * HOUR,
        durationText: '24 giờ (1 ngày)',
        message: '🔒 Tài khoản bị khóa 24 giờ',
        description: 'Vi phạm lần 6. Bạn không thể đăng bài trong 24 giờ (1 ngày).',
        nextPenalty: 'Lần sau: Khóa 34 giờ'
      };
      
    case 7:
      return {
        level: 7,
        duration: 34 * HOUR,
        durationText: '34 giờ',
        message: '🔒 Tài khoản bị khóa 34 giờ',
        description: 'Vi phạm lần 7. Bạn không thể đăng bài trong 34 giờ.',
        nextPenalty: 'Lần sau: Khóa 2 ngày'
      };
      
    case 8:
      return {
        level: 8,
        duration: 2 * DAY,
        durationText: '2 ngày (48 giờ)',
        message: '🔒 Tài khoản bị khóa 2 ngày',
        description: 'Vi phạm lần 8. Bạn không thể đăng bài trong 2 ngày (48 giờ).',
        nextPenalty: 'Lần sau: Khóa vĩnh viễn'
      };
      
    default: // 9+
      return {
        level: 9,
        duration: Infinity,
        durationText: 'Vĩnh viễn',
        message: '🚫 Tài khoản bị khóa vĩnh viễn',
        description: 'Vi phạm quá nhiều lần. Tài khoản của bạn đã bị khóa vĩnh viễn. Vui lòng liên hệ admin để được hỗ trợ.',
        nextPenalty: 'Không thể mở khóa tự động'
      };
  }
};

/**
 * Format thời gian còn lại thành text dễ đọc
 */
export const formatTimeRemaining = (milliseconds: number): string => {
  if (milliseconds === Infinity) return 'Vĩnh viễn';
  if (milliseconds <= 0) return 'Đã hết hạn';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days} ngày ${remainingHours} giờ`;
  }
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours} giờ ${remainingMinutes} phút`;
  }
  
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes} phút ${remainingSeconds} giây`;
  }
  
  return `${seconds} giây`;
};

/**
 * Kiểm tra user có đang bị ban không
 */
export const checkBanStatus = (userId: string): {
  isBanned: boolean;
  timeRemaining: number;
  banInfo?: BanInfo;
} => {
  const banData = localStorage.getItem(`ban_${userId}`);
  
  if (!banData) {
    return { isBanned: false, timeRemaining: 0 };
  }
  
  const { bannedUntil, violationCount } = JSON.parse(banData);
  const now = Date.now();
  
  if (bannedUntil === Infinity) {
    // Khóa vĩnh viễn
    return {
      isBanned: true,
      timeRemaining: Infinity,
      banInfo: calculateBanDuration(violationCount)
    };
  }
  
  if (now < bannedUntil) {
    // Vẫn còn bị khóa
    return {
      isBanned: true,
      timeRemaining: bannedUntil - now,
      banInfo: calculateBanDuration(violationCount)
    };
  }
  
  // Hết thời gian khóa
  return { isBanned: false, timeRemaining: 0 };
};

/**
 * Áp dụng ban cho user
 */
export const applyBan = (userId: string): BanInfo => {
  // Lấy số lần vi phạm hiện tại
  const violationsData = localStorage.getItem(`violations_${userId}`);
  const violations = violationsData ? JSON.parse(violationsData) : [];
  
  // Đếm vi phạm trong 30 ngày gần nhất
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentViolations = violations.filter((v: any) => v.timestamp > thirtyDaysAgo);
  
  const violationCount = recentViolations.length;
  const banInfo = calculateBanDuration(violationCount);
  
  // Lưu thông tin ban
  if (banInfo.duration > 0) {
    const bannedUntil = banInfo.duration === Infinity 
      ? Infinity 
      : Date.now() + banInfo.duration;
    
    localStorage.setItem(`ban_${userId}`, JSON.stringify({
      bannedUntil,
      violationCount,
      bannedAt: Date.now()
    }));
  }
  
  return banInfo;
};

/**
 * Ghi nhận vi phạm
 */
export const recordViolation = (userId: string, reason: string): void => {
  const violationsData = localStorage.getItem(`violations_${userId}`);
  const violations = violationsData ? JSON.parse(violationsData) : [];
  
  violations.push({
    timestamp: Date.now(),
    reason
  });
  
  // Chỉ giữ 30 vi phạm gần nhất
  const recent = violations.slice(-30);
  localStorage.setItem(`violations_${userId}`, JSON.stringify(recent));
};

/**
 * Lấy số lần vi phạm
 */
export const getViolationCount = (userId: string): number => {
  const violationsData = localStorage.getItem(`violations_${userId}`);
  if (!violationsData) return 0;
  
  const violations = JSON.parse(violationsData);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  return violations.filter((v: any) => v.timestamp > thirtyDaysAgo).length;
};
