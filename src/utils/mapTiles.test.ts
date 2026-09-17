import { describe, expect, it } from 'vitest';
import { getMapTileUrl, MAP_TILE_ATTRIBUTION } from './mapTiles';

describe('map tile configuration', () => {
  it('uses the reachable CARTO CDN for both themes', () => {
    expect(getMapTileUrl('light')).toContain('basemaps.cartocdn.com/light_all');
    expect(getMapTileUrl('dark')).toContain('basemaps.cartocdn.com/dark_all');
    expect(getMapTileUrl('light')).not.toContain('tile.openstreetmap.org');
  });

  it('keeps both required data-source attributions', () => {
    expect(MAP_TILE_ATTRIBUTION).toContain('OpenStreetMap');
    expect(MAP_TILE_ATTRIBUTION).toContain('CARTO');
  });
});
