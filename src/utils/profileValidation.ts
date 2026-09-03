import { StudentProfile } from '../types';

export interface ProfileValidationResult {
  isComplete: boolean;
  missingFields: string[];
  missingFieldsVN: string[];
}

/**
 * Kiểm tra tính đầy đủ của hồ sơ người dùng
 * Theo Feature Gating: chỉ cần 4 trường bắt buộc
 */
export const validateProfile = (profile: StudentProfile | null): ProfileValidationResult => {
  const missingFields: string[] = [];
  const missingFieldsVN: string[] = [];

  if (!profile) {
    return {
      isComplete: false,
      missingFields: ['mssv', 'fullName', 'className', 'phone'],
      missingFieldsVN: ['Mã số sinh viên', 'Họ và tên', 'Lớp', 'Số điện thoại'],
    };
  }

  // Kiểm tra MSSV - chỉ cần có giá trị, không bắt buộc 9 chữ số
  const mssvTrimmed = profile.mssv?.trim();
  if (!mssvTrimmed || mssvTrimmed.length < 5) {
    missingFields.push('mssv');
    missingFieldsVN.push('Mã số sinh viên');
  }

  // Kiểm tra Họ tên - chỉ cần có giá trị sau khi trim
  const fullNameTrimmed = profile.fullName?.trim();
  if (!fullNameTrimmed || fullNameTrimmed.length < 2) {
    missingFields.push('fullName');
    missingFieldsVN.push('Họ và tên');
  }

  // Kiểm tra Lớp - chỉ cần có giá trị sau khi trim
  const classNameTrimmed = profile.className?.trim();
  if (!classNameTrimmed || classNameTrimmed.length < 2) {
    missingFields.push('className');
    missingFieldsVN.push('Lớp');
  }

  // Kiểm tra Số điện thoại - chỉ cần có giá trị sau khi trim
  const phoneTrimmed = profile.phone?.trim();
  if (!phoneTrimmed || phoneTrimmed.length < 8) {
    missingFields.push('phone');
    missingFieldsVN.push('Số điện thoại');
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    missingFieldsVN,
  };
};

/**
 * Danh sách các tính năng bị khóa khi profile chưa hoàn chỉnh
 */
export const RESTRICTED_FEATURES = {
  matching: 'Ghép cặp',
  chat: 'Nhắn tin',
  conversations: 'Tin nhắn',
  posts: 'Bảng tin',
  results: 'Kết quả ghép cặp',
  explore: 'Khám phá',
  documents: 'Tài liệu học tập',
} as const;

/**
 * Danh sách các tính năng luôn mở
 */
export const PUBLIC_FEATURES = {
  home: 'Trang chủ',
  profile: 'Hồ sơ',
  settings: 'Cài đặt',
} as const;
