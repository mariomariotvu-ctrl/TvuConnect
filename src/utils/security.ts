import { logger } from './logger';
// Security utilities for input sanitization and validation

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string): string | null {
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    // Only allow https and http protocols
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Rate limiter with exponential backoff
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number; backoffUntil: number }> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly backoffMultiplier: number;

  constructor(maxAttempts: number = 5, windowMs: number = 60000, backoffMultiplier: number = 2) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.backoffMultiplier = backoffMultiplier;
  }

  canProceed(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      this.attempts.set(key, { count: 1, lastAttempt: now, backoffUntil: 0 });
      return { allowed: true };
    }

    // Check if still in backoff period
    if (record.backoffUntil > now) {
      return { allowed: false, retryAfter: Math.ceil((record.backoffUntil - now) / 1000) };
    }

    // Reset if window has passed
    if (now - record.lastAttempt > this.windowMs) {
      this.attempts.set(key, { count: 1, lastAttempt: now, backoffUntil: 0 });
      return { allowed: true };
    }

    // Increment attempt count
    record.count++;
    record.lastAttempt = now;

    if (record.count > this.maxAttempts) {
      // Calculate exponential backoff
      const backoffTime = this.windowMs * Math.pow(this.backoffMultiplier, record.count - this.maxAttempts);
      record.backoffUntil = now + backoffTime;
      return { allowed: false, retryAfter: Math.ceil(backoffTime / 1000) };
    }

    return { allowed: true };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

/**
 * Validate audio data size (max 5MB)
 */
export function validateAudioSize(base64Data: string): { valid: boolean; error?: string } {
  const sizeInBytes = (base64Data.length * 3) / 4;
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (sizeInBytes > maxSize) {
    return {
      valid: false,
      error: `Audio file too large (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`
    };
  }

  return { valid: true };
}

/**
 * Validate message content
 */
export function validateMessage(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (text.length > 2000) {
    return { valid: false, error: 'Message too long (max 2000 characters)' };
  }

  return { valid: true };
}

/**
 * Content Moderation - Detect inappropriate content
 */
export interface ModerationResult {
  isClean: boolean;
  violations: string[];
  severity: 'low' | 'medium' | 'high';
  blockedWords: string[];
}

// Từ khóa vi phạm - Phân loại theo mức độ nghiêm trọng
const BLOCKED_KEYWORDS = {
  // Mức độ cao - Chặn ngay lập tức
  high: [
    // Mua bán trái phép
    'ma túy', 'ma tuý', 'cần sa', 'thuốc lắc', 'thuốc phiện', 'heroin', 'cocaine',
    'mua bán vũ khí', 'súng đạn', 'lựu đạn', 'chất nổ',
    'bằng giả', 'bằng fake', 'làm bằng giả', 'bán bằng',
    'giấy tờ giả', 'cmnd giả', 'cccd giả',
    
    // Lừa đảo tài chính
    'đa cấp', 'đầu tư chắc thắng', 'kiếm tiền nhanh', 'làm giàu nhanh',
    'ponzi', 'pyramid scheme',
    
    // Nội dung người lớn & Tình dục
    'sex', 'porn', 'khiêu dâm', 'cave', 'gái gọi', 'cave show',
    'massage kích dục', 'gái bao', 'cave online', 'show hàng',
    'onlyfans', 'livestream sex', 'bán dâm', 'mại dâm',
    'sugar baby', 'sugar daddy', 'tìm bé', 'tìm anh',
    'fwb', 'one night', 'ons', 'tình một đêm',
    'nứng', 'dâm', 'doggy', 'blowjob', 'bj', 'handjob',
    'móc lồn', 'bú cu', 'liếm lồn', 'chịch', 'địt nhau',
    'làm tình', 'quan hệ tình dục', 'sex chat', 'sex call',
    'nude', 'khỏa thân', 'ảnh nóng', 'clip nóng', 'video sex',
    
    // Bạo lực cực đoan
    'giết người', 'tự tử', 'đánh bom', 'khủng bố',
  ],
  
  // Mức độ trung bình - Cảnh báo
  medium: [
    // Công kích cá nhân
    'đồ ngu', 'thằng ngu', 'con ngu', 'đồ khốn', 'đồ chó',
    'mày', 'tao', 'đm', 'dm', 'vl', 'vcl', 'cc', 'đcm',
    'đụ', 'địt', 'lồn', 'buồi', 'cặc', 'cu', 'cứt', 'shit',
    'fuck', 'bitch', 'đéo', 'đệch', 'đếch',
    
    // Gợi dục nhẹ
    'show vú', 'show lồn', 'show cu', 'show body',
    'gạ tình', 'gạ sex', 'muốn làm tình', 'muốn chịch',
    'đi khách sạn', 'mở phòng', 'qua đêm',
    
    // Mua bán không rõ nguồn gốc
    'bán acc', 'mua acc', 'thuê acc', 'clone',
    'bán đồ án', 'làm thuê đồ án', 'nhận làm bài',
    
    // Cờ bạc
    'cá độ', 'cá cược', 'đánh bạc', 'casino online',
    'tài xỉu', 'xóc đĩa', 'bầu cua',
  ],
  
  // Mức độ thấp - Ghi log
  low: [
    // Spam
    'inbox', 'zalo', 'liên hệ ngay', 'click link',
    'kiếm tiền online', 'việc nhẹ lương cao',
  ]
};

export function moderateContent(text: string): ModerationResult {
  const lowerText = text.toLowerCase().trim();
  const violations: string[] = [];
  const blockedWords: string[] = [];
  let severity: 'low' | 'medium' | 'high' = 'low';

  // Check high severity violations
  for (const keyword of BLOCKED_KEYWORDS.high) {
    if (lowerText.includes(keyword.toLowerCase())) {
      violations.push(`Nội dung vi phạm nghiêm trọng: "${keyword}"`);
      blockedWords.push(keyword);
      severity = 'high';
    }
  }

  // Check medium severity violations
  if (severity !== 'high') {
    for (const keyword of BLOCKED_KEYWORDS.medium) {
      if (lowerText.includes(keyword.toLowerCase())) {
        violations.push(`Nội dung không phù hợp: "${keyword}"`);
        blockedWords.push(keyword);
        severity = 'medium';
      }
    }
  }

  // Check low severity violations
  if (severity === 'low') {
    for (const keyword of BLOCKED_KEYWORDS.low) {
      if (lowerText.includes(keyword.toLowerCase())) {
        violations.push(`Nội dung cần xem xét: "${keyword}"`);
        blockedWords.push(keyword);
      }
    }
  }

  return {
    isClean: violations.length === 0,
    violations,
    severity,
    blockedWords
  };
}

/**
 * Check if message should be blocked
 */
export function shouldBlockMessage(text: string): { blocked: boolean; reason?: string } {
  const result = moderateContent(text);
  
  if (result.severity === 'high') {
    return {
      blocked: true,
      reason: 'Tin nhắn chứa nội dung vi phạm nghiêm trọng (mua bán trái phép, bạo lực, nội dung người lớn). Vui lòng tuân thủ quy định của nền tảng.'
    };
  }
  
  if (result.severity === 'medium' && result.violations.length >= 2) {
    return {
      blocked: true,
      reason: 'Tin nhắn chứa nhiều từ ngữ không phù hợp. Vui lòng sử dụng ngôn từ lịch sự.'
    };
  }
  
  return { blocked: false };
}

/**
 * Log violation for admin review
 */
export function logViolation(userId: string, content: string, result: ModerationResult): void {
  // In production, this would send to a logging service or admin dashboard
  if (result.severity === 'high' || result.severity === 'medium') {
    logger.warn('[CONTENT MODERATION]', {
      userId,
      severity: result.severity,
      violations: result.violations,
      timestamp: new Date().toISOString(),
      contentPreview: content.substring(0, 100)
    });
  }
}
