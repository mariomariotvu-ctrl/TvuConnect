/**
 * Bug Condition Exploration Test: Matching ReasonsMap Initialization Order Fix
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 * 
 * MỤC TIÊU: Xác nhận bug tồn tại TRƯỚC KHI implement fix
 * 
 * Test này PHẢI FAIL trên code chưa sửa - failure xác nhận bug tồn tại
 * KHÔNG cố gắng sửa test hoặc code khi nó fail
 * 
 * Bug Condition: 
 * - handleProfileClick callback được định nghĩa ở dòng 64
 * - handleProfileClick có dependency `reasonsMap` trong dependency array
 * - reasonsMap được khai báo bằng useMemo ở dòng 148 (84 dòng SAU handleProfileClick)
 * - JavaScript không cho phép truy cập biến trước khi khai báo (Temporal Dead Zone)
 * - Component crash với ReferenceError: "Cannot access 'reasonsMap' before initialization"
 * 
 * Expected Behavior sau khi fix:
 * - reasonsMap được khai báo TRƯỚC handleProfileClick
 * - Component render thành công với tất cả 4 modes: lover, study, hobby, quick
 * - handleProfileClick có thể access reasonsMap an toàn khi được gọi
 * - Không có ReferenceError trong console
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import React from 'react';
import { Matching } from '../../../src/components/Matching';
import * as firebaseModule from '../../../src/firebase';
import { toast } from 'sonner';
import fc from 'fast-check';

// Mock Firebase modules
vi.mock('../../../src/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'test-user-uid',
      email: 'test@example.com'
    }
  },
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
vi.mock('../../../src/utils/matchingUtils', () => ({
  getMatchingReasons: vi.fn((currentProfile, profile, mode) => {
    // Return mock reasons based on mode
    if (mode === 'lover') return ['Cùng ngành học', 'Cùng sở thích'];
    if (mode === 'study') return ['Cùng lớp', 'Cùng môn học'];
    if (mode === 'hobby') return ['Cùng sở thích âm nhạc'];
    if (mode === 'quick') return ['Cùng trường'];
    return [];
  })
}));

vi.mock('../../../src/utils/matchingAnalytics', () => ({
  trackMatchingStart: vi.fn(),
  trackProfileClick: vi.fn(),
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

// Mock sub-components
vi.mock('../../../src/components/matching/MatchingFilters', () => ({
  MatchingFilters: () => <div data-testid="matching-filters">Filters</div>
}));

vi.mock('../../../src/components/matching/MatchingResults', () => ({
  MatchingResults: ({ onProfileClick, reasons }: any) => (
    <div data-testid="matching-results">
      <button 
        onClick={() => onProfileClick({ uid: 'test-profile-uid', fullName: 'Test User' })}
        data-testid="profile-click-button"
      >
        Click Profile
      </button>
      <div data-testid="reasons-map-access">
        {reasons ? 'ReasonsMap Available' : 'ReasonsMap Unavailable'}
      </div>
    </div>
  )
}));

vi.mock('../../../src/components/matching/MatchingHistory', () => ({
  MatchingHistory: () => <div data-testid="matching-history">History</div>
}));

describe('Property 1: Bug Condition - Component Crash Do ReasonsMap Initialization Order', () => {
  const mockCurrentUser = {
    uid: 'test-user-uid',
    email: 'test@example.com'
  } as any;
  
  const mockOnMatchFound = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock getDoc để return current user profile
    vi.mocked(firebaseModule.getDocs).mockResolvedValue({
      empty: false,
      docs: [{
        data: () => ({
          uid: 'test-user-uid',
          fullName: 'Test User',
          major: 'Công nghệ thông tin',
          academicYear: 2023,
          interests: ['Âm nhạc', 'Thể thao']
        })
      }]
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 1: Render Component với Mode "lover"', () => {
    it('FAIL ON UNFIXED CODE: Component should render without ReferenceError for lover mode', async () => {
      // Arrange
      console.log('🐛 Scenario 1: Testing lover mode render');
      
      let renderError: Error | null = null;
      
      try {
        // Act: Render component với mode='lover'
        const { container } = render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="lover" 
          />
        );
        
        // Wait for component to mount
        await waitFor(() => {
          expect(screen.getByText(/Tìm người yêu/i)).toBeInTheDocument();
        }, { timeout: 2000 });
        
        console.log('✅ Component rendered without crash');
        
      } catch (error) {
        renderError = error as Error;
        console.log('❌ Component crashed:', error);
      }
      
      // Assert: Component should NOT throw ReferenceError
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(renderError).toBeNull();
      
      if (renderError) {
        console.log('🐛 Counterexample - Lover Mode:', renderError.message);
        expect(renderError.message).not.toContain("Cannot access 'reasonsMap' before initialization");
      }
    });
  });

  describe('Scenario 2: Render Component với Mode "study"', () => {
    it('FAIL ON UNFIXED CODE: Component should render without ReferenceError for study mode', async () => {
      // Arrange
      console.log('🐛 Scenario 2: Testing study mode render');
      
      let renderError: Error | null = null;
      
      try {
        // Act: Render component với mode='study'
        render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="study" 
          />
        );
        
        // Wait for component to mount
        await waitFor(() => {
          expect(screen.getByText(/Bạn cùng học/i)).toBeInTheDocument();
        }, { timeout: 2000 });
        
        console.log('✅ Component rendered without crash');
        
      } catch (error) {
        renderError = error as Error;
        console.log('❌ Component crashed:', error);
      }
      
      // Assert: Component should NOT throw ReferenceError
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(renderError).toBeNull();
      
      if (renderError) {
        console.log('🐛 Counterexample - Study Mode:', renderError.message);
        expect(renderError.message).not.toContain("Cannot access 'reasonsMap' before initialization");
      }
    });
  });

  describe('Scenario 3: Render Component với Mode "hobby"', () => {
    it('FAIL ON UNFIXED CODE: Component should render without ReferenceError for hobby mode', async () => {
      // Arrange
      console.log('🐛 Scenario 3: Testing hobby mode render');
      
      let renderError: Error | null = null;
      
      try {
        // Act: Render component với mode='hobby'
        render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="hobby" 
          />
        );
        
        // Wait for component to mount
        await waitFor(() => {
          expect(screen.getByText(/Sở thích chung/i)).toBeInTheDocument();
        }, { timeout: 2000 });
        
        console.log('✅ Component rendered without crash');
        
      } catch (error) {
        renderError = error as Error;
        console.log('❌ Component crashed:', error);
      }
      
      // Assert: Component should NOT throw ReferenceError
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(renderError).toBeNull();
      
      if (renderError) {
        console.log('🐛 Counterexample - Hobby Mode:', renderError.message);
        expect(renderError.message).not.toContain("Cannot access 'reasonsMap' before initialization");
      }
    });
  });

  describe('Scenario 4: Render Component với Mode "quick"', () => {
    it('FAIL ON UNFIXED CODE: Component should render without ReferenceError for quick mode', async () => {
      // Arrange
      console.log('🐛 Scenario 4: Testing quick mode render');
      
      let renderError: Error | null = null;
      
      try {
        // Act: Render component với mode='quick'
        render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="quick" 
          />
        );
        
        // Wait for component to mount
        await waitFor(() => {
          expect(screen.getByText(/Kết nối nhanh/i)).toBeInTheDocument();
        }, { timeout: 2000 });
        
        console.log('✅ Component rendered without crash');
        
      } catch (error) {
        renderError = error as Error;
        console.log('❌ Component crashed:', error);
      }
      
      // Assert: Component should NOT throw ReferenceError
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(renderError).toBeNull();
      
      if (renderError) {
        console.log('🐛 Counterexample - Quick Mode:', renderError.message);
        expect(renderError.message).not.toContain("Cannot access 'reasonsMap' before initialization");
      }
    });
  });

  describe('Scenario 5: handleProfileClick Can Access ReasonsMap', () => {
    it('FAIL ON UNFIXED CODE: handleProfileClick callback should be able to access reasonsMap when called', async () => {
      // Arrange
      console.log('🐛 Scenario 5: Testing handleProfileClick access to reasonsMap');
      
      // Mock useCachedMatching to return profiles
      const { useCachedMatching } = await import('../../../src/hooks/useCachedMatching');
      vi.mocked(useCachedMatching).mockReturnValue({
        profiles: [
          { 
            uid: 'test-profile-uid', 
            fullName: 'Test Profile',
            major: 'Công nghệ thông tin',
            academicYear: 2023
          }
        ],
        loading: false,
        error: null,
        isShowingFallback: false,
        viewedStats: { total: 1, new: 1, viewed: 0 },
        startMatching: vi.fn(),
        loadOneMore: vi.fn()
      } as any);
      
      let clickError: Error | null = null;
      
      try {
        // Act: Render component
        render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="lover" 
          />
        );
        
        // Wait for component to mount
        await waitFor(() => {
          expect(screen.getByText(/Tìm người yêu/i)).toBeInTheDocument();
        });
        
        // Wait for profile click button to appear
        await waitFor(() => {
          expect(screen.getByTestId('profile-click-button')).toBeInTheDocument();
        });
        
        // Simulate profile click
        const profileClickButton = screen.getByTestId('profile-click-button');
        profileClickButton.click();
        
        // Wait for click handler to execute
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('✅ Profile click executed without error');
        
      } catch (error) {
        clickError = error as Error;
        console.log('❌ Profile click crashed:', error);
      }
      
      // Assert: Profile click should work and access reasonsMap
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(clickError).toBeNull();
      
      if (clickError) {
        console.log('🐛 Counterexample - Profile Click:', clickError.message);
        expect(clickError.message).not.toContain("Cannot access 'reasonsMap' before initialization");
      }
      
      // Verify onMatchFound was called
      await waitFor(() => {
        expect(mockOnMatchFound).toHaveBeenCalled();
      });
    });
  });

  describe('Scenario 6: Property-Based Test - All Matching Modes', () => {
    it('FAIL ON UNFIXED CODE: Component should render successfully for any matching mode', async () => {
      // Property: For all matching modes, component should render without ReferenceError
      
      const modeArbitrary = fc.constantFrom('lover', 'study', 'hobby', 'quick');
      
      await fc.assert(
        fc.asyncProperty(
          modeArbitrary,
          async (mode) => {
            // Arrange
            vi.clearAllMocks();
            
            vi.mocked(firebaseModule.getDocs).mockResolvedValue({
              empty: false,
              docs: [{
                data: () => ({
                  uid: 'test-user-uid',
                  fullName: 'Test User',
                  major: 'Công nghệ thông tin',
                  academicYear: 2023
                })
              }]
            } as any);
            
            let renderSuccessful = false;
            let error: Error | null = null;
            
            try {
              // Act: Render với mode từ generator
              const { unmount } = render(
                <Matching 
                  currentUser={mockCurrentUser} 
                  onMatchFound={mockOnMatchFound} 
                  mode={mode} 
                />
              );
              
              // Wait for render
              await waitFor(() => {
                const element = screen.getByRole('button', { name: /Bắt đầu ghép cặp/i });
                expect(element).toBeInTheDocument();
              }, { timeout: 2000 });
              
              renderSuccessful = true;
              
              // Clean up
              unmount();
              
            } catch (err) {
              error = err as Error;
              console.log(`🐛 Mode "${mode}" failed:`, error?.message);
            }
            
            // Assert: Render should succeed
            // EXPECTED TO FAIL ON UNFIXED CODE
            return renderSuccessful && error === null;
          }
        ),
        { 
          numRuns: 20, // Test mỗi mode nhiều lần
          verbose: true 
        }
      );
      
      console.log('🐛 Property test completed: All modes tested');
    });
  });

  describe('Scenario 7: Console Error Check', () => {
    it('FAIL ON UNFIXED CODE: Should not have ReferenceError in console', async () => {
      // Arrange: Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      let renderError: Error | null = null;
      
      try {
        // Act: Render component
        render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="lover" 
          />
        );
        
        await waitFor(() => {
          expect(screen.getByText(/Tìm người yêu/i)).toBeInTheDocument();
        }, { timeout: 2000 });
        
      } catch (error) {
        renderError = error as Error;
      }
      
      // Check console for ReferenceError
      const hasReferenceError = consoleErrorSpy.mock.calls.some(call => 
        call.some(arg => 
          typeof arg === 'string' && 
          (arg.includes("Cannot access 'reasonsMap' before initialization") ||
           arg.includes('ReferenceError'))
        )
      );
      
      console.log('🐛 Has ReferenceError in console:', hasReferenceError);
      console.log('🐛 Console errors:', consoleErrorSpy.mock.calls.map(c => c[0]));
      
      // Assert: Should not have ReferenceError
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(hasReferenceError).toBe(false);
      
      if (hasReferenceError) {
        console.log('🐛 Counterexample: ReferenceError detected in console');
      }
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Scenario 8: Component Mount Lifecycle', () => {
    it('FAIL ON UNFIXED CODE: Component should complete mount lifecycle without errors', async () => {
      // Arrange: Track component lifecycle
      const lifecycleLog: string[] = [];
      
      let mountError: Error | null = null;
      
      try {
        // Act: Render component
        lifecycleLog.push('Render started');
        
        const { container } = render(
          <Matching 
            currentUser={mockCurrentUser} 
            onMatchFound={mockOnMatchFound} 
            mode="lover" 
          />
        );
        
        lifecycleLog.push('Render completed');
        
        // Wait for component to fully mount
        await waitFor(() => {
          expect(screen.getByText(/Tìm người yêu/i)).toBeInTheDocument();
          lifecycleLog.push('Component mounted');
        }, { timeout: 2000 });
        
        // Wait for useEffect to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        lifecycleLog.push('UseEffect completed');
        
        console.log('✅ Component mount lifecycle completed');
        
      } catch (error) {
        mountError = error as Error;
        lifecycleLog.push(`Mount failed: ${mountError.message}`);
        console.log('❌ Component mount failed:', error);
      }
      
      console.log('🐛 Lifecycle log:', lifecycleLog);
      
      // Assert: Mount should complete without error
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(mountError).toBeNull();
      expect(lifecycleLog).toContain('Component mounted');
      expect(lifecycleLog).toContain('UseEffect completed');
      
      if (mountError) {
        console.log('🐛 Counterexample - Mount Lifecycle:', mountError.message);
        expect(mountError.message).not.toContain("Cannot access 'reasonsMap' before initialization");
      }
    });
  });
});

/**
 * EXPECTED COUNTEREXAMPLES (khi chạy trên unfixed code):
 * 
 * 1. Lover Mode: ReferenceError khi component render vì reasonsMap chưa được khai báo
 * 2. Study Mode: Tương tự, ReferenceError vì initialization order
 * 3. Hobby Mode: Tương tự, ReferenceError vì initialization order
 * 4. Quick Mode: Tương tự, ReferenceError vì initialization order
 * 5. Profile Click: handleProfileClick không thể access reasonsMap
 * 6. Property Test: Tất cả modes đều fail với ReferenceError
 * 7. Console Error: ReferenceError xuất hiện trong console.error
 * 8. Mount Lifecycle: Component không complete mount lifecycle vì crash
 * 
 * ROOT CAUSE ANALYSIS từ counterexamples:
 * - handleProfileClick được định nghĩa ở dòng 64 với dependency [reasonsMap, ...]
 * - reasonsMap được khai báo ở dòng 148 (84 dòng sau handleProfileClick)
 * - JavaScript Temporal Dead Zone: không thể truy cập biến trước khi khai báo
 * - React đọc dependency array khi component render → tìm reasonsMap → chưa tồn tại → crash
 * - Lỗi xảy ra ở initialization phase, trước khi component mount hoàn tất
 * 
 * Tất cả tests PHẢI FAIL trên unfixed code để confirm bug tồn tại.
 * Sau khi implement fix (di chuyển reasonsMap lên trước handleProfileClick), tests sẽ PASS.
 */
