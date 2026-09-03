import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { Timestamp } from 'firebase/firestore';
import { DocumentCard } from './DocumentCard';
import { DocumentLink } from '../types/documentLink';

// Mock the useUploaderProfile hook to return immediately
vi.mock('../hooks/useUploaderProfile', () => ({
  useUploaderProfile: () => ({
    profile: {
      displayName: 'Test User',
      uid: 'test-uid',
    },
    loading: false,
  }),
}));

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: () => {},
  }),
}));

/**
 * Bug Condition Exploration Test for Uploader Info Text Alignment
 * 
 * **Validates: Requirements 2.1, 2.2**
 * 
 * This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * The test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * GOAL: Surface counterexamples that demonstrate the text misalignment between uploader info and description.
 * 
 * NOTE: Since jsdom doesn't render actual CSS layouts, this test verifies the structural alignment
 * by checking that the uploader info container and description have consistent left padding/margin.
 * The actual visual bug will be visible in a real browser but this test ensures the CSS structure is correct.
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

// Helper to find uploader info container
const findUploaderInfoContainer = (container: HTMLElement): HTMLElement | null => {
  // Find the div containing UploaderInfo component (has class "mb-2" and contains "Đăng bởi:")
  const divs = Array.from(container.querySelectorAll('div'));
  for (const div of divs) {
    if (div.textContent?.includes('Đăng bởi:') && div.className.includes('mb-2')) {
      return div;
    }
  }
  return null;
};

// Helper to find description text element
const findDescriptionText = (container: HTMLElement): HTMLElement | null => {
  // Find the paragraph element with description text
  const paragraphs = container.querySelectorAll('p');
  // The description is the paragraph with line-clamp-2 class
  for (const p of Array.from(paragraphs)) {
    if (p.className.includes('line-clamp-2')) {
      return p;
    }
  }
  return null;
};

// Helper to extract padding/margin classes from className string
// (Currently unused but kept for potential future use)
// const extractSpacingClasses = (className: string): string[] => {
//   const classes = className.split(' ');
//   return classes.filter(c => 
//     c.startsWith('pl-') || c.startsWith('ml-') || 
//     c.startsWith('px-') || c.startsWith('mx-') ||
//     c.includes('padding') || c.includes('margin')
//   );
// };

// Helper to check if elements have consistent left alignment structure
const hasConsistentLeftAlignment = (uploaderContainer: HTMLElement, description: HTMLElement): boolean => {
  // The bug is that the UploaderInfo component has a User icon that creates visual offset
  // The icon is part of a flex container with gap-1.5, which pushes the text to the right
  // The description text starts at the left edge of its container
  // For proper alignment, the TEXT content (not the icon) should align with the description
  
  // Find the actual text content in the uploader info (after the icon)
  const hasIcon = uploaderContainer.querySelector('svg') !== null;
  
  // If there's an icon in the uploader info, the text will be offset to the right
  // This is the bug condition - the icon creates misalignment
  if (hasIcon) {
    // The uploader info has an icon, which means the text is offset
    // For the bug to be fixed, there should be negative margin or padding adjustment
    // to compensate for the icon width
    
    // Check if there's any compensation for the icon offset
    const uploaderClasses = uploaderContainer.className;
    const hasNegativeMargin = uploaderClasses.includes('-ml-') || uploaderClasses.includes('negative');
    const hasLeftPaddingAdjustment = uploaderClasses.includes('pl-0') || uploaderClasses.includes('pl-');
    
    // If there's no compensation, the alignment is broken (bug exists)
    // Return false to indicate misalignment
    return hasNegativeMargin || hasLeftPaddingAdjustment;
  }
  
  // If there's no icon, check basic structural alignment
  const uploaderParent = uploaderContainer.parentElement;
  const descriptionParent = description.parentElement;
  return uploaderParent === descriptionParent;
};

describe('Property 1: Bug Condition - Uploader Info Text Alignment', () => {
  beforeEach(() => {
    // Reset viewport to default
    setViewportWidth(1024);
  });

  it('Desktop layout: uploader info container should have consistent left alignment with description (both major and subject tags)', () => {
    // Arrange: Create mock document with both major and subject tags
    const mockDocument: DocumentLink = {
      id: 'test-doc-1',
      title: 'Test Document with Long Title',
      description: 'This is a test description that should align with the uploader info text above it.',
      url: 'https://example.com/doc.pdf',
      major_id: 'cntt',
      subject: 'Programming',
      category: 'Lecture Notes',
      createdBy: 'user123',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const mockUser = {
      uid: 'user456',
      email: 'test@example.com',
    } as any;

    // Set desktop viewport
    setViewportWidth(1024);

    // Act: Render DocumentCard
    const { container } = render(
      <DocumentCard 
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Find uploader info container and description elements
    const uploaderContainer = findUploaderInfoContainer(container);
    const description = findDescriptionText(container);

    // Assert: Both elements should exist
    expect(uploaderContainer).toBeTruthy();
    expect(description).toBeTruthy();

    if (uploaderContainer && description) {
      // Assert: Elements should have consistent left alignment structure
      const isAligned = hasConsistentLeftAlignment(uploaderContainer, description);
      expect(isAligned).toBe(true);
    }
  });

  it('Mobile layout: uploader info container should have consistent left alignment with description (both major and subject tags)', () => {
    // Arrange: Create mock document with both major and subject tags
    const mockDocument: DocumentLink = {
      id: 'test-doc-2',
      title: 'Mobile Test Document',
      description: 'Mobile description text that should align with uploader info.',
      url: 'https://example.com/doc.pdf',
      major_id: 'duoc',
      subject: 'Pharmacology',
      category: 'Exam Papers',
      createdBy: 'user789',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const mockUser = {
      uid: 'user456',
      email: 'test@example.com',
    } as any;

    // Set mobile viewport
    setViewportWidth(375);

    // Act: Render DocumentCard
    const { container } = render(
      <DocumentCard 
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Find uploader info container and description elements
    const uploaderContainer = findUploaderInfoContainer(container);
    const description = findDescriptionText(container);

    // Assert: Both elements should exist
    expect(uploaderContainer).toBeTruthy();
    expect(description).toBeTruthy();

    if (uploaderContainer && description) {
      // Assert: Elements should have consistent left alignment structure
      const isAligned = hasConsistentLeftAlignment(uploaderContainer, description);
      expect(isAligned).toBe(true);
    }
  });

  it('Desktop layout: uploader info container should have consistent left alignment with description (only major tag, no subject)', () => {
    // Arrange: Create mock document with only major tag
    const mockDocument: DocumentLink = {
      id: 'test-doc-3',
      title: 'Document Without Subject Tag',
      description: 'Description without subject tag should still align properly.',
      url: 'https://example.com/doc.pdf',
      major_id: 'y',
      subject: '', // No subject tag
      category: 'Research Papers',
      createdBy: 'user111',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const mockUser = {
      uid: 'user456',
      email: 'test@example.com',
    } as any;

    // Set desktop viewport
    setViewportWidth(1024);

    // Act: Render DocumentCard
    const { container } = render(
      <DocumentCard 
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Find uploader info container and description elements
    const uploaderContainer = findUploaderInfoContainer(container);
    const description = findDescriptionText(container);

    // Assert: Both elements should exist
    expect(uploaderContainer).toBeTruthy();
    expect(description).toBeTruthy();

    if (uploaderContainer && description) {
      // Assert: Elements should have consistent left alignment structure
      const isAligned = hasConsistentLeftAlignment(uploaderContainer, description);
      expect(isAligned).toBe(true);
    }
  });

  it('Mobile layout: uploader info container should have consistent left alignment with description (only major tag, no subject)', () => {
    // Arrange: Create mock document with only major tag
    const mockDocument: DocumentLink = {
      id: 'test-doc-4',
      title: 'Mobile Document Without Subject',
      description: 'Mobile description without subject tag alignment test.',
      url: 'https://example.com/doc.pdf',
      major_id: 'kinh te',
      subject: '', // No subject tag
      category: 'Textbooks',
      createdBy: 'user222',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const mockUser = {
      uid: 'user456',
      email: 'test@example.com',
    } as any;

    // Set mobile viewport
    setViewportWidth(375);

    // Act: Render DocumentCard
    const { container } = render(
      <DocumentCard 
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Find uploader info container and description elements
    const uploaderContainer = findUploaderInfoContainer(container);
    const description = findDescriptionText(container);

    // Assert: Both elements should exist
    expect(uploaderContainer).toBeTruthy();
    expect(description).toBeTruthy();

    if (uploaderContainer && description) {
      // Assert: Elements should have consistent left alignment structure
      const isAligned = hasConsistentLeftAlignment(uploaderContainer, description);
      expect(isAligned).toBe(true);
    }
  });

  it('Property: Uploader info container has consistent left alignment with description across all viewport sizes and document configurations', () => {
    fc.assert(
      fc.property(
        // Generate viewport widths (mobile: 320-767, desktop: 768-1920)
        fc.integer({ min: 320, max: 1920 }),
        // Generate document configurations
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 20 }),
          title: fc.string({ minLength: 10, maxLength: 100 }),
          description: fc.string({ minLength: 20, maxLength: 200 }),
          url: fc.constant('https://example.com/doc.pdf'),
          major_id: fc.constantFrom('cntt', 'duoc', 'y', 'kinh te', 'su pham'),
          subject: fc.oneof(
            fc.constant(''), // No subject tag
            fc.constantFrom('Programming', 'Pharmacology', 'Anatomy', 'Economics', 'Education')
          ),
          category: fc.constantFrom('Lecture Notes', 'Exam Papers', 'Research Papers', 'Textbooks', 'Lab Reports'),
          createdBy: fc.string({ minLength: 5, maxLength: 20 }),
          createdAt: fc.constant(Timestamp.now()),
          updatedAt: fc.constant(Timestamp.now()),
        }),
        (viewportWidth, documentConfig) => {
          // Arrange: Set viewport
          setViewportWidth(viewportWidth);

          const mockUser = {
            uid: 'test-user',
            email: 'test@example.com',
          } as any;

          // Act: Render DocumentCard
          const { container, unmount } = render(
            <DocumentCard 
              document={documentConfig as DocumentLink}
              currentUser={mockUser}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          );

          // Find uploader info container and description elements
          const uploaderContainer = findUploaderInfoContainer(container);
          const description = findDescriptionText(container);

          // Only test alignment if both elements exist
          if (uploaderContainer && description) {
            // Assert: Elements should have consistent left alignment structure
            const isAligned = hasConsistentLeftAlignment(uploaderContainer, description);
            expect(isAligned).toBe(true);
          }

          unmount();
        }
      ),
      { numRuns: 20 } // Test across 20 different configurations
    );
  });
});
