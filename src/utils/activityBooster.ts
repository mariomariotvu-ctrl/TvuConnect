/**
 * activityBooster.ts — Pure functions (không import Firebase)
 * Module tính Active_Score, Composite_Score và parse/format presence data
 * từ Firebase Realtime Database.
 */

import type { StudentProfile } from '../types';

// ─── Types & Interfaces ───────────────────────────────────────────────────────

export type ActivityStatus = 'online' | 'away' | 'offline';

export interface ActivityData {
  status: ActivityStatus;
  lastActive: number;       // Unix timestamp (ms) — đã normalize từ raw
  invisibleMode: boolean;   // Ẩn badge và status text
}

export interface RawPresenceData {
  status?: string;
  lastActive?: number | string; // Unix ms hoặc ISO 8601 string
  connections?: Record<string, {
    device: string;
    timestamp: number;
    userAgent?: string;
  }>;
  settings?: {
    invisibleMode?: boolean;
    privacyMode?: boolean;
  };
}

export interface ProfileWithScore {
  profile: StudentProfile;
  matchingScore: number;    // 0–100, từ calculateMatchingScore
  activeScore: number;      // 0|20|40|60|80|100, từ calculateActiveScore
  compositeScore: number;   // 0.7×matching + 0.3×active
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<ActivityStatus>(['online', 'away', 'offline']);

const MS_1_HOUR  = 60 * 60 * 1000;
const MS_6_HOURS = 6 * MS_1_HOUR;
const MS_24_HOURS = 24 * MS_1_HOUR;
const MS_7_DAYS  = 7 * MS_24_HOURS;

// ─── Task 2.1: parsePresenceData & formatPresenceData ────────────────────────

/**
 * Parse raw presence data từ Firebase Realtime DB thành ActivityData.
 * - Không throw exception trong bất kỳ trường hợp nào
 * - raw === null/undefined → trả về null
 *
 * @validates Requirements 7.1, 7.2, 7.4
 */
export function parsePresenceData(raw: RawPresenceData | null | undefined): ActivityData | null {
  // Requirement 7.4: null/undefined → trả về null, không throw
  if (raw == null) {
    return null;
  }

  // Parse lastActive — Requirement 7.1: hỗ trợ cả Unix timestamp (number) và ISO string
  let lastActive = 0;
  if (raw.lastActive !== null && raw.lastActive !== undefined) {
    if (typeof raw.lastActive === 'number') {
      // Unix timestamp (ms): dùng trực tiếp; NaN → 0
      lastActive = Number.isNaN(raw.lastActive) ? 0 : raw.lastActive;
    } else if (typeof raw.lastActive === 'string') {
      // ISO string: parse bằng Date.parse; NaN → 0
      const parsed = Date.parse(raw.lastActive);
      lastActive = Number.isNaN(parsed) ? 0 : parsed;
    }
  }

  // Parse status — Requirement 7.2: chỉ giữ 'online'|'away'|'offline', còn lại → 'offline'
  const status: ActivityStatus =
    typeof raw.status === 'string' && VALID_STATUSES.has(raw.status as ActivityStatus)
      ? (raw.status as ActivityStatus)
      : 'offline';

  // Parse invisibleMode — default false
  const invisibleMode =
    raw.settings != null && typeof raw.settings.invisibleMode === 'boolean'
      ? raw.settings.invisibleMode
      : false;

  return { status, lastActive, invisibleMode };
}

/**
 * Serialize ActivityData ngược lại thành RawPresenceData (dùng cho round-trip test).
 * - lastActive → số (Unix ms)
 * - status → string
 * - invisibleMode → settings.invisibleMode
 *
 * @validates Requirements 7.3
 */
export function formatPresenceData(data: ActivityData): RawPresenceData {
  return {
    status: data.status,
    lastActive: data.lastActive,
    settings: {
      invisibleMode: data.invisibleMode,
    },
  };
}

// ─── Task 2.3: calculateActiveScore ──────────────────────────────────────────

/**
 * Tính Active_Score theo bậc thang thời gian.
 * - status === 'online' → 100 (kiểm tra trước, không phụ thuộc lastActive)
 * - data === null → 0, không throw
 *
 * @validates Requirements 1.1, 1.3
 */
export function calculateActiveScore(data: ActivityData | null): number {
  if (data === null) return 0;

  // 'online' được ưu tiên, bất kể lastActive
  if (data.status === 'online') return 100;

  const now = Date.now();
  const elapsed = now - data.lastActive;

  if (elapsed <= MS_1_HOUR)  return 80;
  if (elapsed <= MS_6_HOURS) return 60;
  if (elapsed <= MS_24_HOURS) return 40;
  if (elapsed <= MS_7_DAYS)  return 20;
  return 0;
}

// ─── Task 2.5: calculateCompositeScore ───────────────────────────────────────

/**
 * Tính Composite_Score = matchingScore × 0.7 + activeScore × 0.3
 *
 * @validates Requirements 1.2
 */
export function calculateCompositeScore(matchingScore: number, activeScore: number): number {
  return matchingScore * 0.7 + activeScore * 0.3;
}

// ─── Task 2.7: isStaleProfile ─────────────────────────────────────────────────

/**
 * Kiểm tra hồ sơ có phải Stale_Profile không (lastActive > 7 ngày hoặc data === null).
 *
 * @validates Requirements 4.3
 */
export function isStaleProfile(data: ActivityData | null): boolean {
  if (data === null) return true;
  const elapsed = Date.now() - data.lastActive;
  return elapsed > MS_7_DAYS;
}

// ─── Task 2.8: applyActivityBooster ──────────────────────────────────────────

/**
 * Áp dụng Activity_Booster lên danh sách profiles đã có Matching_Score.
 * - Tính activeScore cho từng profile qua calculateActiveScore
 * - Tính compositeScore qua calculateCompositeScore
 * - Sort kết quả theo compositeScore giảm dần
 * - UID không có trong presenceMap → activeScore = 0
 *
 * @validates Requirements 1.2, 1.4, 4.1, 5.2
 */
export function applyActivityBooster(
  profilesWithScores: Array<{ profile: StudentProfile; score: number }>,
  presenceMap: Map<string, ActivityData>
): ProfileWithScore[] {
  const result: ProfileWithScore[] = profilesWithScores.map(({ profile, score }) => {
    const activityData = presenceMap.get(profile.uid) ?? null;
    const activeScore = calculateActiveScore(activityData);
    const compositeScore = calculateCompositeScore(score, activeScore);
    return {
      profile,
      matchingScore: score,
      activeScore,
      compositeScore,
    };
  });

  // Sort theo compositeScore giảm dần
  result.sort((a, b) => b.compositeScore - a.compositeScore);

  return result;
}

// ─── Task 2.10: limitStaleProfiles ───────────────────────────────────────────

/**
 * Giới hạn ≤ 2 Stale_Profile trong batch batchSize hồ sơ.
 * - Stale_Profile được xác định bởi activeScore === 0 (không có data hoặc > 7 ngày)
 *   Lưu ý: activeScore = 0 khi lastActive > 7 ngày HOẶC không có dữ liệu presence
 * - Khi tất cả đều stale: log warning, trả về bình thường (không chặn)
 *
 * @validates Requirements 4.3, 4.4
 */
export function limitStaleProfiles(
  profiles: ProfileWithScore[],
  batchSize: number
): ProfileWithScore[] {
  const MAX_STALE = Math.floor(batchSize / 2); // 2 trong batch 4

  const nonStale: ProfileWithScore[] = [];
  const stale: ProfileWithScore[] = [];

  for (const p of profiles) {
    // activeScore === 0 tương đương Stale_Profile (lastActive > 7 ngày hoặc không có data)
    if (p.activeScore === 0) {
      stale.push(p);
    } else {
      nonStale.push(p);
    }
  }

  // Nếu tất cả đều stale: log warning và trả về bình thường (Requirement 4.4)
  if (nonStale.length === 0) {
    console.warn('[ActivityBooster] Tất cả hồ sơ trong batch đều là Stale_Profile');
    return profiles;
  }

  // Ghép: lấy tất cả non-stale + tối đa MAX_STALE stale profiles
  return [...nonStale, ...stale.slice(0, MAX_STALE)];
}
