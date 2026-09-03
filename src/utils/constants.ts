// Application constants

export const RATE_LIMITS = {
  MESSAGE_SEND: { maxAttempts: 10, windowMs: 60000 }, // 10 messages per minute
  PROFILE_UPDATE: { maxAttempts: 3, windowMs: 300000 }, // 3 updates per 5 minutes
  MATCHING: { maxAttempts: 5, windowMs: 60000 }, // 5 matches per minute
  BLOCK_ACTION: { maxAttempts: 5, windowMs: 60000 }, // 5 blocks per minute
} as const;

export const FIRESTORE_LIMITS = {
  PROFILES_PER_QUERY: 30, // Optimized for matching algorithm
  INITIAL_MATCH_DISPLAY: 4, // Show 4 profiles + 1 "See more" card = 5 total
  LOAD_MORE_INCREMENT: 4, // Load 4 more each time
  MESSAGES_PER_PAGE: 15, // Load 15 messages at a time
  MAX_MESSAGES_PER_CHAT: 100, // Hard limit per conversation
  MATCH_HISTORY_INITIAL: 5,
  CONVERSATIONS_LIMIT: 50,
  DAILY_MATCH_LIMIT: 15, // Maximum matches per user per day (3 ca × 5 lượt)
} as const;

export const VALIDATION = {
  MAX_MESSAGE_LENGTH: 2000,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_AUDIO_SIZE_MB: 5,
  MAX_INTERESTS: 20,
  MAX_STUDY_GOALS: 10,
} as const;

export const TIMING = {
  PRESENCE_UPDATE_INTERVAL: 15 * 60 * 1000, // 15 minutes
  DEBOUNCE_DELAY: 500,
  TOAST_DURATION: 5000,
  ACTION_THROTTLE: 1000, // 1 second between actions (giảm từ 1.5s)
  MATCHING_THROTTLE: 1000, // 1 second for matching (giảm từ 2s)
} as const;

export const ZODIAC_SIGNS = [
  'Bạch Dương',
  'Kim Ngưu',
  'Song Tử',
  'Cự Giải',
  'Sư Tử',
  'Xử Nữ',
  'Thiên Bình',
  'Bọ Cạp',
  'Nhân Mã',
  'Ma Kết',
  'Bảo Bình',
  'Song Ngư',
] as const;

export const STUDY_GOALS = [
  'Học nhóm',
  'Trao đổi tài liệu',
  'Chia sẻ mẹo/kinh nghiệm',
  'Học trực tuyến / ngoại tuyến',
] as const;

export const GENDERS = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
} as const;

export const MESSAGE_TYPES = {
  TEXT: 'text',
  AUDIO: 'audio',
  IMAGE: 'image',
  FILE: 'file',
} as const;
