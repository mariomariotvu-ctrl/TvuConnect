import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveError, listGoogleDriveLibraryFiles, loadGoogleDriveFile, TVU_LIBRARY_FOLDER_ID } from './googleDriveClient';

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

  it('recursively lists files from the canonical shared folder', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { id: 'folder-1', name: 'Công nghệ thông tin', mimeType: 'application/vnd.google-apps.folder', parents: [TVU_LIBRARY_FOLDER_ID] },
        { id: 'root-pdf', name: 'Đại cương.pdf', mimeType: 'application/pdf', parents: [TVU_LIBRARY_FOLDER_ID], modifiedTime: '2026-09-20T00:00:00Z' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { id: 'nested-pdf', name: 'Lập trình.pdf', mimeType: 'application/pdf', parents: ['folder-1'], modifiedTime: '2026-09-21T00:00:00Z' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const files = await listGoogleDriveLibraryFiles(true);

    expect(files.map((file) => file.id)).toEqual(['nested-pdf', 'root-pdf']);
    expect(files[0].folderPath).toEqual(['Công nghệ thông tin']);
    const firstQuery = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('q');
    expect(firstQuery).toContain(`'${TVU_LIBRARY_FOLDER_ID}' in parents`);
  });

  it('keeps readable subjects when one shared child folder is private', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { id: 'public-folder', name: 'Công nghệ thông tin', mimeType: 'application/vnd.google-apps.folder', parents: [TVU_LIBRARY_FOLDER_ID] },
        { id: 'private-folder', name: 'Tài liệu nội bộ', mimeType: 'application/vnd.google-apps.folder', parents: [TVU_LIBRARY_FOLDER_ID] },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'The user does not have sufficient permissions for this file.' },
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { id: 'public-pdf', name: 'Lập trình.pdf', mimeType: 'application/pdf', parents: ['public-folder'] },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'The user does not have sufficient permissions for this file.' },
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }));

    const files = await listGoogleDriveLibraryFiles(true);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      id: 'public-pdf',
      folderPath: ['Công nghệ thông tin'],
    });
  });

  it('follows Drive shortcuts that point to shared folders', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        {
          id: 'shortcut-1',
          name: 'Giáo trình dùng chung',
          mimeType: 'application/vnd.google-apps.shortcut',
          parents: [TVU_LIBRARY_FOLDER_ID],
          shortcutDetails: {
            targetId: 'shared-folder',
            targetMimeType: 'application/vnd.google-apps.folder',
          },
        },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [
        { id: 'shared-pdf', name: 'Đại số.pdf', mimeType: 'application/pdf', parents: ['shared-folder'] },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const files = await listGoogleDriveLibraryFiles(true);

    expect(files[0]).toMatchObject({
      id: 'shared-pdf',
      folderPath: ['Giáo trình dùng chung'],
    });
  });
});
