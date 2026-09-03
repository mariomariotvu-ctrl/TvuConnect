/**
 * activityBooster.pbt.test.ts — Property-Based Tests (fast-check)
 *
 * Các property tests cho các hàm thuần trong activityBooster.ts
 * Sử dụng fast-check để verify properties trên nhiều input tự động.
 *
 * Tasks: 2.2, 2.4, 2.6, 2.9, 2.11
 */

import { describe, test, beforeEach, afterEach, vi } from 'vitest';
import { expect } from 'vitest';
import * as fc from 'fast-check';
import type { StudentProfile } from '../types';
import {
  parsePresenceData,
  formatPresenceData,
  calculateActiveScore,
  calculateCompositeScore,
  applyActivityBooster,
  limitStaleProfiles,
} from './activityBooster';
import type { ActivityData, ProfileWithScore } from './activityBooster';

// ─── Helpers & Generators ────────────────────────────────────────────────────

/** Tạo StudentProfile tối giản (chỉ cần uid) */
const arbitraryStudentProfile = (): fc.Arbitrary<StudentProfile> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(uid => ({
    uid,
    email: `${uid}@test.com`,
    mssv: uid,
    fullName: `User ${uid}`,
    createdAt: null as any,
    updatedAt: null as any,
  }));

/** Tạo ActivityData hợp lệ */
const arbitraryActivityData = (now: number): fc.Arbitrary<ActivityData> =>
  fc.record({
    status: fc.constantFrom('online' as const, 'away' as const, 'offline' as const),
    lastActive: fc.integer({ min: 0, max: now + 3_600_000 }), // đến now+1h
    invisibleMode: fc.boolean(),
  });

// ─── Task 2.2: Property tests cho parsePresenceData & formatPresenceData ─────
// Validates: Requirements 7.1, 7.2, 7.3

describe('Task 2.2 — parsePresenceData & formatPresenceData', () => {
  /**
   * Property 6: Parse lastActive Unix ms = parse ISO string đại diện cùng thời điểm
   * Validates: Requirements 7.1
   */
  test('Property 6: Parse lastActive Unix ms = parse ISO string cùng thời điểm', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_999_999_999_999 }),
        (ts) => {
          const fromNumber = parsePresenceData({ lastActive: ts });
          const fromIso = parsePresenceData({ lastActive: new Date(ts).toISOString() });

          // Cả hai phải không null
          expect(fromNumber).not.toBeNull();
          expect(fromIso).not.toBeNull();

          // lastActive phải bằng nhau
          expect(fromNumber!.lastActive).toBe(fromIso!.lastActive);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property 7: Status không hợp lệ → fallback 'offline'
   * Validates: Requirements 7.2
   */
  test('Property 7: Status không hợp lệ → fallback về offline', () => {
    const validStatuses = new Set(['online', 'away', 'offline']);

    fc.assert(
      fc.property(
        fc.string().filter(s => !validStatuses.has(s)),
        (invalidStatus) => {
          const result = parsePresenceData({ status: invalidStatus });
          expect(result).not.toBeNull();
          expect(result!.status).toBe('offline');
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property 8: Round-trip parse → format → parse cho kết quả tương đương
   * Validates: Requirements 7.3
   */
  test('Property 8: Round-trip parse→format→parse trả về kết quả tương đương', () => {
    const validStatuses = ['online', 'away', 'offline'] as const;
    const MAX_SAFE_TS = 9_999_999_999_999;

    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom(...validStatuses),
          lastActive: fc.integer({ min: 0, max: MAX_SAFE_TS }),
          invisibleMode: fc.boolean(),
        }),
        (rawData) => {
          // Parse lần 1 từ raw data hợp lệ
          const parsed1 = parsePresenceData({
            status: rawData.status,
            lastActive: rawData.lastActive,
            settings: { invisibleMode: rawData.invisibleMode },
          });
          expect(parsed1).not.toBeNull();

          // Format rồi parse lại (round-trip)
          const formatted = formatPresenceData(parsed1!);
          const parsed2 = parsePresenceData(formatted);
          expect(parsed2).not.toBeNull();

          // Kết quả phải tương đương
          expect(parsed2!.status).toBe(parsed1!.status);
          expect(parsed2!.lastActive).toBe(parsed1!.lastActive);
          expect(parsed2!.invisibleMode).toBe(parsed1!.invisibleMode);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Task 2.4: Property tests cho calculateActiveScore ───────────────────────
// Validates: Requirements 1.1, 5.1

describe('Task 2.4 — calculateActiveScore', () => {
  const VALID_SCORES = [0, 20, 40, 60, 80, 100];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Property 1: Active_Score ∈ {0, 20, 40, 60, 80, 100}
   * Validates: Requirements 1.1
   */
  test('Property 1: Active_Score luôn thuộc tập {0, 20, 40, 60, 80, 100}', () => {
    const now = new Date('2025-01-01T12:00:00.000Z').getTime();

    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom('online' as const, 'away' as const, 'offline' as const),
          lastActive: fc.integer({ min: 0, max: now + 3_600_000 }),
          invisibleMode: fc.boolean(),
        }),
        (data: ActivityData) => {
          const score = calculateActiveScore(data);
          expect(VALID_SCORES).toContain(score);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property 10: calculateActiveScore là pure/deterministic — cùng input → cùng output
   * Validates: Requirements 5.1 (mode-independent: hàm không nhận tham số mode)
   */
  test('Property 10: calculateActiveScore là deterministic (cùng input → cùng output)', () => {
    const now = new Date('2025-01-01T12:00:00.000Z').getTime();

    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom('online' as const, 'away' as const, 'offline' as const),
          lastActive: fc.integer({ min: 0, max: now + 3_600_000 }),
          invisibleMode: fc.boolean(),
        }),
        (data: ActivityData) => {
          // Gọi 2 lần với cùng input và cùng fake time → phải cho cùng kết quả
          const score1 = calculateActiveScore(data);
          const score2 = calculateActiveScore(data);
          expect(score1).toBe(score2);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Task 2.6: Property tests cho calculateCompositeScore ────────────────────
// Validates: Requirements 1.2

describe('Task 2.6 — calculateCompositeScore', () => {
  /**
   * Property 2: compositeScore = 0.7×matching + 0.3×active (±1e-9)
   * Validates: Requirements 1.2
   */
  test('Property 2: compositeScore = 0.7×matching + 0.3×active (±1e-9)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (matching, active) => {
          const composite = calculateCompositeScore(matching, active);
          const expected = matching * 0.7 + active * 0.3;
          expect(Math.abs(composite - expected)).toBeLessThan(1e-9);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ─── Task 2.9: Property tests cho applyActivityBooster ───────────────────────
// Validates: Requirements 1.4, 4.1, 6.2

describe('Task 2.9 — applyActivityBooster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Property 3: Kết quả được sắp xếp theo compositeScore giảm dần
   * Validates: Requirements 1.4, 4.1
   */
  test('Property 3: applyActivityBooster trả về kết quả sắp xếp theo compositeScore giảm dần', () => {
    const now = new Date('2025-01-01T12:00:00.000Z').getTime();

    // Arbitrary cho một presence entry (uid + ActivityData)
    const arbitraryPresenceEntry = fc.tuple(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.record({
        status: fc.constantFrom('online' as const, 'away' as const, 'offline' as const),
        lastActive: fc.integer({ min: 0, max: now + 3_600_000 }),
        invisibleMode: fc.boolean(),
      })
    );

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            profile: arbitraryStudentProfile(),
            score: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        fc.array(arbitraryPresenceEntry, { minLength: 0, maxLength: 20 }),
        (profilesWithScores, presenceEntries) => {
          const presenceMap = new Map<string, ActivityData>(
            presenceEntries as Array<[string, ActivityData]>
          );
          const result = applyActivityBooster(profilesWithScores, presenceMap);

          // Verify sort giảm dần
          for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].compositeScore).toBeGreaterThanOrEqual(result[i + 1].compositeScore);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property 5: presenceMap rỗng → thứ tự tương đối theo matchingScore không đổi
   * Validates: Requirements 6.2
   */
  test('Property 5: presenceMap rỗng → thứ tự tương đối theo matchingScore được giữ nguyên', () => {
    fc.assert(
      fc.property(
        // Tạo array với matchingScore distinct (không trùng nhau)
        fc
          .array(fc.float({ min: 0, max: 100, noNaN: true }), {
            minLength: 2,
            maxLength: 15,
          })
          .chain(scores => {
            // Đảm bảo scores là distinct bằng cách gán index offset nhỏ
            const distinctScores = scores.map((s, i) => Math.min(100, s + i * 0.001));
            return fc.constant(distinctScores);
          })
          .chain(distinctScores =>
            fc.tuple(
              fc.constant(distinctScores),
              fc.array(arbitraryStudentProfile(), {
                minLength: distinctScores.length,
                maxLength: distinctScores.length,
              })
            )
          ),
        ([distinctScores, profiles]) => {
          const input = profiles.map((profile, i) => ({
            profile,
            score: distinctScores[i],
          }));

          const result = applyActivityBooster(input, new Map());

          // Khi presenceMap rỗng, activeScore = 0 cho tất cả
          // compositeScore = matchingScore * 0.7, thứ tự giảm dần theo matchingScore
          const resultUids = result.map(r => r.profile.uid);
          const expectedUids = [...input]
            .sort((a, b) => b.score - a.score)
            .map(p => p.profile.uid);

          expect(resultUids).toEqual(expectedUids);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Task 2.11: Property tests cho limitStaleProfiles ────────────────────────
// Validates: Requirements 4.3

describe('Task 2.11 — limitStaleProfiles', () => {
  /**
   * Tạo ProfileWithScore giả
   */
  const makeProfile = (uid: string, activeScore: number): ProfileWithScore => ({
    profile: {
      uid,
      email: `${uid}@test.com`,
      mssv: uid,
      fullName: `User ${uid}`,
      createdAt: null as any,
      updatedAt: null as any,
    },
    matchingScore: 50,
    activeScore,
    compositeScore: 50 * 0.7 + activeScore * 0.3,
  });

  /**
   * Property 9: stale ≤ 2 khi có ≥ 2 non-stale trong danh sách
   * Validates: Requirements 4.3
   */
  test('Property 9: stale ≤ 2 khi danh sách có ít nhất 2 non-stale', () => {
    // Tạo arbitrary ProfileWithScore có activeScore ngẫu nhiên (non-stale: > 0)
    const arbitraryNonStale = fc
      .string({ minLength: 1, maxLength: 10 })
      .chain(uid =>
        fc.integer({ min: 1, max: 5 }).map(scoreMult =>
          makeProfile(uid, scoreMult * 20) // 20, 40, 60, 80, 100
        )
      );

    const arbitraryStale = fc
      .string({ minLength: 1, maxLength: 10 })
      .map(uid => makeProfile(uid + '_stale', 0));

    fc.assert(
      fc.property(
        // Ít nhất 2 non-stale
        fc.array(arbitraryNonStale, { minLength: 2, maxLength: 10 }),
        // Nhiều stale
        fc.array(arbitraryStale, { minLength: 0, maxLength: 15 }),
        (nonStaleProfiles, staleProfiles) => {
          // Đảm bảo uid unique
          const nonStaleWithUid = nonStaleProfiles.map((p, i) => ({
            ...p,
            profile: { ...p.profile, uid: `ns_${i}` },
          }));
          const staleWithUid = staleProfiles.map((p, i) => ({
            ...p,
            profile: { ...p.profile, uid: `s_${i}` },
          }));

          const input = [...nonStaleWithUid, ...staleWithUid];
          const result = limitStaleProfiles(input, 4);

          // Verify 1: số stale profiles không vượt quá 2
          const staleCount = result.filter(p => p.activeScore === 0).length;
          expect(staleCount).toBeLessThanOrEqual(2);

          // Verify 2: tất cả non-stale profiles vẫn có trong result (không bị loại bỏ)
          const resultUids = new Set(result.map(p => p.profile.uid));
          for (const nonStale of nonStaleWithUid) {
            expect(resultUids.has(nonStale.profile.uid)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
