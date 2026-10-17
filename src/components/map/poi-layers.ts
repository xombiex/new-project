import type { SymbolLayerSpecification } from 'maplibre-gl';

/**
 * Nearby places (shops, food, fuel, parks, transit…), Google Maps style: the big ones appear at
 * street zoom and smaller ones fill in as you zoom further. The data is the `poi` layer that
 * OpenFreeMap tiles already carry, and the icons come from the sprite every OpenFreeMap style
 * shares; only the "Streets" (liberty) style draws them by default, so the others get these.
 */
type PoiLayer = Omit<SymbolLayerSpecification, 'source'> & { source: 'openmaptiles'; 'source-layer': 'poi' };

const NAME = ['coalesce', ['get', 'name_en'], ['get', 'name']] as never;

/** Liberty's icon choice: a couple of subclasses have their own icon, everything else uses the class. */
const ICON = ['match', ['get', 'subclass'], ['florist', 'furniture'], ['get', 'subclass'], ['get', 'class']] as const;

const POINTS = ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false] as const;

/** Tiers by OSM importance rank: [id suffix, minzoom, filter on rank]. */
const TIERS: [string, number, unknown[]][] = [
  ['major', 15, ['all', ['>=', ['get', 'rank'], 1], ['<', ['get', 'rank'], 7]]],
  ['minor', 16, ['all', ['>=', ['get', 'rank'], 7], ['<', ['get', 'rank'], 20]]],
  ['detail', 17, ['>=', ['get', 'rank'], 20]],
];

export function poiLayers(dark: boolean): PoiLayer[] {
  const paint = {
    'text-color': dark ? '#C9CED6' : '#5B6370',
    'text-halo-color': dark ? '#0B0C0E' : '#FFFFFF',
    'text-halo-width': 1.2,
    'text-halo-blur': 0.5,
    // Icons from a light style read too bright on the dark map; tone them down a touch.
    'icon-opacity': dark ? 0.85 : 1,
  };
  const layers: PoiLayer[] = TIERS.map(([suffix, minzoom, rank]) => ({
    id: `convoy-poi-${suffix}`,
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom,
    // Transit has its own layers (bus stops only up close), so leave it out here.
    filter: ['all', POINTS, rank, ['!', ['match', ['get', 'class'], ['bus', 'rail', 'airport'], true, false]]] as never,
    layout: {
      'icon-image': ICON as never,
      'icon-size': 0.9,
      'text-field': NAME,
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-max-width': 8,
      'text-anchor': 'top',
      'text-offset': [0, 0.7],
      'text-optional': true,
    },
    paint,
  }));
  layers.push({
    id: 'convoy-poi-transit',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 13,
    // Airports and train stations from city zoom; bus stops get their own close-up layer below.
    filter: ['match', ['get', 'class'], ['airport', 'rail'], true, false] as never,
    layout: {
      'icon-image': ['to-string', ['get', 'class']] as never,
      'icon-size': 0.75,
      'text-field': NAME,
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-anchor': 'left',
      'text-offset': [0.9, 0],
      'text-optional': true,
    },
    paint: { ...paint, 'text-color': dark ? '#8EC5FF' : '#2E5A80' },
  });
  // Bus stops are everywhere, so only show them up close.
  layers.push({ ...layers[layers.length - 1], id: 'convoy-poi-bus', minzoom: 17, filter: ['==', ['get', 'class'], 'bus'] as never });
  return layers;
}

/** The Streets style already draws places; adding ours on top would double them up. */
export function styleHasPlaces(styleUrl: string) {
  return /\/liberty$/.test(styleUrl);
}
