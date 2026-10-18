import type { LngLat } from '@/lib/geo';
import type { GlowPalette } from '@/lib/glow';

import type { MapLine } from './types';

type LineLayerDef = {
  suffix: string;
  paint: Record<string, unknown>;
  layout: Record<string, unknown>;
};

const ROUND = { 'line-cap': 'round', 'line-join': 'round' };

/** GeoJSON for a MapLine (single or multi). Shared by the native and web maps. */
export function lineFeature(line: MapLine): GeoJSON.Feature {
  const multi = Array.isArray(line.coords[0]?.[0]);
  return {
    type: 'Feature',
    properties: {},
    geometry: multi
      ? { type: 'MultiLineString', coordinates: line.coords as LngLat[][] }
      : { type: 'LineString', coordinates: line.coords as LngLat[] },
  };
}

/** Layer stack for a line, bottom to top. */
export function lineLayers(line: MapLine, glow: GlowPalette): LineLayerDef[] {
  const w = line.width ?? 6;
  const o = line.opacity ?? 1;
  if (line.variant === 'glow') {
    return [
      { suffix: 'haze', layout: ROUND, paint: { 'line-color': glow.haze, 'line-width': w * 4, 'line-blur': w * 3, 'line-opacity': 0.35 * o } },
      { suffix: 'glow', layout: ROUND, paint: { 'line-color': glow.glow, 'line-width': w * 1.8, 'line-blur': w * 0.8, 'line-opacity': 0.75 * o } },
      { suffix: 'core', layout: ROUND, paint: { 'line-color': glow.core, 'line-width': w * 0.55, 'line-opacity': 0.9 * o } },
    ];
  }
  if (line.variant === 'route') {
    // Navigation route, Apple Maps style: bright blue with a darker blue edge.
    return [
      { suffix: 'edge', layout: ROUND, paint: { 'line-color': '#0B5ED7', 'line-width': w + 5, 'line-opacity': o } },
      { suffix: 'core', layout: ROUND, paint: { 'line-color': '#3A9BFF', 'line-width': w, 'line-opacity': o } },
    ];
  }
  return [
    { suffix: 'casing', layout: ROUND, paint: { 'line-color': '#000000', 'line-width': w + 3, 'line-opacity': 0.35 * o } },
    { suffix: 'fill', layout: ROUND, paint: { 'line-color': line.color, 'line-width': w, 'line-opacity': o } },
  ];
}
