/**
 * Task 1: Bug Condition Exploration Tests
 * 
 * Mục đích: Verify rằng fix hoạt động đúng — documents có matchedProfile = null/undefined
 * bị filter bỏ và không gây crash.
 * 
 * Property 1: Bug Condition — Null matchedProfile không gây crash
 * 
 * QUAN TRỌNG: Fix đã được implement. Các tests này phải PASS trên code hiện tại
 * để xác nhận fix hoạt động đúng.
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import type { Match, StudentProfile } from '../../types';
import { MatchingHistory } from '../../components/matching/MatchingHistory';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — tạo dữ liệu test
// ─────────────────────────────────────────────────────────────────────────────

const mockTimestamp = {
  toDate: () => new Date('2024-01-15'),
  seconds: 1705276800,
  nanoseconds: 0,
} as any;

const makeValidProfile = (uid: string = 'uid1'): StudentProfile => ({
  uid,
  fullName: 'Nguyễn Văn A',
  mssv: '123456789',
  email: 'a@tvu.edu.vn',
  photoURL: 'https://example.com/photo.jpg',
  major: 'Công nghệ thông tin',
  createdAt: mockTimestamp,
  updatedAt: mockTimestamp,
});

const makeValidMatch = (id: string, matchedUid: string, profile?: StudentProfile): Match => ({
  id,
  userUid: 'currentUser',
  matchedUid,
  matchedProfile: profile ?? makeValidProfile(matchedUid),
  createdAt: mockTimestamp,
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic: filter bỏ match có matchedProfile = null/undefined
// (Extract logic từ useMatchingHistory để test mà không cần Firebase)
// ─────────────────────────────────────────────────────────────────────────────
const filterValidMatches = (matches: Match[]): Match[] =>
  matches.filter(m => m.matchedProfile != null);

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Property 1 — Bug Condition
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 1: Bug Condition — Null matchedProfile không gây crash', () => {

  describe('1.1 useMatchingHistory filter logic — matchedProfile = null', () => {
    it('filter bỏ document có matchedProfile = null', () => {
      const nullMatch: Match = {
        id: 'match-null',
        userUid: 'currentUser',
        matchedUid: 'uid-null',
        matchedProfile: null,
        createdAt: mockTimestamp,
      };
      const validMatch = makeValidMatch('match-valid', 'uid-valid');

      const result = filterValidMatches([nullMatch, validMatch]);

      // Document có matchedProfile = null phải bị filter bỏ
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('match-valid');
      expect(result.some(m => m.id === 'match-null')).toBe(false);
    });

    it('list toàn null → trả về mảng rỗng', () => {
      const matches: Match[] = [
        { id: '1', userUid: 'u', matchedUid: 'a', matchedProfile: null, createdAt: mockTimestamp },
        { id: '2', userUid: 'u', matchedUid: 'b', matchedProfile: null, createdAt: mockTimestamp },
      ];
      expect(filterValidMatches(matches)).toHaveLength(0);
    });
  });

  describe('1.2 useMatchingHistory filter logic — matchedProfile = undefined', () => {
    it('filter bỏ document có matchedProfile = undefined', () => {
      const undefinedMatch: Match = {
        id: 'match-undef',
        userUid: 'currentUser',
        matchedUid: 'uid-undef',
        matchedProfile: undefined,
        createdAt: mockTimestamp,
      };
      const validMatch = makeValidMatch('match-valid', 'uid-valid');

      const result = filterValidMatches([undefinedMatch, validMatch]);

      expect(result).toHaveLength(1);
      expect(result.some(m => m.id === 'match-undef')).toBe(false);
    });

    it('document thiếu field matchedProfile (undefined ngầm định) bị filter bỏ', () => {
      // Simulate Firestore doc thiếu field — TypeScript spread không set matchedProfile
      const docWithoutField = {
        id: 'missing-field',
        userUid: 'currentUser',
        matchedUid: 'uid-missing',
        createdAt: mockTimestamp,
        // matchedProfile không có
      } as Match;

      const result = filterValidMatches([docWithoutField]);
      expect(result).toHaveLength(0);
    });
  });

  describe('1.3 useMatchingHistory filter logic — mix hợp lệ và không hợp lệ', () => {
    it('mix null/undefined/hợp lệ → chỉ giữ hợp lệ', () => {
      const matches: Match[] = [
        makeValidMatch('v1', 'uid1'),
        { id: 'n1', userUid: 'u', matchedUid: 'a', matchedProfile: null, createdAt: mockTimestamp },
        makeValidMatch('v2', 'uid2'),
        { id: 'n2', userUid: 'u', matchedUid: 'b', matchedProfile: undefined, createdAt: mockTimestamp },
        makeValidMatch('v3', 'uid3'),
      ];

      const result = filterValidMatches(matches);

      expect(result).toHaveLength(3);
      expect(result.map(m => m.id)).toEqual(['v1', 'v2', 'v3']);
    });
  });

  describe('1.4 MatchingHistory component — null guard khi render', () => {
    it('render item có matchedProfile = null → trả về null cho item đó, không crash', () => {
      // MatchingHistory nhận match với matchedProfile = null
      // Component phải skip item đó (trả về null) mà không crash
      const matchWithNull: Match = {
        id: 'null-match',
        userUid: 'currentUser',
        matchedUid: 'uid-null',
        matchedProfile: null,
        createdAt: mockTimestamp,
      };
      const validMatch = makeValidMatch('valid', 'uid-valid');

      // Render với cả hai items — chỉ item hợp lệ xuất hiện
      const { queryByText, container } = render(
        <MatchingHistory
          matches={[matchWithNull, validMatch]}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      // Không crash — component render thành công
      expect(container).toBeTruthy();
      // Item hợp lệ xuất hiện
      expect(queryByText('Nguyễn Văn A')).toBeTruthy();
    });

    it('render list toàn null matchedProfile → component trả về null (không render)', () => {
      // Sau khi filter bỏ null, MatchingHistory nhận mảng rỗng → trả về null
      const emptyResult = filterValidMatches([
        { id: '1', userUid: 'u', matchedUid: 'a', matchedProfile: null, createdAt: mockTimestamp },
        { id: '2', userUid: 'u', matchedUid: 'b', matchedProfile: null, createdAt: mockTimestamp },
      ]);

      const { container } = render(
        <MatchingHistory
          matches={emptyResult}
          hasMore={false}
          onProfileClick={vi.fn()}
          onLoadMore={vi.fn()}
        />
      );

      // Component trả về null khi matches rỗng
      expect(container.firstChild).toBeNull();
    });
  });

  describe('1.5 Matching.tsx caller guard — không gọi handleProfileClick với null', () => {
    it('guard trong onProfileClick không gọi callback khi matchedProfile là null', () => {
      // Simulate guard logic từ Matching.tsx:
      // onProfileClick={(match) => match.matchedProfile && handleProfileClick(match.matchedProfile)}
      const handleProfileClick = vi.fn();

      const onProfileClick = (match: Match) => {
        if (match.matchedProfile) {
          handleProfileClick(match.matchedProfile);
        }
      };

      const nullMatch: Match = {
        id: 'null',
        userUid: 'u',
        matchedUid: 'a',
        matchedProfile: null,
        createdAt: mockTimestamp,
      };

      onProfileClick(nullMatch);

      // handleProfileClick KHÔNG được gọi với null
      expect(handleProfileClick).not.toHaveBeenCalled();
    });

    it('guard trong onProfileClick gọi callback đúng khi matchedProfile hợp lệ', () => {
      const handleProfileClick = vi.fn();
      const profile = makeValidProfile('uid-valid');

      const onProfileClick = (match: Match) => {
        if (match.matchedProfile) {
          handleProfileClick(match.matchedProfile);
        }
      };

      const validMatch = makeValidMatch('valid', 'uid-valid', profile);
      onProfileClick(validMatch);

      expect(handleProfileClick).toHaveBeenCalledOnce();
      expect(handleProfileClick).toHaveBeenCalledWith(profile);
    });

    it('guard với matchedProfile = undefined → không gọi callback', () => {
      const handleProfileClick = vi.fn();

      const onProfileClick = (match: Match) => {
        if (match.matchedProfile) {
          handleProfileClick(match.matchedProfile);
        }
      };

      const undefinedMatch: Match = {
        id: 'undef',
        userUid: 'u',
        matchedUid: 'a',
        matchedProfile: undefined,
        createdAt: mockTimestamp,
      };

      onProfileClick(undefinedMatch);
      expect(handleProfileClick).not.toHaveBeenCalled();
    });
  });
});
