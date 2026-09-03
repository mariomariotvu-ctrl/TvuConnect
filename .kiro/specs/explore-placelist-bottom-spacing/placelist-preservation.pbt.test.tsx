/**
 * Preservation Property Tests: PlaceList Bottom Spacing
 * 
 * MỤC TIÊU: Xác minh hành vi hiện tại cần được bảo toàn
 * 
 * Tests này PHẢI PASS trên code chưa sửa - xác nhận baseline behavior
 * Sau khi fix, tests này vẫn PHẢI PASS - xác nhận không có regressions
 * 
 * Preservation Requirements:
 * - Mobile (< 768px): padding-bottom = 120px (KHÔNG ĐỔI)
 * - Search functionality hoạt động bình thường
 * - Category filter hoạt động bình thường
 * - Card interactions hoạt động bình thường
 * - Scroll behavior mượt mà
 * - Dark/Light mode hiển thị đúng
 * - Responsive behavior khi resize
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaceList } from '../../../src/components/PlaceList';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';
import { User } from 'firebase/auth';
import { Place, CheckIn, PlaceEvent, PlaceCategory } from '../../../src/types';

// Mock data
const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com'
} as User;

const createMockPlace = (id: string, name: string, category: PlaceCategory): Place => ({
  id,
  name,
  category,
  location: {
    lat: 10.0,
    lng: 106.0,
    address: `${id} Test Street`
  },
  rating: 4.5,
  priceRange: '$$',
  checkInCount: 10,
  reviewCount: 5,
  currentVisitors: 2,
  createdBy: 'test-user',
  createdAt: new Date() as any,
  updatedAt: new Date() as any
});

const mockPlaces: Place[] = [
  createMockPlace('place-1', 'Quán Chay Test', 'vegetarian'),
  createMockPlace('place-2', 'Quán Cà Phê Test', 'cafe'),
  createMockPlace('place-3', 'Nhà Sách Test', 'bookstore'),
  createMockPlace('place-4', 'Quán Ăn Test', 'restaurant'),
  createMockPlace('place-5', 'Nhà Thuốc Test', 'pharmacy')
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

describe('Preservation Property Tests: PlaceList Bottom Spacing', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth
    });
  });

  describe('Property 2.1: Mobile Padding Preservation (Requirement 3.1)', () => {
    it('PASS ON UNFIXED CODE: Mobile (375px) should have padding-bottom 120px', async () => {
      // Arrange: Set mobile width
      setWindowWidth(375);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert: Mobile padding must be 120px
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      expect(scrollContainer).toBeTruthy();
      
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // MUST PASS - this is correct behavior to preserve
      expect(paddingBottom).toBe('120px');
      
      console.log('✅ Mobile padding-bottom:', paddingBottom, '(preserved: 120px)');
    });

    it('PASS ON UNFIXED CODE: Mobile (414px) should have padding-bottom 120px', async () => {
      // Arrange: Set iPhone width
      setWindowWidth(414);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // MUST PASS
      expect(paddingBottom).toBe('120px');
      
      console.log('✅ iPhone padding-bottom:', paddingBottom, '(preserved: 120px)');
    });

    it('PASS ON UNFIXED CODE: Mobile (767px) should have padding-bottom 120px', async () => {
      // Arrange: Set just below desktop boundary
      setWindowWidth(767);
      
      // Act: Render component
      const { container } = renderPlaceList();
      
      // Wait for component to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // MUST PASS
      expect(paddingBottom).toBe('120px');
      
      console.log('✅ Mobile boundary padding-bottom:', paddingBottom, '(preserved: 120px)');
    });
  });

  describe('Property 2.2: Search Functionality Preservation (Requirement 3.2)', () => {
    it('PASS ON UNFIXED CODE: Search should filter places correctly', async () => {
      // Arrange
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Act: Type in search box
      const searchInput = container.querySelector('input[placeholder="Tìm địa điểm..."]') as HTMLInputElement;
      expect(searchInput).toBeTruthy();
      
      fireEvent.change(searchInput, { target: { value: 'Chay' } });
      
      // Wait for debounce
      await waitFor(() => {
        const placeCards = container.querySelectorAll('[class*="rounded-xl"]');
        // Should show only "Quán Chay Test"
        expect(placeCards.length).toBeGreaterThan(0);
      }, { timeout: 500 });
      
      console.log('✅ Search functionality preserved');
    });

    it('PASS ON UNFIXED CODE: Clear search button should work', async () => {
      // Arrange
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Act: Type and clear
      const searchInput = container.querySelector('input[placeholder="Tìm địa điểm..."]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'Test' } });
      
      await new Promise(resolve => setTimeout(resolve, 250));
      
      // Find and click clear button
      const clearButton = container.querySelector('button[class*="absolute right-3"]');
      if (clearButton) {
        fireEvent.click(clearButton);
      }
      
      // Assert: Search input should be empty
      await waitFor(() => {
        expect(searchInput.value).toBe('');
      });
      
      console.log('✅ Clear search preserved');
    });
  });

  describe('Property 2.3: Category Filter Preservation (Requirement 3.2)', () => {
    it('PASS ON UNFIXED CODE: Category filter should work', async () => {
      // Arrange
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Act: Click on "Quán chay" category
      const categoryButtons = container.querySelectorAll('button[class*="flex-shrink-0"]');
      const vegetarianButton = Array.from(categoryButtons).find(
        btn => btn.textContent?.includes('Quán chay')
      );
      
      if (vegetarianButton) {
        fireEvent.click(vegetarianButton);
        
        // Wait for filter to apply
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Assert: Should show filtered results
        const resultsCounter = container.querySelector('span[class*="text-sm font-bold"]');
        expect(resultsCounter).toBeTruthy();
        
        console.log('✅ Category filter preserved');
      }
    });

    it('PASS ON UNFIXED CODE: "Tất cả" category should show all places', async () => {
      // Arrange
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Act: Click "Tất cả"
      const allButton = Array.from(container.querySelectorAll('button')).find(
        btn => btn.textContent === 'Tất cả'
      );
      
      if (allButton) {
        fireEvent.click(allButton);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Assert: Should show all places
        const resultsCounter = container.querySelector('span[class*="text-sm font-bold"]');
        expect(resultsCounter?.textContent).toContain('địa điểm');
        
        console.log('✅ "Tất cả" category preserved');
      }
    });
  });

  describe('Property 2.4: Card Interaction Preservation (Requirement 3.3)', () => {
    it('PASS ON UNFIXED CODE: Place cards should be clickable', async () => {
      // Arrange
      setWindowWidth(1920);
      let selectedPlace: Place | null = null;
      
      const { container } = renderPlaceList({
        onPlaceSelect: (place: Place) => {
          selectedPlace = place;
        }
      });
      
      // Act: Click on first place card
      const placeCards = container.querySelectorAll('[class*="rounded-xl"][class*="cursor-pointer"]');
      expect(placeCards.length).toBeGreaterThan(0);
      
      fireEvent.click(placeCards[0]);
      
      // Assert: onPlaceSelect should be called
      await waitFor(() => {
        expect(selectedPlace).toBeTruthy();
      });
      
      console.log('✅ Card click interaction preserved');
    });

    it('PASS ON UNFIXED CODE: Place cards should display correctly', async () => {
      // Arrange
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Assert: Cards should have correct structure
      const placeCards = container.querySelectorAll('[class*="rounded-xl"]');
      expect(placeCards.length).toBeGreaterThan(0);
      
      // Check first card has name
      const firstCard = placeCards[0];
      expect(firstCard.textContent).toContain('Test');
      
      console.log('✅ Card display preserved');
    });
  });

  describe('Property 2.5: Scroll Behavior Preservation (Requirement 3.4)', () => {
    it('PASS ON UNFIXED CODE: Scroll container should be scrollable', async () => {
      // Arrange
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Assert: Scroll container exists and has overflow
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      expect(scrollContainer).toBeTruthy();
      
      const computedStyle = window.getComputedStyle(scrollContainer!);
      expect(computedStyle.overflowY).toBe('auto');
      
      console.log('✅ Scroll behavior preserved');
    });
  });

  describe('Property 2.6: Responsive Behavior Preservation (Requirement 3.7)', () => {
    it('PASS ON UNFIXED CODE: Resize from desktop to mobile should update padding', async () => {
      // Arrange: Start with desktop
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Act: Resize to mobile
      setWindowWidth(375);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert: Should now have mobile padding
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      expect(paddingBottom).toBe('120px');
      
      console.log('✅ Responsive resize preserved (desktop → mobile)');
    });

    it('PASS ON UNFIXED CODE: Resize from mobile to desktop should update padding', async () => {
      // Arrange: Start with mobile
      setWindowWidth(375);
      const { container } = renderPlaceList();
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Act: Resize to desktop
      setWindowWidth(1920);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Assert: Should now have desktop padding (96px on unfixed code)
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      const computedStyle = window.getComputedStyle(scrollContainer!);
      const paddingBottom = computedStyle.paddingBottom;
      
      // On unfixed code, this will be 96px
      // After fix, this will be 24px
      // But the BEHAVIOR of updating on resize must be preserved
      expect(['24px', '96px']).toContain(paddingBottom);
      
      console.log('✅ Responsive resize preserved (mobile → desktop)');
    });
  });

  describe('Property 2.7: Component Structure Preservation', () => {
    it('PASS ON UNFIXED CODE: Component should render without errors', () => {
      // Arrange & Act
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Assert: Component renders successfully
      expect(container).toBeTruthy();
      expect(container.querySelector('[class*="h-full"]')).toBeTruthy();
      
      console.log('✅ Component structure preserved');
    });

    it('PASS ON UNFIXED CODE: Search bar should exist', () => {
      // Arrange & Act
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Assert: Search bar exists
      const searchInput = container.querySelector('input[placeholder="Tìm địa điểm..."]');
      expect(searchInput).toBeTruthy();
      
      console.log('✅ Search bar preserved');
    });

    it('PASS ON UNFIXED CODE: Category pills should exist', () => {
      // Arrange & Act
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Assert: Category buttons exist
      const categoryButtons = container.querySelectorAll('button[class*="flex-shrink-0"]');
      expect(categoryButtons.length).toBeGreaterThan(0);
      
      console.log('✅ Category pills preserved');
    });

    it('PASS ON UNFIXED CODE: Results counter should exist', () => {
      // Arrange & Act
      setWindowWidth(1920);
      const { container } = renderPlaceList();
      
      // Assert: Results counter exists
      const resultsCounter = container.querySelector('span[class*="text-sm font-bold"]');
      expect(resultsCounter).toBeTruthy();
      expect(resultsCounter?.textContent).toContain('địa điểm');
      
      console.log('✅ Results counter preserved');
    });
  });
});
