/**
 * Unit tests cho activityBooster.ts
 * Kiểm tra các pure functions: parse, format, score, boost, limit
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 4.3, 4.4, 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  parsePresenceData,
  formatPresenceData,
  calculateActiveScore,
  calculateCompositeScore,
  isStaleProfile,
  applyActivityBooster,
  limitStaleProfiles,
  type ActivityData,
  type RawPresenceData,
  type ProfileWithScore,
} from './activityBooster';
import type { StudentProfile } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now();

/** Tạo một ActivityData đơn giản */
function makeActivity(
  status: 'online' | 'away' | 'offline',
  lastActiveOffset: number = 0, // offset tính từ NOW (âm = quá khứ)
  invisibleMode = false
): ActivityData {
  return { status, lastActive: NOW + lastActiveOffset, invisibleMode };
}

/** Tạo một StudentProfile mock đơn giản */
function makeProfile(uid: string): StudentProfile {
  return { uid } as unknown as StudentProfile;
}

/** Tạo một ProfileWithScore mock */
function makeProfileWithScore(uid: string, matchingScore: number, activeScore: number): ProfileWithScore {
  return {
    profile: makeProfile(uid),
    matchingScore,
    activeScore,
    compositeScore: calculateCompositeScore(matchingScore, activeScore),
  };
}

// ─── parsePresenceData ────────────────────────────────────────────────────────

describe('parsePresenceData', () => {
  it('trả về null khi input là null', () => {
    expect(parsePresenceData(null)).toBeNull();
  });

  it('trả về null khi input là undefined', () => {
    expect(parsePresenceData(undefined)).toBeNull();
  });

  it('parse Unix timestamp số thành lastActive', () => {
    const ts = 1_700_000_000_000;
    const result = parsePresenceData({ lastActive: ts, status: 'online' });
    expect(result?.lastActive).toBe(ts);
  });

  it('parse ISO string thành lastActive (Requirements 7.1)', () => {
    const iso = '2023-11-14T22:13:20.000Z';
    const expected = Date.parse(iso);
    const result = parsePresenceData({ lastActive: iso, status: 'online' });
    expect(result?.lastActive).toBe(expected);
  });

  it('NaN number lastActive → 0', () => {
    const result = parsePresenceData({ lastActive: NaN, status: 'offline' });
    expect(result?.lastActive).toBe(0);
  });

  it('invalid string lastActive → 0', () => {
    const result = parsePresenceData({ lastActive: 'not-a-date', status: 'offline' });
    expect(result?.lastActive).toBe(0);
  });

  it('không có lastActive → 0', () => {
    const result = parsePresenceData({ status: 'online' });
    expect(result?.lastActive).toBe(0);
  });

  it('status "online" được giữ nguyên', () => {
    const result = parsePresenceData({ status: 'online' });
    expect(result?.status).toBe('online');
  });

  it('status "away" được giữ nguyên', () => {
    const result = parsePresenceData({ status: 'away' });
    expect(result?.status).toBe('away');
  });

  it('status "offline" được giữ nguyên', () => {
    const result = parsePresenceData({ status: 'offline' });
    expect(result?.status).toBe('offline');
  });

  it('status không hợp lệ → fallback "offline" (Requirements 7.2)', () => {
    const result = parsePresenceData({ status: 'invisible' });
    expect(result?.status).toBe('offline');
  });

  it('không có status → fallback "offline"', () => {
    const result = parsePresenceData({});
    expect(result?.status).toBe('offline');
  });

  it('invisibleMode true từ settings', () => {
    const result = parsePresenceData({ settings: { invisibleMode: true } });
    expect(result?.invisibleMode).toBe(true);
  });

  it('invisibleMode false khi không có settings', () => {
    const result = parsePresenceData({ status: 'online' });
    expect(result?.invisibleMode).toBe(false);
  });
});

// ─── formatPresenceData ───────────────────────────────────────────────────────

describe('formatPresenceData', () => {
  it('serialize thành RawPresenceData đúng trường', () => {
    const data: ActivityData = { status: 'online', lastActive: 12345, invisibleMode: true };
    const raw = formatPresenceData(data);
    expect(raw.status).toBe('online');
    expect(raw.lastActive).toBe(12345);
    expect(raw.settings?.invisibleMode).toBe(true);
  });

  it('round-trip parse→format→parse cho kết quả tương đương (Requirements 7.3)', () => {
    const original: RawPresenceData = {
      status: 'away',
      lastActive: 1_700_000_000_000,
      settings: { invisibleMode: false },
    };
    const parsed1 = parsePresenceData(original)!;
    const formatted = formatPresenceData(parsed1);
    const parsed2 = parsePresenceData(formatted)!;

    expect(parsed2.status).toBe(parsed1.status);
    expect(parsed2.lastActive).toBe(parsed1.lastActive);
    expect(parsed2.invisibleMode).toBe(parsed1.invisibleMode);
  });
});

// ─── calculateActiveScore ─────────────────────────────────────────────────────

describe('calculateActiveScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('null → 0', () => {
    expect(calculateActiveScore(null)).toBe(0);
  });

  it('status "online" → 100 bất kể lastActive (Requirements 1.1)', () => {
    const data = makeActivity('online', -8 * 24 * 60 * 60 * 1000); // 8 ngày trước nhưng online
    expect(calculateActiveScore(data)).toBe(100);
  });

  it('lastActive ≤ 1h → 80', () => {
    const data = makeActivity('offline', -30 * 60 * 1000); // 30 phút trước
    expect(calculateActiveScore(data)).toBe(80);
  });

  it('lastActive ≤ 6h → 60', () => {
    const data = makeActivity('offline', -3 * 60 * 60 * 1000); // 3 giờ trước
    expect(calculateActiveScore(data)).toBe(60);
  });

  it('lastActive ≤ 24h → 40', () => {
    const data = makeActivity('offline', -12 * 60 * 60 * 1000); // 12 giờ trước
    expect(calculateActiveScore(data)).toBe(40);
  });

  it('lastActive ≤ 7 ngày → 20', () => {
    const data = makeActivity('offline', -3 * 24 * 60 * 60 * 1000); // 3 ngày trước
    expect(calculateActiveScore(data)).toBe(20);
  });

  it('lastActive > 7 ngày → 0', () => {
    const data = makeActivity('offline', -8 * 24 * 60 * 60 * 1000); // 8 ngày trước
    expect(calculateActiveScore(data)).toBe(0);
  });

  it('kết quả luôn nằm trong tập {0,20,40,60,80,100} (Requirements 1.1)', () => {
    const validScores = new Set([0, 20, 40, 60, 80, 100]);
    const offsets = [0, -1000, -60 * 60 * 1000, -6 * 60 * 60 * 1000, -24 * 60 * 60 * 1000, -8 * 24 * 60 * 60 * 1000];
    for (const offset of offsets) {
      const score = calculateActiveScore(makeActivity('offline', offset));
      expect(validScores.has(score)).toBe(true);
    }
    expect(validScores.has(calculateActiveScore(makeActivity('online')))).toBe(true);
    expect(validScores.has(calculateActiveScore(null))).toBe(true);
  });
});

// ─── calculateCompositeScore ──────────────────────────────────────────────────

describe('calculateCompositeScore', () => {
  it('công thức = 0.7×matching + 0.3×active (Requirements 1.2)', () => {
    expect(calculateCompositeScore(80, 100)).toBeCloseTo(80 * 0.7 + 100 * 0.3, 9);
  });

  it('matching=100, active=0 → 70', () => {
    expect(calculateCompositeScore(100, 0)).toBeCloseTo(70, 9);
  });

  it('matching=0, active=100 → 30', () => {
    expect(calculateCompositeScore(0, 100)).toBeCloseTo(30, 9);
  });

  it('cả hai = 0 → 0', () => {
    expect(calculateCompositeScore(0, 0)).toBe(0);
  });

  it('cả hai = 100 → 100', () => {
    expect(calculateCompositeScore(100, 100)).toBeCloseTo(100, 9);
  });
});

// ─── isStaleProfile ───────────────────────────────────────────────────────────

describe('isStaleProfile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('null → true (Requirements 4.3)', () => {
    expect(isStaleProfile(null)).toBe(true);
  });

  it('lastActive > 7 ngày → true', () => {
    const data = makeActivity('offline', -8 * 24 * 60 * 60 * 1000);
    expect(isStaleProfile(data)).toBe(true);
  });

  it('lastActive = 7 ngày đúng → false (biên)', () => {
    const data = makeActivity('offline', -7 * 24 * 60 * 60 * 1000);
    expect(isStaleProfile(data)).toBe(false);
  });

  it('lastActive ≤ 7 ngày → false', () => {
    const data = makeActivity('offline', -3 * 24 * 60 * 60 * 1000);
    expect(isStaleProfile(data)).toBe(false);
  });

  it('status "online" nhưng lastActive = 0 → true (vì lastActive rất cũ)', () => {
    const data: ActivityData = { status: 'online', lastActive: 0, invisibleMode: false };
    // elapsed = NOW - 0 >> 7 ngày → stale (dù online, isStaleProfile chỉ dựa vào lastActive)
    expect(isStaleProfile(data)).toBe(true);
  });
});

// ─── applyActivityBooster ─────────────────────────────────────────────────────

describe('applyActivityBooster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('danh sách rỗng → kết quả rỗng', () => {
    expect(applyActivityBooster([], new Map())).toEqual([]);
  });

  it('presenceMap rỗng → activeScore = 0 cho tất cả', () => {
    const input = [
      { profile: makeProfile('u1'), score: 80 },
      { profile: makeProfile('u2'), score: 60 },
    ];
    const result = applyActivityBooster(input, new Map());
    for (const item of result) {
      expect(item.activeScore).toBe(0);
    }
  });

  it('kết quả được sắp xếp theo compositeScore giảm dần (Requirements 1.4)', () => {
    const presenceMap = new Map<string, ActivityData>([
      ['u1', makeActivity('offline', -30 * 60 * 1000)], // activeScore = 80
      ['u2', makeActivity('online')],                    // activeScore = 100
    ]);
    const input = [
      { profile: makeProfile('u1'), score: 90 },
      { profile: makeProfile('u2'), score: 50 },
    ];
    const result = applyActivityBooster(input, presenceMap);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].compositeScore).toBeGreaterThanOrEqual(result[i].compositeScore);
    }
  });

  it('UID không có trong presenceMap → activeScore = 0', () => {
    const input = [{ profile: makeProfile('unknown'), score: 70 }];
    const result = applyActivityBooster(input, new Map());
    expect(result[0].activeScore).toBe(0);
  });

  it('compositeScore được tính đúng theo công thức', () => {
    const presenceMap = new Map<string, ActivityData>([
      ['u1', makeActivity('online')], // activeScore = 100
    ]);
    const input = [{ profile: makeProfile('u1'), score: 80 }];
    const result = applyActivityBooster(input, presenceMap);
    expect(result[0].compositeScore).toBeCloseTo(80 * 0.7 + 100 * 0.3, 9);
  });

  it('presenceMap rỗng → thứ tự tương đối theo matchingScore không đổi (Requirements 6.2 approx)', () => {
    const input = [
      { profile: makeProfile('u1'), score: 90 },
      { profile: makeProfile('u2'), score: 70 },
      { profile: makeProfile('u3'), score: 50 },
    ];
    const result = applyActivityBooster(input, new Map());
    expect(result[0].profile.uid).toBe('u1');
    expect(result[1].profile.uid).toBe('u2');
    expect(result[2].profile.uid).toBe('u3');
  });
});

// ─── limitStaleProfiles ───────────────────────────────────────────────────────

describe('limitStaleProfiles', () => {
  it('danh sách rỗng → rỗng', () => {
    expect(limitStaleProfiles([], 4)).toEqual([]);
  });

  it('tất cả non-stale → không bị cắt', () => {
    const profiles = [
      makeProfileWithScore('u1', 90, 80),
      makeProfileWithScore('u2', 80, 60),
      makeProfileWithScore('u3', 70, 40),
      makeProfileWithScore('u4', 60, 20),
    ];
    const result = limitStaleProfiles(profiles, 4);
    expect(result.length).toBe(4);
  });

  it('stale ≤ 2 trong batch 4 khi có ≥ 2 non-stale (Requirements 4.3)', () => {
    const profiles = [
      makeProfileWithScore('u1', 90, 80),  // non-stale
      makeProfileWithScore('u2', 80, 60),  // non-stale
      makeProfileWithScore('u3', 70, 0),   // stale
      makeProfileWithScore('u4', 60, 0),   // stale
      makeProfileWithScore('u5', 50, 0),   // stale (sẽ bị cắt)
    ];
    const result = limitStaleProfiles(profiles, 4);
    const staleCount = result.filter(p => p.activeScore === 0).length;
    expect(staleCount).toBeLessThanOrEqual(2);
  });

  it('tất cả stale → log warning, trả về bình thường (Requirements 4.4)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const profiles = [
      makeProfileWithScore('u1', 90, 0),
      makeProfileWithScore('u2', 80, 0),
      makeProfileWithScore('u3', 70, 0),
    ];
    const result = limitStaleProfiles(profiles, 4);
    expect(result.length).toBe(3); // trả về bình thường, không chặn
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('chỉ 1 stale → không bị cắt', () => {
    const profiles = [
      makeProfileWithScore('u1', 90, 80),  // non-stale
      makeProfileWithScore('u2', 80, 0),   // stale
    ];
    const result = limitStaleProfiles(profiles, 4);
    expect(result.length).toBe(2);
  });
});
