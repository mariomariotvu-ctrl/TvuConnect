/**
 * formatLastSeen.ts — Utility thuần (không import Firebase)
 * Chuyển đổi timestamp lastActive thành chuỗi hiển thị thân thiện bằng tiếng Việt.
 *
 * Được dùng chung trong: OnlineStatus, useOnlineStatus, Chat, ProfileCard
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MS_30_SECONDS = 30_000;
const MS_1_MINUTE   = 60_000;
const MS_1_HOUR     = 3_600_000;
const MS_24_HOURS   = 86_400_000;
const MS_48_HOURS   = 172_800_000;
const MS_7_DAYS     = 604_800_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Kết quả trả về của formatLastSeen — luôn là chuỗi không rỗng */
export type LastSeenString = string;

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Chuyển đổi `lastActive` thành chuỗi mô tả thời gian hoạt động gần nhất.
 *
 * Thuật toán 7 mức thời gian (theo design document):
 * - `null` hoặc Date không hợp lệ → `"Không hoạt động"`
 * - diff < 0 (clock skew)          → `"Không hoạt động"`
 * - diff < 30s                     → `"Vừa hoạt động"`
 * - diff < 60s                     → `"Hoạt động vài giây trước"`
 * - diff < 60 phút                 → `"Hoạt động X phút trước"`
 * - diff < 24 giờ                  → `"Hoạt động X giờ trước"`
 * - diff < 48 giờ                  → `"Hoạt động hôm qua"`
 * - diff < 7 ngày                  → `"Hoạt động X ngày trước"`
 * - diff >= 7 ngày                 → `"Không hoạt động"`
 *
 * @param lastActive - Đối tượng Date hoặc null
 * @returns Chuỗi không rỗng, không bao giờ chứa NaN/undefined/null/"Invalid Date"
 *
 * @validates Requirements 3.4, 3.5, 4.4, 10.4
 */
export function formatLastSeen(lastActive: Date | null): LastSeenString {
  // Edge case: null
  if (lastActive === null || lastActive === undefined) {
    return 'Không hoạt động';
  }

  // Edge case: Date không hợp lệ (NaN timestamp)
  const lastActiveMs = lastActive.getTime();
  if (!Number.isFinite(lastActiveMs)) {
    return 'Không hoạt động';
  }

  const diff = Date.now() - lastActiveMs;

  // Edge case: diff âm — clock skew (server time nhanh hơn client)
  if (diff < 0) {
    return 'Không hoạt động';
  }

  // ── 7 mức thời gian ─────────────────────────────────────────────────────────

  if (diff < MS_30_SECONDS) {
    return 'Vừa hoạt động';
  }

  if (diff < MS_1_MINUTE) {
    return 'Hoạt động vài giây trước';
  }

  const minutes = Math.floor(diff / MS_1_MINUTE);
  if (diff < MS_1_HOUR) {
    return `Hoạt động ${minutes} phút trước`;
  }

  const hours = Math.floor(diff / MS_1_HOUR);
  if (diff < MS_24_HOURS) {
    return `Hoạt động ${hours} giờ trước`;
  }

  if (diff < MS_48_HOURS) {
    return 'Hoạt động hôm qua';
  }

  const days = Math.floor(diff / MS_24_HOURS);
  if (diff < MS_7_DAYS) {
    return `Hoạt động ${days} ngày trước`;
  }

  // diff >= 7 ngày
  return 'Không hoạt động';
}
