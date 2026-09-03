import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DocumentCard } from './DocumentCard';

vi.mock('../hooks/useUploaderProfile', () => ({
  useUploaderProfile: (uploaderId: string) => ({
    profile: { displayName: 'Test User', uid: uploaderId },
    loading: false,
  }),
}));

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: () => {},
  }),
}));

const createMockDocument = (overrides?: any): any => ({
  id: 'test-doc-1',
  title: 'Test Document',
  description: 'Test description',
  url: 'https://example.com/doc.pdf',
  major_id: 'cntt',
  subject: 'Programming',
  category: 'Lecture Notes',
  createdBy: 'user123',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('Property 2: Preservation - Functional Behavior Unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.3 clicking uploader name should trigger onProfileClick', () => {
    const mockDocument = createMockDocument();
    const mockUser = { uid: 'current-user', email: 'test@example.com' } as any;
    const onProfileClick = vi.fn();

    const { container } = render(
      <DocumentCard
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
        onProfileClick={onProfileClick}
      />
    );

    const uploaderButton = container.querySelector('button[aria-label*=\"View profile\"]');
    if (uploaderButton) {
      fireEvent.click(uploaderButton);
    }

    expect(onProfileClick).toHaveBeenCalledWith(mockDocument.createdBy);
  });

  it('3.6 clicking edit button should trigger onEdit callback', () => {
    const mockDocument = createMockDocument({ createdBy: 'owner-uid' });
    const mockUser = { uid: 'owner-uid', email: 'owner@example.com' } as any;
    const onEdit = vi.fn();

    const { container } = render(
      <DocumentCard
        document={mockDocument}
        currentUser={mockUser}
        onEdit={onEdit}
        onDelete={() => {}}
      />
    );

    const editButton = container.querySelector('button[aria-label=\"Sửa tài liệu\"]');
    if (editButton) {
      fireEvent.click(editButton);
    }

    expect(onEdit).toHaveBeenCalledWith(mockDocument);
  });

  it('3.7 clicking open document button should open URL in new tab', () => {
    const mockDocument = createMockDocument({ url: 'https://example.com/test.pdf' });
    const mockUser = { uid: 'user123', email: 'test@example.com' } as any;
    
    const originalOpen = window.open;
    window.open = vi.fn();

    const { container } = render(
      <DocumentCard
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const openButton = container.querySelector('button[aria-label=\"Mở tài liệu\"]');
    if (openButton) {
      fireEvent.click(openButton);
    }

    expect(window.open).toHaveBeenCalledWith(mockDocument.url, '_blank', 'noopener,noreferrer');
    window.open = originalOpen;
  });

  it('3.5 should display major tag with icon', () => {
    const mockDocument = createMockDocument({ major_id: 'cntt' });
    const mockUser = { uid: 'user123', email: 'test@example.com' } as any;

    const { container } = render(
      <DocumentCard
        document={mockDocument}
        currentUser={mockUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const spans = Array.from(container.querySelectorAll('span'));
    const majorTag = spans.find(span => span.textContent?.includes('Công Nghệ Thông Tin'));
    expect(majorTag).toBeTruthy();
    if (majorTag) {
      const icon = majorTag.querySelector('svg');
      expect(icon).toBeTruthy();
    }
  });
});
