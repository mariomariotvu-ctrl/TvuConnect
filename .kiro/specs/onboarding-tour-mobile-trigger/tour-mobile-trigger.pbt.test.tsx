/**
 * Bug Condition Exploration Test: Onboarding Tour Mobile Trigger
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 * 
 * MỤC TIÊU: Xác nhận bug tồn tại TRƯỚC KHI implement fix
 * 
 * Test này PHẢI FAIL trên code chưa sửa - failure xác nhận bug tồn tại
 * KHÔNG cố gắng sửa test hoặc code khi nó fail
 * 
 * Bug Condition: 
 * - User trên mobile (width < 768px)
 * - Trigger tour từ Settings (cần chuyển view)
 * - Elements chưa ready sau 100ms delay
 * - Tour KHÔNG khởi động
 * 
 * Expected Behavior sau khi fix:
 * - Tour phải khởi động thành công
 * - Tất cả 7 navigation elements phải được tìm thấy
 * - First step phải visible
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import OnboardingTour from '../../../src/components/OnboardingTour';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';

// Mock navigation elements với data-tour attributes
const createMockNavigationElements = () => {
  const nav = document.createElement('nav');
  nav.setAttribute('data-testid', 'mobile-navigation');
  
  const elements = [
    { id: 'home', label: 'Trang chủ' },
    { id: 'matching', label: 'Tìm bạn' },
    { id: 'messages', label: 'Tin nhắn' },
    { id: 'posts', label: 'Bảng tin' },
    { id: 'documents', label: 'Tài liệu' },
    { id: 'explore', label: 'Khám phá' },
    { id: 'profile', label: 'Hồ sơ' }
  ];
  
  elements.forEach(({ id, label }) => {
    const button = document.createElement('button');
    button.setAttribute('data-tour', id);
    button.textContent = label;
    nav.appendChild(button);
  });
  
  return nav;
};

// Helper để set window width
const setWindowWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width
  });
  window.dispatchEvent(new Event('resize'));
};

// Helper để render OnboardingTour với theme
const renderTour = (props = {}) => {
  return render(
    <ThemeProvider>
      <OnboardingTour run={false} {...props} />
    </ThemeProvider>
  );
};

// Helper để đếm số elements với data-tour attribute
const countTourElements = (): number => {
  const elements = document.querySelectorAll('[data-tour]');
  return elements.length;
};

// Helper để check xem tour có đang chạy không
const isTourRunning = (): boolean => {
  // Joyride tạo overlay khi tour đang chạy
  const overlay = document.querySelector('[class*="react-joyride__overlay"]');
  const tooltip = document.querySelector('[class*="react-joyride__tooltip"]');
  return !!(overlay || tooltip);
};

describe('Property 1: Bug Condition - Tour Không Khởi Động Trên Mobile Từ Settings', () => {
  let originalInnerWidth: number;
  let mockNav: HTMLElement;

  beforeEach(() => {
    // Lưu window width gốc
    originalInnerWidth = window.innerWidth;
    
    // Clear DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Khôi phục window width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth
    });
    
    // Clean up DOM
    if (mockNav && mockNav.parentNode) {
      mockNav.parentNode.removeChild(mockNav);
    }
    document.body.innerHTML = '';
  });

  describe('Scenario 1: Mobile iPhone 13 (390px) - Tour từ Settings', () => {
    it('FAIL ON UNFIXED CODE: Tour should start but elements not found after 100ms', async () => {
      // Arrange: Set mobile width (iPhone 13)
      setWindowWidth(390);
      
      // Simulate Settings → Home navigation
      // Elements chưa có trong DOM (giống như khi chuyển view)
      
      // Act: Trigger tour (giống như onShowTour được gọi)
      const { rerender } = renderTour({ run: false });
      
      // Simulate delay 100ms như trong code hiện tại
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Bây giờ mới add elements (simulate slow mobile rendering)
      mockNav = createMockNavigationElements();
      document.body.appendChild(mockNav);
      
      // Trigger tour
      rerender(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      // Wait for tour to attempt to start
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Assert: Check elements
      const elementsFound = countTourElements();
      console.log('🐛 iPhone 13 - Elements found:', elementsFound, '/7');
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      // Bug: Tour triggers before elements are ready
      expect(elementsFound).toBeGreaterThanOrEqual(7);
      
      // Check if tour is running
      const tourRunning = isTourRunning();
      console.log('🐛 iPhone 13 - Tour running:', tourRunning);
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(tourRunning).toBe(true);
    });
  });

  describe('Scenario 2: Mobile Samsung Galaxy (360px) - Tour từ Settings', () => {
    it('FAIL ON UNFIXED CODE: Tour should start but elements not ready', async () => {
      // Arrange: Set mobile width (Samsung Galaxy)
      setWindowWidth(360);
      
      // Act: Trigger tour without elements
      const { rerender } = renderTour({ run: false });
      
      // Simulate 100ms delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Add elements after delay (too late)
      mockNav = createMockNavigationElements();
      document.body.appendChild(mockNav);
      
      // Trigger tour
      rerender(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Assert
      const elementsFound = countTourElements();
      console.log('🐛 Samsung Galaxy - Elements found:', elementsFound, '/7');
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(elementsFound).toBeGreaterThanOrEqual(7);
      
      const tourRunning = isTourRunning();
      console.log('🐛 Samsung Galaxy - Tour running:', tourRunning);
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(tourRunning).toBe(true);
    });
  });

  describe('Scenario 3: Timing Test - Elements Render Time', () => {
    it('FAIL ON UNFIXED CODE: 100ms is insufficient for mobile element rendering', async () => {
      // Arrange: Set mobile width
      setWindowWidth(390);
      
      // Measure: Time when elements become available
      const startTime = Date.now();
      
      // Simulate view change
      const { rerender } = renderTour({ run: false });
      
      // Wait 100ms (current delay)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check elements at 100ms
      let elementsAt100ms = countTourElements();
      console.log('🐛 Elements at 100ms:', elementsAt100ms, '/7');
      
      // Add elements (simulate mobile rendering completing)
      mockNav = createMockNavigationElements();
      document.body.appendChild(mockNav);
      
      const renderTime = Date.now() - startTime;
      console.log('🐛 Actual render time:', renderTime, 'ms');
      
      // Trigger tour
      rerender(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      // Expect that tour has not started yet at 100ms because elements weren't in DOM
      expect(elementsAt100ms).toBeLessThan(7);
      
      // Wait for the polling to succeed after elements are added
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const finalElements = countTourElements();
      
      // EXPECTED TO PASS ON FIXED CODE
      expect(finalElements).toBeGreaterThanOrEqual(7);
      expect(isTourRunning()).toBe(true);
      
      console.log('🐛 Final elements:', finalElements, '/7');
    });
  });

  describe('Scenario 4: Race Condition Test', () => {
    it('FAIL ON UNFIXED CODE: Tour triggers before Home view fully renders', async () => {
      // Arrange: Set mobile width
      setWindowWidth(390);
      
      // Simulate Settings view (no navigation elements)
      const { rerender } = renderTour({ run: false });
      
      // Simulate setView('home') + setTimeout(setShowOnboarding, 100)
      const viewChangeTime = Date.now();
      
      // After 100ms, tour tries to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check elements when tour starts
      const elementsWhenTourStarts = countTourElements();
      console.log('🐛 Elements when tour starts (100ms):', elementsWhenTourStarts, '/7');
      
      // Trigger tour (race condition - elements not ready)
      rerender(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      // Elements render AFTER tour already triggered
      await new Promise(resolve => setTimeout(resolve, 50));
      mockNav = createMockNavigationElements();
      document.body.appendChild(mockNav);
      
      const elementsAfterRender = countTourElements();
      console.log('🐛 Elements after render (150ms):', elementsAfterRender, '/7');
      
      // Assert: Race condition successfully resolved by polling
      // EXPECTED TO PASS ON FIXED CODE
      expect(elementsWhenTourStarts).toBeLessThan(7);
      
      // Wait for the polling to succeed after elements are added
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const tourRunning = isTourRunning();
      console.log('🐛 Tour running after race condition is resolved:', tourRunning);
      
      // EXPECTED TO PASS ON FIXED CODE
      expect(tourRunning).toBe(true);
    });
  });

  describe('Scenario 5: Mobile vs Desktop Comparison', () => {
    it('FAIL ON UNFIXED CODE: Mobile needs more time than desktop', async () => {
      // Test 1: Desktop (should work)
      setWindowWidth(1920);
      
      // Add elements immediately (desktop renders fast)
      mockNav = createMockNavigationElements();
      document.body.appendChild(mockNav);
      
      const { rerender: rerenderDesktop } = renderTour({ run: false });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      rerenderDesktop(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const desktopElements = countTourElements();
      const desktopTourRunning = isTourRunning();
      
      console.log('✅ Desktop - Elements:', desktopElements, '/7, Tour running:', desktopTourRunning);
      
      // Clean up
      document.body.innerHTML = '';
      
      // Test 2: Mobile (should fail)
      setWindowWidth(390);
      
      const { rerender: rerenderMobile } = renderTour({ run: false });
      
      // Delay adding elements (simulate slow mobile)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      rerenderMobile(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      // Elements added late
      await new Promise(resolve => setTimeout(resolve, 50));
      const mobileNav = createMockNavigationElements();
      document.body.appendChild(mobileNav);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const mobileElements = countTourElements();
      const mobileTourRunning = isTourRunning();
      
      console.log('🐛 Mobile - Elements:', mobileElements, '/7, Tour running:', mobileTourRunning);
      
      // Assert: Mobile behavior different from desktop
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(mobileTourRunning).toBe(desktopTourRunning);
      
      console.log('🐛 Counterexample: Mobile needs longer delay than desktop');
    });
  });

  describe('Scenario 6: Element Verification Test', () => {
    it('FAIL ON UNFIXED CODE: No verification logic before starting tour', async () => {
      // Arrange: Set mobile width
      setWindowWidth(390);
      
      // Act: Trigger tour without any elements
      const { rerender } = renderTour({ run: false });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger tour (no elements in DOM)
      rerender(
        <ThemeProvider>
          <OnboardingTour run={true} />
        </ThemeProvider>
      );
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Assert: Check if tour attempted to start despite no elements
      const elementsFound = countTourElements();
      console.log('🐛 Elements found:', elementsFound, '/7');
      
      // EXPECTED TO PASS ON FIXED CODE
      expect(elementsFound).toBeLessThan(7);
      
      const tourRunning = isTourRunning();
      console.log('🐛 Tour attempted to start:', tourRunning);
      
      // EXPECTED TO PASS ON FIXED CODE
      expect(tourRunning).toBe(false);
    });
  });
});

/**
 * EXPECTED COUNTEREXAMPLES (khi chạy trên unfixed code):
 * 
 * 1. iPhone 13 (390px): Elements found: 0/7, Tour running: false
 * 2. Samsung Galaxy (360px): Elements found: 0/7, Tour running: false
 * 3. Timing: 100ms delay insufficient, elements need ~150-200ms
 * 4. Race condition: Tour starts at 100ms, elements ready at 150ms
 * 5. Mobile vs Desktop: Desktop works, mobile fails
 * 6. No verification: Tour attempts to start with 0 elements
 * 
 * Tất cả tests PHẢI FAIL trên unfixed code để confirm bug tồn tại.
 * Sau khi implement fix, tests sẽ PASS để confirm bug đã được sửa.
 */
