import type { LngLat } from '@/lib/geo';

/**
 * Where the follow camera should sit, Apple Maps style: closer in town, further out on fast
 * roads, and zoomed in as a turn approaches so it's obvious which street to take.
 */
export function followZoom(speedMps: number, toNextTurnM: number | null): number {
  let zoom = speedMps < 8 ? 17.2 : speedMps < 17 ? 16.5 : speedMps < 27 ? 15.7 : 15;
  if (toNextTurnM != null) {
    if (toNextTurnM < 120) zoom = Math.max(zoom, 18);
    else if (toNextTurnM < 300) zoom = Math.max(zoom, 17.4);
  }
  return zoom;
}

/** Camera tilt: leaned in for navigation, a little for 3D follow, flat otherwise. */
export function followPitch(navigating: boolean, map3d: boolean): number {
  if (navigating) return 60;
  return map3d ? 50 : 0;
}

/** Point `along` meters into a polyline with cumulative distances. */
export function pointAlong(geometry: LngLat[], cumulative: number[], along: number): LngLat {
  if (geometry.length === 0) return [0, 0];
  if (along <= 0) return geometry[0];
  for (let i = 1; i < geometry.length; i++) {
    if (cumulative[i] >= along) {
      const span = cumulative[i] - cumulative[i - 1] || 1;
      const t = (along - cumulative[i - 1]) / span;
      const [a, b] = [geometry[i - 1], geometry[i]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return geometry[geometry.length - 1];
}

/** The route split at your position: the part already driven and the part still ahead. */
export function splitRoute(geometry: LngLat[], cumulative: number[], segment: number, along: number): { driven: LngLat[]; ahead: LngLat[] } {
  const here = pointAlong(geometry, cumulative, along);
  const cut = Math.min(Math.max(segment + 1, 1), geometry.length);
  return { driven: [...geometry.slice(0, cut), here], ahead: [here, ...geometry.slice(cut)] };
}
