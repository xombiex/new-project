import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * "Neon City": an original night-city look. Near-black ground, crimson buildings, glowing cyan
 * roads (each road gets a blurred glow copy underneath), deep navy water, cyan and red labels.
 * Built from the OpenFreeMap dark style by recoloring its layers.
 */
const BG = '#05060A';
const CYAN = '#3AF2FF';
const RED = '#FF3B4E';

function sourceLayer(l: LayerSpecification): string | undefined {
  return (l as { 'source-layer'?: string })['source-layer'];
}

/** Brighter, wider glow for big roads; dimmer for side streets. */
const ROAD_COLOR = ['match', ['get', 'class'], ['motorway', 'trunk'], CYAN, ['primary', 'secondary'], '#22C7DD', '#1696A8'];

function transform(l: LayerSpecification): LayerSpecification[] {
  const sl = sourceLayer(l);
  switch (l.type) {
    case 'background':
      return [{ ...l, paint: { 'background-color': BG } }];
    case 'raster':
    case 'hillshade':
      return [];
    case 'fill':
      if (sl === 'water') return [{ ...l, paint: { 'fill-color': '#06121F' } }];
      if (sl === 'building') return [{ ...l, paint: { 'fill-color': '#3A0A12', 'fill-outline-color': '#C2283A' } }];
      if (sl === 'landcover' || sl === 'landuse' || sl === 'park') return [{ ...l, paint: { 'fill-color': '#0A0C12', 'fill-opacity': 0.6 } }];
      return [{ ...l, paint: { ...l.paint, 'fill-color': '#0B0D14' } } as LayerSpecification];
    case 'line': {
      const width = l.paint?.['line-width'] ?? 1;
      if (sl === 'transportation') {
        if (/casing|outline/.test(l.id)) return [];
        if (/rail|transit/.test(l.id)) return [{ ...l, paint: { 'line-color': '#7A2A8C', 'line-width': width } } as LayerSpecification];
        // A soft glow under a crisp core line.
        const glow = { ...l, id: `${l.id}-neon-glow`, paint: { 'line-color': ROAD_COLOR, 'line-width': ['*', 3, ['to-number', width, 1]], 'line-blur': 4, 'line-opacity': 0.35 } };
        const core = { ...l, paint: { 'line-color': ROAD_COLOR, 'line-width': width } };
        // Zoom-based widths can't be multiplied inside an expression; give those a fixed glow instead.
        const widthIsZoomCurve = typeof width === 'object' && !Array.isArray(width);
        const safeGlow = widthIsZoomCurve || (Array.isArray(width) && width[0] === 'interpolate')
          ? { ...glow, paint: { ...glow.paint, 'line-width': 6 } }
          : glow;
        return [safeGlow as LayerSpecification, core as LayerSpecification];
      }
      if (sl === 'waterway') return [{ ...l, paint: { 'line-color': '#0E3550', 'line-width': width } } as LayerSpecification];
      if (sl === 'boundary') return [{ ...l, paint: { 'line-color': RED, 'line-width': width, 'line-opacity': 0.7 } } as LayerSpecification];
      return [l];
    }
    case 'symbol': {
      const place = sl === 'place' || /place|city|town|country/.test(l.id);
      return [
        {
          ...l,
          paint: { ...l.paint, 'text-color': place ? RED : '#7FF6FF', 'text-halo-color': BG, 'text-halo-width': 1.4, 'icon-opacity': 0.8 },
        } as LayerSpecification,
      ];
    }
    default:
      return [l];
  }
}

export function neonStyle(base: StyleSpecification): StyleSpecification {
  return { ...base, name: 'Convoy Neon City', layers: base.layers.flatMap(transform) };
}
