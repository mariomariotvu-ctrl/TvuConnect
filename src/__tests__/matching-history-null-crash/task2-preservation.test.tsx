/**
 * Task 2: Preservation Property Tests
 * 
 * Mục đích: Verify rằng Match document hợp lệ hoạt động đúng như cũ sau khi fix.
 * Áp dụng observation-first methodology — dựa trên hành vi quan sát được từ code.
 * 
 * Property 2: Preservation — Match document hợp lệ hoạt động như cũ
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import type { Match, StudentProfile } from '../../types';
import { MatchingHistory } from '../../components/matching/MatchingHistory';

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic helpers (mirror logic trong useMatchingHistory)
// ─────────────────────────────────────────────────────────────────────────────

const filterValidMatches = (matches: Match[]): Match[] =>
  matches.filter(m => m.matchedProfile != null);

const filterBlockedUsers = (matches: Match[], blockedUids: Set<string>): Match[] =>
  matches.filter(m => !blockedUids.has(m.matchedUid));

const deduplicateByMatchedUid = (matches: Match[]): Match[] => {
  const unique: Match[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (!seen.has(m.matchedUid)) {
      seen.add(m.matchedUid);
      unique.push(m);
    }
  }
  return unique;
};

const applyHistoryLimit = (
  matches: Match[],
  limit: number
): { visible: Match[]; hasMore: boolean } => {
  if (matches.length > limit) {
    return { visible: matches.slice(0, limit), hasMore: true };
  }
  return { visible: matches, hasMore: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// fast-check Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

const mockTimestamp = {
  toDate: () => new Date('2024-01-15'),
  seconds: 1705276800,
  nanoseconds: 0,
} as any;

/** Arbitrary sinh StudentProfile hợp lệ */
const arbStudentProfile: fc.Arbitrary<StudentProfile> = fc
  .record({
    uid: fc.uuid(),
    fullName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    mssv: fc.string({ minLength: 9, maxLength: 10 }),
    email: fc.emailAddress(),
    photoURL: fc.option(fc.webUrl(), { nil: undefined }),
    major: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
  })
  .map(fields => ({
    ...fields,
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  } as StudentProfile));

/** Arbitrary sinh Match hợp lệ (matchedProfile != null) */
const arbValidMatch: fc.Arbitrary<Match> = fc
  .record({
    id: fc.uuid(),
    matchedUid: fc.uuid(),
  })
  .chain(({ id, matchedUid }) =>
    arbStudentProfile.map(profile => ({
      id,
      userUid: 'currentUser',
      matchedUid,
      matchedProfile: { ...profile, uid: matchedUid },
      createdAt: mockTimestamp,
    } as Match))
  );

/** Arbitrary sinh Match không hợp lệ (matchedProfile = null hoặc undefined) */
const arbInvalidMatch: fc.Arbitrary<Match> = fc
  .record({ id: fc.uuid(), matchedUid: fc.uuid() })
  .chain(({ id, matchedUid }) =>
    fc.constantFrom(null as null, undefined as undefined).map(bad => ({
      id,
      userUid: 'currentUser',
      matchedUid,
      matchedProfile: bad,
      createdAt: mockTimestamp,
    } as Match))
  );

/** Arbitrary sinh list match với ít nhất 1 valid, mix cả invalid */
const arbMixedMatches = (minValid = 1): fc.Arbitrary<Match[]> =>
  fc
    .tuple(
      fc.array(arbValidMatch, { minLength: minValid, maxLength: 10 }),
      fc.array(arbInvalidMatch, { minLength: 0, maxLength: 5 })
    )
    .map(([valid, invalid]) => {
      // Interleave để tạo mix ngẫu nhiên hơn
      const combined = [...valid, ...invalid];
      // Shuffle deterministically enough for testing
      return combined;
    });

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Property 2 — Preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 2: Preservation — Match document hợp lệ hoạt động như cũ', () => {

  // ── 3.1 Valid match render đúng data ──────────────────────────────────────
  describe('3.1 Render đúng data cho match hợp lệ', () => {

    /**
     * **Validates: Requirements 3.1**
     * Property: Với bất kỳ Match hợp lệ nào, MatchingHistory PHẢI render
     * fullName và major của matchedProfile mà không mất dữ liệu.
     */
    it('[PBT] sinh ngẫu nhiên match hợp lệ → fullName luôn được render', () => {
      fc.assert(
        fc.property(arbValidMatch, (match) => {
          const { queryByText, unmount } = render(
            <MatchingHistory
              matches={[match]}
              hasMore={false}
              onProfileClick={vi.fn()}
              onLoadMore={vi.fn()}
            />
          );

          const fullName = match.matchedProfile!.fullName;
          const rendered = queryByText(fullName);
          unmount();
          return rendered !== null;
        }),
        { numRuns: 30 }
      );
    });

    it('[PBT] major được render đúng — hiện "Chưa cập nhật" nếu không có', () => {
      fc.assert(
        fc.property(arbValidMatch, (match) => {
          const { container, unmount } = render(
            <MatchingHistory
              matches={[match]}
              hasMore={false}
              onProfileClick={vi.fn()}
              onLoadMore={vi.fn()}
            />
          );

          const expectedMajor = match.matchedProfile!.major || 'Chưa cập nhật';
          const majorEl = container.querySelector('p.text-\\[12px\\]');
          unmount();

          // Major text phải có trong rendered output
          return container.textContent?.includes(expectedMajor) ?? false;
        }),
        { numRuns: 30 }
      );
    });

    it('render đúng photoURL nếu có — dùng img tag', () => {
      const profile: StudentProfile = {
        uid: 'uid1',
        fullName: 'Trần Thị B',
        mssv: '123456789',
        email: 'b@tvu.edu.vn',
        photoURL: 'https://example.com/photo.jpg',
        major: 'Kế toán',
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      };
      const match: Match = {
        id: 'm1',
        userUid: 'currentUser',
        matchedUid: 'uid1',
        matchedProfile: profile,
        createdAt: mockTimestamp,
      };

      const { container } = render(
        <MatchingHistory
          matches={[match]}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg');
      expect(img?.getAttribute('alt')).toBe('Trần Thị B');
    });

    it('render icon UserIcon khi không có photoURL', () => {
      const profile: StudentProfile = {
        uid: 'uid2',
        fullName: 'Lê Văn C',
        mssv: '987654321',
        email: 'c@tvu.edu.vn',
        photoURL: undefined,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      };
      const match: Match = {
        id: 'm2',
        userUid: 'currentUser',
        matchedUid: 'uid2',
        matchedProfile: profile,
        createdAt: mockTimestamp,
      };

      const { container } = render(
        <MatchingHistory
          matches={[match]}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      // Không có img, chỉ có SVG icon
      const img = container.querySelector('img');
      expect(img).toBeNull();
    });
  });

  // ── 3.2 Click callback gọi đúng match ─────────────────────────────────────
  describe('3.2 Click vào match hợp lệ gọi đúng onProfileClick', () => {

    /**
     * **Validates: Requirements 3.2**
     * Property: Click vào bất kỳ match hợp lệ nào phải gọi onProfileClick với
     * đúng match object đó.
     */
    it('[PBT] click vào match → onProfileClick được gọi với đúng match', () => {
      fc.assert(
        fc.property(arbValidMatch, (match) => {
          const onProfileClick = vi.fn();

          const { container, unmount } = render(
            <MatchingHistory
              matches={[match]}
              hasMore={false}
              onProfileClick={onProfileClick}
              onLoadMore={vi.fn()}
            />
          );

          // Click vào card item
          const card = container.querySelector('[class*="cursor-pointer"]');
          if (card) {
            fireEvent.click(card);
          }

          const called = onProfileClick.mock.calls.length === 1;
          if (called) {
            const calledWith = onProfileClick.mock.calls[0][0] as Match;
            // Verify đúng match được truyền vào
            const correct = calledWith.id === match.id && calledWith.matchedUid === match.matchedUid;
            unmount();
            return correct;
          }
          unmount();
          return called;
        }),
        { numRuns: 20 }
      );
    });
  });

  // ── 3.3 Deduplication — giữ nguyên sau fix ────────────────────────────────
  describe('3.3 Deduplication hoạt động đúng', () => {

    /**
     * **Validates: Requirements 3.3**
     * Property: Sau dedup, mỗi matchedUid chỉ xuất hiện một lần trong kết quả.
     */
    it('[PBT] sinh match với trùng matchedUid → dedup giữ 1 bản cho mỗi uid', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 8 }).chain(uids =>
            fc.array(
              fc.constantFrom(...uids).chain(uid =>
                arbStudentProfile.map(p => ({
                  id: Math.random().toString(36),
                  userUid: 'currentUser',
                  matchedUid: uid,
                  matchedProfile: { ...p, uid },
                  createdAt: mockTimestamp,
                } as Match))
              ),
              { minLength: 1, maxLength: 15 }
            )
          ),
          (matches) => {
            const deduped = deduplicateByMatchedUid(matches);
            const seenUids = new Set(deduped.map(m => m.matchedUid));
            // Không có uid nào bị duplicate trong kết quả
            return seenUids.size === deduped.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('dedup giữ match đầu tiên khi trùng uid (most recent do orderBy desc)', () => {
      const matches: Match[] = [
        makeTestMatch('m1', 'uid1', 'First Nguyễn'),
        makeTestMatch('m2', 'uid1', 'Duplicate Nguyễn'),  // trùng uid1
        makeTestMatch('m3', 'uid2', 'Trần Văn B'),
      ];

      const result = deduplicateByMatchedUid(matches);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('m1'); // Giữ bản đầu tiên
      expect(result[1].id).toBe('m3');
    });
  });

  // ── 3.4 Filter blocked users ──────────────────────────────────────────────
  describe('3.4 Filter blocked users hoạt động đúng', () => {

    /**
     * **Validates: Requirements 3.4**
     * Property: Với bất kỳ Set blockedUids nào, kết quả sau filter không bao giờ
     * chứa match có matchedUid thuộc blockedUids.
     */
    it('[PBT] sinh danh sách match và blocked uids → không có blocked user trong kết quả', () => {
      fc.assert(
        fc.property(
          fc.array(arbValidMatch, { minLength: 0, maxLength: 10 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
          (matches, blockedList) => {
            const blockedSet = new Set(blockedList);
            const filtered = filterBlockedUsers(matches, blockedSet);

            // Không có match nào trong kết quả có matchedUid là blocked
            return filtered.every(m => !blockedSet.has(m.matchedUid));
          }
        ),
        { numRuns: 50 }
      );
    });

    it('blocked users bị loại bỏ, unblocked giữ nguyên', () => {
      const matches: Match[] = [
        makeTestMatch('m1', 'uid1', 'Không bị block'),
        makeTestMatch('m2', 'uid2', 'Bị block'),
        makeTestMatch('m3', 'uid3', 'Cũng không bị block'),
      ];
      const blocked = new Set(['uid2']);

      const result = filterBlockedUsers(matches, blocked);

      expect(result).toHaveLength(2);
      expect(result.map(m => m.matchedUid)).toEqual(['uid1', 'uid3']);
    });
  });

  // ── 3.5 Mix hợp lệ/không hợp lệ → chỉ valid xuất hiện ──────────────────
  describe('3.5 Mix valid và invalid → chỉ valid items được render', () => {

    /**
     * **Validates: Requirements 3.5**
     * Property: Sau khi filter bỏ invalid, chỉ items hợp lệ xuất hiện trong
     * kết quả, count phải đúng.
     */
    it('[PBT] mix hợp lệ và không hợp lệ → số lượng sau filter = số match hợp lệ', () => {
      fc.assert(
        fc.property(
          fc.array(arbValidMatch, { minLength: 0, maxLength: 8 }),
          fc.array(arbInvalidMatch, { minLength: 0, maxLength: 5 }),
          (valid, invalid) => {
            const mixed = [...valid, ...invalid];
            const filtered = filterValidMatches(mixed);
            return filtered.length === valid.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('[PBT] mọi item trong kết quả filter đều có matchedProfile != null', () => {
      fc.assert(
        fc.property(
          arbMixedMatches(0),
          (mixed) => {
            const filtered = filterValidMatches(mixed);
            return filtered.every(m => m.matchedProfile != null);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('render mix → chỉ render fullName của valid items', () => {
      const validProfile1: StudentProfile = {
        uid: 'uid1', fullName: 'Hợp Lệ Một', mssv: '111',
        email: 'one@tvu.edu.vn', createdAt: mockTimestamp, updatedAt: mockTimestamp,
      };
      const validProfile2: StudentProfile = {
        uid: 'uid2', fullName: 'Hợp Lệ Hai', mssv: '222',
        email: 'two@tvu.edu.vn', createdAt: mockTimestamp, updatedAt: mockTimestamp,
      };

      const matches: Match[] = [
        { id: 'v1', userUid: 'u', matchedUid: 'uid1', matchedProfile: validProfile1, createdAt: mockTimestamp },
        { id: 'n1', userUid: 'u', matchedUid: 'uid3', matchedProfile: null, createdAt: mockTimestamp },
        { id: 'v2', userUid: 'u', matchedUid: 'uid2', matchedProfile: validProfile2, createdAt: mockTimestamp },
        { id: 'n2', userUid: 'u', matchedUid: 'uid4', matchedProfile: undefined, createdAt: mockTimestamp },
      ];

      // Simulate: useMatchingHistory filter trước khi pass vào component
      const filtered = filterValidMatches(matches);

      const { queryByText } = render(
        <MatchingHistory
          matches={filtered}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      // Valid items xuất hiện
      expect(queryByText('Hợp Lệ Một')).toBeTruthy();
      expect(queryByText('Hợp Lệ Hai')).toBeTruthy();
    });
  });

  // ── 3.6 Empty list → null ─────────────────────────────────────────────────
  describe('3.6 Empty list → component trả về null', () => {
    it('matches rỗng → MatchingHistory không render gì cả', () => {
      const { container } = render(
        <MatchingHistory
          matches={[]}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('[PBT] mọi kịch bản mảng rỗng → không render', () => {
      fc.assert(
        fc.property(fc.constant([]), (matches: Match[]) => {
          const { container, unmount } = render(
            <MatchingHistory
              matches={matches}
              hasMore={false}
              onProfileClick={vi.fn()}
              onLoadMore={vi.fn()}
            />
          );
          const result = container.firstChild === null;
          unmount();
          return result;
        }),
        { numRuns: 5 }
      );
    });
  });

  // ── 3.7 hasMore và nút "Xem thêm lịch sử" ────────────────────────────────
  describe('3.7 hasMore và nút Xem thêm lịch sử hoạt động đúng', () => {

    it('hasMore = true → hiện nút "Xem thêm lịch sử"', () => {
      const match = makeTestMatch('m1', 'uid1', 'Nguyễn Văn A');

      const { queryByText } = render(
        <MatchingHistory
          matches={[match]}
          hasMore={true}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      expect(queryByText('Xem thêm lịch sử')).toBeTruthy();
    });

    it('hasMore = false → không hiện nút "Xem thêm lịch sử"', () => {
      const match = makeTestMatch('m1', 'uid1', 'Nguyễn Văn A');

      const { queryByText } = render(
        <MatchingHistory
          matches={[match]}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      expect(queryByText('Xem thêm lịch sử')).toBeNull();
    });

    it('click "Xem thêm lịch sử" → gọi onLoadMore', () => {
      const onLoadMore = vi.fn();
      const match = makeTestMatch('m1', 'uid1', 'Nguyễn Văn A');

      const { getByText } = render(
        <MatchingHistory
          matches={[match]}
          hasMore={true}
          onProfileClick={vi.fn()}
          onLoadMore={onLoadMore}
        />
      );

      fireEvent.click(getByText('Xem thêm lịch sử'));
      expect(onLoadMore).toHaveBeenCalledOnce();
    });

    it('[PBT] hasMore logic: nếu total > limit → hasMore = true', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }).chain(limit =>
            fc.tuple(
              fc.constant(limit),
              fc.integer({ min: limit + 1, max: limit + 10 })
            )
          ),
          ([limit, totalCount]) => {
            // Tạo matches giả
            const matches = Array.from({ length: totalCount }, (_, i) =>
              makeTestMatch(`m${i}`, `uid${i}`, `User ${i}`)
            );

            const { visible, hasMore } = applyHistoryLimit(matches, limit);
            return hasMore === true && visible.length === limit;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('[PBT] nếu total <= limit → hasMore = false', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }).chain(limit =>
            fc.tuple(
              fc.constant(limit),
              fc.integer({ min: 0, max: limit })
            )
          ),
          ([limit, totalCount]) => {
            const matches = Array.from({ length: totalCount }, (_, i) =>
              makeTestMatch(`m${i}`, `uid${i}`, `User ${i}`)
            );

            const { hasMore } = applyHistoryLimit(matches, limit);
            return hasMore === false;
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper function dùng trong test suite (không phải arbitrary)
// ─────────────────────────────────────────────────────────────────────────────
function makeTestMatch(id: string, matchedUid: string, fullName: string): Match {
  return {
    id,
    userUid: 'currentUser',
    matchedUid,
    matchedProfile: {
      uid: matchedUid,
      fullName,
      mssv: '123456789',
      email: `${matchedUid}@tvu.edu.vn`,
      createdAt: mockTimestamp,
      updatedAt: mockTimestamp,
    },
    createdAt: mockTimestamp,
  };
}
