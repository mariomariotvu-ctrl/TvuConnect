import { StudentProfile } from '../types';

export interface ProfileValidationResult {
  isComplete: boolean;
  missingFields: string[];
  missingFieldsVN: string[];
}

/**
 * Kiểm tra tính đầy đủ của hồ sơ người dùng
 * Feature gating only requires fields used for student identity and discovery.
 * Private contact data such as a phone number is always optional.
 */
export const validateProfile = (profile: StudentProfile | null): ProfileValidationResult => {
  const missingFields: string[] = [];
  const missingFieldsVN: string[] = [];

  if (!profile) {
    return {
      isComplete: false,
      missingFields: ['mssv', 'fullName', 'className', 'major'],
      missingFieldsVN: ['Mã số sinh viên', 'Họ và tên', 'Lớp', 'Ngành học'],
    };
  }

  // Keep compatibility with existing numeric and letter-prefixed student IDs.
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

  const majorTrimmed = profile.major?.trim();
  if (!majorTrimmed || majorTrimmed.length < 2) {
    missingFields.push('major');
    missingFieldsVN.push('Ngành học');
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
  students: 'Tìm bạn',
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
