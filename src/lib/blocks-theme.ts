import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * "Blocks": a pixel-art map theme built from our own 16×16 textures (scripts/themes). It takes
 * the OpenFreeMap dark style and swaps fills and lines for texture patterns: grass land,
 * black-concrete roads, metal-block buildings, pixel water, sand beaches and dirt footpaths.
 */
export const BLOCK_TEXTURES = ['grass', 'concrete', 'metal', 'water', 'sand', 'dirt'] as const;
export const blockImage = (name: (typeof BLOCK_TEXTURES)[number]) => `blk-${name}`;

const PATHS = ['path', 'track', 'pedestrian', 'bridleway', 'footway', 'cycleway', 'steps'];

function sourceLayer(l: LayerSpecification): string | undefined {
  return (l as { 'source-layer'?: string })['source-layer'];
}

function transform(l: LayerSpecification): LayerSpecification[] {
  const sl = sourceLayer(l);
  switch (l.type) {
    case 'background':
      return [{ ...l, paint: { 'background-pattern': blockImage('grass') } }];
    case 'raster':
    case 'hillshade':
      return []; // shaded relief doesn't belong in a block world
    case 'fill': {
      const keep = { 'fill-opacity': l.paint?.['fill-opacity'] ?? 1 };
      if (sl === 'water') return [{ ...l, paint: { ...keep, 'fill-pattern': blockImage('water') } }];
      if (sl === 'building') return [{ ...l, paint: { 'fill-pattern': blockImage('metal') } }];
      if (sl === 'landcover')
        return [{ ...l, paint: { ...keep, 'fill-pattern': ['match', ['get', 'class'], 'sand', blockImage('sand'), blockImage('grass')] } }];
      if (sl === 'landuse' || sl === 'park') return [{ ...l, paint: { ...keep, 'fill-pattern': blockImage('grass') } }];
      if (sl === 'aeroway' || sl === 'transportation') return [{ ...l, paint: { ...keep, 'fill-pattern': blockImage('concrete') } }];
      return [l];
    }
    case 'line': {
      const width = l.paint?.['line-width'];
      if (sl === 'transportation') {
        if (/casing|outline/.test(l.id)) return []; // patterns don't need casings
        if (/rail|transit/.test(l.id)) return [l];
        return [
          {
            ...l,
            paint: {
              ...(width !== undefined ? { 'line-width': width } : {}),
              'line-pattern': ['match', ['get', 'class'], PATHS, blockImage('dirt'), blockImage('concrete')],
            },
          },
        ];
      }
      if (sl === 'waterway') return [{ ...l, paint: { ...(width !== undefined ? { 'line-width': width } : {}), 'line-pattern': blockImage('water') } }];
      return [l];
    }
    case 'symbol':
      // Labels over busy textures need a solid halo.
      return [{ ...l, paint: { ...l.paint, 'text-color': '#FFFFFF', 'text-halo-color': '#101114', 'text-halo-width': 1.6 } } as LayerSpecification];
    default:
      return [l];
  }
}

export function blocksStyle(base: StyleSpecification): StyleSpecification {
  return { ...base, name: 'Convoy Blocks', layers: base.layers.flatMap(transform) };
}
