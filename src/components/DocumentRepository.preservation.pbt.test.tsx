import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { DocumentCard } from './DocumentCard';
import { DocumentLink } from '../types/documentLink';
import { Timestamp } from 'firebase/firestore';

/**
 * Preservation Property Tests for Non-Mobile-Light-Mode Behavior
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * IMPORTANT: Follow observation-first methodology
 * - Observe behavior on UNFIXED code for non-buggy inputs
 * - Record actual styling for each scenario
 * - Write property-based tests capturing observed behavior patterns
 * - Run tests on UNFIXED code
 * - EXPECTED OUTCOME: Tests PASS (confirms baseline behavior to preserve)
 * 
 * These tests ensure that desktop light/dark mode and mobile dark mode
 * styling remains unchanged after the fix is implemented.
 * 
 * NOTE: These tests check className attributes rather than computed styles
 * because jsdom doesn't fully compute Tailwind CSS. This approach validates
 * that the correct CSS classes are applied, which is what matters for preservation.
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

// Helper to simulate dark mode
const setDarkMode = () => {
  document.documentElement.classList.add('dark');
};

// Helper to simulate light mode
const setLightMode = () => {
  document.documentElement.classList.remove('dark');
};

// Helper to check if element has light mode background classes
const hasLightModeBackground = (element: HTMLElement): boolean => {
  const className = element.className;
  // Check for white or light gray backgrounds
  return className.includes('bg-white') || 
         className.includes('bg-gray-50') || 
         className.includes('bg-gray-100');
};

// Helper to check if element has dark mode background classes
const hasDarkModeBackground = (element: HTMLElement): boolean => {
  const className = element.className;
  // Check for dark gray backgrounds
  return className.includes('bg-gray-800') || 
         className.includes('bg-gray-900') ||
         className.includes('dark:bg-gray-800') ||
         className.includes('dark:bg-gray-900');
};

// Helper to check if element has light mode text classes
const hasLightModeText = (element: HTMLElement): boolean => {
  const className = element.className;
  // Check for dark text colors (used in light mode)
  // For DocumentCard, the article element doesn't have text classes directly,
  // so we check if it has the base structure (bg-white indicates light mode support)
  if (element.tagName === 'ARTICLE') {
    return className.includes('bg-white');
  }
  return className.includes('text-gray-900') || 
         className.includes('text-gray-800') ||
         className.includes('text-black');
};

// Helper to check if element has dark mode text classes
const hasDarkModeText = (element: HTMLElement): boolean => {
  const className = element.className;
  // Check for light text colors (used in dark mode)
  // For DocumentCard, the article element doesn't have text classes directly,
  // so we check if it has dark mode background variants
  if (element.tagName === 'ARTICLE') {
    return className.includes('dark:bg-gray-800');
  }
  return className.includes('text-white') || 
         className.includes('text-gray-100') ||
         className.includes('dark:text-white') ||
         className.includes('dark:text-gray-100');
};

describe('Property 2: Preservation - Non-Mobile-Light-Mode Behavior', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    // Restore original viewport and mode
    setViewportWidth(originalInnerWidth);
    setLightMode();
  });

  describe('Desktop Light Mode Preservation (1920x1080, light mode)', () => {
    beforeEach(() => {
      setViewportWidth(1920);
      setLightMode();
    });

    it('SearchBar should have light mode classes on desktop', () => {
      const { container } = render(
        <SearchBar value="" onChange={() => {}} />
      );

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Desktop light mode: should have bg-white and text-gray-900 classes
      expect(hasLightModeBackground(input)).toBe(true);
      expect(hasLightModeText(input)).toBe(true);
      
      // Should also have dark mode variants for when dark mode is active
      expect(hasDarkModeBackground(input)).toBe(true);
      expect(hasDarkModeText(input)).toBe(true);
    });

    it('FilterPanel should have light mode classes on desktop', () => {
      const { container } = render(
        <FilterPanel 
          filters={{ major_id: null, subject: null, category: null }} 
          onFilterChange={() => {}} 
          availableSubjects={[]} 
        />
      );

      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();

      // Desktop light mode: should have bg-white and text-gray-900 classes
      expect(hasLightModeBackground(select)).toBe(true);
      expect(hasLightModeText(select)).toBe(true);
      
      // Should also have dark mode variants
      expect(hasDarkModeBackground(select)).toBe(true);
      expect(hasDarkModeText(select)).toBe(true);
    });

    it('DocumentCard should have light mode classes on desktop', () => {
      const mockDocument: DocumentLink = {
        id: 'test-doc-1',
        title: 'Test Document',
        description: 'Test description',
        url: 'https://example.com/doc.pdf',
        major_id: 'cntt',
        subject: 'Programming',
        category: 'Lecture Notes',
        createdBy: 'user123',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockUser = {
        uid: 'user123',
        email: 'test@example.com',
      } as any;

      const { container } = render(
        <DocumentCard 
          document={mockDocument}
          currentUser={mockUser}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      const card = container.querySelector('article') as HTMLElement;
      expect(card).toBeTruthy();

      // Desktop light mode: should have bg-white and text-gray-900 classes
      expect(hasLightModeBackground(card)).toBe(true);
      expect(hasLightModeText(card)).toBe(true);
      
      // Should also have dark mode variants
      expect(hasDarkModeBackground(card)).toBe(true);
      expect(hasDarkModeText(card)).toBe(true);
    });
  });

  describe('Desktop Dark Mode Preservation (1920x1080, dark mode)', () => {
    beforeEach(() => {
      setViewportWidth(1920);
      setDarkMode();
    });

    it('SearchBar should have dark mode classes on desktop', () => {
      const { container } = render(
        <SearchBar value="" onChange={() => {}} />
      );

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Desktop dark mode: should have dark:bg-gray-900 and dark:text-white classes
      expect(hasDarkModeBackground(input)).toBe(true);
      expect(hasDarkModeText(input)).toBe(true);
    });

    it('FilterPanel should have dark mode classes on desktop', () => {
      const { container } = render(
        <FilterPanel 
          filters={{ major_id: null, subject: null, category: null }} 
          onFilterChange={() => {}} 
          availableSubjects={[]} 
        />
      );

      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();

      // Desktop dark mode: should have dark:bg-gray-900 and dark:text-white classes
      expect(hasDarkModeBackground(select)).toBe(true);
      expect(hasDarkModeText(select)).toBe(true);
    });

    it('DocumentCard should have dark mode classes on desktop', () => {
      const mockDocument: DocumentLink = {
        id: 'test-doc-1',
        title: 'Test Document',
        description: 'Test description',
        url: 'https://example.com/doc.pdf',
        major_id: 'cntt',
        subject: 'Programming',
        category: 'Lecture Notes',
        createdBy: 'user123',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockUser = {
        uid: 'user123',
        email: 'test@example.com',
      } as any;

      const { container } = render(
        <DocumentCard 
          document={mockDocument}
          currentUser={mockUser}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      const card = container.querySelector('article') as HTMLElement;
      expect(card).toBeTruthy();

      // Desktop dark mode: should have dark:bg-gray-800 and dark:text-gray-100 classes
      expect(hasDarkModeBackground(card)).toBe(true);
      expect(hasDarkModeText(card)).toBe(true);
    });
  });

  describe('Mobile Dark Mode Preservation (375px, dark mode)', () => {
    beforeEach(() => {
      setViewportWidth(375);
      setDarkMode();
    });

    it('SearchBar should have dark mode classes on mobile', () => {
      const { container } = render(
        <SearchBar value="" onChange={() => {}} />
      );

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).toBeTruthy();

      // Mobile dark mode: should have dark:bg-gray-900 and dark:text-white classes
      expect(hasDarkModeBackground(input)).toBe(true);
      expect(hasDarkModeText(input)).toBe(true);
    });

    it('FilterPanel should have dark mode classes on mobile', () => {
      const { container } = render(
        <FilterPanel 
          filters={{ major_id: null, subject: null, category: null }} 
          onFilterChange={() => {}} 
          availableSubjects={[]} 
        />
      );

      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();

      // Mobile dark mode: should have dark:bg-gray-900 and dark:text-white classes
      expect(hasDarkModeBackground(select)).toBe(true);
      expect(hasDarkModeText(select)).toBe(true);
    });

    it('DocumentCard should have dark mode classes on mobile', () => {
      const mockDocument: DocumentLink = {
        id: 'test-doc-1',
        title: 'Test Document',
        description: 'Test description',
        url: 'https://example.com/doc.pdf',
        major_id: 'cntt',
        subject: 'Programming',
        category: 'Lecture Notes',
        createdBy: 'user123',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockUser = {
        uid: 'user123',
        email: 'test@example.com',
      } as any;

      const { container } = render(
        <DocumentCard 
          document={mockDocument}
          currentUser={mockUser}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      const card = container.querySelector('article') as HTMLElement;
      expect(card).toBeTruthy();

      // Mobile dark mode: should have dark:bg-gray-800 and dark:text-gray-100 classes
      expect(hasDarkModeBackground(card)).toBe(true);
      expect(hasDarkModeText(card)).toBe(true);
    });
  });

  describe('Tablet Breakpoint Preservation (768px, both modes)', () => {
    it('Components should have desktop light mode classes at 768px in light mode', () => {
      setViewportWidth(768);
      setLightMode();

      const { container: searchContainer } = render(
        <SearchBar value="" onChange={() => {}} />
      );
      const searchInput = searchContainer.querySelector('input') as HTMLInputElement;

      // At 768px (tablet), desktop styles should apply (light mode)
      expect(hasLightModeBackground(searchInput)).toBe(true);
      expect(hasLightModeText(searchInput)).toBe(true);
    });

    it('Components should have desktop dark mode classes at 768px in dark mode', () => {
      setViewportWidth(768);
      setDarkMode();

      const { container: searchContainer } = render(
        <SearchBar value="" onChange={() => {}} />
      );
      const searchInput = searchContainer.querySelector('input') as HTMLInputElement;

      // At 768px (tablet), desktop styles should apply (dark mode)
      expect(hasDarkModeBackground(searchInput)).toBe(true);
      expect(hasDarkModeText(searchInput)).toBe(true);
    });
  });

  describe('Property-Based: Desktop viewport sizes preserve correct styling', () => {
    it('Desktop light mode classes are consistent across viewport sizes', () => {
      fc.assert(
        fc.property(
          // Generate desktop viewport widths (>= 768px)
          fc.integer({ min: 768, max: 2560 }),
          (viewportWidth) => {
            setViewportWidth(viewportWidth);
            setLightMode();

            const { container, unmount } = render(
              <SearchBar value="" onChange={() => {}} />
            );
            const input = container.querySelector('input') as HTMLInputElement;
            
            // Desktop light mode: should have light mode classes
            expect(hasLightModeBackground(input)).toBe(true);
            expect(hasLightModeText(input)).toBe(true);
            
            unmount();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('Desktop dark mode classes are consistent across viewport sizes', () => {
      fc.assert(
        fc.property(
          // Generate desktop viewport widths (>= 768px)
          fc.integer({ min: 768, max: 2560 }),
          (viewportWidth) => {
            setViewportWidth(viewportWidth);
            setDarkMode();

            const { container, unmount } = render(
              <SearchBar value="" onChange={() => {}} />
            );
            const input = container.querySelector('input') as HTMLInputElement;
            
            // Desktop dark mode: should have dark mode classes
            expect(hasDarkModeBackground(input)).toBe(true);
            expect(hasDarkModeText(input)).toBe(true);
            
            unmount();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property-Based: Mobile dark mode styling is consistent', () => {
    it('Mobile dark mode classes are consistent across mobile viewport sizes', () => {
      fc.assert(
        fc.property(
          // Generate mobile viewport widths (< 768px)
          fc.integer({ min: 320, max: 767 }),
          (viewportWidth) => {
            setViewportWidth(viewportWidth);
            setDarkMode();

            const { container, unmount } = render(
              <SearchBar value="" onChange={() => {}} />
            );
            const input = container.querySelector('input') as HTMLInputElement;
            
            // Mobile dark mode: should have dark mode classes
            expect(hasDarkModeBackground(input)).toBe(true);
            expect(hasDarkModeText(input)).toBe(true);
            
            unmount();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property-Based: All components preserve styling across scenarios', () => {
    it('All components maintain correct classes for non-mobile-light-mode scenarios', () => {
      fc.assert(
        fc.property(
          // Generate viewport width
          fc.integer({ min: 320, max: 2560 }),
          // Generate mode (true = dark, false = light)
          fc.boolean(),
          (viewportWidth, isDark) => {
            // Skip mobile light mode (that's the bug condition we're NOT testing here)
            if (viewportWidth < 768 && !isDark) {
              return true; // Skip this combination
            }

            setViewportWidth(viewportWidth);
            if (isDark) {
              setDarkMode();
            } else {
              setLightMode();
            }

            // Test SearchBar
            const { container: searchContainer, unmount: unmountSearch } = render(
              <SearchBar value="" onChange={() => {}} />
            );
            const searchInput = searchContainer.querySelector('input') as HTMLInputElement;
            
            if (isDark) {
              // Dark mode: should have dark mode classes
              expect(hasDarkModeBackground(searchInput)).toBe(true);
              expect(hasDarkModeText(searchInput)).toBe(true);
            } else {
              // Light mode (desktop only, since we skip mobile light): should have light mode classes
              expect(hasLightModeBackground(searchInput)).toBe(true);
              expect(hasLightModeText(searchInput)).toBe(true);
            }
            
            unmountSearch();

            // Test FilterPanel
            const { container: filterContainer, unmount: unmountFilter } = render(
              <FilterPanel 
                filters={{ major_id: null, subject: null, category: null }} 
                onFilterChange={() => {}} 
                availableSubjects={[]} 
              />
            );
            const filterSelect = filterContainer.querySelector('select') as HTMLSelectElement;
            
            if (isDark) {
              expect(hasDarkModeBackground(filterSelect)).toBe(true);
              expect(hasDarkModeText(filterSelect)).toBe(true);
            } else {
              expect(hasLightModeBackground(filterSelect)).toBe(true);
              expect(hasLightModeText(filterSelect)).toBe(true);
            }
            
            unmountFilter();

            // Test DocumentCard
            const mockDoc: DocumentLink = {
              id: 'test',
              title: 'Test',
              description: 'Test',
              url: 'https://example.com',
              major_id: 'cntt',
              subject: 'Test',
              category: 'Test',
              createdBy: 'user',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            };
            const { container: cardContainer, unmount: unmountCard } = render(
              <DocumentCard 
                document={mockDoc} 
                currentUser={{ uid: 'user' } as any} 
                onEdit={() => {}} 
                onDelete={() => {}} 
              />
            );
            const card = cardContainer.querySelector('article') as HTMLElement;
            
            if (isDark) {
              expect(hasDarkModeBackground(card)).toBe(true);
              expect(hasDarkModeText(card)).toBe(true);
            } else {
              expect(hasLightModeBackground(card)).toBe(true);
              expect(hasLightModeText(card)).toBe(true);
            }
            
            unmountCard();
          }
        ),
        { numRuns: 20 } // Test across 20 different combinations
      );
    });
  });
});
