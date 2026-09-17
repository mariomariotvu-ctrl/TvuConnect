import { describe, expect, it } from 'vitest';
import {
  getMapTileUrl,
  MAP_TILE_ATTRIBUTION,
} from './mapTiles';

describe('map tile configuration', () => {
  it('uses the same-origin cached tile endpoint', () => {
    expect(getMapTileUrl()).toBe('/api/map-tile?z={z}&x={x}&y={y}');
    expect(getMapTileUrl()).not.toContain('cartocdn.com');
  });

  it('keeps the required OpenStreetMap attribution', () => {
    expect(MAP_TILE_ATTRIBUTION).toContain('OpenStreetMap');
  });
});
