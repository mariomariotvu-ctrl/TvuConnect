/**
 * Bug Condition Exploration Test: PlaceList Desktop Bottom Spacing
 * 
 * MỤC TIÊU: Xác nhận bug tồn tại TRƯỚC KHI implement fix
 * 
 * Test này PHẢI FAIL trên code chưa sửa - failure xác nhận bug tồn tại
 * KHÔNG cố gắng sửa test hoặc code khi nó fail
 * 
 * Bug Condition: Desktop (screenWidth >= 768px) có padding-bottom 96px thay vì 24px
 * 
 * Expected Behavior sau khi fix:
 * - Desktop (>= 768px): padding-bottom = 24px
 * - Mobile (< 768px): padding-bottom = 120px (không đổi)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceList } from '../../../src/components/PlaceList';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';
import { User } from 'firebase/auth';
import { Place, CheckIn, PlaceEvent } from '../../../src/types';

// Mock data
const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com'
} as User;

const mockPlaces: Place[] = [
  {
    id: 'place-1',
    name: 'Quán Chay Test',
    category: 'vegetarian',
    location: {
      lat: 10.0,
      lng: 106.0,
      address: '123 Test Street'
    },
    rating: 4.5,
    priceRange: '$$',
    checkInCount: 10,
    reviewCount: 5,
    currentVisitors: 2,
    createdBy: 'test-user',
    createdAt: new Date() as any,
    updatedAt: new Date() as any
  },
  {
    id: 'place-2',
    name: 'Quán Cà Phê Test',
    category: 'cafe',
    location: {
      lat: 10.1,
      lng: 106.1,
      address: '456 Test Avenue'
    },
    rating: 4.0,
    priceRange: '$',
    checkInCount: 5,
    reviewCount: 3,
    currentVisitors: 1,
    createdBy: 'test-user',
    createdAt: new Date() as any,
    updatedAt: new Date() as any
  }
];

const mockCheckIns: CheckIn[] = [];
const mockEvents: PlaceEvent[] = [];

// Helper để render component với theme
const renderPlaceList = (props = {}) => {
  return render(
    <ThemeProvider>
      <PlaceList
        places={mockPlaces}
        checkIns={mockCheckIns}
        events={mockEvents}
        currentUser={mockUser}
        onPlaceSelect={() => {}}
        onCheckIn={() => {}}
        {...props}
      />
    </ThemeProvider>
  );
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

describe('Bug Condition Exploration: PlaceList Desktop Bottom Spacing', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    // Lưu window width gốc
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    // Khôi phục window width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth
    });
  });

  describe('Property 1: Bug Condition - Desktop Padding Bottom', () => {
    it('FAIL ON UNFIXED CODE: Desktop (1920px) should have padding-bottom 24px, but has 96px', async () => {
      // Arrange: Set desktop width
      setWindowWidth(1920);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update after resize
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert: Find scrollable container
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      expect(scrollContainer).toBeTruthy();
      
      // Get computed padding-bottom
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      // Bug: padding-bottom is 96px instead of 24px
      expect(paddingBottom).toBe('24px');
      
      // Counterexample documentation:
      // If this test fails with paddingBottom = '96px', it confirms the bug exists
      console.log('🐛 Desktop padding-bottom:', paddingBottom, '(expected: 24px)');
    });

    it('FAIL ON UNFIXED CODE: Desktop (1366px) should have padding-bottom 24px, but has 96px', async () => {
      // Arrange: Set laptop width
      setWindowWidth(1366);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(paddingBottom).toBe('24px');
      
      console.log('🐛 Laptop padding-bottom:', paddingBottom, '(expected: 24px)');
    });

    it('FAIL ON UNFIXED CODE: Tablet landscape (1024px) should have padding-bottom 24px, but has 96px', async () => {
      // Arrange: Set tablet landscape width (>= 768px = desktop)
      setWindowWidth(1024);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(paddingBottom).toBe('24px');
      
      console.log('🐛 Tablet landscape padding-bottom:', paddingBottom, '(expected: 24px)');
    });

    it('FAIL ON UNFIXED CODE: Boundary case (768px) should have padding-bottom 24px, but has 96px', async () => {
      // Arrange: Set exactly 768px (desktop boundary)
      setWindowWidth(768);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      expect(paddingBottom).toBe('24px');
      
      console.log('🐛 Boundary (768px) padding-bottom:', paddingBottom, '(expected: 24px)');
    });
  });

  describe('Visual Space Test', () => {
    it('FAIL ON UNFIXED CODE: Desktop should have 24px space after last item, but has 96px', async () => {
      // Arrange: Set desktop width
      setWindowWidth(1920);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert: Check padding creates correct visual space
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // Parse padding value
      const paddingValue = parseInt(paddingBottom);
      
      // EXPECTED TO FAIL ON UNFIXED CODE
      // Bug: 96px creates too much white space
      expect(paddingValue).toBe(24);
      
      console.log('🐛 Visual space after last item:', paddingValue, 'px (expected: 24px)');
    });
  });
});
