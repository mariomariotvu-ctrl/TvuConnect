import { afterEach, describe, expect, it, vi } from 'vitest';
import mapTileHandler from '../../api/map-tile';

describe('map tile proxy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects malformed and out-of-range coordinates before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const malformed = await mapTileHandler.fetch(
      new Request('https://tvuconnect.vercel.app/api/map-tile?z=14&x=nope&y=1'),
    );
    const outside = await mapTileHandler.fetch(
      new Request('https://tvuconnect.vercel.app/api/map-tile?z=2&x=4&y=1'),
    );

    expect(malformed.status).toBe(400);
    expect(outside.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('identifies the app upstream and returns a seven-day cached image', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await mapTileHandler.fetch(
      new Request('https://tvuconnect.vercel.app/api/map-tile?z=14&x=13030&y=7733'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('max-age=604800');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/14/13030/7733.png',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('TVUConnect'),
        }),
      }),
    );
  });
});
