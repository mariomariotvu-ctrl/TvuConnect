import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveError, loadGoogleDriveFile } from './googleDriveClient';

describe('loadGoogleDriveFile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('loads a public PDF through the Drive API instead of embedding a Google page', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'pdf-1',
        name: 'Giáo trình.pdf',
        mimeType: 'application/pdf',
        size: '12',
        capabilities: { canDownload: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('pdf-content', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }));

    const result = await loadGoogleDriveFile('pdf-1');

    expect(result.name).toBe('Giáo trình.pdf');
    expect(result.previewMimeType).toBe('application/pdf');
    expect(fetchMock.mock.calls[1][0]).toContain('/files/pdf-1?alt=media');
    expect(fetchMock.mock.calls[1][0]).toContain('key=test-api-key');
  });

  it('exports a native Google document to PDF for the in-app viewer', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'doc-1',
        name: 'Đại cương',
        mimeType: 'application/vnd.google-apps.document',
        capabilities: { canDownload: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('pdf-content', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }));

    const result = await loadGoogleDriveFile('doc-1');

    expect(result.previewMimeType).toBe('application/pdf');
    expect(fetchMock.mock.calls[1][0]).toContain('/files/doc-1/export?mimeType=application%2Fpdf');
  });

  it('reports a private file as a permission problem', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: 'File not found' },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } }));

    await expect(loadGoogleDriveFile('private-file')).rejects.toMatchObject({
      code: 'permission',
    } satisfies Partial<GoogleDriveError>);
  });
});
