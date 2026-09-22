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

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(async (_blob: Blob, container: HTMLElement) => {
    const page = document.createElement('p');
    page.textContent = 'Nội dung Word đã hiển thị';
    container.appendChild(page);
  }),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    destroy: vi.fn(async () => {}),
    promise: Promise.resolve({
      numPages: 1,
      cleanup: vi.fn(async () => {}),
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
      })),
    }),
  })),
}));

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

  it('renders public Word files directly in the app without forcing a download', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tvu-connect-docx');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'public-docx',
        name: 'Ôn-tập-HVTD (1).docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: '24576',
        capabilities: { canDownload: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('docx-content', {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      }));

    render(createElement(DocumentViewerModal, {
      open: true,
      title: 'Ôn-tập-HVTD (1)',
      url: 'https://drive.google.com/file/d/public-docx/view',
      onClose: () => {},
    }));

    expect(await screen.findByText('Nội dung Word đã hiển thị')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Tải bản gốc' })).toHaveAttribute('href', 'blob:tvu-connect-docx');
    expect(screen.queryByText('Định dạng này chưa xem trực tiếp được')).not.toBeInTheDocument();
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

  it('renders a public Drive PDF inside the app without relying on the browser PDF iframe', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tvu-connect-pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
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

    expect(await screen.findByText('Đang xem PDF trực tiếp')).toBeInTheDocument();
    expect(await screen.findByText('1 / 1 trang')).toBeInTheDocument();
    expect(screen.getByLabelText('Trang 1 / 1')).toBeInTheDocument();
    expect(screen.queryByTitle('Tài liệu: Giáo trình')).not.toBeInTheDocument();
  });

  it('opens legacy PowerPoint files in the Drive viewer instead of forcing a download', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tvu-connect-ppt');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'public-ppt',
        name: 'ÔN TẬP TRẮC NGHIỆM.ppt',
        mimeType: 'application/vnd.ms-powerpoint',
        size: '24576',
        capabilities: { canDownload: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('ppt-content', {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.ms-powerpoint' },
      }));

    render(createElement(DocumentViewerModal, {
      open: true,
      title: 'ÔN TẬP TRẮC NGHIỆM',
      url: 'https://drive.google.com/file/d/public-ppt/view',
      onClose: () => {},
    }));

    expect(await screen.findByText('Đang xem file Office trực tiếp')).toBeInTheDocument();
    expect(screen.getByTitle('Tài liệu: ÔN TẬP TRẮC NGHIỆM'))
      .toHaveAttribute(
        'src',
        'https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Ftvuconnect.vercel.app%2Fapi%2Fdrive-office%3FfileId%3Dpublic-ppt',
      );
    expect(screen.queryByText('Định dạng này chưa xem trực tiếp được')).not.toBeInTheDocument();
  });
});
