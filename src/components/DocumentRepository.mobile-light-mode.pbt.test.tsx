import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { DocumentCard } from './DocumentCard';
import { DocumentLink } from '../types/documentLink';

/**
 * Bug Condition Exploration Test for Mobile Light Mode Display Failure
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * The test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * GOAL: Surface counterexamples that demonstrate mobile light mode styling failures.
 */

// Helper to set viewport width
const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
};

// Helper to simulate light mode (remove dark class from document)
const setLightMode = () => {
  document.documentElement.classList.remove('dark');
};

// Helper to get computed background color
const getComputedBackgroundColor = (element: HTMLElement): string => {
  const computed = window.getComputedStyle(element);
  return computed.backgroundColor;
};

// Helper to get computed text color
const getComputedTextColor = (element: HTMLElement): string => {
  const computed = window.getComputedStyle(element);
  return computed.color;
};

// Helper to convert rgb to hex
const rgbToHex = (rgb: string): string => {
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return rgb;
  const r = parseInt(result[0]);
  const g = parseInt(result[1]);
  const b = parseInt(result[2]);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

describe('Property 1: Bug Condition - Mobile Light Mode Display Failure', () => {
  beforeEach(() => {
    // Set mobile viewport and light mode before each test
    setViewportWidth(375);
    setLightMode();
  });

  it('SearchBar should display white background and black text on mobile light mode', () => {
    // Arrange: Render SearchBar in mobile light mode
    render(
      <SearchBar value="" onChange={() => {}} placeholder="Search documents..." />
    );

    // Act: Get the input element
    const input = screen.getByPlaceholderText('Search documents...') as HTMLInputElement;

    // Assert: Check computed styles
    const bgColor = getComputedBackgroundColor(input);
    const textColor = getComputedTextColor(input);

    const bgHex = rgbToHex(bgColor);
    const textHex = rgbToHex(textColor);

    // Expected: white background (#FFFFFF) and black text (#111827 or similar dark)
    expect(bgHex).toBe('#FFFFFF');
    // Text color should be dark (close to black)
    expect(textHex).toMatch(/^#(000000|111827|1F2937|374151)/);
  });

  it('FilterPanel should display white background and black text on mobile light mode', () => {
    // Arrange: Render FilterPanel in mobile light mode
    const mockFilters = { major_id: null, subject: null, category: null };
    const { container: filterContainer } = render(
      <FilterPanel 
        filters={mockFilters} 
        onFilterChange={() => {}} 
        availableSubjects={[]} 
      />
    );

    // Act: Get the select element
    const select = filterContainer.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();

    // Assert: Check computed styles
    const bgColor = getComputedBackgroundColor(select);
    const textColor = getComputedTextColor(select);

    const bgHex = rgbToHex(bgColor);
    const textHex = rgbToHex(textColor);

    // Expected: white background (#FFFFFF) and black text
    expect(bgHex).toBe('#FFFFFF');
    expect(textHex).toMatch(/^#(000000|111827|1F2937|374151)/);
  });

  it('DocumentCard should display white background and black text on mobile light mode', () => {
    // Arrange: Create mock document and user
    const mockDocument: DocumentLink = {
      id: 'test-doc-1',
      title: 'Test Document',
      description: 'Test description',
      url: 'https://example.com/doc.pdf',
      major_id: 'cntt',
      subject: 'Programming',
      category: 'Lecture Notes',
      createdBy: 'user123',
      createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
      updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
    };

    const mockUser = {
      uid: 'user123',
      email: 'test@example.com',
    } as any;

    // Render DocumentCard in mobile light mode
    const { container: cardContainer } = render(
      <DocumentCard 
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Act: Get the card container (article element)
    const card = cardContainer.querySelector('article') as HTMLElement;
    expect(card).toBeTruthy();

    // Assert: Check computed styles
    const bgColor = getComputedBackgroundColor(card);
    const textColor = getComputedTextColor(card);

    const bgHex = rgbToHex(bgColor);
    const textHex = rgbToHex(textColor);

    // Expected: white background (#FFFFFF) and black text
    expect(bgHex).toBe('#FFFFFF');
    expect(textHex).toMatch(/^#(000000|111827|1F2937|374151)/);
  });

  it('Property: All components display white backgrounds and black text on mobile light mode', () => {
    fc.assert(
      fc.property(
        // Generate mobile viewport widths (< 768px)
        fc.integer({ min: 320, max: 767 }),
        (viewportWidth) => {
          // Arrange: Set mobile viewport and light mode
          setViewportWidth(viewportWidth);
          setLightMode();

          // Test SearchBar
          const { container: searchContainer, unmount: unmountSearch } = render(
            <SearchBar value="" onChange={() => {}} />
          );
          const searchInput = searchContainer.querySelector('input') as HTMLInputElement;
          const searchBg = rgbToHex(getComputedBackgroundColor(searchInput));
          const searchText = rgbToHex(getComputedTextColor(searchInput));
          unmountSearch();

          // Test FilterPanel
          const { container: filterContainer, unmount: unmountFilter } = render(
            <FilterPanel filters={{ major_id: null, subject: null, category: null }} onFilterChange={() => {}} availableSubjects={[]} />
          );
          const filterSelect = filterContainer.querySelector('select') as HTMLSelectElement;
          const filterBg = rgbToHex(getComputedBackgroundColor(filterSelect));
          const filterText = rgbToHex(getComputedTextColor(filterSelect));
          unmountFilter();

          // Test DocumentCard
          const mockDoc: DocumentLink = {
            id: 'test',
            title: 'Test',
            description: 'Test',
            url: 'https://example.com',
            major_id: 'cntt',
            subject: 'Test',
            category: 'Lecture Notes',
            createdBy: 'user',
            createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
            updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
          };
          const { container: cardContainer, unmount: unmountCard } = render(
            <DocumentCard document={mockDoc} currentUser={{ uid: 'user' } as any} onEdit={() => {}} onDelete={() => {}} />
          );
          const card = cardContainer.querySelector('article') as HTMLElement;
          const cardBg = rgbToHex(getComputedBackgroundColor(card));
          const cardText = rgbToHex(getComputedTextColor(card));
          unmountCard();

          // Assert: All components should have white backgrounds
          expect(searchBg).toBe('#FFFFFF');
          expect(filterBg).toBe('#FFFFFF');
          expect(cardBg).toBe('#FFFFFF');

          // Assert: All components should have dark text
          expect(searchText).toMatch(/^#(000000|111827|1F2937|374151)/);
          expect(filterText).toMatch(/^#(000000|111827|1F2937|374151)/);
          expect(cardText).toMatch(/^#(000000|111827|1F2937|374151)/);
        }
      ),
      { numRuns: 10 } // Test across 10 different mobile viewport widths
    );
  });
});
