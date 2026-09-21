import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentViewerModal, getEmbeddedDocumentUrl } from './DocumentViewerModal';
import {
  buildGoogleDriveShareUrl,
  canPreviewMimeType,
  isGoogleDriveFolderUrl,
  parseGoogleDriveReference,
} from '../utils/googleDriveClient';

describe('getEmbeddedDocumentUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('converts shared Google files to an in-app preview URL', () => {
    expect(getEmbeddedDocumentUrl('https://drive.google.com/file/d/file-id/view?usp=sharing'))
      .toBe('https://drive.google.com/file/d/file-id/preview');
    expect(getEmbeddedDocumentUrl('https://docs.google.com/document/d/doc-id/edit'))
      .toBe('https://docs.google.com/document/d/doc-id/preview');
  });

  it('uses the embedded Office viewer for Office files', () => {
    expect(getEmbeddedDocumentUrl('https://example.edu/report.xlsx'))
      .toBe('https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fexample.edu%2Freport.xlsx');
  });

  it('keeps direct PDF links intact', () => {
    expect(getEmbeddedDocumentUrl('https://example.edu/book.pdf')).toBe('https://example.edu/book.pdf');
  });

  it('extracts IDs from supported Google Drive and Workspace links', () => {
    expect(parseGoogleDriveReference('https://drive.google.com/file/d/file-123/view?usp=sharing')).toEqual({
      fileId: 'file-123',
      kind: 'file',
    });
    expect(parseGoogleDriveReference('https://drive.google.com/open?id=query-456')).toEqual({
      fileId: 'query-456',
      kind: 'file',
    });
    expect(parseGoogleDriveReference('https://docs.google.com/spreadsheets/d/sheet-789/edit')).toEqual({
      fileId: 'sheet-789',
      kind: 'spreadsheet',
    });
    expect(parseGoogleDriveReference('https://example.edu/file.pdf')).toBeNull();
    expect(parseGoogleDriveReference('https://drive.google.com/drive/folders/folder-123')).toBeNull();
    expect(isGoogleDriveFolderUrl('https://drive.google.com/drive/folders/folder-123?usp=sharing')).toBe(true);
    expect(isGoogleDriveFolderUrl('https://drive.google.com/drive/u/1/folders/folder-456')).toBe(true);
    expect(isGoogleDriveFolderUrl('https://drive.google.com/file/d/file-123/view')).toBe(false);
  });

  it('builds the canonical share URL for a Picker selection', () => {
    expect(buildGoogleDriveShareUrl({
      id: 'doc-123',
      mimeType: 'application/vnd.google-apps.document',
    })).toBe('https://docs.google.com/document/d/doc-123/edit');

    expect(buildGoogleDriveShareUrl({
      id: 'pdf-456',
      mimeType: 'application/pdf',
    })).toBe('https://drive.google.com/file/d/pdf-456/view');
  });

  it('only marks browser-renderable MIME types as inline previewable', () => {
    expect(canPreviewMimeType('application/pdf')).toBe(true);
    expect(canPreviewMimeType('image/png')).toBe(true);
    expect(canPreviewMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
  });

  it('shows a safe permission screen instead of embedding a private Drive 403 page', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: 'File not found' },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } }));

    render(createElement(DocumentViewerModal, {
      open: true,
      title: 'Tài liệu riêng tư',
      url: 'https://drive.google.com/file/d/private-file/view',
      onClose: () => {},
    }));

    expect(await screen.findByRole('heading', { name: 'Tài liệu đang giới hạn quyền' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử bản xem trực tuyến' })).toBeInTheDocument();
    expect(screen.queryByTitle('Tài liệu: Tài liệu riêng tư')).not.toBeInTheDocument();
  });

  it('uses the Drive preview for large files instead of downloading them into memory', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'large-pdf',
      name: 'Giáo trình lớn.pdf',
      mimeType: 'application/pdf',
      size: String(150 * 1024 * 1024),
      capabilities: { canDownload: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    render(createElement(DocumentViewerModal, {
      open: true,
      title: 'Giáo trình lớn',
      url: 'https://drive.google.com/file/d/large-pdf/view',
      onClose: () => {},
    }));

    await waitFor(() => {
      expect(screen.getByTitle('Tài liệu: Giáo trình lớn'))
        .toHaveAttribute('src', 'https://drive.google.com/file/d/large-pdf/preview');
    });
  });

  it('explains unsupported Drive folders without loading the Google error page', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(createElement(DocumentViewerModal, {
      open: true,
      title: 'Thư mục giáo trình',
      url: 'https://drive.google.com/drive/folders/folder-123?usp=sharing',
      onClose: () => {},
    }));

    expect(screen.getByRole('heading', { name: 'Liên kết thư mục không thể xem' })).toBeInTheDocument();
    expect(screen.queryByTitle('Tài liệu: Thư mục giáo trình')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders a public Drive PDF from a local blob URL', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tvu-connect-pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'public-pdf',
        name: 'Giáo trình.pdf',
        mimeType: 'application/pdf',
        size: '12',
        capabilities: { canDownload: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('pdf-content', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }));

    render(createElement(DocumentViewerModal, {
      open: true,
      title: 'Giáo trình',
      url: 'https://drive.google.com/file/d/public-pdf/view',
      onClose: () => {},
    }));

    await waitFor(() => {
      expect(screen.getByTitle('Tài liệu: Giáo trình')).toHaveAttribute('src', 'blob:tvu-connect-pdf');
    });
  });
});
