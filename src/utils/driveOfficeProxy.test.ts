import { afterEach, describe, expect, it, vi } from 'vitest';
import driveOfficeHandler from '../../api/drive-office';

describe('Drive Office preview proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects invalid file IDs without contacting Drive', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await driveOfficeHandler.fetch(
      new Request('https://tvuconnect.vercel.app/api/drive-office?fileId=bad'),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('streams a public PowerPoint with headers understood by online Office viewers', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'powerpoint-file-id',
        name: 'Bài giảng Logic.ppt',
        mimeType: 'application/vnd.ms-powerpoint',
        size: '1024',
        capabilities: { canDownload: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('powerpoint-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-powerpoint',
          'Content-Length': '16',
        },
      }));

    const response = await driveOfficeHandler.fetch(
      new Request('https://tvuconnect.vercel.app/api/drive-office?fileId=powerpoint-file-id'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.ms-powerpoint');
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''B%C3%A0i%20gi%E1%BA%A3ng%20Logic.ppt");
    expect(await response.text()).toBe('powerpoint-bytes');
  });

  it('does not expose non-Office Drive files', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-api-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'public-pdf-file',
      name: 'Giáo trình.pdf',
      mimeType: 'application/pdf',
      size: '2048',
      capabilities: { canDownload: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await driveOfficeHandler.fetch(
      new Request('https://tvuconnect.vercel.app/api/drive-office?fileId=public-pdf-file'),
    );

    expect(response.status).toBe(415);
  });
});
