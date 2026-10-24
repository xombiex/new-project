// Extra map layers from free public data (the same kinds of sources big map apps credit):
//
// - Terrain: elevation tiles built from NASA SRTM, USGS, GEBCO and others, published openly on
//   AWS (Terrain Tiles, "terrarium" encoding). Drawn as soft hill shading, and on the web as real
//   3D mountains when the 3D map is on.
// - Weather radar: NOAA NEXRAD composite reflectivity for the US, from the Iowa Environmental
//   Mesonet's public tile cache. Refreshed every few minutes.
import type { ThemeVariant } from './use-map-look';

export const DEM_SOURCE = 'convoy-dem';
/** maplibre wants a separate DEM source for 3D terrain than for hill shading. */
export const DEM_3D_SOURCE = 'convoy-dem-3d';
export const HILLSHADE_LAYER = 'convoy-hillshade';
export const RADAR_SOURCE = 'convoy-radar';
export const RADAR_LAYER = 'convoy-radar';
/** Hill shading goes under this base-map layer (every OpenFreeMap style has it), so roads and buildings stay on top. */
export const HILLSHADE_BEFORE = 'building';

export const DEM_TILES = ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'];
export const DEM_ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain: SRTM, USGS, GEBCO and others</a>';
export const DEM_MAXZOOM = 15;
/** Hills are a gentle backdrop in 2D; 3D lifts them a little more than life so they read on a phone. */
export const TERRAIN_EXAGGERATION = 1.3;

const RADAR_REFRESH_MS = 5 * 60_000;
export const RADAR_ATTRIBUTION =
  '<a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">Radar: NOAA NEXRAD via Iowa Environmental Mesonet</a>';
/** Radar pixels are ~1 km: a clear overlay zoomed out, a light wash up close where they'd look blocky. */
export const RADAR_OPACITY = ['interpolate', ['linear'], ['zoom'], 8, 0.6, 13, 0.3] as unknown as number;

/** Radar tile URL, changed every few minutes so a fresh sweep is fetched rather than a cached one. */
export function radarTiles(now = Date.now()): string[] {
  const stamp = Math.floor(now / RADAR_REFRESH_MS);
  return [`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?v=${stamp}`];
}
export { RADAR_REFRESH_MS };

/** Soft shading: enough to see the hills, never enough to fight the roads. */
export function hillshadePaint(dark: boolean, variant: ThemeVariant | null) {
  if (variant === 'neon') return { 'hillshade-exaggeration': 0.25, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#2a1a4a', 'hillshade-accent-color': '#000000' };
  if (dark) return { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#4a515c', 'hillshade-accent-color': '#000000' };
  return { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#5b6470', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#5b6470' };
}
