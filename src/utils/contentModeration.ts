// Content Moderation System - Simple & Effective

// Danh sách từ khóa cấm (Vietnamese)
const BANNED_KEYWORDS = [
  // Tình dục
  'sex', 'porn', 'xxx', 'nude', 'khỏa thân', 'sex', 'địt', 'đụ', 'lồn', 'cặc', 'buồi',
  'tình dục', 'quan hệ', 'làm tình', 'chịch', 'doggy', 'blowjob', 'oral',
  
  // Bạo lực
  'giết', 'chết đi', 'tự tử', 'tự sát', 'đánh nhau', 'đánh đập', 'bạo lực',
  
  // Ma túy
  'ma túy', 'ma tuý', 'cocaine', 'heroin', 'cần sa', 'thuốc lắc', 'thuốc phiện',
  'ecstasy', 'ketamine', 'methamphetamine',
  
  // Lừa đảo
  'lừa đảo', 'lừa tiền', 'cho vay', 'vay tiền', 'đòi nợ', 'đa cấp', 'ponzi',
  'kiếm tiền nhanh', 'làm giàu', 'đầu tư chứng khoán',
  
  // Chính trị nhạy cảm
  'chính phủ đổ', 'lật đổ', 'biểu tình', 'khủng bố', 'cách mạng',
  
  // Phân biệt
  'kỳ thị', 'phân biệt chủng tộc', 'ghét người', 'phân biệt giới tính',
  
  // Thông tin cá nhân
  'số điện thoại', 'cmnd', 'cccd', 'số tài khoản',
  
  // Phốt và công kích
  'phốt', 'bóc phốt', 'tố cáo', 'vạch trần', 'bêu xấu', 'nói xấu',
  'chửi', 'mắng', 'đồ ngu', 'đồ khốn', 'đồ chó', 'con chó', 'thằng ngu',
  'con điên', 'đồ điên', 'ngu ngốc', 'ngu dốt', 'đần độn',
  
  // Từ ngữ thô tục khác
  'đéo', 'vãi', 'đm', 'dm', 'vcl', 'vl', 'cc', 'clgt', 'đcm', 'dcm',
  'đmm', 'dmm', 'đmm', 'loz', 'lồz', 'đb', 'db', 'đĩ', 'cave', 'gái gọi',
];

// Danh sách từ giáo dục được phép (không bị chặn)
const EDUCATIONAL_ALLOWLIST = [
  // Tên lớp học
  'lớp', 'class', 'k66', 'k67', 'k68', 'k69', 'k70', 'k71', 'k72',
  'd66', 'd67', 'd68', 'd69', 'd70', 'd71', 'd72',
  
  // Tên ngành học
  'công nghệ thông tin', 'cntt', 'it', 'khoa học máy tính', 'computer science',
  'sư phạm', 'giáo dục', 'education', 'pedagogy',
  'kinh tế', 'economics', 'quản trị kinh doanh', 'business administration',
  'kế toán', 'accounting', 'tài chính', 'finance',
  'luật', 'law', 'legal', 'pháp luật',
  'y khoa', 'y học', 'medicine', 'medical',
  'nông nghiệp', 'agriculture', 'thủy sản', 'aquaculture',
  'xây dựng', 'civil engineering', 'kiến trúc', 'architecture',
  'điện', 'electrical', 'cơ khí', 'mechanical',
  'hóa học', 'chemistry', 'sinh học', 'biology',
  'vật lý', 'physics', 'toán học', 'mathematics',
  'ngôn ngữ', 'language', 'tiếng anh', 'english',
  'du lịch', 'tourism', 'khách sạn', 'hospitality',
  
  // Tên giảng viên (generic)
  'thầy', 'cô', 'giảng viên', 'giáo sư', 'tiến sĩ', 'ts', 'ths',
  'lecturer', 'professor', 'teacher', 'instructor',
  
  // Môn học
  'toán', 'lý', 'hóa', 'sinh', 'văn', 'sử', 'địa',
  'anh văn', 'tiếng anh', 'english', 'math', 'physics', 'chemistry',
  'lập trình', 'programming', 'cơ sở dữ liệu', 'database',
  'mạng máy tính', 'network', 'hệ điều hành', 'operating system',
  'trí tuệ nhân tạo', 'ai', 'machine learning', 'deep learning',
  
  // Hoạt động học tập
  'học', 'thi', 'kiểm tra', 'bài tập', 'assignment', 'homework',
  'project', 'đồ án', 'luận văn', 'thesis', 'nghiên cứu', 'research',
  'thực tập', 'internship', 'thực hành', 'practice',
];

// Từ khóa cảnh báo (không chặn nhưng đánh dấu)
const WARNING_KEYWORDS = [
  'mua bán', 'quảng cáo', 'kiếm tiền', 'làm thêm', 'part time',
  'link', 'website', 'telegram', 'zalo',
];

// Patterns nguy hiểm
const DANGEROUS_PATTERNS = [
  /\b\d{10,11}\b/, // Số điện thoại (không dùng global flag để tránh lastIndex bug)
  /https?:\/\/[^\s]+/i, // Links
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email
];

export interface ModerationResult {
  isAllowed: boolean;
  reason?: string;
  warnings?: string[];
  severity: 'safe' | 'warning' | 'blocked';
}

/**
 * Normalize text để phát hiện biến thể từ cấm
 * Ví dụ: "đ!t" → "dit", "s3x" → "sex"
 */
const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[!@#$%^&*()_+=\[\]{};':"\\|,.<>\/?`~]/g, '') // Xóa ký tự đặc biệt
    .replace(/[0-9]/g, (digit) => {
      // Chuyển số thành chữ tương ứng
      const digitMap: Record<string, string> = {
        '0': 'o',
        '1': 'i',
        '3': 'e',
        '4': 'a',
        '5': 's',
        '7': 't',
        '8': 'b'
      };
      return digitMap[digit] || digit;
    })
    .replace(/\s+/g, ''); // Xóa khoảng trắng
};

/**
 * Kiểm tra nội dung bài viết
 * NOTE: Không kiểm tra length < 2 vì có thể chỉ đăng ảnh
 */
export const moderateContent = (content: string): ModerationResult => {
  const normalizedContent = content.toLowerCase().trim();
  
  // 1. Nếu content rỗng → OK (có thể chỉ đăng ảnh)
  if (!normalizedContent) {
    return {
      isAllowed: true,
      severity: 'safe'
    };
  }

  // 2. Kiểm tra advanced spam patterns
  if (detectAdvancedSpam(content)) {
    return {
      isAllowed: false,
      reason: 'Nội dung có dấu hiệu spam',
      severity: 'blocked'
    };
  }

  // 3. Kiểm tra từ khóa cấm (với normalization để phát hiện biến thể)
  const fullyNormalized = normalizeText(content);
  
  for (const keyword of BANNED_KEYWORDS) {
    const normalizedKeyword = normalizeText(keyword);
    
    // Check cả original và normalized
    if (normalizedContent.includes(keyword.toLowerCase()) || 
        fullyNormalized.includes(normalizedKeyword)) {
      return {
        isAllowed: false,
        reason: 'Nội dung vi phạm quy định cộng đồng',
        severity: 'blocked'
      };
    }
  }

  // 4. Kiểm tra patterns nguy hiểm
  const warnings: string[] = [];
  
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push('Phát hiện thông tin nhạy cảm (số điện thoại/link/email)');
    }
  }

  // 5. Kiểm tra từ khóa cảnh báo
  for (const keyword of WARNING_KEYWORDS) {
    if (normalizedContent.includes(keyword.toLowerCase())) {
      warnings.push('Nội dung có thể là quảng cáo/spam');
    }
  }

  // 6. Kiểm tra spam (ký tự lặp)
  if (/(.)\1{4,}/.test(content)) {
    warnings.push('Phát hiện ký tự lặp nhiều lần');
  }

  // 7. Kiểm tra CAPS LOCK abuse
  const upperCaseRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (upperCaseRatio > 0.5 && content.length > 20) {
    warnings.push('Sử dụng quá nhiều chữ in hoa');
  }

  // Kết quả
  if (warnings.length > 0) {
    return {
      isAllowed: true, // Cho phép nhưng cảnh báo
      warnings,
      severity: 'warning'
    };
  }

  return {
    isAllowed: true,
    severity: 'safe'
  };
};

/**
 * Làm sạch nội dung (remove links, emails, phone numbers)
 */
export const sanitizeContent = (content: string): string => {
  let cleaned = content;
  
  // Remove links
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '[link đã xóa]');
  
  // Remove emails
  cleaned = cleaned.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email đã xóa]');
  
  // Remove phone numbers
  cleaned = cleaned.replace(/\b\d{10,11}\b/g, '[số ĐT đã xóa]');
  
  return cleaned;
};

/**
 * Phát hiện spam patterns nâng cao
 */
export const detectAdvancedSpam = (content: string): boolean => {
  // 1. Lặp từ quá nhiều
  const words = content.toLowerCase().split(/\s+/);
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    if (word.length > 2) { // Chỉ đếm từ có > 2 ký tự
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  });
  
  // Nếu 1 từ lặp > 5 lần → spam
  for (const count of wordCount.values()) {
    if (count > 5) return true;
  }
  
  // 2. Quá nhiều số (SĐT, mã code)
  const digitRatio = (content.match(/\d/g) || []).length / content.length;
  if (digitRatio > 0.4 && content.length > 10) return true;
  
  // 3. Quá nhiều ký tự đặc biệt (loại trừ dấu tiếng Việt và emoji thông thường)
  const specialCharRatio = (content.match(/[^a-zA-Z0-9\s\u00C0-\u1EF9\u{1F000}-\u{1FFFF}]/gu) || []).length / content.length;
  if (specialCharRatio > 0.5 && content.length > 10) return true;
  
  // 4. Toàn chữ hoa (CAPS LOCK abuse)
  const upperCaseRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (upperCaseRatio > 0.7 && content.length > 20) return true;
  
  return false;
};

/**
 * Tính điểm spam (0-100, càng cao càng spam)
 */
export const calculateSpamScore = (content: string): number => {
  let score = 0;
  
  // Ký tự lặp
  if (/(.)\1{4,}/.test(content)) score += 30;
  
  // Quá nhiều emoji
  const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
  if (emojiCount > 10) score += 20;
  
  // Quá nhiều dấu chấm than/hỏi
  const exclamationCount = (content.match(/[!?]/g) || []).length;
  if (exclamationCount > 5) score += 15;
  
  // CAPS LOCK
  const upperCaseRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (upperCaseRatio > 0.5) score += 25;
  
  // Links
  if (/https?:\/\//i.test(content)) score += 20;
  
  return Math.min(score, 100);
};

/**
 * Kiểm tra user có đang spam không (dựa trên lịch sử)
 */
export const checkUserSpamHistory = (userId: string): boolean => {
  const key = `spam_history_${userId}`;
  const history = localStorage.getItem(key);
  
  if (!history) return false;
  
  const violations = JSON.parse(history);
  const recentViolations = violations.filter((timestamp: number) => {
    return Date.now() - timestamp < 24 * 60 * 60 * 1000; // 24 hours
  });
  
  // Nếu có 3+ vi phạm trong 24h -> spam
  return recentViolations.length >= 3;
};
