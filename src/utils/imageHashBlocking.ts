import { logger } from './logger';
// Image Hash Blocking System - Block ảnh vi phạm đã biết
// Không cần AI, chỉ dựa vào hash của ảnh

// Danh sách hash của ảnh vi phạm (admin sẽ thêm vào)
const BLOCKED_IMAGE_HASHES = new Set<string>([
  // Admin sẽ thêm hash của ảnh vi phạm vào đây
  // Ví dụ: 'a1b2c3d4e5f6...'
]);

/**
 * Tính hash đơn giản của ảnh (dựa trên size và first 1000 chars)
 * Hash này đủ để phát hiện ảnh giống nhau
 */
export const calculateImageHash = (dataUrl: string): string => {
  // Lấy 1000 ký tự đầu của data URL (bỏ qua header)
  const dataStart = dataUrl.indexOf(',') + 1;
  const data = dataUrl.substring(dataStart, dataStart + 1000);
  
  // Simple hash algorithm
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to base36 string
  return Math.abs(hash).toString(36);
};

/**
 * Kiểm tra ảnh có bị block không
 */
export const isImageBlocked = (dataUrl: string): boolean => {
  const hash = calculateImageHash(dataUrl);
  const blocked = BLOCKED_IMAGE_HASHES.has(hash);
  
  if (blocked) {
    logger.warn('🚫 Blocked image detected:', hash);
  }
  
  return blocked;
};

/**
 * Admin: Thêm ảnh vào blacklist
 * Sử dụng trong admin tool hoặc khi user report ảnh
 */
export const addToBlacklist = (dataUrl: string): string => {
  const hash = calculateImageHash(dataUrl);
  BLOCKED_IMAGE_HASHES.add(hash);
  
  // Lưu vào localStorage để persist
  saveBlacklist();
  
  logger.log('✅ Added to blacklist:', hash);
  return hash;
};

/**
 * Admin: Xóa ảnh khỏi blacklist
 */
export const removeFromBlacklist = (hash: string): void => {
  BLOCKED_IMAGE_HASHES.delete(hash);
  saveBlacklist();
  logger.log('✅ Removed from blacklist:', hash);
};

/**
 * Lưu blacklist vào localStorage
 */
const saveBlacklist = (): void => {
  const blacklist = Array.from(BLOCKED_IMAGE_HASHES);
  localStorage.setItem('image_blacklist', JSON.stringify(blacklist));
};

/**
 * Load blacklist từ localStorage
 */
export const loadBlacklist = (): void => {
  try {
    const stored = localStorage.getItem('image_blacklist');
    if (stored) {
      const hashes = JSON.parse(stored);
      hashes.forEach((hash: string) => BLOCKED_IMAGE_HASHES.add(hash));
      logger.log(`📋 Loaded ${hashes.length} blocked image hashes`);
    }
  } catch (error) {
    console.error('❌ Error loading blacklist:', error);
  }
};

/**
 * Lấy danh sách tất cả hash bị block
 */
export const getBlacklist = (): string[] => {
  return Array.from(BLOCKED_IMAGE_HASHES);
};

/**
 * Đếm số ảnh bị block
 */
export const getBlockedCount = (): number => {
  return BLOCKED_IMAGE_HASHES.size;
};

// Load blacklist khi module được import
loadBlacklist();
