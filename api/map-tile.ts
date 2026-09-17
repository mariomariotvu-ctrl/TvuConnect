const OSM_TILE_ORIGIN = 'https://tile.openstreetmap.org';
const CACHE_SECONDS = 7 * 24 * 60 * 60;

function readTileCoordinate(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const coordinate = Number(value);
  return Number.isSafeInteger(coordinate) ? coordinate : null;
}

function invalidTile(message: string, status = 400): Response {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return invalidTile('Method not allowed', 405);

    const url = new URL(request.url);
    const z = readTileCoordinate(url.searchParams.get('z'));
    const x = readTileCoordinate(url.searchParams.get('x'));
    const y = readTileCoordinate(url.searchParams.get('y'));

    if (z === null || x === null || y === null || z > 19) {
      return invalidTile('Invalid tile coordinates');
    }

    const axisLimit = 2 ** z;
    if (x >= axisLimit || y >= axisLimit) {
      return invalidTile('Tile coordinates are outside this zoom level');
    }

    const upstream = await fetch(`${OSM_TILE_ORIGIN}/${z}/${x}/${y}.png`, {
      headers: {
        Accept: 'image/png,image/*;q=0.8',
        Referer: 'https://tvuconnect.vercel.app/',
        'User-Agent': 'TVUConnect/1.0 (+https://tvuconnect.vercel.app)',
      },
    });

    if (!upstream.ok || !upstream.body) {
      return invalidTile('Map tile is temporarily unavailable', 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/png',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, immutable`,
        'CDN-Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`,
        'Vercel-CDN-Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
