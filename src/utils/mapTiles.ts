export const MAP_TILE_URL = '/api/map-tile?z={z}&x={x}&y={y}';

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Same-origin URL served by a cached Vercel Function. Keeping the browser on
 * tvuconnect.vercel.app avoids cross-domain/DNS failures seen on some devices.
 */
export function getMapTileUrl(): string {
  return MAP_TILE_URL;
}
