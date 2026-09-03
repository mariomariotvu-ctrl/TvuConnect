/**
 * Preservation Property Tests: Matching ReasonsMap Initialization Order Fix
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * MUC TIEU: Xac nhan cac hanh vi hien tai KHONG THAY DOI sau khi fix
 *
 * Tests nay nen PASS tren code CHUA SUA (hoac voi mock setup)
 * Tests capture cac hanh vi baseline can bao toan
 *
 * Preservation Requirements:
 * - handleProfileClick phai track analytics voi matchScore chinh xac
 * - handleProfileClick phai goi onMatchFound callback
 * - reasonsMap phai duoc tinh tu getMatchingReasons()
 * - reasonsMap phai re-compute khi dependencies thay doi
 * - MatchingResults hien thi matching reasons chinh xac
 * - Logic matching cho cac modes khac nhau
 * - Edge case: currentProfile = null -> empty arrays
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { Matching } from '../../../src/components/Matching';
import * as firebaseModule from '../../../src/firebase';
import fc from 'fast-check';

// Mock Firebase modules
vi.mock('../../../src/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-uid', email: 'test@example.com' } },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: Date.now() / 1000 })),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { GET: 'GET', ADD: 'ADD', UPDATE: 'UPDATE' }
}));

// Mock hooks
vi.mock('../../../src/hooks/useCachedMatching', () => ({
  useCachedMatching: vi.fn(() => ({
    profiles: [],
    loading: false,
    error: null,
    isShowingFallback: false,
    viewedStats: { total: 0, new: 0, viewed: 0 },
    startMatching: vi.fn(),
    loadOneMore: vi.fn()
  }))
}));

vi.mock('../../../src/hooks/useMatchingFilters', () => ({
  useMatchingFilters: vi.fn(() => ({
    filters: {},
    setFilters: vi.fn(),
    resetFilters: vi.fn()
  }))
}));

vi.mock('../../../src/hooks/useMatchingHistory', () => ({
  useMatchingHistory: vi.fn(() => ({
    matchHistory: [],
    hasMoreHistory: false,
    loadMore: vi.fn()
  }))
}));

vi.mock('../../../src/hooks/useBlockedUsers', () => ({
  useBlockedUsers: vi.fn(() => ({
    blockedSet: new Set()
  }))
}));

// Mock utility functions
let mockTrackProfileClick = vi.fn();
let mockGetMatchingReasons = vi.fn();

vi.mock('../../../src/utils/matchingUtils', () => ({
  getMatchingReasons: (...args: any[]) => mockGetMatchingReasons(...args)
}));

vi.mock('../../../src/utils/matchingAnalytics', () => ({
  trackMatchingStart: vi.fn(),
  trackProfileClick: (...args: any[]) => mockTrackProfileClick(...args),
  trackFilterApplied: vi.fn(),
  trackLoadMore: vi.fn()
}));

vi.mock('../../../src/utils/dailyMatchLimit', () => ({
  getRemainingMatches: vi.fn(() => 10),
  getTimeUntilReset: vi.fn(() => ({ hours: 5, minutes: 30 }))
}));

// Mock contexts
vi.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn()
  }))
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Heart: () => <div data-testid="heart-icon">Heart</div>,
  BookOpen: () => <div data-testid="bookopen-icon">BookOpen</div>,
  Smile: () => <div data-testid="smile-icon">Smile</div>,
  Zap: () => <div data-testid="zap-icon">Zap</div>,
  X: () => <div data-testid="x-icon">X</div>,
  Filter: () => <div>Filter</div>,
  ChevronDown: () => <div>ChevronDown</div>,
  ChevronUp: () => <div>ChevronUp</div>,
  RotateCcw: () => <div>RotateCcw</div>,
  MapPin: () => <div>MapPin</div>,
  Calendar: () => <div>Calendar</div>,
  User: () => <div>User</div>
}));

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>
  },
  AnimatePresence: ({ children }: any) => <>{children}</>
}));

// Mock sub-components de test integration
let capturedReasonsMap: any = null;
let capturedOnProfileClick: any = null;

vi.mock('../../../src/components/matching/MatchingFilters', () => ({
  MatchingFilters: () => <div data-testid="matching-filters">Filters</div>
}));

vi.mock('../../../src/components/matching/MatchingResults', () => ({
  MatchingResults: ({ onProfileClick, reasons, profiles }: any) => {
    // Capture props de test preservation
    capturedReasonsMap = reasons;
    capturedOnProfileClick = onProfileClick;

    // Su dung profile dau tien neu co, neu khong dung fallback
    const firstProfile = profiles && profiles.length > 0 ? profiles[0] : {
      uid: 'test-profile-uid',
      fullName: 'Test User',
      major: 'Cong nghe thong tin',
      academicYear: 2023
    };

    return (
      <div data-testid="matching-results">
        <button
          onClick={() => onProfileClick(firstProfile)}
          data-testid="profile-click-button"
        >
          Click Profile
        </button>
        <div data-testid="reasons-map-size">
          {reasons ? reasons.size : 0}
        </div>
      </div>
    );
  }
}));

vi.mock('../../../src/components/matching/MatchingHistory', () => ({
  MatchingHistory: () => <div data-testid="matching-history">History</div>
}));

describe('Property 2: Preservation - Matching Functionality Khong Doi', () => {
  const mockCurrentUser = {
    uid: 'test-user-uid',
    email: 'test@example.com'
  } as any;

  const mockOnMatchFound = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedReasonsMap = null;
    capturedOnProfileClick = null;

    // Reset mock implementations
    mockTrackProfileClick = vi.fn();
    mockGetMatchingReasons = vi.fn((currentProfile, profile, mode) => {
      if (mode === 'lover') return ['Cung nganh hoc', 'Cung so thich'];
      if (mode === 'study') return ['Cung lop', 'Cung mon hoc'];
      if (mode === 'hobby') return ['Cung so thich am nhac'];
      if (mode === 'quick') return ['Cung truong'];
      return [];
    });

    // Mock getDocs de return current user profile
    vi.mocked(firebaseModule.getDocs).mockResolvedValue({
      empty: false,
      docs: [{
        data: () => ({
          uid: 'test-user-uid',
          fullName: 'Test User',
          major: 'Cong nghe thong tin',
          academicYear: 2023,
          interests: ['Am nhac', 'The thao']
        })
      }]
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('Preservation 3.1: handleProfileClick goi trackProfileClick voi matchScore chinh xac', () => {
    it('SHOULD PASS: trackProfileClick duoc goi voi so luong matching reasons', async () => {
      // Arrange: Setup profiles voi matching reasons da biet
      const testProfile = {
        uid: 'test-profile-uid',
        fullName: 'Test Profile',
        major: 'Cong nghe thong tin',
        academicYear: 2023,
        interests: ['Am nhac']
      };

      // Mock getMatchingReasons tra ve 2 reasons
      mockGetMatchingReasons.mockReturnValue(['Cung nganh hoc', 'Cung so thich']);

      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [testProfile],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 1, new: 1, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act: Render va click profile
      render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-click-button')).toBeDefined();
      });

      const profileClickButton = screen.getByTestId('profile-click-button');
      profileClickButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: trackProfileClick duoc goi voi matchScore = 2 (so luong reasons)
      expect(mockTrackProfileClick).toHaveBeenCalledWith(
        'test-user-uid',
        'test-profile-uid',
        2  // matchScore = reasonsMap.get(profile.uid)?.length
      );

      console.log('PASS Preservation: trackProfileClick called with correct matchScore');
    });

    it('PROPERTY: matchScore luon bang so luong reasons tu getMatchingReasons', async () => {
      // Property-based test: For any profile and mode, matchScore = reasons.length

      const profileArbitrary = fc.record({
        uid: fc.uuid(),
        fullName: fc.string(),
        major: fc.constantFrom('Cong nghe thong tin', 'Kinh te', 'Su pham'),
        academicYear: fc.integer({ min: 2020, max: 2024 })
      });

      const modeArbitrary = fc.constantFrom('lover', 'study', 'hobby', 'quick');
      const reasonsCountArbitrary = fc.integer({ min: 0, max: 5 });

      await fc.assert(
        fc.asyncProperty(
          profileArbitrary,
          modeArbitrary,
          reasonsCountArbitrary,
          async (profile, mode, reasonsCount) => {
            // Arrange: Mock getMatchingReasons to return fixed number of reasons
            const mockReasons = Array.from({ length: reasonsCount }, (_, i) => `Reason ${i + 1}`);
            mockGetMatchingReasons.mockReturnValue(mockReasons);
            mockTrackProfileClick = vi.fn();

            const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
            vi.mocked(useCachedMatching).mockReturnValue({
              profiles: [profile],
              loading: false,
              error: null,
              isShowingFallback: false,
              viewedStats: { total: 1, new: 1, viewed: 0 },
              startMatching: vi.fn(),
              loadOneMore: vi.fn()
            } as any);

            // Act: Render va click profile
            const { unmount, container } = render(
              <Matching
                currentUser={mockCurrentUser}
                onMatchFound={mockOnMatchFound}
                mode={mode as any}
              />
            );

            await waitFor(() => {
              expect(container.querySelector('[data-testid="profile-click-button"]')).toBeTruthy();
            });

            const button = container.querySelector('[data-testid="profile-click-button"]') as HTMLElement;
            button.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert: matchScore = reasonsCount
            expect(mockTrackProfileClick).toHaveBeenCalledWith(
              'test-user-uid',
              profile.uid,
              reasonsCount
            );

            unmount();
            cleanup();
          }
        ),
        { numRuns: 10, timeout: 50000 }
      );

      console.log('PASS Property: matchScore = reasons.length for all profiles and modes');
    }, 60000);
  });

  describe('Preservation 3.2: handleProfileClick goi onMatchFound callback', () => {
    it('SHOULD PASS: onMatchFound duoc goi voi profile dung', async () => {
      // Arrange
      const testProfile = {
        uid: 'test-profile-uid',
        fullName: 'Test Profile',
        major: 'Cong nghe thong tin',
        academicYear: 2023,
        interests: ['Am nhac']
      };

      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [testProfile],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 1, new: 1, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act: Render va click profile
      render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-click-button')).toBeDefined();
      });

      const profileClickButton = screen.getByTestId('profile-click-button');
      profileClickButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: onMatchFound duoc goi voi profile chinh xac
      expect(mockOnMatchFound).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'test-profile-uid',
          fullName: 'Test Profile',
          major: 'Cong nghe thong tin'
        })
      );

      console.log('PASS Preservation: onMatchFound called with correct profile');
    });
  });

  describe('Preservation 3.3: reasonsMap duoc tinh tu getMatchingReasons()', () => {
    it('SHOULD PASS: reasonsMap chua reasons cho moi profile', async () => {
      // Arrange: Multiple profiles
      const testProfiles = [
        { uid: 'profile-1', fullName: 'User 1', major: 'CNTT', academicYear: 2023 },
        { uid: 'profile-2', fullName: 'User 2', major: 'Kinh te', academicYear: 2022 },
        { uid: 'profile-3', fullName: 'User 3', major: 'Su pham', academicYear: 2024 }
      ];

      mockGetMatchingReasons.mockImplementation((currentProfile, profile) => {
        if (profile.uid === 'profile-1') return ['Reason A', 'Reason B'];
        if (profile.uid === 'profile-2') return ['Reason C'];
        if (profile.uid === 'profile-3') return ['Reason D', 'Reason E', 'Reason F'];
        return [];
      });

      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: testProfiles,
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 3, new: 3, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act: Render component
      render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('reasons-map-size')).toBeDefined();
      });

      // Assert: reasonsMap co 3 entries (1 cho moi profile)
      const reasonsMapSize = screen.getByTestId('reasons-map-size');
      expect(reasonsMapSize.textContent).toBe('3');

      // Verify getMatchingReasons duoc goi cho moi profile
      expect(mockGetMatchingReasons).toHaveBeenCalledTimes(3);

      console.log('PASS Preservation: reasonsMap computed for all profiles');
    });

    it('SHOULD PASS: Edge case - currentProfile null tao empty reasons', async () => {
      // Arrange: No current profile
      vi.mocked(firebaseModule.getDocs).mockResolvedValue({
        empty: true,
        docs: []
      } as any);

      const testProfile = {
        uid: 'test-profile-uid',
        fullName: 'Test Profile',
        major: 'CNTT',
        academicYear: 2023
      };

      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [testProfile],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 1, new: 1, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act: Render
      const { container } = render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Kiem tra component khong crash khi currentProfile la null
      expect(container).toBeTruthy();
      // Component van render duoc
      expect(container.querySelector('[data-testid="matching-results"]')).toBeTruthy();

      console.log('PASS Preservation: Edge case currentProfile=null handled');
    });
  });

  describe('Preservation 3.4: reasonsMap re-compute khi dependencies thay doi', () => {
    it('SHOULD PASS: reasonsMap updates khi mode thay doi', async () => {
      // Arrange: Track getMatchingReasons calls per mode
      const callsByMode: Record<string, number> = {};
      mockGetMatchingReasons.mockImplementation((currentProfile, profile, mode) => {
        callsByMode[mode] = (callsByMode[mode] || 0) + 1;
        if (mode === 'lover') return ['Lover Reason 1', 'Lover Reason 2'];
        if (mode === 'study') return ['Study Reason 1'];
        return [];
      });

      const testProfile = {
        uid: 'test-profile-uid',
        fullName: 'Test Profile',
        major: 'CNTT',
        academicYear: 2023
      };

      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [testProfile],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 1, new: 1, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act 1: Render voi mode='lover'
      const { rerender } = render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify mode 'lover' was computed
      expect(callsByMode['lover']).toBeGreaterThanOrEqual(1);

      // Act 2: Rerender voi mode='study'
      rerender(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="study"
        />
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: getMatchingReasons duoc goi lai voi mode moi
      // useMemo se re-compute khi mode thay doi
      expect(callsByMode['study']).toBeGreaterThanOrEqual(1);

      console.log('PASS Preservation: reasonsMap re-computed when mode changes');
    });
  });

  describe('Preservation: Component Structure va UI', () => {
    it('SHOULD PASS: Component renders without errors', async () => {
      // Arrange
      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 0, new: 0, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act: Render
      const { container } = render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      // Assert: Component mounts successfully
      expect(container).toBeTruthy();
      expect(screen.getByTestId('matching-results')).toBeDefined();

      console.log('PASS Preservation: Component structure intact');
    });

    it('SHOULD PASS: MatchingResults nhan reasonsMap prop', async () => {
      // Arrange
      const testProfile = {
        uid: 'test-profile-uid',
        fullName: 'Test Profile',
        major: 'CNTT',
        academicYear: 2023
      };

      mockGetMatchingReasons.mockReturnValue(['Reason 1', 'Reason 2']);

      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [testProfile],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 1, new: 1, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);

      // Act: Render
      render(
        <Matching
          currentUser={mockCurrentUser}
          onMatchFound={mockOnMatchFound}
          mode="lover"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('reasons-map-size')).toBeDefined();
      });

      // Assert: MatchingResults received reasonsMap
      const reasonsMapSize = screen.getByTestId('reasons-map-size');
      expect(reasonsMapSize.textContent).toBe('1');

      console.log('PASS Preservation: MatchingResults receives reasonsMap prop');
    });
  });
});
