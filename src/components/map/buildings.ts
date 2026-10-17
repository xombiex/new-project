import type { FillExtrusionLayerSpecification } from 'maplibre-gl';

/**
 * 3D buildings from the `building` layer OpenFreeMap tiles already carry (render_height /
 * render_min_height in meters). Fades in from zoom 15 so the city view stays clean.
 */
export function buildingsLayer(dark: boolean): Omit<FillExtrusionLayerSpecification, 'source'> & { source: 'openmaptiles'; 'source-layer': 'building' } {
  return {
    id: 'convoy-buildings-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 15,
    paint: {
      'fill-extrusion-color': dark ? '#24272E' : '#D9DCE1',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8] as never,
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] as never,
      'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, dark ? 0.85 : 0.75] as never,
    },
  };
}

/** Camera tilt for the 3D view: flat when zoomed out, leaning in as you zoom close. */
export const TILT_3D = 55;
